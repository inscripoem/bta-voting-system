package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
)

var ErrSSOInvalidAssertion = errors.New("invalid sso assertion")

// ErrSSODisabled is returned when no partner secret is configured.
var ErrSSODisabled = errors.New("sso is disabled")

// SSOCodeTTL is how long a one-time SSO code stays valid.
const SSOCodeTTL = 60 * time.Second

// SSOIdentity is a verified identity asserted by a trusted external site.
type SSOIdentity struct {
	Provider   string
	ExternalID string // e.g. "cac_user_123"
	Nickname   string
}

type ssoCodeEntry struct {
	userID    uuid.UUID
	expiresAt time.Time
}

// SSOService handles the token-exchange SSO flow: a trusted site (cac-website)
// signs a short-lived HS256 assertion for its logged-in user; we verify it,
// map the external identity to a local user, and hand out a one-time code
// which the user's browser later exchanges for a session.
type SSOService struct {
	db    *ent.Client
	cfg   *config.Config
	mu    sync.Mutex
	codes map[string]ssoCodeEntry
}

func NewSSOService(db *ent.Client, cfg *config.Config) *SSOService {
	return &SSOService{db: db, cfg: cfg, codes: make(map[string]ssoCodeEntry)}
}

type ssoClaims struct {
	Name string `json:"name"`
	jwt.RegisteredClaims
}

// ParseAssertion verifies the HS256 assertion JWT and extracts the identity.
// It fails closed when SSO is not configured.
func (s *SSOService) ParseAssertion(assertion string) (*SSOIdentity, error) {
	if s.cfg.SSOCACSecret == "" {
		return nil, ErrSSODisabled
	}
	claims := &ssoClaims{}
	token, err := jwt.ParseWithClaims(assertion, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.SSOCACSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, ErrSSOInvalidAssertion
	}
	if claims.Issuer != s.cfg.SSOCACAppID || claims.Subject == "" || claims.Name == "" {
		return nil, ErrSSOInvalidAssertion
	}
	// The assertion must be intended for this endpoint: the caller sets aud
	// to the OAuth 2.0 token endpoint URL (RFC 7523), which must match our
	// public backend base URL.
	expectedAud := strings.TrimRight(s.cfg.BackendBaseURL, "/") + "/api/v1/oauth/token"
	if !audienceContains(claims.Audience, expectedAud) {
		return nil, ErrSSOInvalidAssertion
	}
	return &SSOIdentity{
		Provider:   s.cfg.SSOCACAppID,
		ExternalID: claims.Subject,
		Nickname:   claims.Name,
	}, nil
}

// FindOrCreateUser maps an external identity to a local formal account:
// match by (external_provider, external_id); if absent, create a new formal
// user under the default school. Never takes over an existing local account.
func (s *SSOService) FindOrCreateUser(ctx context.Context, id *SSOIdentity) (*ent.User, error) {
	u, err := s.db.User.Query().
		Where(entuser.ExternalProvider(id.Provider), entuser.ExternalID(id.ExternalID)).
		Only(ctx)
	if err == nil {
		return u, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	school, err := s.ensureDefaultSchool(ctx)
	if err != nil {
		return nil, err
	}

	nickname := normalizeNickname(id.Nickname)
	// A same-nickname user in the school belongs to someone else — pick a
	// disambiguated nickname instead of failing or hijacking the account.
	exists, err := s.db.User.Query().
		Where(entuser.Nickname(nickname), entuser.HasSchoolWith(entschool.ID(school.ID))).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	if exists {
		nickname = nickname + "-" + shortDigest(id.ExternalID)
	}

	u, err = s.db.User.Create().
		SetNickname(nickname).
		SetIsGuest(false).
		SetRole(entuser.RoleVoter).
		SetSchool(school).
		SetExternalProvider(id.Provider).
		SetExternalID(id.ExternalID).
		Save(ctx)
	if err != nil {
		if !ent.IsConstraintError(err) {
			return nil, err
		}
		// Concurrent exchange for the same identity: the other request won.
		u, err = s.db.User.Query().
			Where(entuser.ExternalProvider(id.Provider), entuser.ExternalID(id.ExternalID)).
			Only(ctx)
		if err != nil {
			return nil, err
		}
	}
	return u, nil
}

// ensureDefaultSchool finds the school SSO users are assigned to, creating it
// on first use.
func (s *SSOService) ensureDefaultSchool(ctx context.Context) (*ent.School, error) {
	school, err := s.db.School.Query().
		Where(entschool.Name(s.cfg.SSODefaultSchool)).
		Only(ctx)
	if err == nil {
		return school, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	return s.db.School.Create().
		SetName(s.cfg.SSODefaultSchool).
		SetCode("nju").
		Save(ctx)
}

// IssueCode mints a one-time code bound to a user, for later browser consume.
func (s *SSOService) IssueCode(userID uuid.UUID) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := hex.EncodeToString(b)
	s.mu.Lock()
	s.codes[code] = ssoCodeEntry{userID: userID, expiresAt: time.Now().Add(SSOCodeTTL)}
	s.mu.Unlock()
	return code, nil
}

// PeekCode returns the userID bound to a valid, unexpired code WITHOUT
// consuming it. Used by the authorize page to show who is about to log in.
func (s *SSOService) PeekCode(code string) (uuid.UUID, bool) {
	s.mu.Lock()
	entry, ok := s.codes[code]
	s.mu.Unlock()
	if !ok || time.Now().After(entry.expiresAt) {
		return uuid.Nil, false
	}
	return entry.userID, true
}

// ConsumeCode validates and consumes a one-time SSO code (single use).
func (s *SSOService) ConsumeCode(code string) (uuid.UUID, error) {
	s.mu.Lock()
	entry, ok := s.codes[code]
	if ok {
		delete(s.codes, code)
	}
	s.mu.Unlock()
	if !ok || time.Now().After(entry.expiresAt) {
		return uuid.Nil, ErrInvalidCode
	}
	return entry.userID, nil
}

// shortDigest returns a short stable suffix for nickname disambiguation.
func shortDigest(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:4])
}

func audienceContains(aud jwt.ClaimStrings, want string) bool {
	for _, a := range aud {
		if a == want {
			return true
		}
	}
	return false
}

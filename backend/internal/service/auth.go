package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
)

var (
	ErrNicknameConflictSameSchool      = errors.New("nickname_conflict_same_school")
	ErrNicknameConflictDifferentSchool = errors.New("nickname_conflict_different_school")
	ErrWrongAnswer                     = errors.New("wrong_answer")
	ErrEmailSuffixNotAllowed           = errors.New("email_suffix_not_allowed")
	ErrInvalidCode                     = errors.New("invalid_or_expired_code")
	ErrSchoolNotFound                  = errors.New("school_not_found")
)

type codeEntry struct {
	code      string
	expiresAt time.Time
	schoolID  uuid.UUID
}

type AuthService struct {
	db    *ent.Client
	jwt   *JWTService
	email EmailSender
	mu    sync.RWMutex         // protects codes
	codes map[string]codeEntry // email → code entry; production: use Redis
}

func NewAuthService(db *ent.Client, jwt *JWTService, email EmailSender) *AuthService {
	return &AuthService{
		db:    db,
		jwt:   jwt,
		email: email,
		codes: make(map[string]codeEntry),
	}
}

// DB returns the underlying ent client.
func (s *AuthService) DB() *ent.Client {
	return s.db
}

// JWT returns the underlying JWTService.
func (s *AuthService) JWT() *JWTService {
	return s.jwt
}

// Email returns the underlying EmailSender.
func (s *AuthService) Email() EmailSender {
	return s.email
}

// GuestByQuestion creates or logs in a guest user via verification question answer.
func (s *AuthService) GuestByQuestion(ctx context.Context, nickname, schoolCode, answer, ip, ua string) (access, refresh string, err error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	// Validate answer against first verification question
	questions := school.VerificationQuestions
	if len(questions) > 0 {
		expected := questions[0]["answer"]
		if !strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected)) {
			return "", "", ErrWrongAnswer
		}
	}
	return s.findOrCreateGuest(ctx, nickname, school, nil, ip, ua)
}

// SendEmailCode sends a 6-digit verification code to the given email.
// If schoolCode is non-empty, validates email suffix against school config.
// If schoolCode is empty, accepts any email (used for account upgrade).
func (s *AuthService) SendEmailCode(ctx context.Context, emailAddr, schoolCode string) error {
	var entry codeEntry
	entry.code = generateCode()
	entry.expiresAt = time.Now().Add(5 * time.Minute)

	if schoolCode != "" {
		school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
		if err != nil {
			return ErrSchoolNotFound
		}
		if !emailMatchesSuffixes(emailAddr, school.EmailSuffixes) {
			return ErrEmailSuffixNotAllowed
		}
		entry.schoolID = school.ID
	}

	s.mu.Lock()
	s.codes[emailAddr] = entry
	s.mu.Unlock()
	return s.email.SendVerificationCode(emailAddr, entry.code)
}

// GuestByEmail creates or logs in a guest user via email verification code.
func (s *AuthService) GuestByEmail(ctx context.Context, nickname, emailAddr, code, ip, ua string) (access, refresh string, err error) {
	s.mu.RLock()
	entry, ok := s.codes[emailAddr]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, emailAddr)
	s.mu.Unlock()

	school, err := s.db.School.Get(ctx, entry.schoolID)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	return s.findOrCreateGuest(ctx, nickname, school, &emailAddr, ip, ua)
}

// ReauthByQuestion re-authenticates an existing user with same school via question.
// Returns the user's tokens if successful.
func (s *AuthService) ReauthByQuestion(ctx context.Context, nickname, schoolCode, answer string) (access, refresh string, err error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	questions := school.VerificationQuestions
	if len(questions) > 0 {
		expected := questions[0]["answer"]
		if !strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected)) {
			return "", "", ErrWrongAnswer
		}
	}
	user, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if err != nil {
		return "", "", errors.New("user not found")
	}
	return s.issueTokens(ctx, user)
}

// ReauthByEmail re-authenticates an existing user with same school via email code.
func (s *AuthService) ReauthByEmail(ctx context.Context, nickname, emailAddr, code string) (access, refresh string, err error) {
	s.mu.RLock()
	entry, ok := s.codes[emailAddr]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, emailAddr)
	s.mu.Unlock()
	user, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if err != nil {
		return "", "", errors.New("user not found")
	}
	return s.issueTokens(ctx, user)
}

// RegisterByQuestion creates a registered (non-guest) user via verification question.
func (s *AuthService) RegisterByQuestion(ctx context.Context, nickname, schoolCode, answer, password, ip, ua string) (access, refresh string, err error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	questions := school.VerificationQuestions
	if len(questions) > 0 {
		expected := questions[0]["answer"]
		if !strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected)) {
			return "", "", ErrWrongAnswer
		}
	}
	return s.createRegistered(ctx, nickname, school, nil, password)
}

// RegisterByEmail creates a registered (non-guest) user via school email verification code.
func (s *AuthService) RegisterByEmail(ctx context.Context, nickname, emailAddr, code, password, ip, ua string) (access, refresh string, err error) {
	s.mu.RLock()
	entry, ok := s.codes[emailAddr]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, emailAddr)
	s.mu.Unlock()

	school, err := s.db.School.Get(ctx, entry.schoolID)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	return s.createRegistered(ctx, nickname, school, &emailAddr, password)
}

// createRegistered creates a non-guest user with a password.
func (s *AuthService) createRegistered(ctx context.Context, nickname string, school *ent.School, email *string, password string) (access, refresh string, err error) {
	existing, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return "", "", err
	}
	if existing != nil {
		existingSchool, _ := existing.QuerySchool().Only(ctx)
		if existingSchool != nil && existingSchool.ID == school.ID {
			return "", "", ErrNicknameConflictSameSchool
		}
		return "", "", ErrNicknameConflictDifferentSchool
	}
	hashed, err := HashPassword(password)
	if err != nil {
		return "", "", err
	}
	user, err := s.db.User.Create().
		SetNickname(nickname).
		SetNillableEmail(email).
		SetIsGuest(false).
		SetRole(entuser.RoleVoter).
		SetSchool(school).
		SetPasswordHash(hashed).
		Save(ctx)
	if err != nil {
		return "", "", err
	}
	return s.issueTokens(ctx, user)
}

// Login authenticates a registered (non-guest) user by email and password.
func (s *AuthService) Login(ctx context.Context, email, password string) (access, refresh string, err error) {
	user, err := s.db.User.Query().Where(entuser.EmailEQ(email)).Only(ctx)
	if err != nil || user.IsGuest {
		return "", "", errors.New("invalid credentials")
	}
	if user.PasswordHash == nil || !CheckPassword(*user.PasswordHash, password) {
		return "", "", errors.New("invalid credentials")
	}
	return s.issueTokens(ctx, user)
}

// HashPassword hashes a plaintext password with bcrypt.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// CheckPassword checks a plaintext password against a bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// findOrCreateGuest looks up a user by nickname:
//   - not found → create new guest (optionally with email)
//   - found, same school → ErrNicknameConflictSameSchool
//   - found, different school → ErrNicknameConflictDifferentSchool
func (s *AuthService) findOrCreateGuest(ctx context.Context, nickname string, school *ent.School, email *string, ip, ua string) (access, refresh string, err error) {
	existing, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return "", "", err
	}
	if existing != nil {
		existingSchool, _ := existing.QuerySchool().Only(ctx)
		if existingSchool != nil && existingSchool.ID == school.ID {
			return "", "", ErrNicknameConflictSameSchool
		}
		return "", "", ErrNicknameConflictDifferentSchool
	}
	user, err := s.db.User.Create().
		SetNickname(nickname).
		SetNillableEmail(email).
		SetIsGuest(true).
		SetRole(entuser.RoleVoter).
		SetSchool(school).
		Save(ctx)
	if err != nil {
		return "", "", err
	}
	return s.issueTokens(ctx, user)
}

// VerifyEmailCode verifies an email verification code and updates the user's email.
func (s *AuthService) VerifyEmailCode(ctx context.Context, userID uuid.UUID, emailAddr, code string) error {
	s.mu.RLock()
	entry, ok := s.codes[emailAddr]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, emailAddr)
	s.mu.Unlock()

	_, err := s.db.User.UpdateOneID(userID).SetEmail(emailAddr).Save(ctx)
	return err
}

func (s *AuthService) issueTokens(ctx context.Context, user *ent.User) (access, refresh string, err error) {
	school, _ := user.QuerySchool().Only(ctx)
	var schoolIDPtr *uuid.UUID
	if school != nil {
		id := school.ID
		schoolIDPtr = &id
	}
	access, err = s.jwt.GenerateAccess(user.ID, string(user.Role), schoolIDPtr, user.IsGuest)
	if err != nil {
		return "", "", err
	}
	refresh, err = s.jwt.GenerateRefresh(user.ID)
	return access, refresh, err
}

func emailMatchesSuffixes(email string, suffixes []string) bool {
	if len(suffixes) == 0 {
		return true
	}
	lower := strings.ToLower(email)
	atIdx := strings.LastIndex(lower, "@")
	if atIdx < 0 {
		return false
	}
	domain := lower[atIdx:] // e.g. "@pku.edu.cn"
	for _, s := range suffixes {
		if domain == strings.ToLower(s) {
			return true
		}
	}
	return false
}

func generateCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))[:6]
}

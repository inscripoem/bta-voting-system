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
	ErrNicknameConflictSameSchoolGuest   = errors.New("nickname_conflict_same_school_guest")
	ErrNicknameConflictSameSchoolFormal  = errors.New("nickname_conflict_same_school_formal")
	ErrWrongAnswer                       = errors.New("wrong_answer")
	ErrEmailRequired                     = errors.New("email_required")
	ErrEmailAlreadyTaken                 = errors.New("email_already_taken")
	ErrEmailSuffixNotAllowed             = errors.New("email_suffix_not_allowed")
	ErrEmailCodeRequired                 = errors.New("email_and_code_required")
	ErrEmailMismatch                     = errors.New("email_mismatch")
	ErrInvalidCode                       = errors.New("invalid_or_expired_code")
	ErrSchoolNotFound                    = errors.New("school_not_found")
	ErrVerificationQuestionMisconfigured = errors.New("verification_question_misconfigured")
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

// GuestByQuestion creates a guest user via verification question answers + email code binding.
func (s *AuthService) GuestByQuestion(ctx context.Context, nickname, schoolCode string, answers []string, emailAddr, code, ip, ua string) (access, refresh string, err error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	if err := validateVerificationAnswers(school.VerificationQuestions, answers); err != nil {
		return "", "", err
	}
	// Email binding is required for all guest accounts
	if strings.TrimSpace(emailAddr) == "" || strings.TrimSpace(code) == "" {
		return "", "", ErrEmailCodeRequired
	}
	normalized := normalizeEmail(emailAddr)
	if normalized == "" {
		return "", "", ErrEmailCodeRequired
	}
	// Atomically consume code before creating account to prevent replay attacks
	if ok := s.consumeCode(normalized, code); !ok {
		return "", "", ErrInvalidCode
	}

	access, refresh, err = s.findOrCreateGuest(ctx, nickname, school, &normalized, ip, ua)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// SendEmailCode sends a 6-digit verification code to the given email.
// If schoolCode is non-empty, validates email suffix against school config.
// If schoolCode is empty, accepts any email (used for question-method guest binding or upgrade).
func (s *AuthService) SendEmailCode(ctx context.Context, emailAddr, schoolCode string) error {
	normalized := normalizeEmail(emailAddr)
	var entry codeEntry
	entry.code = generateCode()
	entry.expiresAt = time.Now().Add(5 * time.Minute)

	if schoolCode != "" {
		school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
		if err != nil {
			return ErrSchoolNotFound
		}
		if !emailMatchesSuffixes(normalized, school.EmailSuffixes) {
			return ErrEmailSuffixNotAllowed
		}
		entry.schoolID = school.ID
	}

	s.mu.Lock()
	s.codes[normalized] = entry
	s.mu.Unlock()
	return s.email.SendVerificationCode(normalized, entry.code)
}

// GuestByEmail creates a guest user via educational email verification code.
func (s *AuthService) GuestByEmail(ctx context.Context, nickname, emailAddr, code, ip, ua string) (access, refresh string, err error) {
	normalized := normalizeEmail(emailAddr)
	entry, err := s.getValidCodeEntry(normalized, code)
	if err != nil {
		return "", "", ErrInvalidCode
	}

	// Atomically consume code before creating account to prevent replay attacks
	if ok := s.consumeCode(normalized, code); !ok {
		return "", "", ErrInvalidCode
	}

	school, err := s.db.School.Get(ctx, entry.schoolID)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	access, refresh, err = s.findOrCreateGuest(ctx, nickname, school, &normalized, ip, ua)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// NicknameCheckResult holds the result of a nickname availability check.
type NicknameCheckResult struct {
	Available    bool
	ConflictType string // "same_school" | "different_school" | ""
	IsGuest      *bool  // non-nil only when ConflictType == "same_school"
}

// CheckNickname checks whether a nickname is available for a given school.
func (s *AuthService) CheckNickname(ctx context.Context, nickname, schoolCode string) (NicknameCheckResult, error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return NicknameCheckResult{}, ErrSchoolNotFound
	}
	nickname = normalizeNickname(nickname)
	existing, err := s.db.User.Query().
		Where(entuser.Nickname(nickname), entuser.HasSchoolWith(entschool.ID(school.ID))).
		Only(ctx)
	if ent.IsNotFound(err) {
		return NicknameCheckResult{Available: true}, nil
	}
	if err != nil {
		return NicknameCheckResult{}, err
	}
	isGuest := existing.IsGuest
	return NicknameCheckResult{Available: false, ConflictType: "same_school", IsGuest: &isGuest}, nil
}

// ClaimNickname allows a guest user to reclaim their account via bound email verification.
func (s *AuthService) ClaimNickname(ctx context.Context, nickname, schoolCode, emailAddr, code string) (access, refresh string, err error) {
	normalized := normalizeEmail(emailAddr)
	// Atomically consume code before issuing tokens to prevent replay attacks
	if ok := s.consumeCode(normalized, code); !ok {
		return "", "", ErrInvalidCode
	}

	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	nickname = normalizeNickname(nickname)
	if nickname == "" {
		return "", "", errors.New("user not found")
	}
	user, err := s.db.User.Query().
		Where(entuser.Nickname(nickname), entuser.HasSchoolWith(entschool.ID(school.ID))).
		Only(ctx)
	if err != nil {
		return "", "", errors.New("user not found")
	}
	if user.Email == nil || strings.ToLower(*user.Email) != normalized {
		return "", "", ErrEmailMismatch
	}
	if !user.IsGuest {
		return "", "", ErrNicknameConflictSameSchoolFormal
	}
	access, refresh, err = s.issueTokens(ctx, user)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// RegisterByQuestion creates a registered (non-guest) user via verification questions + email code.
func (s *AuthService) RegisterByQuestion(ctx context.Context, nickname, schoolCode string, answers []string, emailAddr, emailCode, password, ip, ua string) (access, refresh string, err error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	if err := validateVerificationAnswers(school.VerificationQuestions, answers); err != nil {
		return "", "", err
	}
	if strings.TrimSpace(emailAddr) == "" {
		return "", "", ErrEmailRequired
	}
	normalizedEmail := normalizeEmail(emailAddr)
	if normalizedEmail == "" {
		return "", "", ErrEmailRequired
	}
	// Atomically consume code before creating account to prevent replay attacks
	if ok := s.consumeCode(normalizedEmail, emailCode); !ok {
		return "", "", ErrInvalidCode
	}
	access, refresh, err = s.createRegistered(ctx, nickname, school, &normalizedEmail, password)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// RegisterByEmail creates a registered (non-guest) user via school email verification code.
func (s *AuthService) RegisterByEmail(ctx context.Context, nickname, emailAddr, code, password, ip, ua string) (access, refresh string, err error) {
	normalized := normalizeEmail(emailAddr)
	entry, err := s.getValidCodeEntry(normalized, code)
	if err != nil {
		return "", "", ErrInvalidCode
	}

	// Atomically consume code before creating account to prevent replay attacks
	if ok := s.consumeCode(normalized, code); !ok {
		return "", "", ErrInvalidCode
	}

	school, err := s.db.School.Get(ctx, entry.schoolID)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	access, refresh, err = s.createRegistered(ctx, nickname, school, &normalized, password)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// createRegistered creates a non-guest user with a password.
func (s *AuthService) createRegistered(ctx context.Context, nickname string, school *ent.School, email *string, password string) (access, refresh string, err error) {
	nickname = normalizeNickname(nickname)
	existing, err := s.db.User.Query().
		Where(entuser.Nickname(nickname), entuser.HasSchoolWith(entschool.ID(school.ID))).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return "", "", err
	}
	if existing != nil {
		if existing.IsGuest {
			return "", "", ErrNicknameConflictSameSchoolGuest
		}
		return "", "", ErrNicknameConflictSameSchoolFormal
	}
	// Check email uniqueness among non-guest users
	if email != nil {
		emailTaken, err := s.db.User.Query().
			Where(entuser.EmailEQ(*email), entuser.IsGuestEQ(false)).
			Exist(ctx)
		if err != nil {
			return "", "", err
		}
		if emailTaken {
			return "", "", ErrEmailAlreadyTaken
		}
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

// Login authenticates a registered (non-guest) user by email or nickname + password.
// For nickname login, schoolCode must be provided.
func (s *AuthService) Login(ctx context.Context, identifier, password string) (access, refresh string, err error) {
	return s.LoginWithIdentifier(ctx, identifier, password, "")
}

// LoginWithIdentifier authenticates a registered user by email+password
// or nickname+password+schoolCode.
func (s *AuthService) LoginWithIdentifier(ctx context.Context, identifier, password, schoolCode string) (access, refresh string, err error) {
	identifier = strings.TrimSpace(identifier)
	var user *ent.User
	if looksLikeEmail(identifier) {
		normalizedEmail := normalizeEmail(identifier)
		user, err = s.db.User.Query().
			Where(entuser.EmailEQ(normalizedEmail), entuser.IsGuestEQ(false)).
			Only(ctx)
	} else {
		normalizedNickname := normalizeNickname(identifier)
		normalizedSchoolCode := strings.TrimSpace(schoolCode)
		if normalizedNickname == "" || normalizedSchoolCode == "" {
			return "", "", errors.New("invalid credentials")
		}
		user, err = s.db.User.Query().
			Where(
				entuser.Nickname(normalizedNickname),
				entuser.IsGuestEQ(false),
				entuser.HasSchoolWith(entschool.Code(normalizedSchoolCode)),
			).
			Only(ctx)
	}
	if err != nil {
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

// findOrCreateGuest looks up a user by nickname within the same school:
//   - not found → create new guest with email
//   - found, guest → ErrNicknameConflictSameSchoolGuest
//   - found, formal → ErrNicknameConflictSameSchoolFormal
func (s *AuthService) findOrCreateGuest(ctx context.Context, nickname string, school *ent.School, email *string, ip, ua string) (access, refresh string, err error) {
	nickname = normalizeNickname(nickname)
	existing, err := s.db.User.Query().
		Where(entuser.Nickname(nickname), entuser.HasSchoolWith(entschool.ID(school.ID))).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return "", "", err
	}
	if existing != nil {
		if existing.IsGuest {
			return "", "", ErrNicknameConflictSameSchoolGuest
		}
		return "", "", ErrNicknameConflictSameSchoolFormal
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
	normalized := normalizeEmail(emailAddr)
	// Atomically consume code before updating email to prevent replay attacks
	if ok := s.consumeCode(normalized, code); !ok {
		return ErrInvalidCode
	}

	_, err := s.db.User.UpdateOneID(userID).SetEmail(normalized).Save(ctx)
	if err != nil {
		return err
	}
	return nil
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

func validateVerificationAnswers(questions []map[string]string, answers []string) error {
	if len(questions) == 0 {
		return nil
	}
	if len(answers) < len(questions) {
		return ErrWrongAnswer
	}
	for i, q := range questions {
		expectedRaw, ok := q["answer"]
		if !ok {
			return ErrVerificationQuestionMisconfigured
		}
		expected := strings.TrimSpace(expectedRaw)
		if expected == "" {
			return ErrVerificationQuestionMisconfigured
		}
		if !strings.EqualFold(strings.TrimSpace(answers[i]), expected) {
			return ErrWrongAnswer
		}
	}
	return nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeNickname(nickname string) string {
	return strings.TrimSpace(nickname)
}

func looksLikeEmail(identifier string) bool {
	return strings.Contains(identifier, "@")
}

func (s *AuthService) getValidCodeEntry(normalizedEmail, code string) (codeEntry, error) {
	s.mu.RLock()
	entry, ok := s.codes[normalizedEmail]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return codeEntry{}, ErrInvalidCode
	}
	return entry, nil
}

func (s *AuthService) consumeCode(normalizedEmail, code string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.codes[normalizedEmail]
	if !ok {
		return false
	}
	if entry.code != code || time.Now().After(entry.expiresAt) {
		return false
	}
	delete(s.codes, normalizedEmail)
	return true
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

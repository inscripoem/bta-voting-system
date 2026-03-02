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
	ErrNicknameConflictDifferentSchool   = errors.New("nickname_conflict_different_school")
	ErrWrongAnswer                       = errors.New("wrong_answer")
	ErrEmailRequired                     = errors.New("email_required")
	ErrEmailAlreadyTaken                 = errors.New("email_already_taken")
	ErrEmailSuffixNotAllowed             = errors.New("email_suffix_not_allowed")
	ErrEmailCodeRequired                 = errors.New("email_and_code_required")
	ErrEmailMismatch                     = errors.New("email_mismatch")
	ErrInvalidCode                       = errors.New("invalid_or_expired_code")
	ErrSchoolNotFound                    = errors.New("school_not_found")
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
	// Validate answers against all verification questions
	questions := school.VerificationQuestions
	if len(questions) > 0 {
		if len(answers) < len(questions) {
			return "", "", ErrWrongAnswer
		}
		for i, q := range questions {
			if !strings.EqualFold(strings.TrimSpace(answers[i]), strings.TrimSpace(q["answer"])) {
				return "", "", ErrWrongAnswer
			}
		}
	}
	// Email binding is required for all guest accounts
	if strings.TrimSpace(emailAddr) == "" || strings.TrimSpace(code) == "" {
		return "", "", ErrEmailCodeRequired
	}
	normalized := strings.ToLower(strings.TrimSpace(emailAddr))
	s.mu.RLock()
	entry, ok := s.codes[normalized]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, normalized)
	s.mu.Unlock()
	return s.findOrCreateGuest(ctx, nickname, school, &normalized, ip, ua)
}

// SendEmailCode sends a 6-digit verification code to the given email.
// If schoolCode is non-empty, validates email suffix against school config.
// If schoolCode is empty, accepts any email (used for question-method guest binding or upgrade).
func (s *AuthService) SendEmailCode(ctx context.Context, emailAddr, schoolCode string) error {
	normalized := strings.ToLower(strings.TrimSpace(emailAddr))
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
	normalized := strings.ToLower(strings.TrimSpace(emailAddr))
	s.mu.RLock()
	entry, ok := s.codes[normalized]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, normalized)
	s.mu.Unlock()

	school, err := s.db.School.Get(ctx, entry.schoolID)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	return s.findOrCreateGuest(ctx, nickname, school, &normalized, ip, ua)
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
	existing, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if ent.IsNotFound(err) {
		return NicknameCheckResult{Available: true}, nil
	}
	if err != nil {
		return NicknameCheckResult{}, err
	}
	existingSchool, _ := existing.QuerySchool().Only(ctx)
	if existingSchool != nil && existingSchool.ID == school.ID {
		isGuest := existing.IsGuest
		return NicknameCheckResult{Available: false, ConflictType: "same_school", IsGuest: &isGuest}, nil
	}
	return NicknameCheckResult{Available: false, ConflictType: "different_school"}, nil
}

// ClaimNickname allows a guest user to reclaim their account via bound email verification.
func (s *AuthService) ClaimNickname(ctx context.Context, nickname, schoolCode, emailAddr, code string) (access, refresh string, err error) {
	normalized := strings.ToLower(strings.TrimSpace(emailAddr))
	s.mu.RLock()
	entry, ok := s.codes[normalized]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, normalized)
	s.mu.Unlock()

	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	user, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if err != nil {
		return "", "", errors.New("user not found")
	}
	if user.Email == nil || strings.ToLower(*user.Email) != normalized {
		return "", "", ErrEmailMismatch
	}
	if !user.IsGuest {
		return "", "", ErrNicknameConflictSameSchoolFormal
	}
	existingSchool, _ := user.QuerySchool().Only(ctx)
	if existingSchool == nil || existingSchool.ID != school.ID {
		return "", "", errors.New("school mismatch")
	}
	return s.issueTokens(ctx, user)
}

// RegisterByQuestion creates a registered (non-guest) user via verification questions + email code.
func (s *AuthService) RegisterByQuestion(ctx context.Context, nickname, schoolCode string, answers []string, emailAddr, emailCode, password, ip, ua string) (access, refresh string, err error) {
	school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	questions := school.VerificationQuestions
	if len(questions) > 0 {
		if len(answers) < len(questions) {
			return "", "", ErrWrongAnswer
		}
		for i, q := range questions {
			if !strings.EqualFold(strings.TrimSpace(answers[i]), strings.TrimSpace(q["answer"])) {
				return "", "", ErrWrongAnswer
			}
		}
	}
	if strings.TrimSpace(emailAddr) == "" {
		return "", "", ErrEmailRequired
	}
	normalizedEmail := strings.ToLower(strings.TrimSpace(emailAddr))
	s.mu.RLock()
	entry, ok := s.codes[normalizedEmail]
	s.mu.RUnlock()
	if !ok || entry.code != emailCode || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, normalizedEmail)
	s.mu.Unlock()
	return s.createRegistered(ctx, nickname, school, &normalizedEmail, password)
}

// RegisterByEmail creates a registered (non-guest) user via school email verification code.
func (s *AuthService) RegisterByEmail(ctx context.Context, nickname, emailAddr, code, password, ip, ua string) (access, refresh string, err error) {
	normalized := strings.ToLower(strings.TrimSpace(emailAddr))
	s.mu.RLock()
	entry, ok := s.codes[normalized]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return "", "", ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, normalized)
	s.mu.Unlock()

	school, err := s.db.School.Get(ctx, entry.schoolID)
	if err != nil {
		return "", "", ErrSchoolNotFound
	}
	return s.createRegistered(ctx, nickname, school, &normalized, password)
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
			if existing.IsGuest {
				return "", "", ErrNicknameConflictSameSchoolGuest
			}
			return "", "", ErrNicknameConflictSameSchoolFormal
		}
		return "", "", ErrNicknameConflictDifferentSchool
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

// Login authenticates a registered (non-guest) user by email and password.
func (s *AuthService) Login(ctx context.Context, email, password string) (access, refresh string, err error) {
	user, err := s.db.User.Query().Where(entuser.EmailEQ(email), entuser.IsGuestEQ(false)).Only(ctx)
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

// findOrCreateGuest looks up a user by nickname:
//   - not found → create new guest with email
//   - found, same school, guest → ErrNicknameConflictSameSchoolGuest
//   - found, same school, formal → ErrNicknameConflictSameSchoolFormal
//   - found, different school → ErrNicknameConflictDifferentSchool
func (s *AuthService) findOrCreateGuest(ctx context.Context, nickname string, school *ent.School, email *string, ip, ua string) (access, refresh string, err error) {
	existing, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return "", "", err
	}
	if existing != nil {
		existingSchool, _ := existing.QuerySchool().Only(ctx)
		if existingSchool != nil && existingSchool.ID == school.ID {
			if existing.IsGuest {
				return "", "", ErrNicknameConflictSameSchoolGuest
			}
			return "", "", ErrNicknameConflictSameSchoolFormal
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
	normalized := strings.ToLower(strings.TrimSpace(emailAddr))
	s.mu.RLock()
	entry, ok := s.codes[normalized]
	s.mu.RUnlock()
	if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
		return ErrInvalidCode
	}
	s.mu.Lock()
	delete(s.codes, normalized)
	s.mu.Unlock()

	_, err := s.db.User.UpdateOneID(userID).SetEmail(normalized).Save(ctx)
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

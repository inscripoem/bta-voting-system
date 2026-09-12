package service

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
)

func testSSOService(secret string) *SSOService {
	return NewSSOService(nil, &config.Config{
		SSOCACAppID:    "cac_website",
		SSOCACSecret:   secret,
		BackendBaseURL: "http://localhost:8080",
	})
}

const testAudience = "http://localhost:8080/api/v1/oauth/token"

func signTestAssertion(t *testing.T, secret, iss, sub, name string, exp time.Time) string {
	t.Helper()
	claims := ssoClaims{
		Name: name,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    iss,
			Subject:   sub,
			Audience:  jwt.ClaimStrings{testAudience},
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign assertion: %v", err)
	}
	return s
}

func TestParseAssertionValid(t *testing.T) {
	svc := testSSOService("shared-secret")
	assertion := signTestAssertion(t, "shared-secret", "cac_website", "cac_user_42", "小明", time.Now().Add(5*time.Minute))

	id, err := svc.ParseAssertion(assertion)
	if err != nil {
		t.Fatalf("ParseAssertion: %v", err)
	}
	if id.Provider != "cac_website" || id.ExternalID != "cac_user_42" || id.Nickname != "小明" {
		t.Errorf("unexpected identity: %+v", id)
	}
}

func TestParseAssertionRejected(t *testing.T) {
	svc := testSSOService("shared-secret")
	future := time.Now().Add(5 * time.Minute)

	cases := map[string]string{
		"wrong secret":  signTestAssertion(t, "other-secret", "cac_website", "cac_user_42", "小明", future),
		"wrong issuer":  signTestAssertion(t, "shared-secret", "evil_site", "cac_user_42", "小明", future),
		"empty name":    signTestAssertion(t, "shared-secret", "cac_website", "cac_user_42", "", future),
		"empty subject": signTestAssertion(t, "shared-secret", "cac_website", "", "小明", future),
		"expired":       signTestAssertion(t, "shared-secret", "cac_website", "cac_user_42", "小明", time.Now().Add(-time.Minute)),
		"garbage":       "not-a-jwt",
	}
	for name, assertion := range cases {
		if _, err := svc.ParseAssertion(assertion); err == nil {
			t.Errorf("%s: expected error, got nil", name)
		}
	}
}

func TestParseAssertionWrongAudience(t *testing.T) {
	svc := testSSOService("shared-secret")
	claims := ssoClaims{
		Name: "小明",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "cac_website",
			Subject:   "cac_user_42",
			Audience:  jwt.ClaimStrings{"http://localhost:8080/api/v1/some/other/endpoint"},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	assertion, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("shared-secret"))
	if err != nil {
		t.Fatalf("sign assertion: %v", err)
	}
	if _, err := svc.ParseAssertion(assertion); err == nil {
		t.Error("expected error for wrong audience")
	}
}

func TestParseAssertionDisabled(t *testing.T) {
	svc := testSSOService("")
	assertion := signTestAssertion(t, "shared-secret", "cac_website", "cac_user_42", "小明", time.Now().Add(5*time.Minute))
	if _, err := svc.ParseAssertion(assertion); err == nil {
		t.Error("expected error when SSO is disabled")
	}
}

func TestPeekCodeDoesNotConsume(t *testing.T) {
	svc := testSSOService("shared-secret")
	userID := uuid.MustParse("01234567-89ab-cdef-1032-547698badc00")

	code, err := svc.IssueCode(userID)
	if err != nil {
		t.Fatalf("IssueCode: %v", err)
	}

	got, ok := svc.PeekCode(code)
	if !ok || got != userID {
		t.Errorf("PeekCode = %v, %v; want %v, true", got, ok, userID)
	}
	// Peeking must leave the code consumable.
	if _, ok := svc.PeekCode(code); !ok {
		t.Error("second peek: code should still be valid")
	}
	got, err = svc.ConsumeCode(code)
	if err != nil || got != userID {
		t.Errorf("consume after peek: got %v, %v", got, err)
	}
	// Consumed code can no longer be peeked.
	if _, ok := svc.PeekCode(code); ok {
		t.Error("peek after consume: should be invalid")
	}
	if _, ok := svc.PeekCode("nonexistent"); ok {
		t.Error("peek bogus code: should be invalid")
	}
}

func TestConsumeCodeSingleUse(t *testing.T) {
	svc := testSSOService("shared-secret")
	userID := uuid.MustParse("01234567-89ab-cdef-1032-547698badc00")

	code, err := svc.IssueCode(userID)
	if err != nil {
		t.Fatalf("IssueCode: %v", err)
	}

	got, err := svc.ConsumeCode(code)
	if err != nil {
		t.Fatalf("first consume: %v", err)
	}
	if got != userID {
		t.Errorf("ConsumeCode = %v, want %v", got, userID)
	}

	if _, err := svc.ConsumeCode(code); err == ErrInvalidCode {
		// expected
	} else {
		t.Errorf("second consume: got %v, want ErrInvalidCode", err)
	}

	if _, err := svc.ConsumeCode("nonexistent"); err != ErrInvalidCode {
		t.Errorf("bogus code: got %v, want ErrInvalidCode", err)
	}
}

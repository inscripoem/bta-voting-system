package service

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID   uuid.UUID  `json:"user_id"`
	Role     string     `json:"role"`
	SchoolID *uuid.UUID `json:"school_id,omitempty"`
	IsGuest  bool       `json:"is_guest"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secret        []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
}

func NewJWTService(secret, refreshSecret string) *JWTService {
	return &JWTService{
		secret:        []byte(secret),
		refreshSecret: []byte(refreshSecret),
		accessTTL:     15 * time.Minute,
		refreshTTL:    7 * 24 * time.Hour,
	}
}

func (s *JWTService) GenerateAccess(userID uuid.UUID, role string, schoolID *uuid.UUID, isGuest bool) (string, error) {
	claims := Claims{
		UserID:   userID,
		Role:     role,
		SchoolID: schoolID,
		IsGuest:  isGuest,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.accessTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

func (s *JWTService) GenerateRefresh(userID uuid.UUID) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.refreshTTL)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.refreshSecret)
}

func (s *JWTService) ParseAccess(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}

func (s *JWTService) ParseRefresh(tokenStr string) (uuid.UUID, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.refreshSecret, nil
	})
	if err != nil {
		return uuid.Nil, err
	}
	if claims, ok := token.Claims.(*jwt.RegisteredClaims); ok && token.Valid {
		return uuid.Parse(claims.Subject)
	}
	return uuid.Nil, errors.New("invalid refresh token")
}

// EmailVerifyClaims holds the claims for an email verification token.
type EmailVerifyClaims struct {
	UserID   uuid.UUID `json:"user_id"`
	NewEmail string    `json:"new_email"`
	Type     string    `json:"type"` // always "email_verify"
	jwt.RegisteredClaims
}

// GenerateEmailVerify generates a short-lived JWT for email verification (24h).
func (s *JWTService) GenerateEmailVerify(userID uuid.UUID, newEmail string) (string, error) {
	claims := EmailVerifyClaims{
		UserID:   userID,
		NewEmail: newEmail,
		Type:     "email_verify",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

// ParseEmailVerify parses and validates an email verification token.
func (s *JWTService) ParseEmailVerify(tokenStr string) (*EmailVerifyClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &EmailVerifyClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*EmailVerifyClaims); ok && token.Valid {
		if claims.Type != "email_verify" {
			return nil, errors.New("invalid token type")
		}
		return claims, nil
	}
	return nil, errors.New("invalid email verify token")
}

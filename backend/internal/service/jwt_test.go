package service

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJWTRoundtrip(t *testing.T) {
	svc := NewJWTService("test-secret", "test-refresh")
	userID := uuid.New()
	schoolID := uuid.New()

	access, err := svc.GenerateAccess(userID, "voter", &schoolID, true)
	require.NoError(t, err)

	claims, err := svc.ParseAccess(access)
	require.NoError(t, err)
	assert.Equal(t, userID, claims.UserID)
	assert.Equal(t, "voter", claims.Role)
	assert.True(t, claims.IsGuest)
	require.NotNil(t, claims.SchoolID)
	assert.Equal(t, schoolID, *claims.SchoolID)

	refresh, err := svc.GenerateRefresh(userID)
	require.NoError(t, err)

	parsedID, err := svc.ParseRefresh(refresh)
	require.NoError(t, err)
	assert.Equal(t, userID, parsedID)
}

func TestJWTInvalidToken(t *testing.T) {
	svc := NewJWTService("test-secret", "test-refresh")
	_, err := svc.ParseAccess("invalid.token.here")
	assert.Error(t, err)
}

func TestJWTWrongSecret(t *testing.T) {
	svc1 := NewJWTService("secret-a", "refresh-a")
	svc2 := NewJWTService("secret-b", "refresh-b")
	userID := uuid.New()
	token, err := svc1.GenerateAccess(userID, "voter", nil, false)
	require.NoError(t, err)
	_, err = svc2.ParseAccess(token)
	assert.Error(t, err)
}

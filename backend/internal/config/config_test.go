package config

import (
	"os"
	"testing"
)

func TestLoad(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://test")
	os.Setenv("JWT_SECRET", "secret")
	os.Setenv("JWT_REFRESH_SECRET", "refresh-secret")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_REFRESH_SECRET")
	}()

	c, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.DatabaseURL != "postgres://test" {
		t.Errorf("expected DatabaseURL=postgres://test, got %s", c.DatabaseURL)
	}
	if c.EmailProvider != "smtp" {
		t.Errorf("expected default EmailProvider=smtp, got %s", c.EmailProvider)
	}
	if c.ServerPort != "8080" {
		t.Errorf("expected default ServerPort=8080, got %s", c.ServerPort)
	}
}

func TestLoadPanicsOnMissingRequired(t *testing.T) {
	// Ensure required vars are not set
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("JWT_REFRESH_SECRET")

	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic for missing required env var, but did not panic")
		}
	}()
	Load()
}

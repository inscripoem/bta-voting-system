package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL      string
	JWTSecret        string
	JWTRefreshSecret string
	EmailProvider    string // "resend" | "smtp"
	EmailFrom        string // FROM address for all outgoing emails
	SMTPHost         string
	SMTPPort         int
	SMTPUser         string
	SMTPPass         string
	ResendAPIKey     string
	BlobProvider     string // "file" | "s3" | "gcs"
	BlobFilePath     string
	ServerPort       string
	FrontendURL      string
	BackendBaseURL   string // Base URL for constructing cover_image_url
	UploadDir        string // Directory for static file uploads
	CookieSecure     bool   // HTTPS-only cookie flag
	CookieSameSite   string // SameSite attribute: "Lax", "Strict", or "None"
	CookieDomain     string // Cookie domain (empty for default)
}

func Load() (*Config, error) {
	port, _ := strconv.Atoi(getEnv("SMTP_PORT", "587"))
	cookieSecure, _ := strconv.ParseBool(getEnv("COOKIE_SECURE", "true"))
	c := &Config{
		DatabaseURL:      requireEnv("DATABASE_URL"),
		JWTSecret:        requireEnv("JWT_SECRET"),
		JWTRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
		EmailProvider:    getEnv("EMAIL_PROVIDER", "smtp"),
		EmailFrom:        getEnv("EMAIL_FROM", "noreply@bta.example.com"),
		SMTPHost:         getEnv("SMTP_HOST", ""),
		SMTPPort:         port,
		SMTPUser:         getEnv("SMTP_USER", ""),
		SMTPPass:         getEnv("SMTP_PASS", ""),
		ResendAPIKey:     getEnv("RESEND_API_KEY", ""),
		BlobProvider:     getEnv("BLOB_PROVIDER", "file"),
		BlobFilePath:     getEnv("BLOB_FILE_PATH", "./uploads"),
		ServerPort:       getEnv("SERVER_PORT", "8080"),
		FrontendURL:      getEnv("FRONTEND_URL", "http://localhost:3000"),
		BackendBaseURL:   getEnv("BACKEND_BASE_URL", "http://localhost:8080"),
		UploadDir:        getEnv("UPLOAD_DIR", "./uploads"),
		CookieSecure:     cookieSecure,
		CookieSameSite:   getEnv("COOKIE_SAMESITE", "Lax"),
		CookieDomain:     getEnv("COOKIE_DOMAIN", ""),
	}
	return c, nil
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s is not set", key))
	}
	return v
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

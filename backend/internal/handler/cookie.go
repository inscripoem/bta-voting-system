package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
)

func setAuthCookie(c echo.Context, cfg *config.Config, name, value string, maxAge int, path string) {
	cookie := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: parseSameSite(cfg.CookieSameSite),
	}
	if cfg.CookieDomain != "" {
		cookie.Domain = cfg.CookieDomain
	}
	c.SetCookie(cookie)
}

func clearAuthCookie(c echo.Context, cfg *config.Config, name, path string) {
	cookie := &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     path,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: parseSameSite(cfg.CookieSameSite),
	}
	if cfg.CookieDomain != "" {
		cookie.Domain = cfg.CookieDomain
	}
	c.SetCookie(cookie)
}

func parseSameSite(s string) http.SameSite {
	switch s {
	case "Strict":
		return http.SameSiteStrictMode
	case "None":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}

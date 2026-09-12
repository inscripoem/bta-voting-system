package handler

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

// SSOHandler implements the token-exchange SSO flow with trusted partner
// sites: the partner backend calls the OAuth 2.0 token endpoint (RFC 7523
// JWT bearer grant) server-to-server with a signed assertion and gets a
// one-time code; the user's browser then calls Consume with that code and
// receives a normal session cookie.
type SSOHandler struct {
	sso  *service.SSOService
	auth *service.AuthService
	cfg  *config.Config
}

func NewSSOHandler(sso *service.SSOService, auth *service.AuthService, cfg *config.Config) *SSOHandler {
	return &SSOHandler{sso: sso, auth: auth, cfg: cfg}
}

// grantTypeJWTBearer is the RFC 7523 grant type URN.
const grantTypeJWTBearer = "urn:ietf:params:oauth:grant-type:jwt-bearer"

// oauthError writes an RFC 6749 section 5.2 error response.
func oauthError(c echo.Context, status int, code, description string) error {
	return c.JSON(status, map[string]string{
		"error":             code,
		"error_description": description,
	})
}

// Token is the OAuth 2.0 token endpoint supporting the RFC 7523 JWT bearer
// grant. The assertion identifies a user on a trusted partner site; on
// success it returns a one-time bearer code which the user's browser
// exchanges for a session via Consume.
func (h *SSOHandler) Token(c echo.Context) error {
	grantType := c.FormValue("grant_type")
	if grantType == "" {
		return oauthError(c, http.StatusBadRequest, "invalid_request", "grant_type is required")
	}
	if grantType != grantTypeJWTBearer {
		return oauthError(c, http.StatusBadRequest, "unsupported_grant_type", "only the JWT bearer grant is supported")
	}
	assertion := c.FormValue("assertion")
	if assertion == "" {
		return oauthError(c, http.StatusBadRequest, "invalid_request", "assertion is required")
	}

	id, err := h.sso.ParseAssertion(assertion)
	if err != nil {
		if errors.Is(err, service.ErrSSODisabled) {
			return oauthError(c, http.StatusServiceUnavailable, "temporarily_unavailable", "external login is not enabled")
		}
		return oauthError(c, http.StatusBadRequest, "invalid_grant", "assertion verification failed")
	}

	user, err := h.sso.FindOrCreateUser(c.Request().Context(), id)
	if err != nil {
		return oauthError(c, http.StatusInternalServerError, "server_error", "failed to map user")
	}

	code, err := h.sso.IssueCode(user.ID)
	if err != nil {
		return oauthError(c, http.StatusInternalServerError, "server_error", "failed to issue code")
	}

	c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
	c.Response().Header().Set("Pragma", "no-cache")
	return c.JSON(http.StatusOK, map[string]interface{}{
		"access_token": code,
		"token_type":   "Bearer",
		"expires_in":   int(service.SSOCodeTTL.Seconds()),
	})
}

type ssoConsumeRequest struct {
	Code string `json:"code"`
}

// CodeInfo returns the identity bound to a valid code without consuming it,
// so the authorize page can display who is about to log in.
func (h *SSOHandler) CodeInfo(c echo.Context) error {
	code := c.QueryParam("code")
	if code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "code is required")
	}
	userID, ok := h.sso.PeekCode(code)
	if !ok {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
	}
	user, err := h.auth.DB().User.Query().
		Where(entuser.ID(userID)).
		Only(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load user")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"nickname":        user.Nickname,
		"external_provider": user.ExternalProvider,
	})
}

// Consume exchanges a one-time code for a session (sets httpOnly cookies).
// It is called from the bta frontend after the browser is redirected back
// from the trusted site with ?code=...
func (h *SSOHandler) Consume(c echo.Context) error {
	var req ssoConsumeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "code is required")
	}

	userID, err := h.sso.ConsumeCode(req.Code)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
	}

	user, err := h.auth.DB().User.Query().
		Where(entuser.ID(userID)).
		WithSchool().
		Only(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load user")
	}

	access, refresh, err := h.auth.IssueTokens(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to issue tokens")
	}

	setAuthCookie(c, h.cfg, "access_token", access, 900, "/")
	setAuthCookie(c, h.cfg, "refresh_token", refresh, 604800, "/api/v1/auth")

	return c.JSON(http.StatusOK, map[string]string{"message": "success"})
}

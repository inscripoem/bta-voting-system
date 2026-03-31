package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AuthHandler struct {
	auth *service.AuthService
	cfg  *config.Config
}

func NewAuthHandler(auth *service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{auth: auth, cfg: cfg}
}

type guestRequest struct {
	Nickname   string   `json:"nickname"`
	SchoolCode string   `json:"school_code"`
	Method     string   `json:"method"` // "question" | "email"
	Answers    []string `json:"answers"`
	Email      string   `json:"email"`
	Code       string   `json:"code"`
}

func (h *AuthHandler) Guest(c echo.Context) error {
	var req guestRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ip := c.RealIP()
	ua := c.Request().UserAgent()
	ctx := c.Request().Context()

	var access, refresh string
	var err error

	switch req.Method {
	case "question":
		access, refresh, err = h.auth.GuestByQuestion(ctx, req.Nickname, req.SchoolCode, req.Answers, req.Email, req.Code, ip, ua)
	case "email":
		access, refresh, err = h.auth.GuestByEmail(ctx, req.Nickname, req.Email, req.Code, ip, ua)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid method")
	}

	if err != nil {
		switch err {
		case service.ErrNicknameConflictSameSchoolGuest:
			return c.JSON(http.StatusConflict, map[string]any{"conflict": "same_school", "is_guest": true})
		case service.ErrNicknameConflictSameSchoolFormal:
			return c.JSON(http.StatusConflict, map[string]any{"conflict": "same_school", "is_guest": false})
		case service.ErrWrongAnswer:
			return echo.NewHTTPError(http.StatusUnauthorized, "wrong answer")
		case service.ErrInvalidCode:
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
		case service.ErrEmailCodeRequired:
			return echo.NewHTTPError(http.StatusBadRequest, "email and code are required for question method")
		case service.ErrEmailSuffixNotAllowed:
			return echo.NewHTTPError(http.StatusBadRequest, "email suffix not allowed for this school")
		case service.ErrSchoolNotFound:
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		case service.ErrVerificationQuestionMisconfigured:
			return echo.NewHTTPError(http.StatusInternalServerError, "verification question misconfigured")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}

	h.setCookie(c, "access_token", access, 900, "/")
	h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

	return c.JSON(http.StatusOK, map[string]string{"message": "success"})
}

func (h *AuthHandler) CheckNickname(c echo.Context) error {
	nickname := c.QueryParam("nickname")
	schoolCode := c.QueryParam("school_code")
	if nickname == "" || schoolCode == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "nickname and school_code are required")
	}
	result, err := h.auth.CheckNickname(c.Request().Context(), nickname, schoolCode)
	if err != nil {
		if err == service.ErrSchoolNotFound {
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	resp := map[string]any{"available": result.Available}
	if !result.Available {
		resp["conflict"] = result.ConflictType
		if result.ConflictType == "same_school" && result.IsGuest != nil {
			resp["is_guest"] = *result.IsGuest
		}
	}
	return c.JSON(http.StatusOK, resp)
}

type claimNicknameRequest struct {
	Nickname   string `json:"nickname"`
	SchoolCode string `json:"school_code"`
	Email      string `json:"email"`
	Code       string `json:"code"`
}

func (h *AuthHandler) ClaimNickname(c echo.Context) error {
	var req claimNicknameRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Nickname == "" || req.SchoolCode == "" || req.Email == "" || req.Code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "all fields required")
	}
	access, refresh, err := h.auth.ClaimNickname(c.Request().Context(), req.Nickname, req.SchoolCode, req.Email, req.Code)
	if err != nil {
		switch err {
		case service.ErrInvalidCode:
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
		case service.ErrEmailMismatch:
			return c.JSON(http.StatusConflict, map[string]string{"conflict": "email_mismatch"})
		case service.ErrNicknameConflictSameSchoolFormal:
			return echo.NewHTTPError(http.StatusForbidden, "cannot claim formal user account")
		case service.ErrSchoolNotFound:
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}

	h.setCookie(c, "access_token", access, 900, "/")
	h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

	return c.JSON(http.StatusOK, map[string]string{"message": "success"})
}

type sendCodeRequest struct {
	Email      string `json:"email"`
	SchoolCode string `json:"school_code"`
}

func (h *AuthHandler) SendCode(c echo.Context) error {
	var req sendCodeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.auth.SendEmailCode(c.Request().Context(), req.Email, req.SchoolCode); err != nil {
		switch err {
		case service.ErrEmailSuffixNotAllowed:
			return echo.NewHTTPError(http.StatusBadRequest, "email suffix not allowed for this school")
		case service.ErrSchoolNotFound:
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "code sent"})
}

type registerDirectRequest struct {
	Nickname   string   `json:"nickname"`
	SchoolCode string   `json:"school_code"`
	Method     string   `json:"method"` // "question" | "email"
	Answers    []string `json:"answers"`
	Email      string   `json:"email"`
	Code       string   `json:"code"`
	Password   string   `json:"password"`
}

func (h *AuthHandler) RegisterDirect(c echo.Context) error {
	var req registerDirectRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "password is required")
	}

	ip := c.RealIP()
	ua := c.Request().UserAgent()
	ctx := c.Request().Context()

	var access, refresh string
	var err error

	switch req.Method {
	case "question":
		access, refresh, err = h.auth.RegisterByQuestion(ctx, req.Nickname, req.SchoolCode, req.Answers, req.Email, req.Code, req.Password, ip, ua)
	case "email":
		access, refresh, err = h.auth.RegisterByEmail(ctx, req.Nickname, req.Email, req.Code, req.Password, ip, ua)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid method")
	}

	if err != nil {
		switch err {
		case service.ErrNicknameConflictSameSchoolGuest:
			return c.JSON(http.StatusConflict, map[string]any{"conflict": "same_school", "is_guest": true})
		case service.ErrNicknameConflictSameSchoolFormal:
			return c.JSON(http.StatusConflict, map[string]any{"conflict": "same_school", "is_guest": false})
		case service.ErrWrongAnswer:
			return echo.NewHTTPError(http.StatusUnauthorized, "wrong answer")
		case service.ErrInvalidCode:
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
		case service.ErrEmailRequired:
			return echo.NewHTTPError(http.StatusBadRequest, "email is required")
		case service.ErrEmailAlreadyTaken:
			return echo.NewHTTPError(http.StatusConflict, "email already registered")
		case service.ErrEmailSuffixNotAllowed:
			return echo.NewHTTPError(http.StatusBadRequest, "email suffix not allowed for this school")
		case service.ErrSchoolNotFound:
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		case service.ErrVerificationQuestionMisconfigured:
			return echo.NewHTTPError(http.StatusInternalServerError, "verification question misconfigured")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}

	h.setCookie(c, "access_token", access, 900, "/")
	h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

	return c.JSON(http.StatusOK, map[string]string{"message": "success"})
}

type loginRequest struct {
	Identifier string `json:"identifier"` // email or nickname
	Password   string `json:"password"`
	SchoolCode string `json:"school_code"` // required if identifier is nickname
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	access, refresh, err := h.auth.LoginWithIdentifier(c.Request().Context(), req.Identifier, req.Password, req.SchoolCode)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	h.setCookie(c, "access_token", access, 900, "/")
	h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

	return c.JSON(http.StatusOK, map[string]string{"message": "success"})
}

// Me returns the current authenticated user's profile.
func (h *AuthHandler) Me(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	user, err := h.auth.DB().User.Query().Where(entuser.ID(claims.UserID)).WithSchool().Only(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found")
	}
	resp := map[string]any{
		"id":       user.ID,
		"nickname": user.Nickname,
		"role":     user.Role,
		"is_guest": user.IsGuest,
	}
	if user.Email != nil {
		resp["email"] = *user.Email
	}
	if user.Edges.School != nil {
		resp["school_id"] = user.Edges.School.ID
		resp["school_code"] = user.Edges.School.Code
	}
	return c.JSON(http.StatusOK, resp)
}

type upgradeRequest struct {
	Password string `json:"password"`
}

// Upgrade completes the account upgrade by setting a password and making the user formal.
func (h *AuthHandler) Upgrade(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)

	var req upgradeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "password is required")
	}

	user, err := h.auth.DB().User.Query().Where(entuser.ID(claims.UserID)).Only(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "user not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load user")
	}
	if user.Email == nil {
		return echo.NewHTTPError(http.StatusBadRequest, "email not verified: call /auth/verify-email first")
	}

	hashed, err := service.HashPassword(req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to hash password")
	}

	err = h.auth.DB().User.UpdateOneID(claims.UserID).
		SetPasswordHash(hashed).
		SetIsGuest(false).
		Exec(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to upgrade account")
	}

	updatedUser, err := h.auth.DB().User.Query().Where(entuser.ID(claims.UserID)).WithSchool().Only(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load updated user")
	}

	var schoolID *uuid.UUID
	if updatedUser.Edges.School != nil {
		sid := updatedUser.Edges.School.ID
		schoolID = &sid
	}

	access, err := h.auth.JWT().GenerateAccess(updatedUser.ID, string(updatedUser.Role), schoolID, false)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate access token")
	}

	h.setCookie(c, "access_token", access, 900, "/")

	return c.JSON(http.StatusOK, map[string]string{"message": "账户升级成功"})
}

type verifyEmailRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// VerifyEmail POST verifies the email code and associates it with the user.
func (h *AuthHandler) VerifyEmail(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	var req verifyEmailRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if err := h.auth.VerifyEmailCode(c.Request().Context(), claims.UserID, req.Email, req.Code); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "邮箱验证成功"})
}

func (h *AuthHandler) setCookie(c echo.Context, name, value string, maxAge int, path string) {
	cookie := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: parseSameSite(h.cfg.CookieSameSite),
	}
	if h.cfg.CookieDomain != "" {
		cookie.Domain = h.cfg.CookieDomain
	}
	c.SetCookie(cookie)
}

func (h *AuthHandler) clearCookie(c echo.Context, name string, path string) {
	cookie := &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     path,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: parseSameSite(h.cfg.CookieSameSite),
	}
	if h.cfg.CookieDomain != "" {
		cookie.Domain = h.cfg.CookieDomain
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

func (h *AuthHandler) Refresh(c echo.Context) error {
	cookie, err := c.Cookie("refresh_token")
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing refresh token")
	}

	userID, err := h.auth.JWT().ParseRefresh(cookie.Value)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid refresh token")
	}

	user, err := h.auth.DB().User.Query().
		Where(entuser.ID(userID)).
		WithSchool().
		Only(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
	}

	var schoolID *uuid.UUID
	if user.Edges.School != nil {
		sid := user.Edges.School.ID
		schoolID = &sid
	}

	access, err := h.auth.JWT().GenerateAccess(user.ID, string(user.Role), schoolID, user.IsGuest)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate access token")
	}

	refresh, err := h.auth.JWT().GenerateRefresh(user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate refresh token")
	}

	h.setCookie(c, "access_token", access, 900, "/")
	h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

	return c.JSON(http.StatusOK, map[string]string{"message": "refreshed"})
}

func (h *AuthHandler) Logout(c echo.Context) error {
	h.clearCookie(c, "access_token", "/")
	h.clearCookie(c, "refresh_token", "/api/v1/auth")
	return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}

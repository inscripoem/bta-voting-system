package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AuthHandler struct {
	auth    *service.AuthService
	frontendURL string
}

func NewAuthHandler(auth *service.AuthService, frontendURL string) *AuthHandler {
	return &AuthHandler{auth: auth, frontendURL: frontendURL}
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
		case service.ErrNicknameConflictDifferentSchool:
			return c.JSON(http.StatusConflict, map[string]any{"conflict": "different_school"})
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
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}

	return c.JSON(http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
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
	return c.JSON(http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
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
		case service.ErrNicknameConflictDifferentSchool:
			return c.JSON(http.StatusConflict, map[string]any{"conflict": "different_school"})
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
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}

	return c.JSON(http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	access, refresh, err := h.auth.Login(c.Request().Context(), req.Email, req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}
	return c.JSON(http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
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

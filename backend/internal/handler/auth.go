package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

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
	Nickname   string `json:"nickname"`
	SchoolCode string `json:"school_code"`
	Method     string `json:"method"` // "question" | "email"
	Answer     string `json:"answer"`
	Email      string `json:"email"`
	Code       string `json:"code"`
	Reauth     bool   `json:"reauth"` // true = re-authentication for conflict resolution
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

	if req.Reauth {
		// Re-authentication flow for nickname conflict resolution
		switch req.Method {
		case "question":
			access, refresh, err = h.auth.ReauthByQuestion(ctx, req.Nickname, req.SchoolCode, req.Answer)
		case "email":
			access, refresh, err = h.auth.ReauthByEmail(ctx, req.Nickname, req.Email, req.Code)
		default:
			return echo.NewHTTPError(http.StatusBadRequest, "invalid method")
		}
	} else {
		switch req.Method {
		case "question":
			access, refresh, err = h.auth.GuestByQuestion(ctx, req.Nickname, req.SchoolCode, req.Answer, ip, ua)
		case "email":
			access, refresh, err = h.auth.GuestByEmail(ctx, req.Nickname, req.Email, req.Code, ip, ua)
		default:
			return echo.NewHTTPError(http.StatusBadRequest, "invalid method")
		}
	}

	if err != nil {
		switch err {
		case service.ErrNicknameConflictSameSchool:
			return c.JSON(http.StatusConflict, map[string]string{"conflict": "same_school"})
		case service.ErrNicknameConflictDifferentSchool:
			return c.JSON(http.StatusConflict, map[string]string{"conflict": "different_school"})
		case service.ErrWrongAnswer:
			return echo.NewHTTPError(http.StatusUnauthorized, "wrong answer")
		case service.ErrInvalidCode:
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
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
	Nickname   string `json:"nickname"`
	SchoolCode string `json:"school_code"`
	Method     string `json:"method"` // "question" | "email"
	Answer     string `json:"answer"`
	Email      string `json:"email"`
	Code       string `json:"code"`
	Password   string `json:"password"`
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
		access, refresh, err = h.auth.RegisterByQuestion(ctx, req.Nickname, req.SchoolCode, req.Answer, req.Password, ip, ua)
	case "email":
		access, refresh, err = h.auth.RegisterByEmail(ctx, req.Nickname, req.Email, req.Code, req.Password, ip, ua)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid method")
	}

	if err != nil {
		switch err {
		case service.ErrNicknameConflictSameSchool:
			return c.JSON(http.StatusConflict, map[string]string{"conflict": "same_school"})
		case service.ErrNicknameConflictDifferentSchool:
			return c.JSON(http.StatusConflict, map[string]string{"conflict": "different_school"})
		case service.ErrWrongAnswer:
			return echo.NewHTTPError(http.StatusUnauthorized, "wrong answer")
		case service.ErrInvalidCode:
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
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

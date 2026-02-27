package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
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

type loginRequest struct {
	Nickname string `json:"nickname"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	access, refresh, err := h.auth.Login(c.Request().Context(), req.Nickname, req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}
	return c.JSON(http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
}

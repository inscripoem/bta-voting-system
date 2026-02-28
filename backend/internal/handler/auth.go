package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

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

// Me returns the current authenticated user's profile.
func (h *AuthHandler) Me(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	user, err := h.auth.DB().User.Get(c.Request().Context(), claims.UserID)
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
	if claims.SchoolID != nil {
		resp["school_id"] = claims.SchoolID
	}
	return c.JSON(http.StatusOK, resp)
}

type upgradeRequest struct {
	Email string `json:"email"`
}

// Upgrade initiates the account upgrade flow by sending a verification email.
func (h *AuthHandler) Upgrade(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)

	var req upgradeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// Basic email format validation
	if !strings.Contains(req.Email, "@") {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid email format")
	}

	// Generate a short-lived email verification token (24h)
	token, err := h.auth.JWT().GenerateEmailVerify(claims.UserID, req.Email)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate token")
	}

	link := fmt.Sprintf("%s/auth/verify-email?token=%s", h.frontendURL, token)

	if err := h.auth.Email().SendUpgradeVerification(req.Email, link); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to send email")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "验证邮件已发送"})
}

// VerifyEmail completes the account upgrade by verifying the email token.
func (h *AuthHandler) VerifyEmail(c echo.Context) error {
	tokenStr := c.QueryParam("token")
	if tokenStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "missing token")
	}

	claims, err := h.auth.JWT().ParseEmailVerify(tokenStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
	}

	ctx := c.Request().Context()
	_, err = h.auth.DB().User.UpdateOneID(claims.UserID).
		SetIsGuest(false).
		SetEmail(claims.NewEmail).
		Save(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to upgrade account")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "账户升级成功"})
}

package middleware

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

const ClaimsKey = "claims"

func JWT(jwtSvc *service.JWTService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			var token string

			if cookie, err := c.Cookie("access_token"); err == nil {
				token = cookie.Value
			} else {
				header := c.Request().Header.Get("Authorization")
				if strings.HasPrefix(header, "Bearer ") {
					token = strings.TrimPrefix(header, "Bearer ")
				}
			}

			if token == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing or invalid authorization")
			}

			claims, err := jwtSvc.ParseAccess(token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
			}
			c.Set(ClaimsKey, claims)
			return next(c)
		}
	}
}

func RequireRole(roles ...string) echo.MiddlewareFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			claims, ok := c.Get(ClaimsKey).(*service.Claims)
			if !ok || claims == nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing claims")
			}
			if !allowed[claims.Role] {
				return echo.NewHTTPError(http.StatusForbidden, "insufficient permissions")
			}
			return next(c)
		}
	}
}

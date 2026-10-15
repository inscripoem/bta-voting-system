package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

func TestCreateSchoolRejectsSchoolAdmin(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/schools", strings.NewReader(`{"name":"Unauthorized","code":"new"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	c := e.NewContext(req, httptest.NewRecorder())
	c.Set(middleware.ClaimsKey, &service.Claims{Role: "school_admin"})
	// A nil DB proves the request is rejected before any database access.
	err := NewAdminHandler(nil, nil).CreateSchool(c)
	var httpErr *echo.HTTPError
	require.ErrorAs(t, err, &httpErr)
	require.Equal(t, http.StatusForbidden, httpErr.Code)
}

package handler

import (
	"net/http"
	"strings"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
)

type userAdminListItem struct {
	ID         string    `json:"id"`
	Nickname   string    `json:"nickname"`
	Email      *string   `json:"email"`
	Role       string    `json:"role"`
	SchoolID   *string   `json:"school_id"`
	SchoolName *string   `json:"school_name"`
	IsGuest    bool      `json:"is_guest"`
	CreatedAt  time.Time `json:"created_at"`
}

type patchUserRoleRequest struct {
	Role string `json:"role"`
}

func userToAdminResponse(u *ent.User) userAdminListItem {
	var (
		schoolID   *string
		schoolName *string
	)
	if u.Edges.School != nil {
		id := u.Edges.School.ID.String()
		name := u.Edges.School.Name
		schoolID = &id
		schoolName = &name
	}
	return userAdminListItem{
		ID:         u.ID.String(),
		Nickname:   u.Nickname,
		Email:      u.Email,
		Role:       string(u.Role),
		SchoolID:   schoolID,
		SchoolName: schoolName,
		IsGuest:    u.IsGuest,
		CreatedAt:  u.CreatedAt,
	}
}

func parseUserRole(role string) (entuser.Role, error) {
	parsed := entuser.Role(role)
	if err := entuser.RoleValidator(parsed); err != nil {
		return "", err
	}
	return parsed, nil
}

// ListUsers returns paginated users (super_admin only).
func (h *AdminHandler) ListUsers(c echo.Context) error {
	ctx := c.Request().Context()

	offset, limit, err := parsePagination(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	page := offset/limit + 1
	pageSize := limit

	q := h.db.User.Query()
	if qStr := strings.TrimSpace(c.QueryParam("q")); qStr != "" {
		filter := entuser.Or(
			entuser.NicknameContainsFold(qStr),
			entuser.EmailContainsFold(qStr),
			entuser.HasSchoolWith(entschool.NameContainsFold(qStr)),
		)
		q = q.Where(filter)
	}

	total, err := q.Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	users, err := q.
		Order(entuser.ByCreatedAt(sql.OrderDesc())).
		Offset(offset).
		Limit(limit).
		WithSchool().
		All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	out := make([]userAdminListItem, 0, len(users))
	for _, u := range users {
		out = append(out, userToAdminResponse(u))
	}

	return c.JSON(http.StatusOK, paginatedResponse(out, total, page, pageSize))
}

// PatchUserRole updates a user's role (super_admin only).
func (h *AdminHandler) PatchUserRole(c echo.Context) error {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid user id")
	}

	var req patchUserRoleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Role == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "role is required")
	}
	parsedRole, err := parseUserRole(req.Role)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid role")
	}

	if err := h.db.User.UpdateOneID(userID).
		SetRole(parsedRole).
		Exec(c.Request().Context()); err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "user not found")
		}
		if ent.IsValidationError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	updated, err := h.db.User.Query().
		Where(entuser.ID(userID)).
		WithSchool().
		Only(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "user not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, userToAdminResponse(updated))
}

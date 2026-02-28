package handler

import (
	"net/http"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entaward "github.com/inscripoem/bta-voting-system/backend/internal/ent/award"
	entnominee "github.com/inscripoem/bta-voting-system/backend/internal/ent/nominee"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
	entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
	entvotingsession "github.com/inscripoem/bta-voting-system/backend/internal/ent/votingsession"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type voteItemAdminResponse struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	UserNickname string    `json:"user_nickname"`
	SchoolID     string    `json:"school_id"`
	SchoolName   string    `json:"school_name"`
	AwardID      string    `json:"award_id"`
	AwardName    string    `json:"award_name"`
	NomineeID    string    `json:"nominee_id"`
	NomineeName  string    `json:"nominee_name"`
	SessionID    string    `json:"session_id"`
	Score        int       `json:"score"`
	IPAddress    string    `json:"ip_address"`
	UserAgent    string    `json:"user_agent"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ListVoteItems returns paginated vote items for a session.
// super_admin: all schools for that session.
// school_admin: only their own school.
func (h *AdminHandler) ListVoteItems(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	sessionIDStr := c.QueryParam("session_id")
	if sessionIDStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "session_id is required")
	}
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
	}

	offset, limit, err := parsePagination(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	page := offset/limit + 1
	pageSize := limit

	q := h.db.VoteItem.Query().
		Where(entvoteitem.HasSessionWith(entvotingsession.ID(sessionID)))

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		q = q.Where(entvoteitem.HasSchoolWith(entschool.ID(*claims.SchoolID)))
	}

	total, err := q.Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	items, err := q.
		Order(entvoteitem.ByUpdatedAt(sql.OrderDesc())).
		Offset(offset).
		Limit(limit).
		WithUser(func(q *ent.UserQuery) {
			q.Select(entuser.FieldID, entuser.FieldNickname)
		}).
		WithSchool(func(q *ent.SchoolQuery) {
			q.Select(entschool.FieldID, entschool.FieldName)
		}).
		WithAward(func(q *ent.AwardQuery) {
			q.Select(entaward.FieldID, entaward.FieldName)
		}).
		WithNominee(func(q *ent.NomineeQuery) {
			q.Select(entnominee.FieldID, entnominee.FieldName)
		}).
		WithSession(func(q *ent.VotingSessionQuery) {
			q.Select(entvotingsession.FieldID)
		}).
		All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	out := make([]voteItemAdminResponse, 0, len(items))
	for _, it := range items {
		out = append(out, voteItemAdminResponse{
			ID:           it.ID.String(),
			UserID:       it.Edges.User.ID.String(),
			UserNickname: it.Edges.User.Nickname,
			SchoolID:     it.Edges.School.ID.String(),
			SchoolName:   it.Edges.School.Name,
			AwardID:      it.Edges.Award.ID.String(),
			AwardName:    it.Edges.Award.Name,
			NomineeID:    it.Edges.Nominee.ID.String(),
			NomineeName:  it.Edges.Nominee.Name,
			SessionID:    it.Edges.Session.ID.String(),
			Score:        it.Score,
			IPAddress:    it.IPAddress,
			UserAgent:    it.UserAgent,
			UpdatedAt:    it.UpdatedAt,
		})
	}

	return c.JSON(http.StatusOK, paginatedResponse(out, total, page, pageSize))
}

// DeleteVoteItem deletes a vote item (super_admin only).
func (h *AdminHandler) DeleteVoteItem(c echo.Context) error {
	ctx := c.Request().Context()

	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid vote item id")
	}

	if err := h.db.VoteItem.DeleteOneID(itemID).Exec(ctx); err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "vote item not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
	entvotingsession "github.com/inscripoem/bta-voting-system/backend/internal/ent/votingsession"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AdminHandler struct {
	db *ent.Client
}

func NewAdminHandler(db *ent.Client) *AdminHandler {
	return &AdminHandler{db: db}
}

type patchStatusRequest struct {
	Status string `json:"status"`
}

func (h *AdminHandler) PatchSessionStatus(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	if claims.Role != "super_admin" {
		return echo.NewHTTPError(http.StatusForbidden, "super_admin required")
	}

	var req patchStatusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	validStatuses := map[string]bool{
		"pending":   true,
		"active":    true,
		"counting":  true,
		"published": true,
	}
	if !validStatuses[req.Status] {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}
	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session id")
	}
	session, err := h.db.VotingSession.UpdateOneID(sessionID).
		SetStatus(entvotingsession.Status(req.Status)).
		Save(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "session not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"status": string(session.Status)})
}

// ExportVotes exports vote items as CSV.
// super_admin: all schools or filtered by ?school_id=
// school_admin: only their own school
func (h *AdminHandler) ExportVotes(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	sessionIDStr := c.QueryParam("session_id")

	q := h.db.VoteItem.Query().
		WithUser().
		WithSchool().
		WithAward().
		WithNominee()

	if sessionIDStr != "" {
		sessionID, err := uuid.Parse(sessionIDStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
		}
		q = q.Where(entvoteitem.HasSessionWith(entvotingsession.ID(sessionID)))
	}

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		q = q.Where(entvoteitem.HasSchoolWith(entschool.ID(*claims.SchoolID)))
	} else if schoolIDStr := c.QueryParam("school_id"); schoolIDStr != "" {
		schoolID, err := uuid.Parse(schoolIDStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid school_id")
		}
		q = q.Where(entvoteitem.HasSchoolWith(entschool.ID(schoolID)))
	}

	items, err := q.All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", "attachment; filename=votes.csv")
	w := csv.NewWriter(c.Response())
	_ = w.Write([]string{"user_nickname", "school", "award", "nominee", "score", "ip_address", "updated_at"})
	for _, it := range items {
		_ = w.Write([]string{
			it.Edges.User.Nickname,
			it.Edges.School.Name,
			it.Edges.Award.Name,
			it.Edges.Nominee.Name,
			fmt.Sprintf("%d", it.Score),
			it.IPAddress,
			it.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	w.Flush()
	return nil
}

// Results returns aggregate scores per nominee for a session (only when published).
func (h *AdminHandler) Results(c echo.Context) error {
	ctx := c.Request().Context()
	sessionIDStr := c.QueryParam("session_id")

	var sessionID uuid.UUID
	if sessionIDStr != "" {
		var err error
		sessionID, err = uuid.Parse(sessionIDStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
		}
	} else {
		session, err := h.db.VotingSession.Query().
			Where(entvotingsession.StatusEQ(entvotingsession.StatusPublished)).
			Order(entvotingsession.ByYear(sql.OrderDesc())).
			First(ctx)
		if err != nil {
			// No published session — return empty
			return c.JSON(http.StatusOK, []interface{}{})
		}
		sessionID = session.ID
	}

	// Verify the session exists and is published
	session, err := h.db.VotingSession.Get(ctx, sessionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "session not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if session.Status != entvotingsession.StatusPublished {
		return echo.NewHTTPError(http.StatusForbidden, "results not yet published")
	}

	items, err := h.db.VoteItem.Query().
		Where(entvoteitem.HasSessionWith(entvotingsession.ID(sessionID))).
		WithNominee().
		WithAward().
		All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	type result struct {
		AwardID   uuid.UUID `json:"award_id"`
		NomineeID uuid.UUID `json:"nominee_id"`
		Total     int       `json:"total"`
	}
	totals := make(map[uuid.UUID]*result)
	for _, it := range items {
		nid := it.Edges.Nominee.ID
		if _, ok := totals[nid]; !ok {
			totals[nid] = &result{
				AwardID:   it.Edges.Award.ID,
				NomineeID: nid,
			}
		}
		totals[nid].Total += it.Score
	}
	out := make([]*result, 0, len(totals))
	for _, r := range totals {
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// CreateSchool creates a new school (super_admin only).
type createSchoolRequest struct {
	Name                  string              `json:"name"`
	Code                  string              `json:"code"`
	EmailSuffixes         []string            `json:"email_suffixes"`
	VerificationQuestions []map[string]string `json:"verification_questions"`
}

func (h *AdminHandler) CreateSchool(c echo.Context) error {
	var req createSchoolRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	school, err := h.db.School.Create().
		SetName(req.Name).
		SetCode(req.Code).
		SetEmailSuffixes(req.EmailSuffixes).
		SetVerificationQuestions(req.VerificationQuestions).
		Save(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": school.ID.String()})
}

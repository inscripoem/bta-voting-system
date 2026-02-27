package handler

import (
	"net/http"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entaward "github.com/inscripoem/bta-voting-system/backend/internal/ent/award"
	entnominee "github.com/inscripoem/bta-voting-system/backend/internal/ent/nominee"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entvotingsession "github.com/inscripoem/bta-voting-system/backend/internal/ent/votingsession"
)

type AwardHandler struct {
	db *ent.Client
}

func NewAwardHandler(db *ent.Client) *AwardHandler {
	return &AwardHandler{db: db}
}

// List returns awards + nominees for the current active/published session.
// Optional ?school_id= query param to include entertainment awards for that school.
func (h *AwardHandler) List(c echo.Context) error {
	ctx := c.Request().Context()

	// Find current session (active, counting, or published)
	session, err := h.db.VotingSession.Query().
		Where(entvotingsession.StatusIn(
			entvotingsession.StatusActive,
			entvotingsession.StatusPublished,
			entvotingsession.StatusCounting,
		)).
		Order(entvotingsession.ByYear(sql.OrderDesc())).
		First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return c.JSON(http.StatusOK, []interface{}{})
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	// Base query: awards for this session
	q := h.db.Award.Query().
		Where(entaward.HasSessionWith(entvotingsession.ID(session.ID))).
		WithNominees(func(nq *ent.NomineeQuery) {
			nq.Order(entnominee.ByDisplayOrder())
		}).
		WithSchool().
		Order(entaward.ByDisplayOrder())

	schoolIDStr := c.QueryParam("school_id")
	if schoolIDStr != "" {
		schoolID, err := uuid.Parse(schoolIDStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid school_id")
		}
		// Include global awards (no school) + this school's entertainment awards
		q = q.Where(
			entaward.Or(
				entaward.Not(entaward.HasSchool()),
				entaward.HasSchoolWith(entschool.ID(schoolID)),
			),
		)
	} else {
		// Only global awards
		q = q.Where(entaward.Not(entaward.HasSchool()))
	}

	awards, err := q.All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	type nomineeResp struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		CoverImageKey string `json:"cover_image_key,omitempty"`
		Description  string `json:"description,omitempty"`
		DisplayOrder int    `json:"display_order"`
	}
	type awardResp struct {
		ID           string        `json:"id"`
		Name         string        `json:"name"`
		Description  string        `json:"description,omitempty"`
		Category     string        `json:"category"`
		ScoreConfig  interface{}   `json:"score_config"`
		DisplayOrder int           `json:"display_order"`
		SchoolID     *string       `json:"school_id,omitempty"`
		Nominees     []nomineeResp `json:"nominees"`
	}

	out := make([]awardResp, 0, len(awards))
	for _, a := range awards {
		nominees := make([]nomineeResp, 0, len(a.Edges.Nominees))
		for _, n := range a.Edges.Nominees {
			nominees = append(nominees, nomineeResp{
				ID:            n.ID.String(),
				Name:          n.Name,
				CoverImageKey: n.CoverImageKey,
				Description:   n.Description,
				DisplayOrder:  n.DisplayOrder,
			})
		}
		ar := awardResp{
			ID:           a.ID.String(),
			Name:         a.Name,
			Description:  a.Description,
			Category:     string(a.Category),
			ScoreConfig:  a.ScoreConfig,
			DisplayOrder: a.DisplayOrder,
			Nominees:     nominees,
		}
		if a.Edges.School != nil {
			sid := a.Edges.School.ID.String()
			ar.SchoolID = &sid
		}
		out = append(out, ar)
	}

	return c.JSON(http.StatusOK, out)
}

// CurrentSession returns info about the current voting session.
func (h *AwardHandler) CurrentSession(c echo.Context) error {
	session, err := h.db.VotingSession.Query().
		Order(entvotingsession.ByYear(sql.OrderDesc())).
		First(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "no session found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"id":     session.ID,
		"year":   session.Year,
		"name":   session.Name,
		"status": session.Status,
	})
}

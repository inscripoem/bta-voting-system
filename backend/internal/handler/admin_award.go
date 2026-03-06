package handler

import (
	"net/http"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entaward "github.com/inscripoem/bta-voting-system/backend/internal/ent/award"
	entnominee "github.com/inscripoem/bta-voting-system/backend/internal/ent/nominee"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
	entvotingsession "github.com/inscripoem/bta-voting-system/backend/internal/ent/votingsession"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

func parseAwardType(t string) (entaward.Type, error) {
	parsed := entaward.Type(t)
	if err := entaward.TypeValidator(parsed); err != nil {
		return "", err
	}
	return parsed, nil
}

type awardAdminResponse struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	Category     string             `json:"category"`
	Type         string             `json:"type"`
	ScoreConfig  schema.ScoreConfig `json:"score_config"`
	DisplayOrder int                `json:"display_order"`
	SessionID    string             `json:"session_id"`
	SchoolID     *string            `json:"school_id"`
	NomineeCount int                `json:"nominee_count"`
}

type createAwardRequest struct {
	SessionID    string              `json:"session_id"`
	Name         string              `json:"name"`
	Category     string              `json:"category"`
	Type         *string             `json:"type"`
	ScoreConfig  *schema.ScoreConfig `json:"score_config"`
	DisplayOrder *int                `json:"display_order"`
	SchoolID     *string             `json:"school_id"`
}

type updateAwardRequest struct {
	SessionID    *string             `json:"session_id"`
	Name         *string             `json:"name"`
	Category     *string             `json:"category"`
	Type         *string             `json:"type"`
	ScoreConfig  *schema.ScoreConfig `json:"score_config"`
	DisplayOrder *int                `json:"display_order"`
	SchoolID     *string             `json:"school_id"`
}

func parseAwardCategory(category string) (entaward.Category, error) {
	parsed := entaward.Category(category)
	if err := entaward.CategoryValidator(parsed); err != nil {
		return "", err
	}
	return parsed, nil
}

func awardToAdminResponse(a *ent.Award, nomineeCount int) awardAdminResponse {
	var (
		sessionID string
		schoolID  *string
	)
	if a.Edges.Session != nil {
		sessionID = a.Edges.Session.ID.String()
	}
	if a.Edges.School != nil {
		sid := a.Edges.School.ID.String()
		schoolID = &sid
	}
	return awardAdminResponse{
		ID:           a.ID.String(),
		Name:         a.Name,
		Category:     string(a.Category),
		Type:         string(a.Type),
		ScoreConfig:  a.ScoreConfig,
		DisplayOrder: a.DisplayOrder,
		SessionID:    sessionID,
		SchoolID:     schoolID,
		NomineeCount: nomineeCount,
	}
}

// ListAwards returns paginated awards.
// super_admin: optional ?session_id= filter, returns all awards for that session.
// school_admin: only entertainment awards for their school (ignores session_id).
func (h *AdminHandler) ListAwards(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	offset, limit, err := parsePagination(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	page := offset/limit + 1
	pageSize := limit

	q := h.db.Award.Query()

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		q = q.Where(
			entaward.HasSchoolWith(entschool.ID(*claims.SchoolID)),
			entaward.CategoryEQ(entaward.CategoryEntertainment),
		)
	} else {
		if sessionIDStr := c.QueryParam("session_id"); sessionIDStr != "" {
			sessionID, err := uuid.Parse(sessionIDStr)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
			}
			q = q.Where(entaward.HasSessionWith(entvotingsession.ID(sessionID)))
		}
	}

	total, err := q.Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	awards, err := q.
		Order(
			entaward.ByDisplayOrder(),
			entaward.ByCreatedAt(sql.OrderDesc()),
		).
		Offset(offset).
		Limit(limit).
		WithSession().
		WithSchool().
		All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	counts := make(map[uuid.UUID]int, len(awards))
	if len(awards) > 0 {
		ids := make([]uuid.UUID, 0, len(awards))
		for _, a := range awards {
			ids = append(ids, a.ID)
		}
		var rows []struct {
			AwardID      uuid.UUID `json:"award_nominees"`
			NomineeCount int       `json:"nominee_count"`
		}
		if err := h.db.Nominee.Query().
			Where(entnominee.HasAwardWith(entaward.IDIn(ids...))).
			GroupBy(entnominee.AwardColumn).
			Aggregate(ent.As(ent.Count(), "nominee_count")).
			Scan(ctx, &rows); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		for _, row := range rows {
			counts[row.AwardID] = row.NomineeCount
		}
	}

	out := make([]awardAdminResponse, 0, len(awards))
	for _, a := range awards {
		out = append(out, awardToAdminResponse(a, counts[a.ID]))
	}

	return c.JSON(http.StatusOK, paginatedResponse(out, total, page, pageSize))
}

// CreateAward creates a new award.
// super_admin: uses request values for category and school_id (optional).
// school_admin: forces category=entertainment and school_id=claims.school_id.
func (h *AdminHandler) CreateAward(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	var req createAwardRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.SessionID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "session_id required")
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	if req.ScoreConfig == nil {
		return echo.NewHTTPError(http.StatusBadRequest, "score_config required")
	}

	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
	}

	var (
		category entaward.Category
		schoolID *uuid.UUID
	)
	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		category = entaward.CategoryEntertainment
		schoolID = claims.SchoolID
	} else {
		if req.Category == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "category required")
		}
		parsed, err := parseAwardCategory(req.Category)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid category")
		}
		category = parsed
		if req.SchoolID != nil && *req.SchoolID != "" {
			parsedSchoolID, err := uuid.Parse(*req.SchoolID)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid school_id")
			}
			schoolID = &parsedSchoolID
		}
	}

	awardType := entaward.TypeOther
	if req.Type != nil && *req.Type != "" {
		parsed, err := parseAwardType(*req.Type)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid award type")
		}
		awardType = parsed
	}

	create := h.db.Award.Create().
		SetSessionID(sessionID).
		SetName(req.Name).
		SetCategory(category).
		SetType(awardType).
		SetScoreConfig(*req.ScoreConfig)
	if req.DisplayOrder != nil {
		create.SetDisplayOrder(*req.DisplayOrder)
	}
	if schoolID != nil {
		create.SetSchoolID(*schoolID)
	}

	award, err := create.Save(ctx)
	if err != nil {
		if ent.IsValidationError(err) || ent.IsConstraintError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": award.ID.String()})
}

// UpdateAward updates an award.
// super_admin: can modify all fields.
// school_admin: only name, score_config, display_order (own entertainment awards only).
func (h *AdminHandler) UpdateAward(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	awardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid award id")
	}

	var req updateAwardRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	existing, err := h.db.Award.Query().
		Where(entaward.ID(awardID)).
		WithSchool().
		WithSession().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "award not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		if existing.Edges.School == nil || existing.Edges.School.ID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot modify another school")
		}
		if existing.Category != entaward.CategoryEntertainment {
			return echo.NewHTTPError(http.StatusForbidden, "only entertainment awards are allowed")
		}
	}

	update := h.db.Award.UpdateOneID(awardID)

	if claims.Role == "school_admin" {
		if req.Name != nil {
			update.SetName(*req.Name)
		}
		if req.ScoreConfig != nil {
			update.SetScoreConfig(*req.ScoreConfig)
		}
		if req.DisplayOrder != nil {
			update.SetDisplayOrder(*req.DisplayOrder)
		}
		if req.Type != nil {
			parsed, err := parseAwardType(*req.Type)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid type")
			}
			update.SetType(parsed)
		}
	} else {
		if req.Name != nil {
			update.SetName(*req.Name)
		}
		if req.Category != nil {
			parsed, err := parseAwardCategory(*req.Category)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid category")
			}
			update.SetCategory(parsed)
		}
		if req.Type != nil {
			parsed, err := parseAwardType(*req.Type)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid type")
			}
			update.SetType(parsed)
		}
		if req.ScoreConfig != nil {
			update.SetScoreConfig(*req.ScoreConfig)
		}
		if req.DisplayOrder != nil {
			update.SetDisplayOrder(*req.DisplayOrder)
		}
		if req.SessionID != nil {
			if *req.SessionID == "" {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
			}
			parsedSessionID, err := uuid.Parse(*req.SessionID)
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
			}
			update.SetSessionID(parsedSessionID)
		}
		if req.SchoolID != nil {
			if *req.SchoolID == "" {
				update.ClearSchool()
			} else {
				parsedSchoolID, err := uuid.Parse(*req.SchoolID)
				if err != nil {
					return echo.NewHTTPError(http.StatusBadRequest, "invalid school_id")
				}
				update.SetSchoolID(parsedSchoolID)
			}
		}
	}

	if _, err := update.Save(ctx); err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "award not found")
		}
		if ent.IsValidationError(err) || ent.IsConstraintError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	updated, err := h.db.Award.Query().
		Where(entaward.ID(awardID)).
		WithSession().
		WithSchool().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "award not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	nomineeCount, err := h.db.Nominee.Query().
		Where(entnominee.HasAwardWith(entaward.ID(awardID))).
		Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, awardToAdminResponse(updated, nomineeCount))
}

// DeleteAward deletes an award and its nominees.
// super_admin: any award.
// school_admin: entertainment awards for their school only.
func (h *AdminHandler) DeleteAward(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	awardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid award id")
	}

	existing, err := h.db.Award.Query().
		Where(entaward.ID(awardID)).
		WithSchool().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "award not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		if existing.Edges.School == nil || existing.Edges.School.ID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot delete another school")
		}
		if existing.Category != entaward.CategoryEntertainment {
			return echo.NewHTTPError(http.StatusForbidden, "only entertainment awards are allowed")
		}
	}

	tx, err := h.db.Tx(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if _, err := tx.VoteItem.Delete().
		Where(entvoteitem.HasAwardWith(entaward.ID(awardID))).
		Exec(ctx); err != nil {
		_ = tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if _, err := tx.Nominee.Delete().
		Where(entnominee.HasAwardWith(entaward.ID(awardID))).
		Exec(ctx); err != nil {
		_ = tx.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if err := tx.Award.DeleteOneID(awardID).Exec(ctx); err != nil {
		_ = tx.Rollback()
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "award not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if err := tx.Commit(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

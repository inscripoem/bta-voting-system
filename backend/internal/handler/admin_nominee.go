package handler

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entaward "github.com/inscripoem/bta-voting-system/backend/internal/ent/award"
	entnominee "github.com/inscripoem/bta-voting-system/backend/internal/ent/nominee"
	entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type nomineeAdminResponse struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	CoverImageKey string  `json:"cover_image_key"`
	CoverImageURL *string `json:"cover_image_url"`
	Description   string  `json:"description"`
	DisplayOrder  int     `json:"display_order"`
	AwardID       string  `json:"award_id"`
}

type createNomineeRequest struct {
	AwardID       string  `json:"award_id"`
	Name          string  `json:"name"`
	CoverImageKey *string `json:"cover_image_key"`
	Description   *string `json:"description"`
	DisplayOrder  *int    `json:"display_order"`
}

type updateNomineeRequest struct {
	Name          *string `json:"name"`
	CoverImageKey *string `json:"cover_image_key"`
	Description   *string `json:"description"`
	DisplayOrder  *int    `json:"display_order"`
}

func invalidCoverImageKey(key string) bool {
	return strings.Contains(key, "..")
}

func (h *AdminHandler) ListNominees(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	awardIDStr := c.QueryParam("award_id")
	if awardIDStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "award_id is required")
	}
	awardID, err := uuid.Parse(awardIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid award id")
	}

	award, err := h.db.Award.Query().
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
		if award.Edges.School == nil || award.Edges.School.ID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot access another school")
		}
	}

	offset, limit, err := parsePagination(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	page := offset/limit + 1
	pageSize := limit

	filter := entnominee.HasAwardWith(entaward.ID(awardID))
	total, err := h.db.Nominee.Query().Where(filter).Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	nominees, err := h.db.Nominee.Query().
		Where(filter).
		Order(entnominee.ByDisplayOrder()).
		Offset(offset).
		Limit(limit).
		All(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	out := make([]nomineeAdminResponse, 0, len(nominees))
	for _, n := range nominees {
		out = append(out, nomineeAdminResponse{
			ID:            n.ID.String(),
			Name:          n.Name,
			CoverImageKey: n.CoverImageKey,
			CoverImageURL: buildCoverURL(h.cfg, n.CoverImageKey),
			Description:   n.Description,
			DisplayOrder:  n.DisplayOrder,
			AwardID:       awardID.String(),
		})
	}

	return c.JSON(http.StatusOK, paginatedResponse(out, total, page, pageSize))
}

func (h *AdminHandler) CreateNominee(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	var req createNomineeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.AwardID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "award_id is required")
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	awardID, err := uuid.Parse(req.AwardID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid award id")
	}

	award, err := h.db.Award.Query().
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
		if award.Edges.School == nil || award.Edges.School.ID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot access another school")
		}
	}

	if req.CoverImageKey != nil && invalidCoverImageKey(*req.CoverImageKey) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid cover_image_key")
	}

	create := h.db.Nominee.Create().
		SetAwardID(awardID).
		SetName(req.Name)
	if req.CoverImageKey != nil {
		create.SetCoverImageKey(*req.CoverImageKey)
	}
	if req.Description != nil {
		create.SetDescription(*req.Description)
	}
	if req.DisplayOrder != nil {
		create.SetDisplayOrder(*req.DisplayOrder)
	}

	nominee, err := create.Save(ctx)
	if err != nil {
		if ent.IsValidationError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusCreated, map[string]string{"id": nominee.ID.String()})
}

func (h *AdminHandler) UpdateNominee(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	nomineeID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid nominee id")
	}

	var req updateNomineeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	nominee, err := h.db.Nominee.Query().
		Where(entnominee.ID(nomineeID)).
		WithAward(func(q *ent.AwardQuery) { q.WithSchool() }).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "nominee not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		if nominee.Edges.Award == nil || nominee.Edges.Award.Edges.School == nil || nominee.Edges.Award.Edges.School.ID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot access another school")
		}
	}

	if req.CoverImageKey != nil && invalidCoverImageKey(*req.CoverImageKey) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid cover_image_key")
	}

	update := h.db.Nominee.UpdateOneID(nomineeID)
	if req.Name != nil {
		update.SetName(*req.Name)
	}
	if req.CoverImageKey != nil {
		update.SetCoverImageKey(*req.CoverImageKey)
	}
	if req.Description != nil {
		update.SetDescription(*req.Description)
	}
	if req.DisplayOrder != nil {
		update.SetDisplayOrder(*req.DisplayOrder)
	}

	updated, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "nominee not found")
		}
		if ent.IsValidationError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	awardID := nominee.Edges.Award.ID
	resp := nomineeAdminResponse{
		ID:            updated.ID.String(),
		Name:          updated.Name,
		CoverImageKey: updated.CoverImageKey,
		CoverImageURL: buildCoverURL(h.cfg, updated.CoverImageKey),
		Description:   updated.Description,
		DisplayOrder:  updated.DisplayOrder,
		AwardID:       awardID.String(),
	}

	return c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) DeleteNominee(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)
	ctx := c.Request().Context()

	nomineeID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid nominee id")
	}

	nominee, err := h.db.Nominee.Query().
		Where(entnominee.ID(nomineeID)).
		WithAward(func(q *ent.AwardQuery) { q.WithSchool() }).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "nominee not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		if nominee.Edges.Award == nil || nominee.Edges.Award.Edges.School == nil || nominee.Edges.Award.Edges.School.ID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot access another school")
		}
	}

	voteCount, err := h.db.VoteItem.Query().
		Where(entvoteitem.HasNomineeWith(entnominee.ID(nomineeID))).
		Count(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if voteCount > 0 {
		return c.JSON(http.StatusConflict, map[string]string{"error": "nominee has existing votes"})
	}

	if err := h.db.Nominee.DeleteOneID(nomineeID).Exec(ctx); err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "nominee not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

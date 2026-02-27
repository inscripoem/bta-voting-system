package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type VoteHandler struct {
	vote *service.VoteService
}

func NewVoteHandler(vote *service.VoteService) *VoteHandler {
	return &VoteHandler{vote: vote}
}

type upsertItemsRequest struct {
	SessionID uuid.UUID `json:"session_id"`
	Items     []struct {
		NomineeID uuid.UUID `json:"nominee_id"`
		Score     int       `json:"score"`
	} `json:"items"`
}

func (h *VoteHandler) UpsertItems(c echo.Context) error {
	claims := c.Get(middleware.ClaimsKey).(*service.Claims)
	if claims.SchoolID == nil {
		return echo.NewHTTPError(http.StatusForbidden, "not affiliated with a school")
	}

	var req upsertItemsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	items := make([]service.VoteItemInput, len(req.Items))
	for i, it := range req.Items {
		items[i] = service.VoteItemInput{NomineeID: it.NomineeID, Score: it.Score}
	}

	err := h.vote.UpsertItems(
		c.Request().Context(),
		claims.UserID,
		req.SessionID,
		*claims.SchoolID,
		items,
		c.RealIP(),
		c.Request().UserAgent(),
	)
	if err != nil {
		switch err {
		case service.ErrVotingNotActive:
			return echo.NewHTTPError(http.StatusForbidden, "voting is not active")
		case service.ErrMaxSupportExceeded:
			return echo.NewHTTPError(http.StatusBadRequest, "max support count exceeded for this award")
		case service.ErrInvalidScore:
			return echo.NewHTTPError(http.StatusBadRequest, "invalid score")
		case service.ErrWrongSchoolForAward:
			return echo.NewHTTPError(http.StatusForbidden, "this award is not for your school")
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

func (h *VoteHandler) GetItems(c echo.Context) error {
	claims := c.Get(middleware.ClaimsKey).(*service.Claims)
	sessionIDStr := c.QueryParam("session_id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session_id")
	}
	items, err := h.vote.GetItems(c.Request().Context(), claims.UserID, sessionID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	type itemResponse struct {
		NomineeID uuid.UUID `json:"nominee_id"`
		AwardID   uuid.UUID `json:"award_id"`
		Score     int       `json:"score"`
	}
	out := make([]itemResponse, 0, len(items))
	for _, it := range items {
		out = append(out, itemResponse{
			NomineeID: it.Edges.Nominee.ID,
			AwardID:   it.Edges.Award.ID,
			Score:     it.Score,
		})
	}
	return c.JSON(http.StatusOK, out)
}

package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
	entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
	entvotingsession "github.com/inscripoem/bta-voting-system/backend/internal/ent/votingsession"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AdminHandler struct {
	db  *ent.Client
	cfg *config.Config
}

func NewAdminHandler(db *ent.Client, cfg *config.Config) *AdminHandler {
	return &AdminHandler{db: db, cfg: cfg}
}

var sessionStatusMap = map[string]entvotingsession.Status{
	"pending":   entvotingsession.StatusPending,
	"active":    entvotingsession.StatusActive,
	"counting":  entvotingsession.StatusCounting,
	"published": entvotingsession.StatusPublished,
}

func parseSessionStatus(status string) (entvotingsession.Status, bool) {
	parsed, ok := sessionStatusMap[status]
	return parsed, ok
}

type sessionListItem struct {
	ID        string    `json:"id"`
	Year      int       `json:"year"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type sessionResponse struct {
	ID        string    `json:"id"`
	Year      int       `json:"year"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func toSessionResponse(session *ent.VotingSession) sessionResponse {
	return sessionResponse{
		ID:        session.ID.String(),
		Year:      session.Year,
		Name:      session.Name,
		Status:    string(session.Status),
		CreatedAt: session.CreatedAt,
		UpdatedAt: session.UpdatedAt,
	}
}

type schoolResponse struct {
	ID                    string              `json:"id"`
	Name                  string              `json:"name"`
	Code                  string              `json:"code"`
	EmailSuffixes         []string            `json:"email_suffixes"`
	VerificationQuestions []map[string]string `json:"verification_questions"`
	IsActive              bool                `json:"is_active"`
	CreatedAt             time.Time           `json:"created_at"`
}

func toSchoolResponse(school *ent.School) schoolResponse {
	return schoolResponse{
		ID:                    school.ID.String(),
		Name:                  school.Name,
		Code:                  school.Code,
		EmailSuffixes:         school.EmailSuffixes,
		VerificationQuestions: school.VerificationQuestions,
		IsActive:              school.IsActive,
		CreatedAt:             school.CreatedAt,
	}
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
	status, ok := parseSessionStatus(req.Status)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}
	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session id")
	}
	session, err := h.db.VotingSession.UpdateOneID(sessionID).
		SetStatus(status).
		Save(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "session not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"status": string(session.Status)})
}

type createSessionRequest struct {
	Year   int    `json:"year"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// ListSessions returns paginated sessions (super_admin only).
func (h *AdminHandler) ListSessions(c echo.Context) error {
	ctx := c.Request().Context()

	offset, limit, err := parsePagination(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	page := offset/limit + 1
	pageSize := limit

	q := c.QueryParam("q")
	var (
		sessions []*ent.VotingSession
		total    int
	)
	if q != "" {
		filter := entvotingsession.NameContainsFold(q)
		total, err = h.db.VotingSession.Query().Where(filter).Count(ctx)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		sessions, err = h.db.VotingSession.Query().
			Where(filter).
			Order(
				entvotingsession.ByYear(sql.OrderDesc()),
				entvotingsession.ByCreatedAt(sql.OrderDesc()),
			).
			Offset(offset).
			Limit(limit).
			All(ctx)
	} else {
		total, err = h.db.VotingSession.Query().Count(ctx)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		sessions, err = h.db.VotingSession.Query().
			Order(
				entvotingsession.ByYear(sql.OrderDesc()),
				entvotingsession.ByCreatedAt(sql.OrderDesc()),
			).
			Offset(offset).
			Limit(limit).
			All(ctx)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	out := make([]sessionListItem, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, sessionListItem{
			ID:        s.ID.String(),
			Year:      s.Year,
			Name:      s.Name,
			Status:    string(s.Status),
			CreatedAt: s.CreatedAt,
		})
	}

	return c.JSON(http.StatusOK, paginatedResponse(out, total, page, pageSize))
}

// CreateSession creates a new voting session (super_admin only).
func (h *AdminHandler) CreateSession(c echo.Context) error {
	var req createSessionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.Year == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "year is required")
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	status := entvotingsession.StatusPending
	if req.Status != "" {
		parsed, ok := parseSessionStatus(req.Status)
		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
		}
		status = parsed
	}

	session, err := h.db.VotingSession.Create().
		SetYear(req.Year).
		SetName(req.Name).
		SetStatus(status).
		Save(c.Request().Context())
	if err != nil {
		if ent.IsValidationError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": session.ID.String()})
}

// GetSession returns a single session (super_admin only).
func (h *AdminHandler) GetSession(c echo.Context) error {
	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session id")
	}

	session, err := h.db.VotingSession.Get(c.Request().Context(), sessionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "session not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, toSessionResponse(session))
}

type updateSessionRequest struct {
	Year   int    `json:"year"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// UpdateSession updates a session (super_admin only).
func (h *AdminHandler) UpdateSession(c echo.Context) error {
	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session id")
	}

	var req updateSessionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	update := h.db.VotingSession.UpdateOneID(sessionID)
	if req.Year != 0 {
		update.SetYear(req.Year)
	}
	if req.Name != "" {
		update.SetName(req.Name)
	}
	if req.Status != "" {
		parsed, ok := parseSessionStatus(req.Status)
		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
		}
		update.SetStatus(parsed)
	}

	session, err := update.Save(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "session not found")
		}
		if ent.IsValidationError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, toSessionResponse(session))
}

// DeleteSession deletes a session (super_admin only).
func (h *AdminHandler) DeleteSession(c echo.Context) error {
	sessionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid session id")
	}

	count, err := h.db.VoteItem.Query().
		Where(entvoteitem.HasSessionWith(entvotingsession.ID(sessionID))).
		Count(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if count > 0 {
		return c.JSON(http.StatusConflict, map[string]string{"error": "session has existing votes"})
	}

	if err := h.db.VotingSession.DeleteOneID(sessionID).Exec(c.Request().Context()); err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "session not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
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
	// Write UTF-8 BOM so Excel opens the file correctly
	_, _ = c.Response().Write([]byte{0xEF, 0xBB, 0xBF})
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

// ListSchools returns paginated schools (super_admin only).
func (h *AdminHandler) ListSchools(c echo.Context) error {
	ctx := c.Request().Context()

	offset, limit, err := parsePagination(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	page := offset/limit + 1
	pageSize := limit

	q := c.QueryParam("q")
	var (
		schools []*ent.School
		total   int
	)
	if q != "" {
		filter := entschool.NameContainsFold(q)
		total, err = h.db.School.Query().Where(filter).Count(ctx)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		schools, err = h.db.School.Query().
			Where(filter).
			Order(entschool.ByCreatedAt(sql.OrderDesc())).
			Offset(offset).
			Limit(limit).
			All(ctx)
	} else {
		total, err = h.db.School.Query().Count(ctx)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		schools, err = h.db.School.Query().
			Order(entschool.ByCreatedAt(sql.OrderDesc())).
			Offset(offset).
			Limit(limit).
			All(ctx)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	out := make([]schoolResponse, 0, len(schools))
	for _, s := range schools {
		out = append(out, toSchoolResponse(s))
	}

	return c.JSON(http.StatusOK, paginatedResponse(out, total, page, pageSize))
}

type updateSchoolRequest struct {
	Name                  string              `json:"name"`
	Code                  string              `json:"code"`
	EmailSuffixes         []string            `json:"email_suffixes"`
	VerificationQuestions []map[string]string `json:"verification_questions"`
	IsActive              *bool               `json:"is_active"`
}

// UpdateSchool updates a school.
// super_admin: can update name, code, email_suffixes, verification_questions, is_active
// school_admin: can update verification_questions and email_suffixes only (and only their own school)
func (h *AdminHandler) UpdateSchool(c echo.Context) error {
	claims := c.Get(apimw.ClaimsKey).(*service.Claims)

	schoolID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid school id")
	}

	var req updateSchoolRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	update := h.db.School.UpdateOneID(schoolID)

	if claims.Role == "school_admin" {
		if claims.SchoolID == nil {
			return echo.NewHTTPError(http.StatusForbidden, "school admin has no school")
		}
		if schoolID != *claims.SchoolID {
			return echo.NewHTTPError(http.StatusForbidden, "cannot modify another school")
		}
		if req.EmailSuffixes != nil {
			update.SetEmailSuffixes(req.EmailSuffixes)
		}
		if req.VerificationQuestions != nil {
			update.SetVerificationQuestions(req.VerificationQuestions)
		}
	} else {
		if req.Name != "" {
			update.SetName(req.Name)
		}
		if req.Code != "" {
			update.SetCode(req.Code)
		}
		if req.EmailSuffixes != nil {
			update.SetEmailSuffixes(req.EmailSuffixes)
		}
		if req.VerificationQuestions != nil {
			update.SetVerificationQuestions(req.VerificationQuestions)
		}
		if req.IsActive != nil {
			update.SetIsActive(*req.IsActive)
		}
	}

	school, err := update.Save(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		}
		if ent.IsValidationError(err) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, toSchoolResponse(school))
}

// DeleteSchool soft-deletes a school (super_admin only).
func (h *AdminHandler) DeleteSchool(c echo.Context) error {
	schoolID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid school id")
	}

	if _, err := h.db.School.UpdateOneID(schoolID).
		SetIsActive(false).
		Save(c.Request().Context()); err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

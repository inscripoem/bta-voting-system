package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
)

type SchoolHandler struct {
	db *ent.Client
}

func NewSchoolHandler(db *ent.Client) *SchoolHandler {
	return &SchoolHandler{db: db}
}

func (h *SchoolHandler) List(c echo.Context) error {
	schools, err := h.db.School.Query().
		Where(entschool.IsActive(true)).
		All(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	type item struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Code string `json:"code"`
	}
	out := make([]item, len(schools))
	for i, s := range schools {
		out[i] = item{ID: s.ID.String(), Name: s.Name, Code: s.Code}
	}
	return c.JSON(http.StatusOK, out)
}

// Get returns school info including verification questions (question text only, no answers).
func (h *SchoolHandler) Get(c echo.Context) error {
	code := c.Param("code")
	school, err := h.db.School.Query().
		Where(entschool.Code(code)).
		Only(c.Request().Context())
	if err != nil {
		if ent.IsNotFound(err) {
			return echo.NewHTTPError(http.StatusNotFound, "school not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	// Strip answers from verification questions — only expose the "question" key.
	safeQuestions := make([]map[string]string, 0)
	for _, q := range school.VerificationQuestions {
		safeQuestions = append(safeQuestions, map[string]string{
			"question": q["question"],
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id":                     school.ID,
		"name":                   school.Name,
		"code":                   school.Code,
		"email_suffixes":         school.EmailSuffixes,
		"verification_questions": safeQuestions,
	})
}

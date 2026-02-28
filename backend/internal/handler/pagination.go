package handler

import (
	"fmt"
	"strconv"

	"github.com/labstack/echo/v4"
)

func parsePagination(c echo.Context) (offset, limit int, err error) {
	page := 1
	pageSize := 20

	if pageStr := c.QueryParam("page"); pageStr != "" {
		parsed, parseErr := strconv.Atoi(pageStr)
		if parseErr != nil || parsed < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsed
	}

	if pageSizeStr := c.QueryParam("page_size"); pageSizeStr != "" {
		parsed, parseErr := strconv.Atoi(pageSizeStr)
		if parseErr != nil || parsed < 1 {
			return 0, 0, fmt.Errorf("invalid page_size")
		}
		pageSize = parsed
	}

	if pageSize > 100 {
		return 0, 0, fmt.Errorf("page_size must be <= 100")
	}

	return (page - 1) * pageSize, pageSize, nil
}

func paginatedResponse(data any, total, page, pageSize int) map[string]any {
	return map[string]any{
		"data":      data,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	}
}

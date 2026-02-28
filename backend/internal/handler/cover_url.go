package handler

import (
	"path/filepath"
	"strings"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
)

func buildCoverURL(cfg *config.Config, key string) *string {
	if key == "" {
		return nil
	}

	cleaned := filepath.Clean(key)
	if strings.Contains(cleaned, "..") {
		return nil
	}

	url := cfg.BackendBaseURL + "/static/" + key
	return &url
}

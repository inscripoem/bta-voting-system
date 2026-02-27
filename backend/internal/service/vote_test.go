package service

import (
	"testing"
)

func TestScoreAllowed(t *testing.T) {
	tests := []struct {
		score   int
		allowed []int
		want    bool
	}{
		{1, []int{1, 0, -1}, true},
		{0, []int{1, 0, -1}, true},
		{-1, []int{1, 0, -1}, true},
		{2, []int{1, 0, -1}, false},
		{1, []int{}, false},
	}
	for _, tt := range tests {
		got := scoreAllowed(tt.score, tt.allowed)
		if got != tt.want {
			t.Errorf("scoreAllowed(%d, %v) = %v, want %v", tt.score, tt.allowed, got, tt.want)
		}
	}
}

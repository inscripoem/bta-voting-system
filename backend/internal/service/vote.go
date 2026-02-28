package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	entaward "github.com/inscripoem/bta-voting-system/backend/internal/ent/award"
	entnominee "github.com/inscripoem/bta-voting-system/backend/internal/ent/nominee"
	entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
	entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
	entvotingsession "github.com/inscripoem/bta-voting-system/backend/internal/ent/votingsession"
)

var (
	ErrVotingNotActive     = errors.New("voting session is not active")
	ErrMaxSupportExceeded  = errors.New("max support count exceeded for this award")
	ErrInvalidScore        = errors.New("invalid score for this award")
	ErrWrongSchoolForAward = errors.New("this entertainment award is not for your school")
)

type VoteItemInput struct {
	NomineeID uuid.UUID
	Score     int
}

type VoteService struct {
	db *ent.Client
}

func NewVoteService(db *ent.Client) *VoteService {
	return &VoteService{db: db}
}

// UpsertItems validates and batch-upserts vote items for a user.
func (s *VoteService) UpsertItems(ctx context.Context, userID, sessionID, schoolID uuid.UUID, items []VoteItemInput, ip, ua string) error {
	session, err := s.db.VotingSession.Get(ctx, sessionID)
	if err != nil {
		return err
	}
	if session.Status != "active" {
		return ErrVotingNotActive
	}

	nomineeIDs := make([]uuid.UUID, 0, len(items))
	for _, it := range items {
		nomineeIDs = append(nomineeIDs, it.NomineeID)
	}

	nominees, err := s.db.Nominee.Query().
		Where(entnominee.IDIn(nomineeIDs...)).
		WithAward(func(q *ent.AwardQuery) {
			q.WithSchool()
		}).
		All(ctx)
	if err != nil {
		return err
	}

	nomineeMap := make(map[uuid.UUID]*ent.Nominee, len(nominees))
	for _, n := range nominees {
		nomineeMap[n.ID] = n
	}

	// Validate each incoming item (score allowed, school restriction)
	awardByNominee := make(map[uuid.UUID]*ent.Award)
	for _, it := range items {
		n, ok := nomineeMap[it.NomineeID]
		if !ok {
			return fmt.Errorf("nominee %s not found", it.NomineeID)
		}
		award := n.Edges.Award
		if award == nil {
			return fmt.Errorf("award not loaded for nominee %s", it.NomineeID)
		}

		cfg := award.ScoreConfig

		if !scoreAllowed(it.Score, cfg.AllowedScores) {
			return ErrInvalidScore
		}

		// Check school restriction for entertainment awards
		if award.Edges.School != nil && award.Edges.School.ID != schoolID {
			return ErrWrongSchoolForAward
		}

		awardByNominee[it.NomineeID] = award
	}

	// Fetch user's existing vote items for this session to validate max_count
	// against the merged (existing + incoming) set.
	existingItems, err := s.db.VoteItem.Query().
		Where(
			entvoteitem.HasUserWith(entuser.ID(userID)),
			entvoteitem.HasSessionWith(entvotingsession.ID(sessionID)),
		).
		WithNominee().
		All(ctx)
	if err != nil {
		return fmt.Errorf("fetch existing votes: %w", err)
	}

	// Build existing score map: nomineeID → score
	existingScores := make(map[uuid.UUID]int, len(existingItems))
	for _, vi := range existingItems {
		if vi.Edges.Nominee != nil {
			existingScores[vi.Edges.Nominee.ID] = vi.Score
		}
	}

	// Apply incoming changes on top of existing scores
	for _, item := range items {
		existingScores[item.NomineeID] = item.Score
	}

	// Group merged scores by award for max_count validation
	awardMergedScores := make(map[uuid.UUID][]int)
	for nomineeID, score := range existingScores {
		// Determine award for this nominee — check incoming nominees first
		award, ok := awardByNominee[nomineeID]
		if !ok {
			// This nominee is from existing items not in the current request;
			// we need to load its award.
			n, err := s.db.Nominee.Query().
				Where(entnominee.ID(nomineeID)).
				WithAward().
				Only(ctx)
			if err != nil {
				continue // skip if can't load (shouldn't happen)
			}
			if n.Edges.Award == nil {
				continue
			}
			award = n.Edges.Award
		}
		awardMergedScores[award.ID] = append(awardMergedScores[award.ID], score)
	}

	// Validate max_count constraints per award against merged set
	for awardID, scores := range awardMergedScores {
		award, err := s.db.Award.Query().Where(entaward.ID(awardID)).Only(ctx)
		if err != nil {
			return err
		}
		cfg := award.ScoreConfig
		for scoreStr, maxCount := range cfg.MaxCount {
			sc, _ := strconv.Atoi(scoreStr)
			cnt := 0
			for _, sv := range scores {
				if sv == sc {
					cnt++
				}
			}
			if cnt > maxCount {
				return ErrMaxSupportExceeded
			}
		}
	}

	// Wrap the upsert loop in a transaction
	tx, err := s.db.Tx(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	for _, it := range items {
		award := awardByNominee[it.NomineeID]

		existing, queryErr := tx.VoteItem.Query().
			Where(
				entvoteitem.HasUserWith(entuser.ID(userID)),
				entvoteitem.HasSessionWith(entvotingsession.ID(sessionID)),
				entvoteitem.HasNomineeWith(entnominee.ID(it.NomineeID)),
			).
			Only(ctx)

		if queryErr != nil && !ent.IsNotFound(queryErr) {
			_ = tx.Rollback()
			return queryErr
		}

		var upsertErr error
		if existing != nil {
			// Update existing vote item
			upsertErr = existing.Update().
				SetScore(it.Score).
				SetNillableIPAddress(&ip).
				SetNillableUserAgent(&ua).
				Exec(ctx)
		} else {
			// Create new vote item
			upsertErr = tx.VoteItem.Create().
				SetUserID(userID).
				SetSessionID(sessionID).
				SetSchoolID(schoolID).
				SetAwardID(award.ID).
				SetNomineeID(it.NomineeID).
				SetScore(it.Score).
				SetIPAddress(ip).
				SetUserAgent(ua).
				Exec(ctx)
		}
		if upsertErr != nil {
			_ = tx.Rollback()
			return upsertErr
		}
	}

	return tx.Commit()
}

// GetItems returns all vote items for a user in a session.
func (s *VoteService) GetItems(ctx context.Context, userID, sessionID uuid.UUID) ([]*ent.VoteItem, error) {
	return s.db.VoteItem.Query().
		Where(
			entvoteitem.HasUserWith(entuser.ID(userID)),
			entvoteitem.HasSessionWith(entvotingsession.ID(sessionID)),
		).
		WithNominee().
		WithAward().
		All(ctx)
}

func scoreAllowed(score int, allowed []int) bool {
	for _, a := range allowed {
		if a == score {
			return true
		}
	}
	return false
}

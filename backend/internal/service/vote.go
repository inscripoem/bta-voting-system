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

	// Group scores by award for max_count validation
	awardScores := make(map[uuid.UUID][]int)
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

		awardScores[award.ID] = append(awardScores[award.ID], it.Score)
		awardByNominee[it.NomineeID] = award
	}

	// Validate max_count constraints per award
	for awardID, scores := range awardScores {
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

	// Upsert each item: query for existing, update if found, create if not
	for _, it := range items {
		award := awardByNominee[it.NomineeID]

		existing, queryErr := s.db.VoteItem.Query().
			Where(
				entvoteitem.HasUserWith(entuser.ID(userID)),
				entvoteitem.HasSessionWith(entvotingsession.ID(sessionID)),
				entvoteitem.HasNomineeWith(entnominee.ID(it.NomineeID)),
			).
			Only(ctx)

		if queryErr != nil && !ent.IsNotFound(queryErr) {
			return queryErr
		}

		if existing != nil {
			// Update existing vote item
			err = existing.Update().
				SetScore(it.Score).
				SetNillableIPAddress(&ip).
				SetNillableUserAgent(&ua).
				Exec(ctx)
		} else {
			// Create new vote item
			err = s.db.VoteItem.Create().
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
		if err != nil {
			return err
		}
	}
	return nil
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

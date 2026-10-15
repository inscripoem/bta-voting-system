package service

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema"
	"github.com/inscripoem/bta-voting-system/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

func voteFixture(t *testing.T, db *ent.Client) (*ent.School, *ent.User, *ent.VotingSession, *ent.Award) {
	t.Helper()
	ctx := context.Background()
	school := db.School.Create().SetName("Test school").SetCode(uuid.NewString()).SaveX(ctx)
	u := db.User.Create().SetNickname("voter").SetSchool(school).SaveX(ctx)
	session := db.VotingSession.Create().SetName("Current").SetYear(2026).SetStatus("active").SaveX(ctx)
	award := db.Award.Create().SetName("Award").SetCategory("mandatory").SetSession(session).
		SetScoreConfig(schema.ScoreConfig{ScoreLabels: map[string]string{"1": "Yes", "0": "No"}, MaxCount: map[string]int{"1": 4}}).SaveX(ctx)
	return school, u, session, award
}

func TestVotesRejectOtherSessionAtomically(t *testing.T) {
	db := testutil.Postgres(t)
	ctx := context.Background()
	school, u, session, award := voteFixture(t, db)
	valid := db.Nominee.Create().SetName("Current nominee").SetAward(award).SaveX(ctx)
	old := db.VotingSession.Create().SetName("Old").SetYear(2025).SetStatus("published").SaveX(ctx)
	oldAward := db.Award.Create().SetName("Old award").SetCategory("mandatory").SetSession(old).SetScoreConfig(award.ScoreConfig).SaveX(ctx)
	foreign := db.Nominee.Create().SetName("Old nominee").SetAward(oldAward).SaveX(ctx)
	svc := NewVoteService(db)
	err := svc.UpsertItems(ctx, u.ID, session.ID, school.ID, []VoteItemInput{{valid.ID, 1}, {foreign.ID, 1}}, "", "")
	require.ErrorIs(t, err, ErrNomineeNotInSession)
	require.Zero(t, db.VoteItem.Query().CountX(ctx))
	require.NoError(t, svc.UpsertItems(ctx, u.ID, session.ID, school.ID, []VoteItemInput{{valid.ID, 1}}, "", ""))
	require.NoError(t, svc.UpsertItems(ctx, u.ID, session.ID, school.ID, []VoteItemInput{{valid.ID, 0}}, "", ""))
	require.Equal(t, 0, db.VoteItem.Query().OnlyX(ctx).Score)
	old.Update().SetStatus("counting").ExecX(ctx)
	require.ErrorIs(t, svc.UpsertItems(ctx, u.ID, old.ID, school.ID, []VoteItemInput{{foreign.ID, 1}}, "", ""), ErrVotingNotActive)
}

func TestConcurrentVotesRespectSupportLimit(t *testing.T) {
	db := testutil.Postgres(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	school, u, session, award := voteFixture(t, db)
	const count = 16
	nominees := make([]uuid.UUID, count)
	for i := range nominees {
		nominees[i] = db.Nominee.Create().SetName(fmt.Sprint(i)).SetAward(award).SaveX(ctx).ID
	}
	svc := NewVoteService(db)
	start := make(chan struct{})
	errs := make(chan error, count)
	var wg sync.WaitGroup
	for _, id := range nominees {
		wg.Add(1)
		go func(id uuid.UUID) {
			defer wg.Done()
			<-start
			errs <- svc.UpsertItems(ctx, u.ID, session.ID, school.ID, []VoteItemInput{{id, 1}}, "", "")
		}(id)
	}
	close(start)
	wg.Wait()
	close(errs)
	accepted := 0
	for err := range errs {
		if err == nil {
			accepted++
		} else {
			require.ErrorIs(t, err, ErrMaxSupportExceeded)
		}
	}
	require.Equal(t, 4, accepted)
	require.Equal(t, 4, db.VoteItem.Query().CountX(ctx))
}

func TestFormalEmailUniqueAcrossUpgradeRegistrationAndChange(t *testing.T) {
	db := testutil.Postgres(t)
	ctx := context.Background()
	school := db.School.Create().SetName("School").SetCode("test").SaveX(ctx)
	const email = "shared@example.com"
	first := db.User.Create().SetNickname("first").SetEmail(email).SetSchool(school).SaveX(ctx)
	second := db.User.Create().SetNickname("second").SetEmail(email).SetSchool(school).SaveX(ctx)
	svc := NewAuthService(db, NewJWTService("access", "refresh"), nil)
	require.NoError(t, svc.UpgradeAccount(ctx, first.ID, "password"))
	require.ErrorIs(t, svc.UpgradeAccount(ctx, second.ID, "password"), ErrEmailAlreadyTaken)
	require.True(t, db.User.GetX(ctx, second.ID).IsGuest)
	_, _, err := svc.createRegistered(ctx, "third", school, stringPtr(email), "password")
	require.ErrorIs(t, err, ErrEmailAlreadyTaken)
	other := db.User.Create().SetNickname("other").SetEmail("other@example.com").SetIsGuest(false).SaveX(ctx)
	svc.codes[email] = codeEntry{code: "ABC123", expiresAt: time.Now().Add(time.Minute)}
	require.ErrorIs(t, svc.VerifyEmailCode(ctx, other.ID, email, "ABC123"), ErrEmailAlreadyTaken)
	require.Equal(t, "other@example.com", *db.User.GetX(ctx, other.ID).Email)
	_, _, err = svc.Login(ctx, email, "password")
	require.NoError(t, err)
	// The database also arbitrates writes that race past application prechecks.
	_, err = db.User.Create().SetNickname("racing").SetEmail(email).SetIsGuest(false).Save(ctx)
	require.ErrorIs(t, emailWriteError(err), ErrEmailAlreadyTaken)
}

func stringPtr(s string) *string { return &s }

func TestConcurrentUpgradesKeepOneFormalEmailOwner(t *testing.T) {
	db := testutil.Postgres(t)
	ctx := context.Background()
	const email = "race@example.com"
	first := db.User.Create().SetNickname("first").SetEmail(email).SaveX(ctx)
	second := db.User.Create().SetNickname("second").SetEmail(email).SaveX(ctx)
	svc := NewAuthService(db, nil, nil)
	start := make(chan struct{})
	errs := make(chan error, 2)
	for _, id := range []uuid.UUID{first.ID, second.ID} {
		go func(id uuid.UUID) {
			<-start
			errs <- svc.UpgradeAccount(ctx, id, "password")
		}(id)
	}
	close(start)
	accepted, rejected := 0, 0
	for i := 0; i < 2; i++ {
		if err := <-errs; err == nil {
			accepted++
		} else {
			require.ErrorIs(t, err, ErrEmailAlreadyTaken)
			rejected++
		}
	}
	require.Equal(t, 1, accepted)
	require.Equal(t, 1, rejected)
	// Repeated startup migrations must preserve the partial index.
	require.NoError(t, db.Schema.Create(ctx))
}

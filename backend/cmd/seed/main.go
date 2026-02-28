package main

import (
	"context"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema"
)

type seedSummary struct {
	Schools  int
	Sessions int
	Awards   int
	Nominees int
	Users    int
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	client, err := ent.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	ctx := context.Background()
	count, err := client.School.Query().Count(ctx)
	if err != nil {
		log.Fatal(err)
	}
	if count > 0 {
		fmt.Println("数据库已有数据,跳过 seed")
		os.Exit(0)
	}

	tx, err := client.Tx(ctx)
	if err != nil {
		log.Fatal(err)
	}

	summary, err := seedData(ctx, tx)
	if err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback failed: %v", rbErr)
		}
		log.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Printf("rollback after commit failure: %v", rbErr)
		}
		log.Fatal(err)
	}

	fmt.Printf("seed inserted: schools=%d sessions=%d awards=%d nominees=%d users=%d\n",
		summary.Schools, summary.Sessions, summary.Awards, summary.Nominees, summary.Users)
}

func seedData(ctx context.Context, tx *ent.Tx) (seedSummary, error) {
	schoolA, err := tx.School.Create().
		SetName("示例大学A").
		SetCode("univ-a").
		SetEmailSuffixes([]string{"@univ-a.edu"}).
		SetVerificationQuestions([]map[string]string{
			{"question": "你的学号前四位？", "type": "input"},
		}).
		SetIsActive(true).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	_, err = tx.School.Create().
		SetName("示例大学B").
		SetCode("univ-b").
		SetEmailSuffixes([]string{"@univ-b.edu"}).
		SetVerificationQuestions([]map[string]string{
			{"question": "你的入学年份？", "type": "input"},
		}).
		SetIsActive(true).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	session, err := tx.VotingSession.Create().
		SetYear(2025).
		SetName("第一届大二杯").
		SetStatus("active").
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	award1, err := tx.Award.Create().
		SetName("最佳剧情奖").
		SetCategory("mandatory").
		SetScoreConfig(schema.ScoreConfig{
			AllowedScores: []int{0, 1},
			MaxCount:      map[string]int{"1": 3},
		}).
		SetDisplayOrder(1).
		SetSession(session).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	award2, err := tx.Award.Create().
		SetName("最具潜力奖").
		SetCategory("optional").
		SetScoreConfig(schema.ScoreConfig{
			AllowedScores: []int{0, 1},
			MaxCount:      map[string]int{"1": 2},
		}).
		SetDisplayOrder(2).
		SetSession(session).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	award3, err := tx.Award.Create().
		SetName("示例大学A娱乐奖").
		SetCategory("entertainment").
		SetScoreConfig(schema.ScoreConfig{
			AllowedScores: []int{0, 1},
			MaxCount:      map[string]int{"1": 1},
		}).
		SetDisplayOrder(3).
		SetSession(session).
		SetSchool(schoolA).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	awards := []*ent.Award{award1, award2, award3}
	nomineeSuffixes := []string{"A", "B", "C"}
	for _, award := range awards {
		for i, suffix := range nomineeSuffixes {
			_, err := tx.Nominee.Create().
				SetName(fmt.Sprintf("提名 %s %s", award.Name, suffix)).
				SetCoverImageKey("").
				SetDisplayOrder(i + 1).
				SetAward(award).
				Save(ctx)
			if err != nil {
				return seedSummary{}, err
			}
		}
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		return seedSummary{}, err
	}

	_, err = tx.User.Create().
		SetNickname("test_voter").
		SetEmail("voter@univ-a.edu").
		SetRole("voter").
		SetIsGuest(false).
		SetSchool(schoolA).
		SetPasswordHash(string(passwordHash)).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	_, err = tx.User.Create().
		SetNickname("test_school_admin").
		SetEmail("schooladmin@univ-a.edu").
		SetRole("school_admin").
		SetIsGuest(false).
		SetSchool(schoolA).
		SetPasswordHash(string(passwordHash)).
		Save(ctx)
	if err != nil {
		return seedSummary{}, err
	}

	return seedSummary{
		Schools:  2,
		Sessions: 1,
		Awards:   3,
		Nominees: 9,
		Users:    2,
	}, nil
}

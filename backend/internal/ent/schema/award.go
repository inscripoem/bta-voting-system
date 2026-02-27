package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

// ScoreConfig is stored as JSON in award.score_config
type ScoreConfig struct {
	AllowedScores []int          `json:"allowed_scores"`
	MaxCount      map[string]int `json:"max_count"`
}

type Award struct {
	ent.Schema
}

func (Award) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.AuditMixin{}}
}

func (Award) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).Default(uuid.New),
		field.String("name").NotEmpty(),
		field.String("description").Optional(),
		field.Enum("category").Values("mandatory", "optional", "entertainment"),
		field.JSON("score_config", ScoreConfig{}),
		field.Int("display_order").Default(0),
	}
}

func (Award) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("session", VotingSession.Type).Ref("awards").Unique().Required(),
		edge.From("school", School.Type).Ref("awards").Unique(),
		edge.To("nominees", Nominee.Type),
		edge.To("vote_items", VoteItem.Type),
	}
}

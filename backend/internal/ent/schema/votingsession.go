package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

type VotingSession struct {
	ent.Schema
}

func (VotingSession) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.AuditMixin{}}
}

func (VotingSession) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).Default(uuid.New),
		field.Int("year"),
		field.String("name").NotEmpty(),
		field.Enum("status").
			Values("pending", "active", "counting", "published").
			Default("pending"),
	}
}

func (VotingSession) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("awards", Award.Type),
		edge.To("vote_items", VoteItem.Type),
	}
}

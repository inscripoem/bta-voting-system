package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

type VoteItem struct {
	ent.Schema
}

func (VoteItem) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.AuditMixin{}}
}

func (VoteItem) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).Default(uuid.New),
		field.Int("score"),
		field.String("ip_address").Optional(),
		field.String("user_agent").Optional(),
	}
}

func (VoteItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).Ref("vote_items").Unique().Required(),
		edge.From("session", VotingSession.Type).Ref("vote_items").Unique().Required(),
		edge.From("school", School.Type).Ref("vote_items").Unique().Required(),
		edge.From("award", Award.Type).Ref("vote_items").Unique().Required(),
		edge.From("nominee", Nominee.Type).Ref("vote_items").Unique().Required(),
	}
}

func (VoteItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Edges("user", "nominee", "session").Unique(),
	}
}

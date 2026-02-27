package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

type School struct {
	ent.Schema
}

func (School) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.AuditMixin{}}
}

func (School) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).Default(uuid.New),
		field.String("name").NotEmpty(),
		field.String("code").Unique().NotEmpty(),
		field.JSON("email_suffixes", []string{}).Optional(),
		field.JSON("verification_questions", []map[string]string{}).Optional(),
		field.Bool("is_active").Default(true),
	}
}

func (School) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("users", User.Type),
		edge.To("awards", Award.Type),
		edge.To("vote_items", VoteItem.Type),
	}
}

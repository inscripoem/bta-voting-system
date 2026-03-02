package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

type User struct {
	ent.Schema
}

func (User) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.AuditMixin{}}
}

func (User) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).Default(uuid.New),
		field.String("nickname").Unique().NotEmpty(),
		field.String("email").Optional().Nillable().Unique(),
		field.String("password_hash").Optional().Nillable().Sensitive(),
		field.Enum("role").Values("voter", "school_admin", "super_admin").Default("voter"),
		field.Bool("is_guest").Default(true),
	}
}

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("school", School.Type).Ref("users").Unique(),
		edge.To("vote_items", VoteItem.Type),
	}
}

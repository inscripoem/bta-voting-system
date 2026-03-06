package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

type Nominee struct {
	ent.Schema
}

func (Nominee) Mixin() []ent.Mixin {
	return []ent.Mixin{mixin.AuditMixin{}}
}

func (Nominee) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).Default(uuid.New),
		field.String("name").NotEmpty(),
		field.String("cover_image_key").Optional(),
		field.String("description").Optional(),
		field.Int("display_order").Default(0),
		field.String("bangumi_id").Optional(),
		field.String("related_bangumi_id").Optional(),
		field.String("related_name").Optional(),
		field.String("related_image_url").Optional(),
	}
}

func (Nominee) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("award", Award.Type).Ref("nominees").Unique().Required(),
		edge.To("vote_items", VoteItem.Type),
	}
}

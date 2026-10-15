//go:build ignore

package main

import (
	"log"

	"entgo.io/ent/entc"
	"entgo.io/ent/entc/gen"
)

func main() {
	// Use entc directly: the CLI's tablewriter dependency conflicts with Air's.
	if err := entc.Generate("./schema", &gen.Config{
		Features: []gen.Feature{gen.FeatureLock},
	}); err != nil {
		log.Fatal(err)
	}
}

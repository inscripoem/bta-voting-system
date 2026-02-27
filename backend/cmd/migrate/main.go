package main

import (
	"context"
	"log"
	"os"

	_ "github.com/lib/pq"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	client, err := ent.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed opening connection to postgres: %v", err)
	}
	defer client.Close()
	if err := client.Schema.Create(context.Background()); err != nil {
		log.Fatalf("failed creating schema resources: %v", err)
	}
	log.Println("schema migration done")
	os.Exit(0)
}

package main

import (
	"log/slog"
	"os"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	_ "github.com/lib/pq"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	"github.com/inscripoem/bta-voting-system/backend/internal/handler"
	apimw "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
	"github.com/inscripoem/bta-voting-system/backend/internal/service"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	db, err := ent.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	// Services
	jwtSvc := service.NewJWTService(cfg.JWTSecret, cfg.JWTRefreshSecret)
	emailSvc := service.NewEmailSender(cfg)
	authSvc := service.NewAuthService(db, jwtSvc, emailSvc)
	voteSvc := service.NewVoteService(db)

	// Handlers
	authH := handler.NewAuthHandler(authSvc)
	voteH := handler.NewVoteHandler(voteSvc)
	schoolH := handler.NewSchoolHandler(db)
	awardH := handler.NewAwardHandler(db)
	adminH := handler.NewAdminHandler(db)

	e := echo.New()
	e.HideBanner = true
	e.Use(echomw.RequestLoggerWithConfig(echomw.RequestLoggerConfig{
		LogStatus: true,
		LogURI:    true,
		LogMethod: true,
		LogError:  true,
		HandleError: true,
		LogValuesFunc: func(c echo.Context, v echomw.RequestLoggerValues) error {
			slog.Info("request",
				"method", v.Method,
				"uri", v.URI,
				"status", v.Status,
				"err", v.Error,
			)
			return nil
		},
	}))
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{cfg.FrontendURL},
		AllowHeaders: []string{echo.HeaderAuthorization, echo.HeaderContentType},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
	}))

	v1 := e.Group("/api/v1")

	// Auth
	v1.POST("/auth/guest", authH.Guest)
	v1.POST("/auth/send-code", authH.SendCode)
	v1.POST("/auth/login", authH.Login)

	// Public
	v1.GET("/sessions/current", awardH.CurrentSession)
	v1.GET("/schools", schoolH.List)
	v1.GET("/schools/:code", schoolH.Get)
	v1.GET("/awards", awardH.List)
	v1.GET("/results", adminH.Results)

	// Voting (requires JWT)
	jwtMW := apimw.JWT(jwtSvc)
	vote := v1.Group("/vote", jwtMW)
	vote.GET("/items", voteH.GetItems)
	vote.PUT("/items", voteH.UpsertItems)

	// Admin (requires JWT + role)
	admin := v1.Group("/admin", jwtMW, apimw.RequireRole("school_admin", "super_admin"))
	admin.PATCH("/sessions/:id/status", adminH.PatchSessionStatus)
	admin.GET("/votes/export", adminH.ExportVotes)
	admin.POST("/schools", adminH.CreateSchool)

	slog.Info("server starting", "port", cfg.ServerPort)
	if err := e.Start(":" + cfg.ServerPort); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}

package main

import (
	"context"
	"crypto/rand"
	"log"
	"log/slog"
	"math/big"
	"os"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"github.com/inscripoem/bta-voting-system/backend/internal/config"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent"
	"github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
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

	ctx := context.Background()
	if err := db.Schema.Create(ctx); err != nil {
		slog.Error("schema create failed", "err", err)
		os.Exit(1)
	}
	if err := bootstrapSuperAdmin(ctx, db); err != nil {
		slog.Error("bootstrap super_admin failed", "err", err)
		os.Exit(1)
	}

	// Services
	jwtSvc := service.NewJWTService(cfg.JWTSecret, cfg.JWTRefreshSecret)
	emailSvc := service.NewEmailSender(cfg)
	authSvc := service.NewAuthService(db, jwtSvc, emailSvc)
	voteSvc := service.NewVoteService(db)

	// Handlers
	authH := handler.NewAuthHandler(authSvc, cfg)
	voteH := handler.NewVoteHandler(voteSvc)
	schoolH := handler.NewSchoolHandler(db)
	awardH := handler.NewAwardHandler(db, cfg)
	adminH := handler.NewAdminHandler(db, cfg)

	e := echo.New()
	e.HideBanner = true
	e.Use(echomw.RequestLoggerWithConfig(echomw.RequestLoggerConfig{
		LogStatus:   true,
		LogURI:      true,
		LogMethod:   true,
		LogError:    true,
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
		AllowOrigins:     []string{cfg.FrontendURL},
		AllowHeaders:     []string{echo.HeaderAuthorization, echo.HeaderContentType},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowCredentials: true,
	}))

	v1 := e.Group("/api/v1")

	// JWT middleware (used across multiple route groups)
	jwtMW := apimw.JWT(jwtSvc)

	// Auth
	v1.GET("/auth/check-nickname", authH.CheckNickname)
	v1.POST("/auth/guest", authH.Guest)
	v1.POST("/auth/claim-nickname", authH.ClaimNickname)
	v1.POST("/auth/register", authH.RegisterDirect)
	v1.POST("/auth/send-code", authH.SendCode)
	v1.POST("/auth/login", authH.Login)
	v1.POST("/auth/refresh", authH.Refresh)
	v1.POST("/auth/upgrade", authH.Upgrade, jwtMW)
	v1.POST("/auth/verify-email", authH.VerifyEmail, jwtMW)
	v1.POST("/auth/logout", authH.Logout, jwtMW)

	// User info (requires JWT)
	v1.GET("/me", authH.Me, jwtMW)

	// Public
	v1.GET("/sessions/current", awardH.CurrentSession)
	v1.GET("/schools", schoolH.List)
	v1.GET("/schools/:code", schoolH.Get)
	v1.GET("/awards", awardH.List)
	v1.GET("/results", adminH.Results)

	// Voting (requires JWT)
	vote := v1.Group("/vote", jwtMW)
	vote.GET("/items", voteH.GetItems)
	vote.PUT("/items", voteH.UpsertItems)

	// Admin (requires JWT + role)
	admin := v1.Group("/admin", jwtMW, apimw.RequireRole("school_admin", "super_admin"))
	admin.PATCH("/sessions/:id/status", adminH.PatchSessionStatus)
	admin.GET("/votes/export", adminH.ExportVotes)
	admin.GET("/awards", adminH.ListAwards)
	admin.POST("/awards", adminH.CreateAward)
	admin.PUT("/awards/:id", adminH.UpdateAward)
	admin.DELETE("/awards/:id", adminH.DeleteAward)
	admin.POST("/schools", adminH.CreateSchool)
	admin.PUT("/schools/:id", adminH.UpdateSchool)
	admin.GET("/vote-items", adminH.ListVoteItems)
	admin.GET("/nominees", adminH.ListNominees)
	admin.POST("/nominees", adminH.CreateNominee)
	admin.PUT("/nominees/:id", adminH.UpdateNominee)
	admin.DELETE("/nominees/:id", adminH.DeleteNominee)

	// Super admin only
	adminSuper := v1.Group("/admin", jwtMW, apimw.RequireRole("super_admin"))
	adminSuper.GET("/sessions", adminH.ListSessions)
	adminSuper.POST("/sessions", adminH.CreateSession)
	adminSuper.GET("/sessions/:id", adminH.GetSession)
	adminSuper.PUT("/sessions/:id", adminH.UpdateSession)
	adminSuper.DELETE("/sessions/:id", adminH.DeleteSession)
	adminSuper.GET("/schools", adminH.ListSchools)
	adminSuper.DELETE("/schools/:id", adminH.DeleteSchool)
	adminSuper.DELETE("/vote-items/:id", adminH.DeleteVoteItem)
	adminSuper.GET("/users", adminH.ListUsers)
	adminSuper.PATCH("/users/:id/role", adminH.PatchUserRole)

	slog.Info("server starting", "port", cfg.ServerPort)
	if err := e.Start(":" + cfg.ServerPort); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}

func bootstrapSuperAdmin(ctx context.Context, client *ent.Client) error {
	count, err := client.User.Query().Where(user.RoleEQ("super_admin")).Count(ctx)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	pwd, err := generateRandomPassword(32)
	if err != nil {
		return err
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = client.User.Create().
		SetEmail("admin@bta.local").
		SetNickname("super_admin").
		SetRole("super_admin").
		SetIsGuest(false).
		SetPasswordHash(string(hashed)).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil
		}
		return err
	}

	log.Printf("[INIT] super_admin created: email=admin@bta.local password=%s", pwd)
	return nil
}

func generateRandomPassword(length int) (string, error) {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	if length <= 0 {
		return "", nil
	}
	b := make([]byte, length)
	max := big.NewInt(int64(len(letters)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b[i] = letters[n.Int64()]
	}
	return string(b), nil
}

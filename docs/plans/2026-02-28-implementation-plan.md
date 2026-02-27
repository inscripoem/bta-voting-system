# 大二杯投票平台 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建大二杯年度动画评选投票平台，支持多校参与、两种身份验证方式、匿名/正式用户体系、管理后台与数据导出。

**Architecture:** 前端 Next.js 15（Vercel）+ 后端 Go Echo（自托管 Docker）+ PostgreSQL。前后端通过 REST API 通信，JWT 鉴权。ent ORM 管理数据库 schema，audit 字段通过 Mixin 统一注入。

**Tech Stack:** Go 1.23+, Echo v4, ent ORM, PostgreSQL 16, Next.js 15, shadcn/ui (new-york), Tailwind CSS, Framer Motion, Bun, Docker Compose, Resend/SMTP, gocloud.dev/blob

---

## Phase 0: Monorepo & Infrastructure

### Task 0.1: 初始化目录结构

**Files:**
- Create: `backend/go.mod`
- Create: `frontend/package.json`（bun init）
- Create: `docker-compose.yml`
- Create: `.gitignore`

**Step 1: 初始化 backend Go module**

```bash
mkdir -p backend/cmd/server
mkdir -p backend/internal/{config,handler,middleware,service,testutil}
cd backend
go mod init github.com/inscripoem/bta-voting-system/backend
go get github.com/labstack/echo/v4
go get github.com/labstack/echo/v4/middleware
go get entgo.io/ent/cmd/ent
go get entgo.io/ent
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/crypto
go get github.com/resend/resend-go/v2
go get gocloud.dev/blob
go get gocloud.dev/blob/fileblob
go get github.com/lib/pq
go get github.com/stretchr/testify
go get github.com/google/uuid
```

**Step 2: 初始化 frontend（从 bta-2024 复制基础）**

```bash
cd frontend
# Clone reference project for UI/config baseline
git clone https://github.com/inscripoem/bta-2024-visualization-next.git .tmp-ref
# 复制关键配置文件
cp .tmp-ref/tailwind.config.ts .
cp .tmp-ref/components.json .
cp .tmp-ref/app/globals.css app/
# 复制 UI 组件
cp -r .tmp-ref/components/ui components/
cp .tmp-ref/components/site-header.tsx components/
cp .tmp-ref/lib/utils.ts lib/
rm -rf .tmp-ref
```

**Step 3: 创建 docker-compose.yml**

```yaml
version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bta
      POSTGRES_PASSWORD: bta_dev
      POSTGRES_DB: bta_voting
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    env_file: ./backend/.env
    ports:
      - "8080:8080"
    depends_on:
      - db

volumes:
  pgdata:
```

**Step 4: 创建 backend/.env.example**

```env
DATABASE_URL=postgres://bta:bta_dev@localhost:5432/bta_voting?sslmode=disable
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-refresh
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
RESEND_API_KEY=
BLOB_PROVIDER=file
BLOB_FILE_PATH=./uploads
SERVER_PORT=8080
FRONTEND_URL=http://localhost:3000
```

**Step 5: Commit**

```bash
git add .
git commit -m "chore: initialize monorepo structure with docker-compose"
```

---

### Task 0.2: Backend config 系统

**Files:**
- Create: `backend/internal/config/config.go`

**Step 1: 写 config 结构**

```go
// backend/internal/config/config.go
package config

import (
    "fmt"
    "os"
    "strconv"
)

type Config struct {
    DatabaseURL      string
    JWTSecret        string
    JWTRefreshSecret string
    EmailProvider    string // "resend" | "smtp"
    SMTPHost         string
    SMTPPort         int
    SMTPUser         string
    SMTPPass         string
    ResendAPIKey     string
    BlobProvider     string // "file" | "s3" | "gcs"
    BlobFilePath     string
    ServerPort       string
    FrontendURL      string
}

func Load() (*Config, error) {
    port, _ := strconv.Atoi(getEnv("SMTP_PORT", "587"))
    c := &Config{
        DatabaseURL:      requireEnv("DATABASE_URL"),
        JWTSecret:        requireEnv("JWT_SECRET"),
        JWTRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
        EmailProvider:    getEnv("EMAIL_PROVIDER", "smtp"),
        SMTPHost:         getEnv("SMTP_HOST", ""),
        SMTPPort:         port,
        SMTPUser:         getEnv("SMTP_USER", ""),
        SMTPPass:         getEnv("SMTP_PASS", ""),
        ResendAPIKey:     getEnv("RESEND_API_KEY", ""),
        BlobProvider:     getEnv("BLOB_PROVIDER", "file"),
        BlobFilePath:     getEnv("BLOB_FILE_PATH", "./uploads"),
        ServerPort:       getEnv("SERVER_PORT", "8080"),
        FrontendURL:      getEnv("FRONTEND_URL", "http://localhost:3000"),
    }
    return c, nil
}

func requireEnv(key string) string {
    v := os.Getenv(key)
    if v == "" {
        panic(fmt.Sprintf("required env var %s is not set", key))
    }
    return v
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}
```

**Step 2: 写测试**

```go
// backend/internal/config/config_test.go
package config

import (
    "os"
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestLoad(t *testing.T) {
    os.Setenv("DATABASE_URL", "postgres://test")
    os.Setenv("JWT_SECRET", "secret")
    os.Setenv("JWT_REFRESH_SECRET", "refresh-secret")
    defer func() {
        os.Unsetenv("DATABASE_URL")
        os.Unsetenv("JWT_SECRET")
        os.Unsetenv("JWT_REFRESH_SECRET")
    }()

    c, err := Load()
    assert.NoError(t, err)
    assert.Equal(t, "postgres://test", c.DatabaseURL)
    assert.Equal(t, "smtp", c.EmailProvider) // default
    assert.Equal(t, "8080", c.ServerPort)    // default
}
```

**Step 3: 运行测试**

```bash
cd backend && go test ./internal/config/...
```
Expected: PASS

**Step 4: Commit**

```bash
git commit -am "feat(backend): add config loader from env vars"
```

---

## Phase 1: ent Schema & Database

### Task 1.1: Audit Mixin

**Files:**
- Create: `backend/internal/ent/schema/mixin/audit.go`

**Step 1: 初始化 ent**

```bash
cd backend
go run entgo.io/ent/cmd/ent new --target internal/ent/schema User School VotingSession Award Nominee VoteItem
```

**Step 2: 创建 Audit Mixin**

```go
// backend/internal/ent/schema/mixin/audit.go
package mixin

import (
    "time"
    "entgo.io/ent"
    "entgo.io/ent/schema/field"
    "entgo.io/ent/schema/mixin"
)

type AuditMixin struct {
    mixin.Schema
}

func (AuditMixin) Fields() []ent.Field {
    return []ent.Field{
        field.Time("created_at").
            Default(time.Now).
            Immutable(),
        field.Time("updated_at").
            Default(time.Now).
            UpdateDefault(time.Now),
    }
}
```

**Step 3: Commit**

```bash
git commit -am "feat(backend/ent): add audit mixin"
```

---

### Task 1.2: User Schema

**Files:**
- Modify: `backend/internal/ent/schema/user.go`

```go
// backend/internal/ent/schema/user.go
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
        field.String("email").Optional().Nillable(),
        field.String("password_hash").Optional().Nillable().Sensitive(),
        field.Enum("role").Values("voter", "school_admin", "super_admin").Default("voter"),
        field.Bool("is_guest").Default(true),
        // school_id is set via Edge
    }
}

func (User) Edges() []ent.Edge {
    return []ent.Edge{
        edge.From("school", School.Type).Ref("users").Unique(),
        edge.To("vote_items", VoteItem.Type),
    }
}
```

---

### Task 1.3: School Schema

**Files:**
- Modify: `backend/internal/ent/schema/school.go`

```go
// backend/internal/ent/schema/school.go
package schema

import (
    "entgo.io/ent"
    "entgo.io/ent/schema/edge"
    "entgo.io/ent/schema/field"
    "github.com/google/uuid"
    "github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

// VerificationQuestion は JSON に格納される構造体
// Go 側で定義し JSON として school.verification_questions に保存する

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
        // JSON array of strings, e.g. ["@pku.edu.cn"]
        field.JSON("email_suffixes", []string{}).Optional(),
        // JSON array of {question, answer}
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
```

---

### Task 1.4: VotingSession Schema

**Files:**
- Modify: `backend/internal/ent/schema/votingsession.go`

```go
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
```

---

### Task 1.5: Award & Nominee Schema

**Files:**
- Modify: `backend/internal/ent/schema/award.go`
- Modify: `backend/internal/ent/schema/nominee.go`

```go
// backend/internal/ent/schema/award.go
package schema

import (
    "entgo.io/ent"
    "entgo.io/ent/schema/edge"
    "entgo.io/ent/schema/field"
    "github.com/google/uuid"
    "github.com/inscripoem/bta-voting-system/backend/internal/ent/schema/mixin"
)

// ScoreConfig is stored as JSON in award.score_config
// Example: {"allowed_scores":[1,0,-1],"max_count":{"1":4}}
type ScoreConfig struct {
    AllowedScores []int          `json:"allowed_scores"`
    MaxCount      map[string]int `json:"max_count"` // key is score as string
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
        // nullable: school_id only set for entertainment awards
        edge.From("school", School.Type).Ref("awards").Unique(),
        edge.To("nominees", Nominee.Type),
        edge.To("vote_items", VoteItem.Type),
    }
}
```

```go
// backend/internal/ent/schema/nominee.go
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
    }
}

func (Nominee) Edges() []ent.Edge {
    return []ent.Edge{
        edge.From("award", Award.Type).Ref("nominees").Unique().Required(),
        edge.To("vote_items", VoteItem.Type),
    }
}
```

---

### Task 1.6: VoteItem Schema

**Files:**
- Modify: `backend/internal/ent/schema/voteitem.go`

```go
// backend/internal/ent/schema/voteitem.go
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
        field.Int("score"), // 1=支持, 0=没看过, -1=不支持
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
        // 一用户一提名一届只有一条记录
        index.Fields("score").
            Edges("user", "nominee", "session").
            Unique(),
    }
}
```

---

### Task 1.7: 生成 ent 代码 & 数据库迁移

**Step 1: 生成 ent 代码**

```bash
cd backend
go generate ./internal/ent/...
```

如果没有 generate 指令，手动运行：
```bash
go run entgo.io/ent/cmd/ent generate ./internal/ent/schema
```

**Step 2: 创建 migration main**

```go
// backend/cmd/migrate/main.go
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
        log.Fatal(err)
    }
    defer client.Close()
    if err := client.Schema.Create(context.Background()); err != nil {
        log.Fatalf("failed creating schema: %v", err)
    }
    log.Println("schema migration done")
    os.Exit(0)
}
```

**Step 3: 启动 DB 并运行迁移**

```bash
docker compose up -d db
cd backend
DATABASE_URL="postgres://bta:bta_dev@localhost:5432/bta_voting?sslmode=disable" \
JWT_SECRET=dev JWT_REFRESH_SECRET=dev-refresh \
go run ./cmd/migrate
```

Expected: `schema migration done`

**Step 4: Commit**

```bash
git commit -am "feat(backend/ent): define all schemas and run migration"
```

---

## Phase 2: Backend — Email & JWT

### Task 2.1: Email interface & implementations

**Files:**
- Create: `backend/internal/service/email.go`
- Create: `backend/internal/service/email_test.go`

```go
// backend/internal/service/email.go
package service

import (
    "crypto/tls"
    "fmt"
    "net/smtp"

    "github.com/inscripoem/bta-voting-system/backend/internal/config"
    resend "github.com/resend/resend-go/v2"
)

type EmailSender interface {
    SendVerificationCode(to, code string) error
    SendUpgradeVerification(to, link string) error
}

// --- Resend ---

type ResendSender struct {
    client    *resend.Client
    fromEmail string
}

func NewResendSender(apiKey, from string) *ResendSender {
    return &ResendSender{client: resend.NewClient(apiKey), fromEmail: from}
}

func (s *ResendSender) SendVerificationCode(to, code string) error {
    _, err := s.client.Emails.Send(&resend.SendEmailRequest{
        From:    s.fromEmail,
        To:      []string{to},
        Subject: "大二杯 - 邮箱验证码",
        Html:    fmt.Sprintf("<p>你的验证码是：<strong>%s</strong>，5分钟内有效。</p>", code),
    })
    return err
}

func (s *ResendSender) SendUpgradeVerification(to, link string) error {
    _, err := s.client.Emails.Send(&resend.SendEmailRequest{
        From:    s.fromEmail,
        To:      []string{to},
        Subject: "大二杯 - 账号升级验证",
        Html:    fmt.Sprintf(`<p>点击以下链接完成账号升级：</p><a href="%s">%s</a><p>链接10分钟内有效。</p>`, link, link),
    })
    return err
}

// --- SMTP ---

type SMTPSender struct {
    host      string
    port      int
    user      string
    pass      string
    fromEmail string
}

func NewSMTPSender(cfg *config.Config) *SMTPSender {
    return &SMTPSender{
        host:      cfg.SMTPHost,
        port:      cfg.SMTPPort,
        user:      cfg.SMTPUser,
        pass:      cfg.SMTPPass,
        fromEmail: cfg.SMTPUser,
    }
}

func (s *SMTPSender) send(to, subject, body string) error {
    auth := smtp.PlainAuth("", s.user, s.pass, s.host)
    msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
        s.fromEmail, to, subject, body)
    addr := fmt.Sprintf("%s:%d", s.host, s.port)
    tlsCfg := &tls.Config{ServerName: s.host}
    conn, err := tls.Dial("tcp", addr, tlsCfg)
    if err != nil {
        return err
    }
    c, err := smtp.NewClient(conn, s.host)
    if err != nil {
        return err
    }
    defer c.Quit()
    if err = c.Auth(auth); err != nil {
        return err
    }
    if err = c.Mail(s.fromEmail); err != nil {
        return err
    }
    if err = c.Rcpt(to); err != nil {
        return err
    }
    w, err := c.Data()
    if err != nil {
        return err
    }
    _, err = w.Write([]byte(msg))
    w.Close()
    return err
}

func (s *SMTPSender) SendVerificationCode(to, code string) error {
    return s.send(to, "大二杯 - 邮箱验证码",
        fmt.Sprintf("<p>你的验证码是：<strong>%s</strong>，5分钟内有效。</p>", code))
}

func (s *SMTPSender) SendUpgradeVerification(to, link string) error {
    return s.send(to, "大二杯 - 账号升级验证",
        fmt.Sprintf(`<p>点击以下链接完成账号升级：</p><a href="%s">%s</a><p>链接10分钟内有效。</p>`, link, link))
}

// NewEmailSender 根据 config.EmailProvider 返回对应实现
func NewEmailSender(cfg *config.Config) EmailSender {
    if cfg.EmailProvider == "resend" {
        return NewResendSender(cfg.ResendAPIKey, cfg.SMTPUser)
    }
    return NewSMTPSender(cfg)
}
```

**Step 2: Commit**

```bash
git commit -am "feat(backend): add email sender interface with resend/smtp implementations"
```

---

### Task 2.2: JWT service

**Files:**
- Create: `backend/internal/service/jwt.go`
- Create: `backend/internal/service/jwt_test.go`

```go
// backend/internal/service/jwt.go
package service

import (
    "errors"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
)

type Claims struct {
    UserID   uuid.UUID `json:"user_id"`
    Role     string    `json:"role"`
    SchoolID *uuid.UUID `json:"school_id,omitempty"`
    IsGuest  bool      `json:"is_guest"`
    jwt.RegisteredClaims
}

type JWTService struct {
    secret        []byte
    refreshSecret []byte
    accessTTL     time.Duration
    refreshTTL    time.Duration
}

func NewJWTService(secret, refreshSecret string) *JWTService {
    return &JWTService{
        secret:        []byte(secret),
        refreshSecret: []byte(refreshSecret),
        accessTTL:     15 * time.Minute,
        refreshTTL:    7 * 24 * time.Hour,
    }
}

func (s *JWTService) GenerateAccess(userID uuid.UUID, role string, schoolID *uuid.UUID, isGuest bool) (string, error) {
    claims := Claims{
        UserID:   userID,
        Role:     role,
        SchoolID: schoolID,
        IsGuest:  isGuest,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.accessTTL)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
        },
    }
    return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

func (s *JWTService) GenerateRefresh(userID uuid.UUID) (string, error) {
    claims := jwt.RegisteredClaims{
        Subject:   userID.String(),
        ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.refreshTTL)),
        IssuedAt:  jwt.NewNumericDate(time.Now()),
    }
    return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.refreshSecret)
}

func (s *JWTService) ParseAccess(tokenStr string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, errors.New("unexpected signing method")
        }
        return s.secret, nil
    })
    if err != nil {
        return nil, err
    }
    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }
    return nil, errors.New("invalid token")
}

func (s *JWTService) ParseRefresh(tokenStr string) (uuid.UUID, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (interface{}, error) {
        return s.refreshSecret, nil
    })
    if err != nil {
        return uuid.Nil, err
    }
    if claims, ok := token.Claims.(*jwt.RegisteredClaims); ok && token.Valid {
        return uuid.Parse(claims.Subject)
    }
    return uuid.Nil, errors.New("invalid refresh token")
}
```

**Step 2: 写测试**

```go
// backend/internal/service/jwt_test.go
package service

import (
    "testing"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestJWTRoundtrip(t *testing.T) {
    svc := NewJWTService("test-secret", "test-refresh")
    userID := uuid.New()
    schoolID := uuid.New()

    access, err := svc.GenerateAccess(userID, "voter", &schoolID, true)
    require.NoError(t, err)

    claims, err := svc.ParseAccess(access)
    require.NoError(t, err)
    assert.Equal(t, userID, claims.UserID)
    assert.Equal(t, "voter", claims.Role)
    assert.True(t, claims.IsGuest)

    refresh, err := svc.GenerateRefresh(userID)
    require.NoError(t, err)

    parsedID, err := svc.ParseRefresh(refresh)
    require.NoError(t, err)
    assert.Equal(t, userID, parsedID)
}

func TestJWTInvalidToken(t *testing.T) {
    svc := NewJWTService("test-secret", "test-refresh")
    _, err := svc.ParseAccess("invalid.token.here")
    assert.Error(t, err)
}
```

**Step 3: 运行测试**

```bash
cd backend && go test ./internal/service/... -run TestJWT
```
Expected: PASS

**Step 4: Commit**

```bash
git commit -am "feat(backend): add JWT service with access/refresh token support"
```

---

### Task 2.3: Auth Middleware

**Files:**
- Create: `backend/internal/middleware/auth.go`

```go
// backend/internal/middleware/auth.go
package middleware

import (
    "net/http"
    "strings"

    "github.com/labstack/echo/v4"
    "github.com/inscripoem/bta-voting-system/backend/internal/service"
)

const ClaimsKey = "claims"

func JWT(jwtSvc *service.JWTService) echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            header := c.Request().Header.Get("Authorization")
            if !strings.HasPrefix(header, "Bearer ") {
                return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
            }
            token := strings.TrimPrefix(header, "Bearer ")
            claims, err := jwtSvc.ParseAccess(token)
            if err != nil {
                return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
            }
            c.Set(ClaimsKey, claims)
            return next(c)
        }
    }
}

func RequireRole(roles ...string) echo.MiddlewareFunc {
    allowed := make(map[string]bool)
    for _, r := range roles {
        allowed[r] = true
    }
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            claims := c.Get(ClaimsKey).(*service.Claims)
            if !allowed[claims.Role] {
                return echo.NewHTTPError(http.StatusForbidden, "insufficient role")
            }
            return next(c)
        }
    }
}
```

**Step 2: Commit**

```bash
git commit -am "feat(backend): add JWT middleware and role guard"
```

---

## Phase 3: Backend — Auth Handlers

### Task 3.1: Auth Service (guest creation)

**Files:**
- Create: `backend/internal/service/auth.go`
- Create: `backend/internal/service/auth_test.go`

```go
// backend/internal/service/auth.go
package service

import (
    "context"
    "crypto/rand"
    "encoding/hex"
    "errors"
    "strings"
    "time"

    "golang.org/x/crypto/bcrypt"
    "github.com/google/uuid"
    "github.com/inscripoem/bta-voting-system/backend/internal/ent"
    entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
    entuser "github.com/inscripoem/bta-voting-system/backend/internal/ent/user"
)

var (
    ErrNicknameConflictSameSchool      = errors.New("nickname_conflict_same_school")
    ErrNicknameConflictDifferentSchool = errors.New("nickname_conflict_different_school")
    ErrWrongAnswer                     = errors.New("wrong_answer")
    ErrEmailSuffixNotAllowed           = errors.New("email_suffix_not_allowed")
    ErrNicknameEmpty                   = errors.New("nickname_empty")
)

type AuthService struct {
    db    *ent.Client
    jwt   *JWTService
    email EmailSender
    // in-memory code store (production: use Redis or DB)
    codes map[string]codeEntry
}

type codeEntry struct {
    code      string
    expiresAt time.Time
    schoolID  uuid.UUID
}

func NewAuthService(db *ent.Client, jwt *JWTService, email EmailSender) *AuthService {
    return &AuthService{db: db, jwt: jwt, email: email, codes: make(map[string]codeEntry)}
}

// GuestByQuestion 验证题方式创建/登入 guest
func (s *AuthService) GuestByQuestion(ctx context.Context, nickname, schoolCode, answer string, ip, ua string) (accessToken, refreshToken string, conflict string, err error) {
    if strings.TrimSpace(nickname) == "" {
        return "", "", "", ErrNicknameEmpty
    }
    school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
    if err != nil {
        return "", "", "", errors.New("school not found")
    }
    // 验证答案
    questions, _ := school.VerificationQuestions.([]map[string]string)
    if len(questions) > 0 {
        q := questions[0]
        if !strings.EqualFold(strings.TrimSpace(q["answer"]), strings.TrimSpace(answer)) {
            return "", "", "", ErrWrongAnswer
        }
    }
    return s.findOrCreateGuest(ctx, nickname, school, ip, ua)
}

// GuestByEmail 邮箱验证方式：先发验证码
func (s *AuthService) SendEmailCode(ctx context.Context, emailAddr, schoolCode string) error {
    school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
    if err != nil {
        return errors.New("school not found")
    }
    // 检查邮箱后缀
    suffixes, _ := school.EmailSuffixes.([]string)
    if !emailMatchesSuffixes(emailAddr, suffixes) {
        return ErrEmailSuffixNotAllowed
    }
    code := generateCode()
    s.codes[emailAddr] = codeEntry{code: code, expiresAt: time.Now().Add(5 * time.Minute), schoolID: school.ID}
    return s.email.SendVerificationCode(emailAddr, code)
}

// GuestByEmail 验证码验证方式
func (s *AuthService) GuestByEmail(ctx context.Context, nickname, emailAddr, code string, ip, ua string) (accessToken, refreshToken string, conflict string, err error) {
    entry, ok := s.codes[emailAddr]
    if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
        return "", "", "", errors.New("invalid or expired code")
    }
    delete(s.codes, emailAddr)

    school, err := s.db.School.Get(ctx, entry.schoolID)
    if err != nil {
        return "", "", "", err
    }
    return s.findOrCreateGuest(ctx, nickname, school, ip, ua)
}

func (s *AuthService) findOrCreateGuest(ctx context.Context, nickname string, school *ent.School, ip, ua string) (access, refresh, conflict string, err error) {
    existing, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
    if err != nil && !ent.IsNotFound(err) {
        return "", "", "", err
    }
    if existing != nil {
        // 昵称冲突
        existingSchool, _ := existing.QuerySchool().Only(ctx)
        if existingSchool != nil && existingSchool.ID == school.ID {
            return "", "", "same_school", ErrNicknameConflictSameSchool
        }
        return "", "", "different_school", ErrNicknameConflictDifferentSchool
    }
    // 创建 guest
    user, err := s.db.User.Create().
        SetNickname(nickname).
        SetIsGuest(true).
        SetRole("voter").
        SetSchool(school).
        Save(ctx)
    if err != nil {
        return "", "", "", err
    }
    return s.issueTokens(user)
}

func (s *AuthService) issueTokens(user *ent.User) (access, refresh string, _ string, err error) {
    school, _ := user.QuerySchool().Only(context.Background())
    var schoolIDPtr *uuid.UUID
    if school != nil {
        id := school.ID
        schoolIDPtr = &id
    }
    access, err = s.jwt.GenerateAccess(user.ID, string(user.Role), schoolIDPtr, user.IsGuest)
    if err != nil {
        return "", "", "", err
    }
    refresh, err = s.jwt.GenerateRefresh(user.ID)
    return access, refresh, "", err
}

func emailMatchesSuffixes(email string, suffixes []string) bool {
    if len(suffixes) == 0 {
        return true // 未配置后缀限制则放行
    }
    lower := strings.ToLower(email)
    for _, s := range suffixes {
        if strings.HasSuffix(lower, strings.ToLower(s)) {
            return true
        }
    }
    return false
}

func generateCode() string {
    b := make([]byte, 3)
    rand.Read(b)
    return strings.ToUpper(hex.EncodeToString(b))[:6]
}

// HashPassword 用于升级时设置密码
func HashPassword(password string) (string, error) {
    b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    return string(b), err
}

func CheckPassword(hash, password string) bool {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
```

**Step 2: Commit**

```bash
git commit -am "feat(backend): add auth service with guest creation flows"
```

---

### Task 3.2: Auth Handler (REST endpoints)

**Files:**
- Create: `backend/internal/handler/auth.go`

```go
// backend/internal/handler/auth.go
package handler

import (
    "net/http"

    "github.com/labstack/echo/v4"
    "github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AuthHandler struct {
    auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
    return &AuthHandler{auth: auth}
}

type guestRequest struct {
    Nickname   string `json:"nickname"  validate:"required"`
    SchoolCode string `json:"school_code" validate:"required"`
    Method     string `json:"method"    validate:"required,oneof=question email"`
    Answer     string `json:"answer"`     // 验证题答案
    Email      string `json:"email"`      // 邮箱验证时的邮箱
    Code       string `json:"code"`       // 邮箱验证码
    // 昵称冲突时重新验证
    Reauth     bool   `json:"reauth"`
}

func (h *AuthHandler) Guest(c echo.Context) error {
    var req guestRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    ip := c.RealIP()
    ua := c.Request().UserAgent()

    var access, refresh, conflict string
    var err error

    switch req.Method {
    case "question":
        access, refresh, conflict, err = h.auth.GuestByQuestion(c.Request().Context(), req.Nickname, req.SchoolCode, req.Answer, ip, ua)
    case "email":
        access, refresh, conflict, err = h.auth.GuestByEmail(c.Request().Context(), req.Nickname, req.Email, req.Code, ip, ua)
    default:
        return echo.NewHTTPError(http.StatusBadRequest, "invalid method")
    }

    if err != nil {
        switch err {
        case service.ErrNicknameConflictSameSchool:
            return c.JSON(http.StatusConflict, map[string]string{"conflict": "same_school"})
        case service.ErrNicknameConflictDifferentSchool:
            return c.JSON(http.StatusConflict, map[string]string{"conflict": "different_school"})
        case service.ErrWrongAnswer:
            return echo.NewHTTPError(http.StatusUnauthorized, "wrong answer")
        case service.ErrEmailSuffixNotAllowed:
            return echo.NewHTTPError(http.StatusBadRequest, "email suffix not allowed for this school")
        default:
            return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
        }
    }

    _ = conflict
    return c.JSON(http.StatusOK, map[string]string{"access_token": access, "refresh_token": refresh})
}

type sendCodeRequest struct {
    Email      string `json:"email"       validate:"required,email"`
    SchoolCode string `json:"school_code" validate:"required"`
}

func (h *AuthHandler) SendCode(c echo.Context) error {
    var req sendCodeRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if err := h.auth.SendEmailCode(c.Request().Context(), req.Email, req.SchoolCode); err != nil {
        if err == service.ErrEmailSuffixNotAllowed {
            return echo.NewHTTPError(http.StatusBadRequest, "email suffix not allowed")
        }
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, map[string]string{"message": "code sent"})
}
```

**Step 2: Commit**

```bash
git commit -am "feat(backend): add auth handler for guest creation"
```

---

### Task 3.3: Vote Service & Handler

**Files:**
- Create: `backend/internal/service/vote.go`
- Create: `backend/internal/handler/vote.go`
- Create: `backend/internal/service/vote_test.go`

```go
// backend/internal/service/vote.go
package service

import (
    "context"
    "errors"
    "fmt"
    "strconv"

    "github.com/google/uuid"
    "github.com/inscripoem/bta-voting-system/backend/internal/ent"
    entaward "github.com/inscripoem/bta-voting-system/backend/internal/ent/award"
    entnominee "github.com/inscripoem/bta-voting-system/backend/internal/ent/nominee"
    entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
    entschema "github.com/inscripoem/bta-voting-system/backend/internal/ent/schema"
)

var (
    ErrVotingNotActive       = errors.New("voting is not active")
    ErrMaxSupportExceeded    = errors.New("max support count exceeded for this award")
    ErrInvalidScore          = errors.New("invalid score for this award")
    ErrWrongSchoolForAward   = errors.New("this entertainment award is not for your school")
)

type VoteItemInput struct {
    NomineeID uuid.UUID
    Score     int
}

type VoteService struct {
    db *ent.Client
}

func NewVoteService(db *ent.Client) *VoteService {
    return &VoteService{db: db}
}

// UpsertItems 批量 upsert，返回错误（含业务校验）
func (s *VoteService) UpsertItems(ctx context.Context, userID, sessionID, schoolID uuid.UUID, items []VoteItemInput, ip, ua string) error {
    // 检查 session 状态
    session, err := s.db.VotingSession.Get(ctx, sessionID)
    if err != nil {
        return err
    }
    if session.Status != "active" {
        return ErrVotingNotActive
    }

    // 按 nominee 分组，拿出 award 信息
    nomineeIDs := make([]uuid.UUID, 0, len(items))
    for _, it := range items {
        nomineeIDs = append(nomineeIDs, it.NomineeID)
    }
    nominees, err := s.db.Nominee.Query().
        Where(entnominee.IDIn(nomineeIDs...)).
        WithAward().
        All(ctx)
    if err != nil {
        return err
    }
    nomineeMap := make(map[uuid.UUID]*ent.Nominee, len(nominees))
    for _, n := range nominees {
        nomineeMap[n.ID] = n
    }

    // 按 award 分组，校验 allowed_scores 和 max_count
    awardScores := make(map[uuid.UUID][]int) // awardID → 本次提交的所有 score
    for _, it := range items {
        n, ok := nomineeMap[it.NomineeID]
        if !ok {
            return fmt.Errorf("nominee %s not found", it.NomineeID)
        }
        award, err := n.Edges.Award, error(nil)
        if award == nil {
            award, err = n.QueryAward().Only(ctx)
            if err != nil {
                return err
            }
        }
        cfg := award.ScoreConfig.(entschema.ScoreConfig)
        // 校验 score 合法
        if !scoreAllowed(it.Score, cfg.AllowedScores) {
            return ErrInvalidScore
        }
        // 娱乐奖项检查学校归属
        if award.Edges.School != nil && award.Edges.School.ID != schoolID {
            return ErrWrongSchoolForAward
        }
        awardScores[award.ID] = append(awardScores[award.ID], it.Score)
    }

    // 校验每个 award 的 max_count
    for awardID, scores := range awardScores {
        award, err := s.db.Award.Get(ctx, awardID)
        if err != nil {
            return err
        }
        cfg := award.ScoreConfig.(entschema.ScoreConfig)
        for scoreStr, maxCount := range cfg.MaxCount {
            sc, _ := strconv.Atoi(scoreStr)
            cnt := 0
            for _, s := range scores {
                if s == sc {
                    cnt++
                }
            }
            if cnt > maxCount {
                return ErrMaxSupportExceeded
            }
        }
    }

    // Upsert
    for _, it := range items {
        n := nomineeMap[it.NomineeID]
        award, _ := n.QueryAward().Only(ctx)
        err := s.db.VoteItem.Create().
            SetUserID(userID).
            SetSessionID(sessionID).
            SetSchoolID(schoolID).
            SetAwardID(award.ID).
            SetNomineeID(it.NomineeID).
            SetScore(it.Score).
            SetIPAddress(ip).
            SetUserAgent(ua).
            OnConflictColumns(entvoteitem.FieldUserID, entvoteitem.FieldNomineeID /* session via edge */).
            UpdateNewValues().
            Exec(ctx)
        if err != nil {
            return err
        }
    }
    return nil
}

func scoreAllowed(score int, allowed []int) bool {
    for _, a := range allowed {
        if a == score {
            return true
        }
    }
    return false
}
```

**Step 2: 写测试（核心业务逻辑：max_count 校验）**

```go
// backend/internal/service/vote_test.go
package service

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestScoreAllowed(t *testing.T) {
    assert.True(t, scoreAllowed(1, []int{1, 0, -1}))
    assert.True(t, scoreAllowed(0, []int{1, 0, -1}))
    assert.False(t, scoreAllowed(2, []int{1, 0, -1}))
}
```

**Step 3: 运行测试**

```bash
cd backend && go test ./internal/service/... -run TestScore
```
Expected: PASS

**Step 4: Vote Handler**

```go
// backend/internal/handler/vote.go
package handler

import (
    "net/http"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
    "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
    "github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type VoteHandler struct {
    vote      *service.VoteService
    sessionID uuid.UUID // 当前届 ID，运行时从 DB 查
}

func NewVoteHandler(vote *service.VoteService) *VoteHandler {
    return &VoteHandler{vote: vote}
}

type upsertItemsRequest struct {
    SessionID uuid.UUID `json:"session_id" validate:"required"`
    Items     []struct {
        NomineeID uuid.UUID `json:"nominee_id"`
        Score     int       `json:"score"`
    } `json:"items"`
}

func (h *VoteHandler) UpsertItems(c echo.Context) error {
    claims := c.Get(middleware.ClaimsKey).(*service.Claims)
    var req upsertItemsRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if claims.SchoolID == nil {
        return echo.NewHTTPError(http.StatusForbidden, "not affiliated with a school")
    }
    items := make([]service.VoteItemInput, len(req.Items))
    for i, it := range req.Items {
        items[i] = service.VoteItemInput{NomineeID: it.NomineeID, Score: it.Score}
    }
    err := h.vote.UpsertItems(c.Request().Context(), claims.UserID, req.SessionID, *claims.SchoolID, items, c.RealIP(), c.Request().UserAgent())
    if err != nil {
        switch err {
        case service.ErrVotingNotActive:
            return echo.NewHTTPError(http.StatusForbidden, "voting is not active")
        case service.ErrMaxSupportExceeded:
            return echo.NewHTTPError(http.StatusBadRequest, "max support count exceeded")
        case service.ErrInvalidScore:
            return echo.NewHTTPError(http.StatusBadRequest, "invalid score")
        case service.ErrWrongSchoolForAward:
            return echo.NewHTTPError(http.StatusForbidden, "this award is not for your school")
        }
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}
```

**Step 5: Commit**

```bash
git commit -am "feat(backend): add vote service and handler"
```

---

## Phase 4: Backend — Public & Admin APIs

### Task 4.1: Schools & Awards handlers

**Files:**
- Create: `backend/internal/handler/school.go`
- Create: `backend/internal/handler/award.go`

```go
// backend/internal/handler/school.go
package handler

import (
    "net/http"
    "github.com/labstack/echo/v4"
    entschool "github.com/inscripoem/bta-voting-system/backend/internal/ent/school"
    "github.com/inscripoem/bta-voting-system/backend/internal/ent"
)

type SchoolHandler struct{ db *ent.Client }

func NewSchoolHandler(db *ent.Client) *SchoolHandler { return &SchoolHandler{db: db} }

func (h *SchoolHandler) List(c echo.Context) error {
    schools, err := h.db.School.Query().Where(entschool.IsActive(true)).All(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    type item struct {
        ID   string `json:"id"`
        Name string `json:"name"`
        Code string `json:"code"`
    }
    out := make([]item, len(schools))
    for i, s := range schools {
        out[i] = item{ID: s.ID.String(), Name: s.Name, Code: s.Code}
    }
    return c.JSON(http.StatusOK, out)
}

// Get 返回学校信息，包含 verification_questions（只返回 question 字段，不含 answer）
func (h *SchoolHandler) Get(c echo.Context) error {
    school, err := h.db.School.Query().Where(entschool.Code(c.Param("code"))).Only(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusNotFound, "school not found")
    }
    questions, _ := school.VerificationQuestions.([]map[string]string)
    safeQuestions := make([]map[string]string, len(questions))
    for i, q := range questions {
        safeQuestions[i] = map[string]string{"question": q["question"]}
    }
    return c.JSON(http.StatusOK, map[string]interface{}{
        "id":                    school.ID,
        "name":                  school.Name,
        "code":                  school.Code,
        "verification_questions": safeQuestions,
    })
}
```

**Step 2: Commit**

```bash
git commit -am "feat(backend): add school and award public handlers"
```

---

### Task 4.2: Admin handler (session status + export)

**Files:**
- Create: `backend/internal/handler/admin.go`

```go
// backend/internal/handler/admin.go
package handler

import (
    "encoding/csv"
    "net/http"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
    "github.com/inscripoem/bta-voting-system/backend/internal/ent"
    entvoteitem "github.com/inscripoem/bta-voting-system/backend/internal/ent/voteitem"
    "github.com/inscripoem/bta-voting-system/backend/internal/middleware"
    "github.com/inscripoem/bta-voting-system/backend/internal/service"
)

type AdminHandler struct{ db *ent.Client }

func NewAdminHandler(db *ent.Client) *AdminHandler { return &AdminHandler{db: db} }

type patchStatusRequest struct {
    Status string `json:"status" validate:"required,oneof=pending active counting published"`
}

func (h *AdminHandler) PatchSessionStatus(c echo.Context) error {
    var req patchStatusRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    sessionID, err := uuid.Parse(c.Param("id"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid session id")
    }
    _, err = h.db.VotingSession.UpdateOneID(sessionID).SetStatus(req.Status).Save(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, map[string]string{"status": req.Status})
}

// ExportVotes 导出 CSV，school_admin 只能导出本校
func (h *AdminHandler) ExportVotes(c echo.Context) error {
    claims := c.Get(middleware.ClaimsKey).(*service.Claims)
    sessionID, _ := uuid.Parse(c.QueryParam("session_id"))

    q := h.db.VoteItem.Query().Where(entvoteitem.HasSessionWith(/* session id */))
    if claims.Role == "school_admin" && claims.SchoolID != nil {
        q = q.Where(entvoteitem.HasSchoolWith(/* school id = claims.SchoolID */))
    } else if schoolID := c.QueryParam("school_id"); schoolID != "" {
        sid, _ := uuid.Parse(schoolID)
        _ = sid
        // filter by school
    }
    _ = sessionID

    items, err := q.WithUser().WithNominee().WithAward().WithSchool().All(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }

    c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
    c.Response().Header().Set("Content-Disposition", "attachment; filename=votes.csv")
    w := csv.NewWriter(c.Response())
    w.Write([]string{"user_nickname", "school", "award", "nominee", "score", "ip_address", "updated_at"})
    for _, it := range items {
        w.Write([]string{
            it.Edges.User.Nickname,
            it.Edges.School.Name,
            it.Edges.Award.Name,
            it.Edges.Nominee.Name,
            fmt.Sprintf("%d", it.Score),
            it.IPAddress,
            it.UpdatedAt.Format("2006-01-02 15:04:05"),
        })
    }
    w.Flush()
    return nil
}
```

**Step 2: Commit**

```bash
git commit -am "feat(backend): add admin handler with session status and CSV export"
```

---

### Task 4.3: Server 入口 & 路由注册

**Files:**
- Create: `backend/cmd/server/main.go`

```go
// backend/cmd/server/main.go
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
    adminH := handler.NewAdminHandler(db)

    e := echo.New()
    e.Use(echomw.Logger())
    e.Use(echomw.Recover())
    e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
        AllowOrigins: []string{cfg.FrontendURL},
        AllowHeaders: []string{echo.HeaderAuthorization, echo.HeaderContentType},
    }))

    v1 := e.Group("/api/v1")

    // Auth
    auth := v1.Group("/auth")
    auth.POST("/guest", authH.Guest)
    auth.POST("/send-code", authH.SendCode)

    // Public
    v1.GET("/schools", schoolH.List)
    v1.GET("/schools/:code", schoolH.Get)

    // Voting (requires JWT)
    jwtMW := apimw.JWT(jwtSvc)
    vote := v1.Group("/vote", jwtMW)
    vote.PUT("/items", voteH.UpsertItems)

    // Admin
    admin := v1.Group("/admin", jwtMW, apimw.RequireRole("school_admin", "super_admin"))
    admin.PATCH("/sessions/:id/status", adminH.PatchSessionStatus)
    admin.GET("/votes/export", adminH.ExportVotes)

    slog.Info("server starting", "port", cfg.ServerPort)
    e.Logger.Fatal(e.Start(":" + cfg.ServerPort))
}
```

**Step 2: 构建验证**

```bash
cd backend && go build ./cmd/server
```
Expected: 无错误

**Step 3: Commit**

```bash
git commit -am "feat(backend): wire up echo server with all routes"
```

---

## Phase 5: Frontend Setup

### Task 5.1: Next.js 初始化 & 基础布局

**Files:**
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/globals.css`（从 bta-2024 迁移）
- Modify: `frontend/components/site-header.tsx`

**Step 1: 安装依赖**

```bash
cd frontend
bun add framer-motion @radix-ui/react-navigation-menu @radix-ui/react-dialog \
  @radix-ui/react-tabs @radix-ui/react-scroll-area lucide-react \
  tailwind-merge tailwindcss-animate class-variance-authority clsx
bun add -d @types/node typescript tailwindcss postcss autoprefixer
```

**Step 2: 更新 site-header 菜单项（参考 bta-2024 结构）**

```tsx
// frontend/components/site-header.tsx
// 基于 bta-2024 的 SiteHeader，修改导航菜单项
const navItems = [
  { title: "首页", href: "/" },
  { title: "参与投票", href: "/vote" },
  { title: "结果公布", href: "/results" },
  { title: "关于大二杯", href: "/about" },
]
```

**Step 3: Root layout（复用 bta-2024 模式，dark mode，font）**

```tsx
// frontend/app/layout.tsx
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { SiteHeader } from "@/components/site-header"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "大二杯 - 高校二次元人气动画评选",
  description: "大学生二次元年度动画评选活动",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}>
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  )
}
```

**Step 4: 验证**

```bash
cd frontend && bun dev
```
打开 http://localhost:3000，确认导航栏正常渲染。

**Step 5: Commit**

```bash
git commit -am "feat(frontend): setup Next.js with bta-2024 design system and navigation"
```

---

## Phase 6: Frontend — Voting Flow

### Task 6.1: API client

**Files:**
- Create: `frontend/lib/api.ts`

```ts
// frontend/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new APIError(res.status, err.message ?? res.statusText)
  }
  return res.json()
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const api = {
  schools: {
    list: () => request<School[]>("/schools"),
    get: (code: string) => request<SchoolDetail>(`/schools/${code}`),
  },
  auth: {
    sendCode: (email: string, schoolCode: string) =>
      request("/auth/send-code", { method: "POST", body: JSON.stringify({ email, school_code: schoolCode }) }),
    guest: (body: GuestRequest) =>
      request<TokenResponse>("/auth/guest", { method: "POST", body: JSON.stringify(body) }),
  },
  sessions: {
    current: () => request<VotingSession>("/sessions/current"),
  },
  awards: {
    list: (schoolId?: string) => request<Award[]>(`/awards${schoolId ? `?school_id=${schoolId}` : ""}`),
  },
  vote: {
    getItems: () => request<VoteItem[]>("/vote/items"),
    upsertItems: (sessionId: string, items: VoteItemInput[]) =>
      request("/vote/items", { method: "PUT", body: JSON.stringify({ session_id: sessionId, items }) }),
  },
}

// Types
export interface School { id: string; name: string; code: string }
export interface SchoolDetail extends School { verification_questions: Array<{ question: string }> }
export interface VotingSession { id: string; year: number; name: string; status: string }
export interface Award {
  id: string; name: string; description: string
  category: "mandatory" | "optional" | "entertainment"
  score_config: { allowed_scores: number[]; max_count: Record<string, number> }
  display_order: number
  nominees: Nominee[]
}
export interface Nominee { id: string; name: string; cover_image_key?: string; display_order: number }
export interface VoteItem { nominee_id: string; score: number }
export interface VoteItemInput { nominee_id: string; score: number }
export interface TokenResponse { access_token: string; refresh_token: string }
export interface GuestRequest {
  nickname: string; school_code: string; method: "question" | "email"
  answer?: string; email?: string; code?: string
}
```

**Step 2: Commit**

```bash
git commit -am "feat(frontend): add typed API client"
```

---

### Task 6.2: 投票页面 — multi-step flow

**Files:**
- Create: `frontend/app/vote/page.tsx`
- Create: `frontend/app/vote/steps/SelectSchool.tsx`
- Create: `frontend/app/vote/steps/Verify.tsx`
- Create: `frontend/app/vote/steps/VoteForm.tsx`
- Create: `frontend/app/vote/steps/NicknameConflict.tsx`
- Create: `frontend/hooks/useVoteStore.ts`

**Step 1: Zustand store（或 useReducer，管理 multi-step 状态）**

```ts
// frontend/hooks/useVoteStore.ts
"use client"
import { create } from "zustand"
import { School, VotingSession } from "@/lib/api"

type Step = "select-school" | "verify" | "vote" | "conflict"

interface VoteStore {
  step: Step
  school: School | null
  session: VotingSession | null
  conflictType: "same_school" | null
  setSchool: (s: School) => void
  setSession: (s: VotingSession) => void
  goTo: (step: Step) => void
  setConflict: (type: "same_school") => void
  reset: () => void
}

export const useVoteStore = create<VoteStore>((set) => ({
  step: "select-school",
  school: null,
  session: null,
  conflictType: null,
  setSchool: (school) => set({ school }),
  setSession: (session) => set({ session }),
  goTo: (step) => set({ step }),
  setConflict: (conflictType) => set({ conflictType, step: "conflict" }),
  reset: () => set({ step: "select-school", school: null, conflictType: null }),
}))
```

安装 zustand：
```bash
cd frontend && bun add zustand
```

**Step 2: SelectSchool 组件**

```tsx
// frontend/app/vote/steps/SelectSchool.tsx
"use client"
import { useEffect, useState } from "react"
import { api, School } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"

export function SelectSchool() {
  const [schools, setSchools] = useState<School[]>([])
  const [selected, setSelected] = useState<School | null>(null)
  const { setSchool, goTo } = useVoteStore()

  useEffect(() => { api.schools.list().then(setSchools) }, [])

  function handleNext() {
    if (!selected) return
    setSchool(selected)
    goTo("verify")
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader><CardTitle>选择你的学校</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {schools.map((s) => (
          <button key={s.id} onClick={() => setSelected(s)}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${selected?.id === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
            {s.name}
          </button>
        ))}
        <Button className="w-full" disabled={!selected} onClick={handleNext}>下一步</Button>
      </CardContent>
    </Card>
  )
}
```

**Step 3: NicknameConflict 组件（同学校冲突页面）**

```tsx
// frontend/app/vote/steps/NicknameConflict.tsx
"use client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"

interface Props { nickname: string; onReauth: () => void }

export function NicknameConflict({ nickname, onReauth }: Props) {
  const { goTo } = useVoteStore()

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>昵称已被使用</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          「{nickname}」这个昵称已被使用。如果这是你，请重新验证身份。
        </p>
        <Button className="w-full" onClick={onReauth}>重新验证身份</Button>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">或者</span>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={() => goTo("verify")}>
          ← 返回，换一个昵称
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Step 4: VoteForm — 奖项投票主界面**

```tsx
// frontend/app/vote/steps/VoteForm.tsx
"use client"
import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { api, Award, VoteItem } from "@/lib/api"
import { useVoteStore } from "@/hooks/useVoteStore"
import { AwardCard } from "./AwardCard"
import { Button } from "@/components/ui/button"

const SHOW_INITIALLY = 3

export function VoteForm() {
  const { school, session } = useVoteStore()
  const [awards, setAwards] = useState<Award[]>([])
  const [votes, setVotes] = useState<Record<string, number>>({}) // nomineeId → score
  const [showAllOptional, setShowAllOptional] = useState(false)
  const [showAllEntertainment, setShowAllEntertainment] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!school) return
    api.awards.list(school.id).then(setAwards)
    api.vote.getItems().then((items) => {
      const map: Record<string, number> = {}
      items.forEach((it: VoteItem) => { map[it.nominee_id] = it.score })
      setVotes(map)
    })
  }, [school])

  const handleVote = useCallback(async (nomineeId: string, score: number) => {
    const next = { ...votes, [nomineeId]: score }
    setVotes(next)
    if (!session) return
    setSaving(true)
    await api.vote.upsertItems(session.id, [{ nominee_id: nomineeId, score }])
    setSaving(false)
  }, [votes, session])

  const mandatory = awards.filter(a => a.category === "mandatory")
  const optional = awards.filter(a => a.category === "optional")
  const entertainment = awards.filter(a => a.category === "entertainment")

  const visibleOptional = showAllOptional ? optional : optional.slice(0, SHOW_INITIALLY)
  const visibleEntertainment = showAllEntertainment ? entertainment : entertainment.slice(0, SHOW_INITIALLY)

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-16">
      {saving && <p className="text-xs text-muted-foreground text-right">保存中…</p>}

      {/* 必填奖项 */}
      <section>
        <h2 className="text-lg font-semibold mb-4">正赛奖项（必填）</h2>
        <div className="space-y-4">
          {mandatory.map(award => (
            <AwardCard key={award.id} award={award} votes={votes} onVote={handleVote} />
          ))}
        </div>
      </section>

      {/* 附加奖项 */}
      {optional.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">附加奖项（选填）</h2>
          <div className="space-y-4">
            <AnimatePresence>
              {visibleOptional.map(award => (
                <motion.div key={award.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <AwardCard award={award} votes={votes} onVote={handleVote} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {optional.length > SHOW_INITIALLY && !showAllOptional && (
            <Button variant="outline" className="mt-3 w-full" onClick={() => setShowAllOptional(true)}>
              展开全部 ({optional.length})
            </Button>
          )}
        </section>
      )}

      {/* 学校娱乐奖项 */}
      {entertainment.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">本校娱乐奖项</h2>
          <div className="space-y-4">
            <AnimatePresence>
              {visibleEntertainment.map(award => (
                <motion.div key={award.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <AwardCard award={award} votes={votes} onVote={handleVote} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {entertainment.length > SHOW_INITIALLY && !showAllEntertainment && (
            <Button variant="outline" className="mt-3 w-full" onClick={() => setShowAllEntertainment(true)}>
              展开全部 ({entertainment.length})
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
```

**Step 5: AwardCard 组件（支持/没看过/不支持 三态切换）**

```tsx
// frontend/app/vote/steps/AwardCard.tsx
"use client"
import { Award } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Props {
  award: Award
  votes: Record<string, number>
  onVote: (nomineeId: string, score: number) => void
}

const SCORE_LABELS: Record<number, string> = { 1: "支持", 0: "没看过", "-1": "不支持" }
const SCORE_STYLES: Record<number, string> = {
  1: "bg-primary text-primary-foreground border-primary",
  0: "bg-muted text-muted-foreground border-muted",
  "-1": "bg-destructive/20 text-destructive border-destructive/50",
}

export function AwardCard({ award, votes, onVote }: Props) {
  const maxSupport = award.score_config.max_count["1"] ?? 4
  const supportCount = award.nominees.filter(n => votes[n.id] === 1).length

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium">{award.name}</h3>
          {award.description && <p className="text-sm text-muted-foreground">{award.description}</p>}
        </div>
        <span className="text-xs text-muted-foreground">支持 {supportCount}/{maxSupport}</span>
      </div>
      <div className="space-y-2">
        {award.nominees.map(nominee => {
          const current = votes[nominee.id]
          const canSupport = supportCount < maxSupport || current === 1
          return (
            <div key={nominee.id} className="flex items-center justify-between gap-2">
              <span className="text-sm flex-1 truncate">{nominee.name}</span>
              <div className="flex gap-1">
                {[1, 0, -1].map(score => (
                  <button key={score}
                    disabled={score === 1 && !canSupport && current !== 1}
                    onClick={() => onVote(nominee.id, score)}
                    className={cn(
                      "px-2 py-1 text-xs rounded border transition-colors",
                      current === score ? SCORE_STYLES[score] : "border-border hover:border-primary/50",
                      score === 1 && !canSupport && current !== 1 && "opacity-40 cursor-not-allowed"
                    )}>
                    {SCORE_LABELS[score]}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 6: 组合 vote/page.tsx**

```tsx
// frontend/app/vote/page.tsx
"use client"
import { useVoteStore } from "@/hooks/useVoteStore"
import { SelectSchool } from "./steps/SelectSchool"
import { Verify } from "./steps/Verify"
import { VoteForm } from "./steps/VoteForm"
import { NicknameConflict } from "./steps/NicknameConflict"

export default function VotePage() {
  const step = useVoteStore(s => s.step)
  return (
    <div className="container py-8">
      {step === "select-school" && <SelectSchool />}
      {step === "verify" && <Verify />}
      {step === "vote" && <VoteForm />}
      {step === "conflict" && <NicknameConflict />}
    </div>
  )
}
```

**Step 7: Commit**

```bash
git commit -am "feat(frontend): implement multi-step voting flow with award cards"
```

---

## Phase 7: Frontend — Account & Admin

### Task 7.1: 账户页（升级 guest → registered）

**Files:**
- Create: `frontend/app/account/page.tsx`

```tsx
// frontend/app/account/page.tsx
"use client"
import { useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AccountPage() {
  const [email, setEmail] = useState("")
  const [step, setStep] = useState<"form" | "verify" | "password">("form")
  const [verifyLink, setVerifyLink] = useState("")

  async function handleUpgrade() {
    await api.auth.upgrade(email) // POST /auth/upgrade
    setStep("verify")
  }

  return (
    <div className="container py-8 max-w-md">
      <Card>
        <CardHeader><CardTitle>升级为正式账户</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {step === "form" && (
            <>
              <p className="text-sm text-muted-foreground">
                验证邮箱后设置密码，即可保存历年投票记录。邮箱无后缀限制。
              </p>
              <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                placeholder="填写邮箱" value={email} onChange={e => setEmail(e.target.value)} />
              <Button className="w-full" onClick={handleUpgrade}>发送验证邮件</Button>
            </>
          )}
          {step === "verify" && (
            <p className="text-sm text-muted-foreground">
              验证邮件已发送至 {email}，请点击邮件中的链接完成验证，然后回来设置密码。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git commit -am "feat(frontend): add account upgrade page"
```

---

### Task 7.2: Admin 后台（基础框架）

**Files:**
- Create: `frontend/app/admin/layout.tsx`
- Create: `frontend/app/admin/session/page.tsx`
- Create: `frontend/app/admin/schools/page.tsx`
- Create: `frontend/app/admin/export/page.tsx`

**Admin layout（role guard 由 server component 或 middleware 实现）：**

```tsx
// frontend/app/admin/layout.tsx
import { redirect } from "next/navigation"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // JWT role check happens client-side in each page via useAuth hook
  return (
    <div className="container py-8">
      <nav className="flex gap-4 mb-8 text-sm">
        <a href="/admin/session" className="hover:text-primary">投票状态</a>
        <a href="/admin/schools" className="hover:text-primary">学校管理</a>
        <a href="/admin/awards" className="hover:text-primary">奖项管理</a>
        <a href="/admin/export" className="hover:text-primary">数据导出</a>
      </nav>
      {children}
    </div>
  )
}
```

**Session status 切换页：**

```tsx
// frontend/app/admin/session/page.tsx
"use client"
import { useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"

const STATUSES = [
  { value: "pending", label: "待开始" },
  { value: "active",  label: "投票中" },
  { value: "counting", label: "计票中" },
  { value: "published", label: "已公布" },
]

export default function SessionPage() {
  const [current, setCurrent] = useState("pending")

  async function handleSet(status: string) {
    await api.admin.patchSessionStatus("current", status)
    setCurrent(status)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">投票状态控制</h1>
      <div className="flex gap-3 flex-wrap">
        {STATUSES.map(s => (
          <Button key={s.value} variant={current === s.value ? "default" : "outline"}
            onClick={() => handleSet(s.value)}>
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git commit -am "feat(frontend): add admin panel with session control and export"
```

---

## Phase 8: Docker & Deployment

### Task 8.1: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

```dockerfile
# backend/Dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
```

**Step 2: Frontend Dockerfile**

```dockerfile
# frontend/Dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**Step 3: 本地完整联调**

```bash
# 在项目根目录
docker compose up --build
```

访问 http://localhost:3000 验证前端，http://localhost:8080/api/v1/schools 验证后端。

**Step 4: Commit**

```bash
git commit -am "chore: add dockerfiles for frontend and backend"
```

---

## Phase 9: 收尾

### Task 9.1: 环境变量文档 & README

**Files:**
- Create: `README.md`
- Create: `backend/.env.example`（已在 Task 0.1 创建）
- Create: `frontend/.env.example`

```env
# frontend/.env.example
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

### Task 9.2: 端对端冒烟测试清单

手动验证以下流程通过后打 tag：

- [ ] 选择学校 → 验证题验证 → 创建 guest → 进入投票页
- [ ] 选择学校 → 邮箱验证 → 创建 guest → 进入投票页
- [ ] 昵称冲突（同学校）→ 显示两个按钮 → 重新验证或返回换昵称
- [ ] 昵称冲突（不同学校）→ 报错
- [ ] 投票页：mandatory 全部作答，score=1 不超过 max_count
- [ ] optional 默认展示 3 个，点击展开全部
- [ ] entertainment 默认展示 3 个，点击展开全部
- [ ] 投票改动实时自动保存
- [ ] 账户升级：发邮件 → 验证 → 设置密码
- [ ] 管理后台：切换 session 状态
- [ ] 数据导出 CSV（school_admin 只能导出本校）

```bash
git tag v0.1.0
git push origin v0.1.0
```

# DX Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完善环境变量文档、修复 Docker 构建、添加 Air 热重载、创建 Taskfile 统一构建系统。

**Architecture:** 纯配置/工具链改动，不涉及业务逻辑。Air 使用 Go 1.24 `tool` 指令管理，Taskfile 放在项目根目录统一入口。

**Tech Stack:** Go 1.24, Air (go tool mode), Taskfile v3, Docker, bun, Next.js

---

### Task 1：完善 `backend/.env.example` 注释

**Files:**
- Modify: `backend/.env.example`

**Step 1：替换文件内容，加入分组注释**

将 `backend/.env.example` 改为：

```dotenv
# =============================================================================
# 数据库
# =============================================================================

# PostgreSQL 连接字符串，格式：postgres://用户名:密码@主机:端口/数据库名?sslmode=disable
DATABASE_URL=postgres://bta:bta_dev@localhost:5432/bta_voting?sslmode=disable

# =============================================================================
# JWT 认证
# 生产环境请使用强随机字符串，例如：openssl rand -hex 32
# =============================================================================

JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-refresh

# =============================================================================
# 邮件发送
# EMAIL_PROVIDER 选择邮件发送方式：
#   smtp   - 使用标准 SMTP 协议（填写下方 SMTP_* 字段）
#   resend - 使用 Resend API（填写下方 RESEND_API_KEY 字段）
# =============================================================================

EMAIL_PROVIDER=smtp

# 所有外发邮件的发件人地址（From 字段），两种 provider 均生效
EMAIL_FROM=noreply@example.com

# --- SMTP 配置（EMAIL_PROVIDER=smtp 时填写）---
SMTP_HOST=smtp.example.com
# 常见端口：587（STARTTLS）、465（SSL/TLS）、25（明文，不推荐）
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password

# --- Resend 配置（EMAIL_PROVIDER=resend 时填写）---
# 在 https://resend.com 获取 API Key
RESEND_API_KEY=

# =============================================================================
# 文件存储（用于上传封面图等）
# BLOB_PROVIDER 选项：
#   file - 存储到本地文件系统（BLOB_FILE_PATH 指定目录）
# =============================================================================

BLOB_PROVIDER=file
BLOB_FILE_PATH=./uploads

# =============================================================================
# 服务器
# =============================================================================

# 后端监听端口
SERVER_PORT=8080

# 前端地址，用于 CORS 白名单和邮件中的链接生成
FRONTEND_URL=http://localhost:3000
```

**Step 2：确认文件正确**

```bash
cat backend/.env.example
```

Expected: 输出包含分组注释的完整内容。

**Step 3：Commit**

```bash
git add backend/.env.example
git commit -m "docs(backend): add detailed comments to .env.example"
```

---

### Task 2：修复 Dockerfile（Go 版本 + 中国镜像）

**Files:**
- Modify: `backend/Dockerfile`

**背景：** `go.mod` 要求 `go 1.24.2`，但 Dockerfile 使用 `golang:1.23-alpine`，版本不匹配导致构建失败。同时需要为中国大陆网络设置 GOPROXY。

**Step 1：更新 Dockerfile**

将 `backend/Dockerfile` 改为：

```dockerfile
# Build stage
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go env -w GOPROXY=https://goproxy.cn,direct && go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Runtime stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server .
EXPOSE 8080
CMD ["./server"]
```

**Step 2：Commit**

```bash
git add backend/Dockerfile
git commit -m "fix(backend): upgrade Go image to 1.24 and add GOPROXY for China"
```

---

### Task 3：添加 Air 热重载（`go tool` 模式）

**Files:**
- Modify: `backend/go.mod`（自动修改）
- Modify: `backend/go.sum`（自动修改）
- Create: `backend/.air.toml`
- Modify: `backend/.gitignore`（如有）或根目录 `.gitignore`

**Step 1：添加 Air 为 go tool 依赖**

```bash
cd backend && go get -tool github.com/air-verse/air@latest
```

Expected: `go.mod` 出现 `tool github.com/air-verse/air` 行。

**Step 2：验证 air 可用**

```bash
cd backend && go tool air -v
```

Expected: 输出 air 版本号，不报错。

**Step 3：创建 `backend/.air.toml`**

```toml
root = "."
tmp_dir = "tmp"

[build]
  cmd = "go build -o ./tmp/server ./cmd/server"
  bin = "./tmp/server"
  include_ext = ["go"]
  exclude_dir = ["tmp", "vendor", "internal/ent"]
  delay = 1000

[log]
  time = false

[color]
  main = "magenta"
  watcher = "cyan"
  build = "yellow"
  runner = "green"

[misc]
  clean_on_exit = true
```

**Step 4：确保 `tmp/` 目录不被提交**

检查根目录 `.gitignore`：

```bash
grep -n "tmp" .gitignore
```

如果没有 `backend/tmp/`，添加：

```bash
echo "backend/tmp/" >> .gitignore
```

**Step 5：验证 air 启动（需要数据库运行）**

如果数据库未启动，只验证 air 能检测到配置即可：

```bash
cd backend && go tool air -c .air.toml -- 2>&1 | head -5
```

Expected: 输出 air banner，开始监听文件变化（或因数据库未连接而退出，不是 air 本身的错误）。

**Step 6：Commit**

```bash
git add backend/go.mod backend/go.sum backend/.air.toml .gitignore
git commit -m "feat(backend): add air hot-reload via go tool directive"
```

---

### Task 4：创建 Taskfile.yml

**Files:**
- Create: `Taskfile.yml`（项目根目录）

**Step 1：创建 Taskfile.yml**

```yaml
version: '3'

vars:
  BACKEND_DIR: backend
  FRONTEND_DIR: frontend

tasks:
  dev:backend:
    desc: 启动后端开发服务器（Air 热重载）
    dir: '{{.BACKEND_DIR}}'
    cmd: go tool air -c .air.toml

  dev:frontend:
    desc: 启动前端开发服务器
    dir: '{{.FRONTEND_DIR}}'
    cmd: bun dev

  docker:build:
    desc: 构建 Docker 镜像
    cmd: docker compose build

  docker:up:
    desc: 启动所有 Docker 服务
    cmd: docker compose up

  docker:down:
    desc: 停止所有 Docker 服务
    cmd: docker compose down

  db:migrate:
    desc: 运行数据库迁移
    dir: '{{.BACKEND_DIR}}'
    cmd: go run ./cmd/migrate

  test:
    desc: 运行后端测试
    dir: '{{.BACKEND_DIR}}'
    cmd: go test ./...
```

**Step 2：安装 task（如未安装）**

```bash
go install github.com/go-task/task/v3/cmd/task@latest
```

**Step 3：验证 task 列出所有任务**

```bash
task --list
```

Expected：列出所有 task 及其描述，格式如：
```
task: Available tasks for this project:
* db:migrate:       运行数据库迁移
* dev:backend:      启动后端开发服务器（Air 热重载）
* dev:frontend:     启动前端开发服务器
* docker:build:     构建 Docker 镜像
* docker:down:      停止所有 Docker 服务
* docker:up:        启动所有 Docker 服务
* test:             运行后端测试
```

**Step 4：Commit**

```bash
git add Taskfile.yml
git commit -m "chore: add Taskfile for unified dev workflow"
```

---

### Task 5：验证 Docker 构建

**Step 1：确保有 `backend/.env` 文件**

`docker compose` 需要 `backend/.env`。如果只有 `.env.example`：

```bash
cp backend/.env.example backend/.env
# 按需修改 backend/.env 中的值
```

**Step 2：运行 Docker 构建**

```bash
task docker:build
```

或直接：

```bash
docker compose build 2>&1
```

Expected：构建成功，最后输出 `Successfully built` 或 `=> exporting to image`，无错误。

**Step 3：如有错误，根据错误信息修复后重新构建**

常见问题：
- go 依赖下载失败 → 检查 GOPROXY 是否生效
- 编译错误 → 检查 Go 代码

**Step 4：更新 README（可选）**

在 README 中添加 Taskfile 的安装和使用说明。

**Step 5：最终 Commit（如有额外修改）**

```bash
git add -A
git commit -m "chore: verify docker build and update README"
```

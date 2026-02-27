# 大二杯年度动画评选投票平台 (BTA Voting System)

大二杯年度动画评选投票系统（BTA Cup Annual Anime Popularity Voting Platform），支持 guest 投票（验证题 / 学校邮箱）和账户升级，后台管理员可管理投票会话及导出数据。

## 架构

```
frontend/   Next.js 15（部署至 Vercel）
backend/    Go 1.23 + Echo（自托管 Docker）
            PostgreSQL（数据库）
```

- **前端**：Next.js 15 App Router，Bun 包管理器
- **后端**：Go + Echo，JWT 双 Token 认证，邮件支持 Resend 或 SMTP，文件上传支持本地文件存储
- **数据库**：PostgreSQL，迁移通过 `cmd/migrate` 管理

## Monorepo 结构

```
bta-voting-system/
├── frontend/          # Next.js 前端
├── backend/           # Go 后端
├── docker-compose.yml # 一键启动（含数据库）
└── docs/              # 设计文档
```

## 前置依赖

| 工具 | 版本要求 |
|------|---------|
| Go | 1.23+ |
| Bun | 最新稳定版 |
| Docker Compose | v2+ |

## 快速开始

### 方式一：分别启动（开发推荐）

**后端**

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写必填项（见下方环境变量说明）
cd backend
go mod tidy
go run ./cmd/migrate
go run ./cmd/server
```

**前端**

```bash
cp frontend/.env.example frontend/.env.local
cd frontend
bun install
bun run dev
```

### 方式二：Docker Compose（含数据库）

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env
docker compose up --build
```

前端默认运行在 `http://localhost:3000`，后端 API 在 `http://localhost:8080/api/v1`。

## 环境变量

### 后端（`backend/.env`）

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，例：`postgres://bta:pass@localhost:5432/bta_voting?sslmode=disable` | 是 |
| `JWT_SECRET` | JWT access token 签名密钥 | 是 |
| `JWT_REFRESH_SECRET` | JWT refresh token 签名密钥 | 是 |
| `EMAIL_PROVIDER` | 邮件服务提供商：`resend` 或 `smtp` | 是 |
| `RESEND_API_KEY` | Resend API Key（`EMAIL_PROVIDER=resend` 时必填） | 条件 |
| `SMTP_HOST` | SMTP 服务器地址（`EMAIL_PROVIDER=smtp` 时必填） | 条件 |
| `SMTP_PORT` | SMTP 端口，默认 `587` | 条件 |
| `SMTP_USER` | SMTP 用户名 | 条件 |
| `SMTP_PASS` | SMTP 密码 | 条件 |
| `BLOB_PROVIDER` | 文件存储方式：`file`（本地） | 是 |
| `BLOB_FILE_PATH` | 本地文件存储路径，默认 `./uploads` | 是 |
| `SERVER_PORT` | 后端监听端口，默认 `8080` | 是 |
| `FRONTEND_URL` | 前端地址，用于邮件链接跳转，默认 `http://localhost:3000` | 是 |

### 前端（`frontend/.env.local`）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 基础 URL，例：`http://localhost:8080/api/v1` |

## 主要用户流程

- **Path A（验证题）**：选择学校 → 回答验证题 → 创建 guest 账户 → 进入投票页
- **Path B（邮箱验证）**：选择学校 → 填写学校邮箱 → 收验证邮件 → 创建 guest 账户 → 进入投票页
- **账户升级**：guest 用户通过邮件验证后设置密码，升级为注册账户
- **管理后台**：管理员切换投票会话状态、管理候选项；school_admin 可导出本校投票数据 CSV

## Smoke Test 清单

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

# 大二杯年度动画评选投票平台 (BTA Voting System)

大二杯年度动画评选投票系统（BTA Cup Annual Anime Popularity Voting Platform），支持 guest 投票（验证题 / 学校邮箱）和账户升级，后台管理员可管理投票会话及导出数据。

## 架构

```
frontend/   Next.js 16（部署至 Vercel）
backend/    Go 1.25 + Echo（自托管 Docker）
            PostgreSQL（数据库）
```

- **前端**：Next.js 16 App Router，Bun 包管理器
- **后端**：Go + Echo，JWT 双 Token 认证，邮件支持 Resend 或 SMTP，文件上传支持本地文件存储
- **数据库**：PostgreSQL，启动时自动迁移（Ent Schema）

## Monorepo 结构

```
bta-voting-system/
├── frontend/              # Next.js 前端
├── backend/               # Go 后端
├── openspec/              # OpenSpec 需求规范
├── docs/                  # 设计文档
├── data/                  # 生产环境数据目录（不提交到 Git）
│   ├── postgres/          # PostgreSQL 数据库文件
│   └── uploads/           # 用户上传的文件
├── docker-compose.yml     # 开发环境（仅数据库）
└── docker-compose.prod.yml # 生产环境（后端 + 数据库）
```

## 前置依赖

| 工具 | 版本要求 |
|------|---------|
| Go | 1.25+ |
| Bun | 最新稳定版 |
| Docker Compose | v2+ |

## 快速开始

### 方式一：分别启动（开发推荐）

**后端**

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写必填项（见下方环境变量说明）
# 生成 JWT 密钥（可选，使用 task 命令）
task gen:jwt-secrets  # 复制输出到 .env 文件

cd backend
go mod tidy
go run ./cmd/server  # 启动时自动执行数据库迁移
```

**前端**

```bash
cp frontend/.env.example frontend/.env.local
cd frontend
bun install
bun run dev
```

### 方式二：Docker Compose（开发环境）

> **注意**：`docker-compose.yml` 仅包含 `db` 服务，后端和前端需单独启动。

```bash
# 启动数据库
docker compose up -d

# 启动后端（会自动执行数据库迁移）
cd backend
cp .env.example .env
# 编辑 .env
go run ./cmd/server

# 启动前端
cd frontend
cp .env.example .env.local
bun install
bun run dev
```

后端 API 在 `http://localhost:8080/api/v1`，前端在 `http://localhost:3000`。

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
| `FRONTEND_URL` | 前端地址，用于 CORS 白名单和邮件链接，默认 `http://localhost:3000` | 是 |
| `BACKEND_BASE_URL` | 后端基础 URL，用于生成静态资源完整 URL，默认 `http://localhost:8080` | 是 |
| `UPLOAD_DIR` | 静态文件上传目录，默认 `./uploads` | 是 |
| `COOKIE_SECURE` | Cookie Secure 属性（HTTPS-only），默认 `false`，生产环境设为 `true` | 否 |
| `COOKIE_SAMESITE` | Cookie SameSite 属性，默认 `Lax`，可选 `Strict`/`None` | 否 |
| `COOKIE_DOMAIN` | Cookie Domain 属性，跨子域共享时设置，默认为空 | 否 |

### 前端（`frontend/.env.local`）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 基础 URL，例：`http://localhost:8080/api/v1` |

## 生产部署

本项目采用混合部署架构：
- **前端**：部署到 Vercel（自动 HTTPS、全球 CDN）
- **后端 + 数据库**：Docker Compose 部署到你的服务器

详细的生产部署流程请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)，包括：
- 后端 Docker Compose 配置
- Vercel 前端部署配置
- 环境变量配置指南
- 首次启动获取 super_admin 密码
- 数据备份与恢复
- 常见问题排查

## 主要用户流程

- **Path A（验证题）**：选择学校 → 回答验证题 → 创建 guest 账户 → 进入投票页
- **Path B（邮箱验证）**：选择学校 → 填写学校邮箱 + 验证码 → 创建 guest 账户 → 进入投票页
- **直接注册**：填写邮箱 + 验证码 + 昵称 + 密码 → 创建正式账户
- **账户升级**：guest 用户通过邮件验证后设置密码，升级为正式账户
- **管理后台**：super_admin 管理投票会话、学校、奖项、提名；school_admin 管理本校娱乐奖项和提名，导出本校投票数据 CSV

## Spec 体系

平台使用 OpenSpec（`openspec/`）管理需求边界。七个核心能力的约束集位于 `openspec/specs/`：

| 目录 | 能力 |
|------|------|
| `user-auth/` | 用户身份体系：Guest 创建、密码登录、JWT 鉴权、角色模型 |
| `school-verification/` | 学校身份验证：验证题（Path A）、教育邮箱验证码（Path B）|
| `voting/` | 投票核心：奖项分类、评分约束、草稿自动保存 |
| `account-management/` | 账户升级：Guest → Registered、邮箱/密码设置 |
| `admin-management/` | 管理后台：VotingSession 状态机、角色权限边界 |
| `data-export/` | 数据导出：CSV 格式、权限分层 |
| `results-display/` | 结果展示：published 门控、奖项聚合得分 |

新功能开发前，请阅读对应 `spec.md` 了解现有约束边界。详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## Smoke Test 清单

- [ ] 选择学校 → 验证题验证 → 创建 guest → 进入投票页
- [ ] 选择学校 → 邮箱验证 → 创建 guest → 进入投票页
- [ ] 昵称冲突（正式用户）→ 显示"前往登录"或"返回换昵称"
- [ ] 昵称冲突（guest 用户）→ 通过邮箱验证认领
- [ ] 投票页：mandatory 全部作答，score=1 不超过 max_count
- [ ] optional 默认展示 3 个，点击展开全部
- [ ] entertainment 默认展示 3 个，点击展开全部
- [ ] 投票改动实时自动保存
- [ ] 账户升级：发邮件 → 验证 → 设置密码
- [ ] 管理后台：切换 session 状态
- [ ] 数据导出 CSV（school_admin 只能导出本校）

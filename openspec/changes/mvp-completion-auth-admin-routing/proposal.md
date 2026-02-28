## Why

应用当前处于不可用状态：无登录注册界面、数据库未初始化、管理后台 CRUD 端点缺失、投票页提名信息不完整、路由结构未适配多届赛事扩展需求。本次变更为 MVP 完整性补全，将系统从"能跑但无法使用"推向"可测试、可演示"的状态。

## Enhanced Requirements（结构化需求）

### 目标
1. 打通完整用户流程：注册/登录 → 选学校 → 验证 → 投票
2. 打通完整管理员流程：登录 → 进入管理后台 → CRUD 所有资源
3. 数据库自初始化：服务启动时自动迁移 + 超管账户创建 + 测试数据注入
4. 路由适配多届赛事扩展

### 技术约束（Hard Constraints）
- 前端：Next.js 15 App Router + Bun + shadcn/ui（Radix UI）+ Zustand + Framer Motion，**不引入额外 CSS 框架**
- 后端：Go + Echo + Ent ORM + JWT 双 Token 认证，维持现有 API 路径前缀 `/api/v1`
- Admin 表格组件：`shadcn/ui + @tanstack/react-table`（新增唯一 npm 依赖）
- 路由结构：`/session/[year]/vote`、`/session/[year]/results`（Next.js App Router 动态段）
- 现有 vote flow 的 Zustand store（`useVoteStore`）保持接口稳定，路由迁移不重写状态机

### 范围边界（Scope）
**IN SCOPE（本次变更）**
- 登录/注册页面（`/auth/login`、`/auth/register`）
- Session 化路由重构（`/session/[year]/vote`）
- 投票页提名 Cover Image 展示
- Verify.tsx 中添加"注册正式用户"引导链接
- 数据库自动迁移 + 超管初始化 + 测试数据 Seed
- 管理后台完整 CRUD 后端接口：Session、School、Award、Nominee、User 列表
- 管理后台前端实现（TanStack Table：分页、搜索、多选、CRUD 操作）
- 顶栏管理员快捷入口（已登录且角色 ≥ school_admin 时显示"管理后台"链接）
- 登录后 redirect 逻辑（回到来源页或默认首页）

**OUT OF SCOPE（本次不做）**
- JWT Refresh Token 端点（复杂度高，后续独立变更）
- 密码重置（后续）
- 审计日志（后续）
- 结果页（`/session/[year]/results`）的完整实现（仅建立路由骨架）

## What Changes

### 新增路由（Frontend）

| 路由 | 文件 | 说明 |
|------|------|------|
| `/auth/login` | `app/auth/login/page.tsx` | 登录页，支持密码登录 |
| `/auth/register` | `app/auth/register/page.tsx` | 注册页，升级 Guest→Registered |
| `/session/[year]/vote` | `app/session/[year]/vote/page.tsx` | 原 `/vote` 迁移至此 |
| `/session/[year]/results` | `app/session/[year]/results/page.tsx` | 结果页骨架（当前 session 重定向） |

原 `/vote` 保留为重定向（redirect 至当前 session 年份的 `/session/[year]/vote`）

### 新增 API 端点（Backend Admin CRUD）

**Session 管理**
- `GET /api/v1/admin/sessions` — 列表（分页 + 搜索）
- `POST /api/v1/admin/sessions` — 创建
- `GET /api/v1/admin/sessions/:id` — 详情
- `PUT /api/v1/admin/sessions/:id` — 更新
- `DELETE /api/v1/admin/sessions/:id` — 删除

**School 管理**
- `GET /api/v1/admin/schools` — 列表（分页 + 搜索）
- `PUT /api/v1/admin/schools/:id` — 更新
- `DELETE /api/v1/admin/schools/:id` — 删除（软删，设 is_active=false）

**Award 管理**
- `GET /api/v1/admin/awards` — 列表（分页 + session_id 过滤）
- `POST /api/v1/admin/awards` — 创建
- `PUT /api/v1/admin/awards/:id` — 更新
- `DELETE /api/v1/admin/awards/:id` — 删除

**Nominee 管理**
- `GET /api/v1/admin/nominees` — 列表（分页 + award_id 过滤）
- `POST /api/v1/admin/nominees` — 创建（含 cover_image_key 字段）
- `PUT /api/v1/admin/nominees/:id` — 更新
- `DELETE /api/v1/admin/nominees/:id` — 删除

**User 管理（super_admin）**
- `GET /api/v1/admin/users` — 列表（分页 + 搜索）
- `PATCH /api/v1/admin/users/:id/role` — 修改角色

**通用分页约定**：所有列表端点支持 `?page=1&page_size=20&q=<search>`

### 修改（Frontend）

| 文件 | 改动 |
|------|------|
| `app/vote/steps/Verify.tsx` | 在提交按钮上方添加"注册正式用户"引导文本链接 |
| `app/vote/steps/AwardCard.tsx` | 在提名名称旁展示封面缩略图（`cover_image_key` → URL） |
| `app/admin/layout.tsx` | 完善 Tab 导航：Session / School / Award / Nominee / User / Export |
| `app/admin/session/page.tsx` | 用 TanStack Table 实现完整 CRUD 表格 |
| `app/admin/awards/page.tsx` | 从 stub 改为完整 CRUD（Award + Nominee 双层） |
| `app/admin/schools/page.tsx` | 从 stub 改为完整 CRUD |
| `app/layout.tsx` | 全局 Header 中当角色 ≥ school_admin 时显示"管理后台"链接 |

### 修改（Backend）

| 文件 | 改动 |
|------|------|
| `cmd/server/main.go` | 启动时调用 `schema.Create()` 自动迁移 |
| `cmd/server/main.go` | 启动时检查 super_admin 是否存在，不存在则创建并 log 输出密码 |
| `cmd/server/main.go` | DEV 模式下注入测试数据 Seed（可由环境变量 `SEED_DATA=true` 控制） |
| `internal/handler/admin.go` | 扩展所有 CRUD 端点 |

## Capabilities

### New Capabilities
- `auth-pages`: 登录/注册页面，连通 JWT 登录流程与注册升级流程
- `session-routing`: `/session/[year]/*` 路由结构，支持多届赛事
- `admin-crud-backend`: 完整 Admin CRUD REST API（Session/School/Award/Nominee/User）
- `admin-crud-frontend`: TanStack Table 驱动的管理后台页面（分页/搜索/多选/CRUD）
- `db-auto-init`: 启动自动迁移 + 超管初始化 + 测试数据 Seed

### Modified Capabilities
- `voting`: 投票页增加 Cover Image 展示、更新路由路径
- `school-verification`: Verify 步骤增加注册正式用户引导

## Impact

- **代码**：新增约 15 个文件，修改约 8 个文件
- **API**：新增 ~16 个 Admin CRUD 端点，现有端点路径不变
- **依赖**：前端新增 `@tanstack/react-table`（1 个新 npm 包）
- **数据库**：Schema 无变更，仅自动迁移执行顺序提前至 server 启动
- **破坏性变更**：原 `/vote` 路由建议重定向至 `/session/[year]/vote`，不删除旧路由（兼容现有书签）

## Constraints Discovered（约束集）

### Hard Constraints
1. `nominee.cover_image_key` 已存在于 Ent schema，但 `AwardCard.tsx` 未渲染 —— 需在前端 `Award` 类型/API 返回中补充 `cover_image_url` 字段
2. `api.auth.login` 端点已存在（`POST /api/v1/auth/login`）但无前端页面消费它
3. Admin 所有新端点必须 require `super_admin` 角色（School 删除/User 角色修改），`school_admin` 仅可操作本校资源
4. TanStack Table 服务端分页：前端不做全量数据缓存，每页通过 API 拉取
5. Seed 数据仅在 `SEED_DATA=true` 时注入，防止生产误执行
6. 超管密码：首次初始化时随机生成，以 `log.Printf` 输出，不写入任何文件

### Soft Constraints
- 注册引导文字：「你也可以选择\n注册正式用户，保留历年记录」—— `\n` 为换行，链接为 `/auth/register`
- 管理后台 Tab 顺序：投票会话 → 学校管理 → 奖项管理 → 提名管理 → 用户管理 → 数据导出
- 顶栏管理入口：仅当 `user.role` 为 `school_admin` 或 `super_admin` 时显示，文字"管理后台"

## Success Criteria（可验证判据）

| # | 判据 | 验证方式 |
|---|------|---------|
| 1 | 访问 `/auth/login` 可渲染登录表单 | 浏览器打开页面 |
| 2 | 超管账户在 server 启动日志中可见 | `go run ./cmd/server` → grep "super_admin" |
| 3 | 启动后直接访问 `/session/2025/vote` 可进入投票流程 | 浏览器打开（需有测试数据）|
| 4 | `GET /api/v1/admin/sessions?page=1&page_size=10` 返回分页列表 | curl + JWT |
| 5 | 管理后台学校管理页可新建、编辑、删除学校 | 浏览器操作 |
| 6 | Verify 页面底部存在"注册正式用户"链接，点击跳转 `/auth/register` | 浏览器检查 |
| 7 | 投票页提名显示封面图（若无图则显示占位符）| 浏览器检查 |
| 8 | 登录为 super_admin 后顶栏出现"管理后台"链接 | 浏览器检查 |
| 9 | `SEED_DATA=true` 启动后，`/api/v1/schools` 返回至少 1 条学校 | curl |
| 10 | 原 `/vote` 路由重定向至 `/session/[year]/vote` | 浏览器地址栏跳转 |

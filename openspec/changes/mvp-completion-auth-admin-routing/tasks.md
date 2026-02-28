# Tasks: mvp-completion-auth-admin-routing

> 约束来源：design.md（D1-D17）+ specs/requirements.md
> 实施顺序：A → B → C → D → E → F → G（B 和 C/D 可并行；G 依赖 B 接口就绪）

---

## 模块 A：数据库自初始化（Backend）

- [x] **A1**. `cmd/server/main.go`：在 `ent.Open()` 之后调用 `client.Schema.Create(ctx)`；若失败则 `log.Fatal`；原 `cmd/migrate` 保留不变

- [x] **A2**. `cmd/server/main.go`：启动时调用 `bootstrapSuperAdmin(ctx, client)` 函数
  - 查询 `db.User.Query().Where(user.RoleEQ("super_admin")).Count()`
  - 若 count > 0：直接返回
  - 若 count == 0：用 `crypto/rand` 生成 32 字符 `[a-zA-Z0-9]` 密码，bcrypt hash，创建 `{email:"admin@bta.local", nickname:"super_admin", role:"super_admin", is_guest:false}`
  - unique violation 错误视为成功，静默返回
  - 成功创建时：`log.Printf("[INIT] super_admin created: email=admin@bta.local password=%s", pwd)`

- [x] **A3**. 创建 `cmd/seed/main.go`：独立 seed 脚本
  - 连接 DB（复用与 server 相同的 DSN env var）
  - 检查 `db.School.Query().Count()`，若 > 0 则打印"数据库已有数据，跳过 seed"并退出（exit 0）
  - 在单个事务中按顺序插入（精确数据见 design.md D3）：
    1. School ×2（univ-a, univ-b）
    2. VotingSession ×1（2025, active）
    3. Award ×3（mandatory/optional/entertainment，entertainment 关联 school univ-a）
    4. 每 Award ×3 Nominee（cover_image_key=""）
    5. User ×2（voter + school_admin，密码均 bcrypt("password123")，school=univ-a）
  - 脚本结束后打印插入摘要

- [x] **A4**. `Taskfile.yml`：新增 `seed` task
  ```yaml
  seed:
    desc: "Insert full test data (skips if DB already has data)"
    dir: backend
    cmds:
      - go run ./cmd/seed
  ```

---

## 模块 B：后端 Admin CRUD（Backend）

### B0: 公共工具

- [x] **B0a**. 在 `internal/handler/` 新建 `pagination.go`：提供 `parsePagination(c echo.Context) (offset, limit int, err error)` 函数
  - 解析 `?page=` 和 `?page_size=`，默认 page=1, page_size=20
  - page_size > 100 → 返回 error（调用方返回 HTTP 400 `{"error":"page_size must be <= 100"}`）
  - 返回 offset=(page-1)*page_size, limit=page_size
  - 提供 `paginatedResponse(data any, total, page, pageSize int) map[string]any` 构造响应体

- [x] **B0b**. 在 `internal/handler/` 新建 `rbac.go`：提供 `requireRole(roles ...string) echo.MiddlewareFunc` 中间件工厂
  - 从 context 读取 claims，若 role 不在 roles 列表中则返回 HTTP 403

- [x] **B0c**. 在 `internal/handler/` 新建 `cover_url.go`：提供 `buildCoverURL(cfg *config.Config, key string) *string` 函数
  - key=="" 或 key==null → 返回 nil
  - `filepath.Clean(key)` 含 ".." → 返回 nil（调用方在构造响应时将 cover_image_url 设为 null）
  - 否则返回 `&(cfg.BackendBaseURL + "/static/" + key)`

### B1: Session 管理

- [x] **B1a**. `GET /api/v1/admin/sessions`（super_admin only）
  - 分页，支持 `?q=` 按 name 模糊搜索（`ILIKE %q%`）
  - 返回 `{data:[{id,year,name,status,created_at},...], total, page, page_size}`

- [x] **B1b**. `POST /api/v1/admin/sessions`（super_admin only）
  - Body: `{year:int, name:string, status?:string}`
  - status 若提供须为合法枚举值，默认 "pending"
  - 返回 HTTP 201 `{id}`

- [x] **B1c**. `GET /api/v1/admin/sessions/:id`（super_admin only）
  - 返回完整 session 对象；404 if not found

- [x] **B1d**. `PUT /api/v1/admin/sessions/:id`（super_admin only）
  - Body: `{year?:int, name?:string, status?:string}`（部分更新，忽略零值字段）
  - status 须为合法枚举值；返回更新后完整对象

- [x] **B1e**. `DELETE /api/v1/admin/sessions/:id`（super_admin only）
  - 若该 session 存在关联 VoteItem → 返回 HTTP 409 `{"error":"session has existing votes"}`
  - 否则硬删除，返回 HTTP 204

### B2: School 管理

- [x] **B2a**. `GET /api/v1/admin/schools`（super_admin only）
  - 分页，支持 `?q=` 按 name 搜索；返回所有学校（含 is_active=false 的）
  - 字段：`{id, name, code, email_suffixes, verification_questions, is_active, created_at}`

- [x] **B2b**. `PUT /api/v1/admin/schools/:id`
  - super_admin：可修改 name, code, email_suffixes, verification_questions, is_active
  - school_admin：仅可修改 verification_questions 和 email_suffixes；其他字段即使在 body 中也忽略；若 id ≠ claims.school_id → 403
  - 返回更新后完整对象

- [x] **B2c**. `DELETE /api/v1/admin/schools/:id`（super_admin only）
  - 软删除：`SET is_active=false`；返回 HTTP 204

### B3: Award 管理

- [x] **B3a**. `GET /api/v1/admin/awards`
  - super_admin：支持 `?session_id=` 过滤，返回该 session 所有 awards（含 nominee 数量）
  - school_admin：强制过滤 school_id=claims.school_id AND category="entertainment"，忽略请求中的 session_id
  - 分页；字段：`{id, name, category, score_config, display_order, session_id, school_id, nominee_count}`

- [x] **B3b**. `POST /api/v1/admin/awards`
  - super_admin：Body `{session_id, name, category, score_config, display_order?, school_id?}`
  - school_admin：强制 category="entertainment"，school_id=claims.school_id（忽略 body 中的这两个字段）
  - 返回 HTTP 201 `{id}`

- [x] **B3c**. `PUT /api/v1/admin/awards/:id`
  - super_admin：可修改所有字段
  - school_admin：先校验 award.school_id=claims.school_id，否则 403；仅可修改 name, score_config, display_order
  - 返回更新后完整对象

- [x] **B3d**. `DELETE /api/v1/admin/awards/:id`
  - super_admin / school_admin（本校娱乐奖）：硬删除，Ent 级联删除关联 Nominee（无 VoteItem 保护，Award 删除时 Nominee 一并删除）
  - 返回 HTTP 204

### B4: Nominee 管理

- [x] **B4a**. `GET /api/v1/admin/nominees`
  - 支持 `?award_id=` 过滤（必填）；分页
  - school_admin：校验 award.school_id=claims.school_id，否则 403
  - 字段：`{id, name, cover_image_key, cover_image_url, description, display_order, award_id}`

- [x] **B4b**. `POST /api/v1/admin/nominees`
  - Body: `{award_id, name, cover_image_key?, description?, display_order?}`
  - school_admin：校验 award.school_id=claims.school_id，否则 403
  - 返回 HTTP 201 `{id}`

- [x] **B4c**. `PUT /api/v1/admin/nominees/:id`
  - school_admin：先校验所属 award.school_id=claims.school_id，否则 403
  - 可修改：name, cover_image_key, description, display_order
  - cover_image_key 若含 ".." → 返回 HTTP 400
  - 返回更新后完整对象（含 cover_image_url）

- [x] **B4d**. `DELETE /api/v1/admin/nominees/:id`
  - 若存在关联 VoteItem → 返回 HTTP 409 `{"error":"nominee has existing votes"}`
  - 否则硬删除，返回 HTTP 204

### B5: Vote Item 管理

- [x] **B5a**. `GET /api/v1/admin/vote-items`
  - 支持 `?session_id=`（必填）过滤；分页
  - super_admin：返回该 session 所有 vote items
  - school_admin：WHERE school_id=claims.school_id
  - 字段：`{id, user_nickname, school_name, award_name, nominee_name, score, ip_address, updated_at}`

- [x] **B5b**. `DELETE /api/v1/admin/vote-items/:id`（super_admin only）
  - 硬删除；返回 HTTP 204；404 if not found

### B6: User 管理

- [x] **B6a**. `GET /api/v1/admin/users`（super_admin only）
  - 分页，支持 `?q=` 按 nickname 或 email 搜索（ILIKE）
  - 字段：`{id, nickname, email, role, school_name, is_guest, created_at}`

- [x] **B6b**. `PATCH /api/v1/admin/users/:id/role`（super_admin only）
  - Body: `{role: "voter" | "school_admin" | "super_admin"}`
  - 合法值校验；返回更新后 `{id, role}`

### B7: 路由注册

- [x] **B7**. `cmd/server/main.go`（或独立路由文件）：在 admin 路由组注册所有新端点
  - 所有新端点统一要求 JWT 中间件
  - 按 D5 配置各端点的 role 检查（`requireSuperAdmin` 或 `requireAdmin` middleware）
  - 新增 Echo Static：`e.Static("/static", cfg.UploadDir)`（在路由注册之前，无需 JWT）

### B8: 配置变量

- [x] **B8**. 在后端配置结构（`internal/config/` 或 env 读取处）新增：
  - `BACKEND_BASE_URL`（string，用于构造 cover_image_url）
  - `UPLOAD_DIR`（string，默认 `./uploads`，Echo Static 的文件根目录）

---

## 模块 C：登录注册页面（Frontend）

- [ ] **C1**. `lib/api.ts`：在统一 fetch wrapper 中新增 401 拦截逻辑
  - 检测 HTTP 401 → `localStorage.removeItem('access_token')` + `removeItem('refresh_token')`
  - `router.push('/auth/login?next=' + encodeURIComponent(location.pathname + location.search))`
  - 抛出 error 以终止请求链
  - 注：需要在 wrapper 中注入 router（通过参数或模块级 import `next/navigation`）

- [ ] **C2**. `lib/api.ts`：确认 `api.auth.login(email, password)` 方法存在（调用 `POST /api/v1/auth/login`），若无则新增；成功后将 token 写入 localStorage

- [ ] **C3**. 创建 `app/auth/login/page.tsx`（客户端组件）
  - 表单字段：email（input type=email）+ 密码（input type=password）
  - 提交：调用 `api.auth.login()`，成功后 `router.push(next ?? '/')`（next 从 `useSearchParams()` 读取）
  - 错误：在表单下方显示错误信息
  - 样式：shadcn/ui Card + Form + Input + Button，居中布局

- [ ] **C4**. 创建 `app/auth/register/page.tsx`（客户端组件）
  - 说明文字：告知用户注册即升级 Guest → 正式用户（需先通过验证流程）
  - 若已有 token（已是 guest）：显示邮箱验证表单，调用 `POST /api/v1/auth/send-code` + `POST /api/v1/auth/verify-email` + 设置密码（`POST /api/v1/auth/upgrade`）
  - 若无 token：提示"请先完成投票验证以创建账户"，显示"去投票"链接
  - 完成后跳转到 `/`

- [ ] **C5**. `app/layout.tsx`（或 `components/layout/AdminNavLink.tsx`）：新增顶栏管理入口
  - 创建客户端子组件 `<AdminNavLink />`，内部调用 `api.auth.me()`
  - 若 role ∈ {school_admin, super_admin}：渲染"管理后台"链接，`href="/admin/session"`
  - 若未登录或 role=voter：不渲染
  - 外层用 `<Suspense fallback={null}>` 包裹

- [ ] **C6**. `app/layout.tsx`（顶栏）：新增登出按钮
  - 仅在已登录时显示（role 任意）
  - 点击：`localStorage.removeItem('access_token')` + `removeItem('refresh_token')` + `router.push('/auth/login')`

---

## 模块 D：路由重构（Frontend）

- [ ] **D1**. 创建目录 `app/session/[year]/vote/` 和 `app/session/[year]/results/`

- [ ] **D2**. 创建 `app/session/[year]/vote/page.tsx`（客户端组件）
  - 从 `useParams()` 读取 `year`
  - `useEffect([year])`：
    1. `parseInt(year)` 为 NaN → 调用 `api.sessions.current()`，`router.replace('/session/{year}/vote')`
    2. 若 store.session?.year !== parseInt(year) → `store.reset()`
    3. 调用 `api.sessions.current()`（或带 year 参数），将 session 写入 store
    4. 若无 active session → 显示"暂无进行中的投票"提示
  - 其余 JSX 与原 `app/vote/page.tsx` 一致（直接复用 VoteFlow 子组件）

- [ ] **D3**. `app/vote/page.tsx`：改为重定向逻辑
  - 调用 `api.sessions.current()` 获取 year
  - `router.replace('/session/{year}/vote')`
  - 加载时显示 loading spinner

- [ ] **D4**. 创建 `app/session/[year]/results/page.tsx`：骨架页
  - 显示"结果尚未公布"静态文案（`<p>` + shadcn Typography）
  - 不调用任何 API

- [ ] **D5**. 检查 `useVoteStore` 是否有 `reset()` 方法，若无则新增（清除所有 session/school/vote 状态，保留 store 接口稳定）

---

## 模块 E：投票页提名封面（Frontend + Backend）

- [ ] **E1**. 后端 `internal/handler/award.go`（`GET /api/v1/awards` 的 nominee 序列化处）：在 nominee 响应对象中新增 `cover_image_url` 字段，调用 `buildCoverURL(cfg, nominee.CoverImageKey)`

- [ ] **E2**. `lib/api.ts`：`Nominee` 类型新增 `cover_image_url?: string | null` 字段

- [ ] **E3**. `app/vote/steps/AwardCard.tsx`：在每个提名旁渲染封面
  - 若 `cover_image_url` 不为 null：`<img src={cover_image_url} className="w-10 h-10 rounded object-cover" />`
  - 若为 null：渲染 SVG 占位符（40×40，灰色背景 + 图片图标）

---

## 模块 F：Verify 注册引导（Frontend）

- [ ] **F1**. `app/vote/steps/Verify.tsx`：在提交按钮上方插入以下 JSX（精确实现，见 design.md D17）：
  ```tsx
  <p className="text-xs text-muted-foreground text-center mt-2">
    你也可以选择
    <br />
    <Link href="/auth/register" className="underline">
      注册正式用户，保留历年记录
    </Link>
  </p>
  ```
  顶部 import 新增 `import Link from 'next/link'`

---

## 模块 G：管理后台 UI（Frontend）

### G0: 基础设施

- [ ] **G0a**. 安装依赖：`bun add @tanstack/react-table`

- [ ] **G0b**. 创建 `components/admin/data-table.tsx`：通用 DataTable 组件
  - Props: `columns: ColumnDef<TData>[]`, `data: TData[]`, `total: number`, `page: number`, `pageSize: number`, `onPageChange`, `onPageSizeChange`, `searchValue?`, `onSearchChange?`
  - 功能：分页控件（上一页/下一页/页码显示）、全局搜索 input、行多选（checkbox 列）
  - 不含业务逻辑，仅 UI

- [ ] **G0c**. 创建 `components/admin/tag-input.tsx`：Tag Input 组件
  - Props: `value: string[]`, `onChange: (v: string[]) => void`, `placeholder?`
  - 回车或逗号触发添加；每个 tag 有 × 按钮删除

- [ ] **G0d**. 创建 `components/admin/repeater-field.tsx`：可重复行编辑器
  - 用于 verification_questions：`value: {question:string, type:string}[]`, `onChange`
  - 每行：文本 input（题目）+ Select（类型：input/select）+ 删除行按钮
  - 底部"添加一行"按钮

- [ ] **G0e**. 创建 `components/admin/kv-editor.tsx`：Key-Value 对编辑器
  - 用于 score_config.max_count：`value: Record<string,number>`, `onChange`
  - 每行：key input + value number input + 删除按钮；底部"添加"按钮

- [ ] **G0f**. 创建 `components/admin/searchable-select.tsx`：带搜索 Combobox
  - 基于 shadcn Popover + Command + CommandInput 实现
  - Props: `options: {value:string, label:string}[]`, `value`, `onChange`, `placeholder?`

### G1: 管理后台布局

- [ ] **G1**. `app/admin/layout.tsx`：完善 Tab 导航
  - Tab 顺序（共 6 个）：投票会话 / 学校管理 / 奖项管理 / 投票数据 / 用户管理 / 数据导出
  - 使用 shadcn Tabs 组件；Tab 切换通过 URL pathname 联动（`href="/admin/session"` 等）
  - 保护：layout 顶部调用 `api.auth.me()`，role 非 admin → redirect `/auth/login`

### G2: 投票会话管理页

- [ ] **G2**. `app/admin/session/page.tsx`（DataTable + 增删改）
  - URL 状态：`?page=1&page_size=20&q=`
  - 列：年份 / 名称 / 状态（Badge）/ 创建时间 / 操作（编辑/删除）
  - "新建会话"按钮 → Dialog，表单字段：year（number input）、name（text）、status（Select：pending/active/counting/published）
  - 编辑：同结构 Dialog，预填数据
  - 删除：AlertDialog 二次确认，有票则显示 409 错误提示（不可删除）
  - 状态列 Badge 颜色：pending=gray, active=green, counting=yellow, published=blue

### G3: 学校管理页

- [ ] **G3**. `app/admin/schools/page.tsx`（DataTable + 编辑/停用）
  - URL 状态：`?page=1&page_size=20&q=`
  - 列：名称 / 编码 / 邮箱后缀数量 / 状态（is_active）/ 操作（编辑/停用）
  - 编辑 Dialog 字段：
    - name（text，school_admin 禁用）
    - code（text，school_admin 禁用）
    - email_suffixes（TagInput 组件）
    - verification_questions（RepeaterField 组件）
    - is_active（Switch，school_admin 禁用）
  - "停用"按钮（super_admin）：AlertDialog 确认后调用 DELETE（软删除）
  - 仅 super_admin 可见"新建学校"按钮（调用现有 `POST /api/v1/admin/schools`）

### G4: 奖项管理页

- [ ] **G4**. `app/admin/awards/page.tsx`（Session 选择器 + DataTable + Sheet Nominee 管理）
  - 页面顶部：Session 选择器（SearchableSelect，显示 `{year} - {name}`，URL 参数 `?session_id=`）
  - Award 列：名称 / 分类 Badge / 提名数量 / 排序 / 操作（编辑/删除/管理提名）
  - 新建/编辑 Award Dialog 字段：
    - session（SearchableSelect，super_admin 可见；school_admin 禁用）
    - name（text）
    - category（Select：mandatory/optional/entertainment；school_admin 固定为 entertainment）
    - score_config.allowed_scores（数字 TagInput）
    - score_config.max_count（KVEditor）
    - display_order（number input）
  - "管理提名"按钮 → shadcn Sheet（右侧）：
    - Sheet 标题：`{Award name} - 提名管理`
    - Sheet 内：Nominee DataTable（名称/排序/封面key/操作）
    - 新建/编辑 Nominee 在 Sheet 内用 Dialog（名称 text + display_order number + cover_image_key text + description textarea）
    - 删除 Nominee：AlertDialog 确认，有票则显示 409 提示

### G5: 投票数据管理页

- [ ] **G5**. `app/admin/votes/page.tsx`（Session 选择器 + DataTable + 删除）
  - 页面顶部：Session 选择器（与 G4 相同逻辑）
  - 列：用户昵称 / 学校 / 奖项 / 提名 / 分数 / IP / 更新时间 / 操作
  - 操作列：仅 super_admin 显示"删除"按钮，AlertDialog 确认后调用 `DELETE /api/v1/admin/vote-items/:id`
  - school_admin 可见但无删除按钮

### G6: 用户管理页

- [ ] **G6**. `app/admin/users/page.tsx`（DataTable + 修改角色）
  - URL 状态：`?page=1&page_size=20&q=`
  - 列：昵称 / 邮箱 / 角色 Badge / 学校名 / 类型（Guest/正式）/ 注册时间 / 操作（修改角色）
  - 修改角色 Dialog：SearchableSelect（voter/school_admin/super_admin），提交调用 `PATCH /api/v1/admin/users/:id/role`
  - 仅 super_admin 可访问此页（layout 层已保护；school_admin 看到 Tab 但点击返回 403 提示）

### G7: 数据导出页

- [ ] **G7**. `app/admin/export/page.tsx`：保持现有功能（CSV 下载），确保与新 Tab 结构集成
  - 若已有 export 页：检查路由和 Tab 链接是否正确，无需大改

---

## 实施顺序

```
A1 → A2 → A3+A4（并行）
↓
B0（工具函数）→ B1~B6（可并行）→ B7+B8
↓              ↓
C1~C6        D1~D5
（前端 auth） （路由重构）
↓
E1 → E2 → E3（封面图，后端先于前端）
↓
F1（Verify 引导，独立，任意时间）
↓
G0（基础组件）→ G1 → G2~G7（可并行）
```

**依赖说明**:
- G（Admin UI）依赖 B（后端 API 就绪）
- E1（后端封面 URL）依赖 B0c（`buildCoverURL` 工具函数）
- C1（401 拦截）依赖无，可最先实施
- F1 独立，任意时间插入

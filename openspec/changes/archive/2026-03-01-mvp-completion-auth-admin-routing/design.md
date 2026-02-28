## Context

本变更为 MVP 完整性补全，将系统从"能跑但无法使用"推向"可测试、可演示"状态。技术约束与现有架构一致（Go + Echo + Ent / Next.js 15 + Bun + shadcn/ui）。

## Goals / Non-Goals

**Goals:**
- 记录本次变更的所有技术选择与约束，消除实施中的决策点
- 确保 PBT 不变量可作为测试依据
- 为实施者提供零歧义的规范

**Non-Goals:**
- JWT Refresh Token 端点（后续独立变更）
- 密码重置、审计日志
- 结果页完整实现（仅骨架）
- 图片上传功能（cover_image_key 字段保留，上传界面留待后续）

---

## Decisions

### D1: DB 自动迁移（无条件执行）
**选择**: `client.Schema.Create(ctx)` 在每次 `cmd/server/main.go` 启动时无条件执行
**理由**: Ent 的 `Schema.Create` 使用 CREATE TABLE IF NOT EXISTS 语义，幂等且只增不删，自然支持 Schema 字段新增升级
**约束**: 不使用 `--drop-column` / `--drop-index` 选项；复杂迁移（删字段/改类型）仍走 `cmd/migrate`

### D2: super_admin 自举（固定身份 + 随机密码）
**选择**: 启动时检测 `role=super_admin` 用户是否存在，不存在则创建
**精确参数**:
- email = `admin@bta.local`（硬编码）
- nickname = `super_admin`（硬编码）
- password = `crypto/rand` 生成 32 字符 `[a-zA-Z0-9]` 随机字符串
- 输出: `log.Printf("[INIT] super_admin created: email=admin@bta.local password=%s", pwd)`
- 若已存在: 静默跳过，不更新密码
- 并发保护: 若 `db.User.Create()` 返回 unique violation 错误，视为"已存在"，静默跳过

### D3: 测试数据 Seed（独立脚本）
**选择**: `cmd/seed/main.go` 独立可执行脚本，通过 Taskfile `task seed` 运行，不嵌入 server 启动流程
**理由**: Seed 逻辑与 server 解耦，逻辑可随需求复杂化而增长；物理隔离防止生产误执行；Taskfile 已有基础设施，加 `task seed` 自然
**幂等性**: 脚本启动时检查 School 表记录数，若 > 0 则打印提示并退出，不执行任何写操作
**全量数据**（精确规格）:
- School ×2:
  - `{name:"示例大学A", code:"univ-a", email_suffixes:["@univ-a.edu"], verification_questions:[{"question":"你的学号前四位？","type":"input"}], is_active:true}`
  - `{name:"示例大学B", code:"univ-b", email_suffixes:["@univ-b.edu"], verification_questions:[{"question":"你的入学年份？","type":"input"}], is_active:true}`
- VotingSession ×1: `{year:2025, name:"第一届大二杯", status:"active"}`
- Award ×3（关联 session）:
  - `{name:"最佳剧情奖", category:"mandatory", score_config:{allowed_scores:[0,1], max_count:{"1":3}}, display_order:1}`（不关联 school）
  - `{name:"最具潜力奖", category:"optional", score_config:{allowed_scores:[0,1], max_count:{"1":2}}, display_order:2}`（不关联 school）
  - `{name:"示例大学A娱乐奖", category:"entertainment", score_config:{allowed_scores:[0,1], max_count:{"1":1}}, display_order:3}`（关联 school A）
- 每个 Award ×3 Nominee: `{name:"提名 {Award名} {A/B/C}", cover_image_key:"", display_order:1/2/3}`
- User ×3:
  - `{nickname:"test_voter", email:"voter@univ-a.edu", role:"voter", is_guest:false, school:A, password: bcrypt("password123")}`
  - `{nickname:"test_school_admin", email:"schooladmin@univ-a.edu", role:"school_admin", is_guest:false, school:A, password: bcrypt("password123")}`
  - （super_admin 由 server 启动时自举，不在 seed 中创建）

### D4: 分页规范（offset/limit，服务端分页）
**精确参数**:
- 请求: `?page=1&page_size=20`（page 从 1 开始）
- 默认: page=1, page_size=20
- 最大: page_size=100；超出返回 HTTP 400 `{"error": "page_size must be <= 100"}`
- 响应格式（固定）:
  ```json
  {"data": [...], "total": 42, "page": 1, "page_size": 20}
  ```
- 排序: 所有列表默认 `ORDER BY created_at DESC`（确定性排序，避免翻页重复/丢失）

### D5: RBAC 精确边界
**super_admin**（role="super_admin"）: 访问所有 admin 端点，无学校限制

**school_admin**（role="school_admin"，JWT Claims 含 school_id）:
| 端点 | 权限 | 约束 |
|------|------|------|
| `GET /api/v1/admin/schools` | ❌ 403 | — |
| `PUT /api/v1/admin/schools/:id` | ✅ 仅本校 | 只可改 `verification_questions`、`email_suffixes`；不可改 `name`/`code`/`is_active`；id ≠ claims.school_id 则 403 |
| `DELETE /api/v1/admin/schools/:id` | ❌ 403 | — |
| `GET /api/v1/admin/sessions*` | ❌ 403 | — |
| `POST/PUT/DELETE /api/v1/admin/sessions*` | ❌ 403 | — |
| `GET /api/v1/admin/awards` | ✅ 仅本校娱乐奖 | WHERE school_id=claims.school_id AND category="entertainment" |
| `POST /api/v1/admin/awards` | ✅ 仅娱乐奖 | 强制 category="entertainment"，school_id=claims.school_id |
| `PUT /api/v1/admin/awards/:id` | ✅ 仅本校娱乐奖 | 校验 award.school_id=claims.school_id，否则 403 |
| `DELETE /api/v1/admin/awards/:id` | ✅ 仅本校娱乐奖 | 同上 |
| `GET /api/v1/admin/nominees` | ✅ 仅本校娱乐奖的提名 | 通过 award 关联校验 |
| `POST/PUT/DELETE /api/v1/admin/nominees*` | ✅ 仅本校娱乐奖 | 同上 |
| `GET /api/v1/admin/vote-items` | ✅ 仅本校 | WHERE school_id=claims.school_id（via vote_item→school edge） |
| `DELETE /api/v1/admin/vote-items/:id` | ❌ 403 | 仅 super_admin 可删除 |
| `GET /api/v1/admin/users` | ❌ 403 | — |
| `PATCH /api/v1/admin/users/:id/role` | ❌ 403 | — |
| `GET /api/v1/admin/export` (CSV) | ✅ 仅本校 | WHERE school_id=claims.school_id（现有逻辑，保持不变） |

### D6: Session 状态（无限制切换）
**选择**: super_admin 可将 VotingSession 设为任意合法状态（pending/active/counting/published），无转移顺序限制
**约束**: 合法值固定为四个枚举，非法值返回 400；仅 super_admin 可修改（school_admin 403）

### D7: 删除语义（per entity）
| 实体 | 删除策略 | 有关联数据时 |
|------|---------|------------|
| School | 软删除：`is_active=false` | 不影响已关联 User/Award/VoteItem |
| Award | 硬删除：DELETE | 级联删除关联 Nominee（通过 Ent cascade） |
| Nominee | 硬删除：DELETE | 若有关联 VoteItem → 返回 HTTP 409 `{"error": "nominee has existing votes"}` |
| VotingSession | 硬删除：DELETE | 若有关联 VoteItem → 返回 HTTP 409 `{"error": "session has existing votes"}` |
| VoteItem | 硬删除：DELETE（super_admin only） | 无限制 |
| User | 不支持删除，仅 PATCH role | — |

### D8: cover_image 存储与访问
**选择**: 本地文件系统 + Echo Static 中间件（当前 MVP；未来可替换为对象存储）
**精确实现**:
- 上传目录: 由 `UPLOAD_DIR` 环境变量配置，默认值 `./uploads`（相对 server 工作目录）
- Echo 路由: `e.Static("/static", cfg.UploadDir)` 在鉴权路由之前注册（公开访问，无需 JWT）
- URL 构造: `cover_image_url = cfg.BackendBaseURL + "/static/" + cover_image_key`
  - `BACKEND_BASE_URL` = 新增环境变量（如 `http://localhost:8080`）
  - 若 `cover_image_key == ""` 或为 null → 响应中 `cover_image_url` 为 `null`
- 安全: 构造 URL 前用 `filepath.Clean(key)` 规范化，若结果含 `..` 字符则返回 HTTP 400

### D9: 前端 401 拦截器
**选择**: 在 `frontend/lib/api.ts` 的统一 fetch wrapper 中拦截 401 响应
**精确行为**:
1. 检测 HTTP 401 响应（任意端点）
2. `localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token')`
3. `router.push('/auth/login?next=' + encodeURIComponent(window.location.pathname + window.location.search))`
4. throw 以终止当前请求链，避免调用方继续处理空数据

### D10: [year] URL 参数验证
**选择**: `/session/[year]/vote/page.tsx` 客户端 `useEffect` 中验证
**精确行为**:
- `parseInt(year)` 若 NaN → 调用 `/api/v1/sessions/current`，`router.replace('/session/{year}/vote')`
- 若整数但 API 无对应 session → 同上重定向到 current session
- 若 `/api/v1/sessions/current` 也失败（无 active session）→ 显示静态提示"暂无进行中的投票"，不跳转

### D11: useVoteStore 与 [year] 同步
**精确行为**（在 `/session/[year]/vote/page.tsx` 的 `useEffect([year])` 中执行）:
1. 若 `store.session?.year !== parseInt(year)` → 先调用 `store.reset()` 清空
2. 调用 `GET /api/v1/sessions/current`（或带 year 参数的查询）获取 session 数据
3. 将 session 写入 store（调用现有 store 接口，不新增 setter）

### D12: 顶栏管理员入口
**触发条件**: `GET /api/v1/auth/me` 返回的 role ∈ {school_admin, super_admin}
**实现**: `app/layout.tsx` 引入客户端子组件 `<AdminNavLink />`，该组件内部调用 me 接口；外层用 `<Suspense>` 包裹防止 hydration 阻塞
**链接文字**: "管理后台"，指向 `/admin/session`

### D13: Admin Panel 总体布局约束
**Tab 顺序**: 投票会话 / 学校管理 / 奖项管理 / 投票数据 / 用户管理 / 数据导出
**Session 作用域**: 奖项管理、投票数据 Tab 顶部均有 Session 选择器（Combobox，显示 `{year} - {name}`，默认选中最近 active session），切换后表格重载
**DataTable URL 状态**: page、page_size、q 写入 URL searchParams（`useSearchParams` + `router.replace`），支持链接分享和浏览器前进后退

### D14: JSON 字段可视化编辑器
管理面板中禁止直接编辑 JSON 字符串，所有结构化字段使用以下组件：

| 字段 | 组件 |
|------|------|
| `school.email_suffixes` (string[]) | Tag Input：文本框输入 + Enter/逗号 添加，每个 Tag 有 × 删除按钮 |
| `school.verification_questions` ([{question, type}]) | 可重复行编辑器：每行含"题目"文本框 + "类型"Select（input/select），可添加/删除行 |
| `award.score_config.allowed_scores` (number[]) | 数字 Tag Input |
| `award.score_config.max_count` ({[key]:number}) | Key-Value 对编辑器：key 列（文字）+ value 列（数字输入），可添加/删除行 |

### D15: 关联关系选择器
所有外键引用字段使用 shadcn Command（Popover + CommandInput）实现带搜索的 Combobox，显示名称而非 ID：

| 场景 | 展示内容 | 搜索字段 |
|------|---------|---------|
| Award 表单：所属 Session | `{year} - {name}` | name |
| Nominee 管理：所属 Award | Award name | name |
| User 列表：学校列 | school name | name |
| Vote Items：学校/奖项/提名列 | 对应名称（只读展示） | — |

### D16: Award + Nominee 层级交互
**Award 页面**: TanStack Table 展示当前 Session 的所有 Awards，每行操作列含"管理提名"按钮
**Nominee 管理**: 点击"管理提名" → 打开 shadcn Sheet（右侧滑入），Sheet 内含该 Award 的 Nominee 子表格（增删改），Sheet 标题显示 `{Award name} - 提名管理`
**理由**: Award 表格保持简洁；Nominee 在明确 Award 上下文中编辑，不易出错

### D17: 注册引导文字（精确约束）
**位置**: `Verify.tsx` 提交按钮的紧上方，同容器内
**精确 JSX**:
```tsx
<p className="text-xs text-muted-foreground text-center mt-2">
  你也可以选择
  <br />
  <Link href="/auth/register" className="underline">
    注册正式用户，保留历年记录
  </Link>
</p>
```

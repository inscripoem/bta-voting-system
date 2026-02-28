# Requirements + PBT Properties
# Change: mvp-completion-auth-admin-routing

---

## 模块 A: 数据库自初始化

### Requirement: Schema 自动迁移
系统 SHALL 在每次 server 启动时调用 `client.Schema.Create(ctx)` 自动迁移数据库 Schema。

#### Scenario: 首次启动（空数据库）
- **WHEN** server 启动，数据库中不存在任何表
- **THEN** Ent 创建所有表，server 继续正常启动

#### Scenario: 升级启动（已有数据）
- **WHEN** server 启动，数据库已存在旧版 Schema
- **THEN** Ent 增量添加新字段/表，不删除已有数据，server 正常启动

#### PBT: 幂等性
- **INVARIANT**: 任意次数连续调用 `Schema.Create()` 后，数据库状态与调用一次相同
- **FALSIFICATION**: 调用 N 次后检查表结构，断言与调用 1 次后结果一致；向已存在表重复创建不应报错

---

### Requirement: super_admin 自举
系统 SHALL 在 server 启动时检测 super_admin 是否存在，不存在则自动创建并通过日志输出凭据。

#### Scenario: 首次启动（无 super_admin）
- **WHEN** 数据库中不存在 role=super_admin 的用户
- **THEN** 创建 email=admin@bta.local、nickname=super_admin 的用户，密码随机生成（32字符），通过 `log.Printf` 输出；server 正常继续启动

#### Scenario: 非首次启动（super_admin 已存在）
- **WHEN** 数据库中已存在 role=super_admin 的用户
- **THEN** 静默跳过，不修改现有 super_admin 的密码或任何字段

#### Scenario: 并发启动竞态
- **WHEN** 多个 server 实例同时启动，均尝试创建 super_admin
- **THEN** 仅一个成功创建，其余因 unique violation 静默跳过；系统中 super_admin 恰好存在一条

#### PBT: 唯一性
- **INVARIANT**: 无论启动多少次，数据库中 role=super_admin 的用户数量 ≤ 1
- **FALSIFICATION**: 并发模拟 N 次启动逻辑后，COUNT(role=super_admin) 应等于 1

---

### Requirement: 全量测试数据 Seed（独立脚本）
系统 SHALL 提供独立的 `cmd/seed/main.go` 脚本，用于一次性插入全量开发测试数据。

#### Scenario: 空数据库执行 seed
- **WHEN** School 表无记录，执行 `task seed`
- **THEN** 插入 2 所学校、1 个投票会话、3 个奖项（各 3 个提名）、2 个测试用户（voter + school_admin），脚本正常退出

#### Scenario: 非空数据库执行 seed
- **WHEN** School 表已有记录，执行 `task seed`
- **THEN** 打印提示"数据库已有数据，跳过 seed"，不执行任何写操作，脚本正常退出

#### PBT: 幂等性
- **INVARIANT**: 空库执行 seed 1 次后，再次执行 seed 不新增任何记录
- **FALSIFICATION**: 执行 seed 两次后，所有表的记录总数与执行 1 次相同

---

## 模块 B: 后端 Admin CRUD

### Requirement: 统一分页
所有 admin 列表端点 SHALL 支持 `?page=&page_size=` 参数，并在响应中返回 total。

#### Scenario: 合法分页参数
- **WHEN** 请求携带 `?page=2&page_size=10`
- **THEN** 返回 `{data: [...第11-20条...], total: N, page: 2, page_size: 10}`

#### Scenario: page_size 超出最大值
- **WHEN** 请求携带 `?page_size=101`
- **THEN** 返回 HTTP 400 `{"error": "page_size must be <= 100"}`

#### PBT: 分页完整性
- **INVARIANT**: 对大小为 N 的数据集按 page_size=P 分页，所有页合并后恰好包含 N 条记录，无重复无丢失
- **FALSIFICATION**: 创建 N 条记录，逐页拉取，收集所有 ID，断言 len(all_ids)==N 且 all unique

#### PBT: 排序确定性
- **INVARIANT**: 相同数据集相同参数的请求，返回顺序恒定（ORDER BY created_at DESC）
- **FALSIFICATION**: 多次请求同一页，断言返回 ID 列表完全相同

---

### Requirement: RBAC 访问控制
所有 `/api/v1/admin/*` 端点 SHALL 根据 JWT claims 中的 role 强制执行 D5 中定义的权限边界。

#### Scenario: school_admin 访问本校娱乐奖
- **WHEN** role=school_admin 调用 `GET /api/v1/admin/awards`
- **THEN** 仅返回该 school 的 category=entertainment 的 awards，不包含其他学校或其他 category

#### Scenario: school_admin 越权访问 sessions
- **WHEN** role=school_admin 调用 `GET /api/v1/admin/sessions`
- **THEN** 返回 HTTP 403

#### Scenario: school_admin 修改他校学校信息
- **WHEN** role=school_admin 调用 `PUT /api/v1/admin/schools/{other_school_id}`
- **THEN** 返回 HTTP 403

#### Scenario: school_admin 修改本校学校名
- **WHEN** role=school_admin 调用 `PUT /api/v1/admin/schools/{own_school_id}`，body 包含 `name` 字段
- **THEN** 返回 HTTP 403（name 字段不允许 school_admin 修改）

#### PBT: 数据隔离
- **INVARIANT**: ∀ school_admin 的任意列表请求，响应数据中不含属于其他学校的记录
- **FALSIFICATION**: 创建 School A 和 School B 的数据，以 School A 的 school_admin token 请求所有列表端点，断言响应中无 school_id=B 的记录

---

### Requirement: vote-items 管理
系统 SHALL 提供 `GET /api/v1/admin/vote-items` 分页列表及 `DELETE /api/v1/admin/vote-items/:id`（super_admin only）。

#### Scenario: super_admin 删除 vote item
- **WHEN** super_admin 调用 `DELETE /api/v1/admin/vote-items/:id`，id 有效
- **THEN** 该 vote item 从数据库中删除，返回 HTTP 204

#### Scenario: school_admin 尝试删除 vote item
- **WHEN** school_admin 调用 `DELETE /api/v1/admin/vote-items/:id`
- **THEN** 返回 HTTP 403

#### Scenario: school_admin 查看本校 vote items
- **WHEN** school_admin 调用 `GET /api/v1/admin/vote-items`
- **THEN** 仅返回 school_id=claims.school_id 的 vote items

---

### Requirement: 软删除（School）
`DELETE /api/v1/admin/schools/:id` SHALL 将 school 的 `is_active` 设为 false，而非物理删除。

#### Scenario: 软删除学校
- **WHEN** super_admin 调用 `DELETE /api/v1/admin/schools/:id`
- **THEN** school.is_active=false；`GET /api/v1/schools`（前台）不再返回该学校；school 记录仍存在于 DB

#### PBT: 软删除不影响关联数据
- **INVARIANT**: 软删除 school 后，该 school 关联的 User/VoteItem 记录仍可查询
- **FALSIFICATION**: 软删除 school，查询其关联 users 和 vote_items，断言记录存在且完整

---

### Requirement: 有票保护删除（Nominee / Session）
当 Nominee 或 VotingSession 存在关联 VoteItem 时，DELETE 请求 SHALL 返回 HTTP 409。

#### Scenario: 删除有投票记录的 Nominee
- **WHEN** 该 Nominee 存在至少一条 VoteItem，super_admin 调用 DELETE
- **THEN** 返回 HTTP 409 `{"error": "nominee has existing votes"}`，Nominee 不被删除

#### PBT: 有票保护
- **INVARIANT**: 有关联 VoteItem 的 Nominee/Session 不可被删除（返回非 2xx）
- **FALSIFICATION**: 创建 vote item，尝试删除其关联的 nominee/session，断言返回 409

---

### Requirement: cover_image_url 安全构造
后端 SHALL 在返回包含 `cover_image_key` 的 nominee 响应时，附加构造好的 `cover_image_url`，并防止路径遍历。

#### Scenario: 正常 key
- **WHEN** nominee.cover_image_key="2025/uuid-image.jpg"
- **THEN** 响应中 cover_image_url="http://localhost:8080/static/2025/uuid-image.jpg"

#### Scenario: 空 key
- **WHEN** nominee.cover_image_key="" 或 null
- **THEN** 响应中 cover_image_url=null

#### Scenario: 含路径遍历的 key
- **WHEN** nominee.cover_image_key="../../etc/passwd"
- **THEN** 返回 HTTP 400（该 nominee 的 key 应在写入时被拒绝，或读取时构造 URL 前校验）

#### PBT: URL 确定性
- **INVARIANT**: 同一 cover_image_key 每次请求返回相同的 cover_image_url
- **FALSIFICATION**: 多次请求同一 nominee，断言 cover_image_url 字段完全相同

---

## 模块 C: 登录注册页面

### Requirement: 密码登录页面
系统 SHALL 提供 `/auth/login` 页面，支持 email+密码登录，成功后重定向。

#### Scenario: 正确凭据登录
- **WHEN** 用户提交有效 email 和密码
- **THEN** 调用 `POST /api/v1/auth/login`，将 access_token 和 refresh_token 写入 localStorage，重定向到 `?next=` 参数指定路径或默认 `/`

#### Scenario: 错误凭据
- **WHEN** 用户提交错误密码
- **THEN** 显示错误提示，不清除已有 token，不跳转

#### PBT: redirect 正确性
- **INVARIANT**: 带 `?next=/some/path` 的登录成功后，location 恰好跳转到 `/some/path`
- **FALSIFICATION**: mock 登录成功，断言 router.push 调用参数等于 next 值

---

### Requirement: 401 自动拦截
前端 api 层 SHALL 在收到任意 401 响应时，清除 token 并重定向到登录页（携带当前路径作为 next 参数）。

#### Scenario: API 返回 401
- **WHEN** 任意 fetch 请求收到 HTTP 401
- **THEN** localStorage 中 access_token 和 refresh_token 均被删除；页面跳转到 `/auth/login?next=<当前路径>`

#### PBT: Token 清除完整性
- **INVARIANT**: 401 响应后，localStorage 不含 access_token 和 refresh_token
- **FALSIFICATION**: 模拟 401 → 检查 localStorage → 断言两个 key 均不存在

---

## 模块 D: 路由重构

### Requirement: Session 化投票路由
系统 SHALL 提供 `/session/[year]/vote` 路由，并将旧 `/vote` 重定向到当前 session 年份。

#### Scenario: 访问有效年份
- **WHEN** 访问 `/session/2025/vote`，且数据库存在 year=2025 的 session
- **THEN** 正常展示投票流程，useVoteStore 中 session.year=2025

#### Scenario: 访问无效年份
- **WHEN** 访问 `/session/1900/vote`（无对应 session）
- **THEN** 自动重定向到 `/session/{current_year}/vote`

#### Scenario: 访问旧路由 /vote
- **WHEN** 用户访问 `/vote`
- **THEN** 获取 current session year，重定向到 `/session/{year}/vote`，URL 更新

#### PBT: 跨 Session 状态隔离
- **INVARIANT**: 从 /session/2024/vote 导航到 /session/2025/vote 后，store.session.year === 2025
- **FALSIFICATION**: 模拟 year 切换，断言 store 中不含 2024 的 session 数据

---

## 模块 E: 投票页提名封面

### Requirement: Nominee 封面图展示
AwardCard.tsx SHALL 为每个提名展示封面图；无图时显示 SVG 占位符。

#### Scenario: 有封面图的提名
- **WHEN** nominee.cover_image_url 不为 null
- **THEN** 渲染 `<img src={cover_image_url}>` 缩略图

#### Scenario: 无封面图的提名
- **WHEN** nominee.cover_image_url 为 null
- **THEN** 渲染 SVG 占位符（不报错，不显示破图）

---

## 模块 G: 管理后台 UI

### Requirement: Session 作用域选择器
奖项管理和投票数据 Tab SHALL 在页面顶部提供 Session 选择器，切换后表格内容随之更新。

#### Scenario: 切换 Session
- **WHEN** 用户在 Session 选择器中选择另一个 Session
- **THEN** 表格重新加载，仅展示所选 Session 下的数据；URL 中 session_id 参数同步更新

---

### Requirement: JSON 字段可视化编辑
所有结构化 JSON 字段（email_suffixes / verification_questions / score_config）SHALL 通过专用 UI 组件编辑，禁止原始 JSON 文本框。

#### Scenario: 添加邮箱后缀
- **WHEN** 学校编辑表单中，用户在 Tag Input 输入 "@new.edu" 并按 Enter
- **THEN** 该后缀出现为一个 Tag，提交后 school.email_suffixes 包含该值

#### Scenario: 删除验证问题行
- **WHEN** 用户点击某个验证问题行的删除按钮
- **THEN** 该行从编辑器中移除，提交后 school.verification_questions 不含该题

---

### Requirement: Award/Nominee Sheet 层级交互
Award 列表 SHALL 提供"管理提名"入口，通过 Sheet 在同页上下文内编辑指定 Award 的 Nominees。

#### Scenario: 打开 Nominee Sheet
- **WHEN** 用户点击某 Award 行的"管理提名"按钮
- **THEN** 右侧 Sheet 滑入，标题显示该 Award 名称，内容为该 Award 的 Nominee 列表（含增删改）

#### Scenario: 创建新 Nominee
- **WHEN** 用户在 Sheet 内点击"新增提名"，填写名称并提交
- **THEN** 调用 `POST /api/v1/admin/nominees`，新 Nominee 出现在 Sheet 列表中，Sheet 保持打开

---

### Requirement: 投票数据管理页
管理后台 SHALL 提供投票数据 Tab，展示 vote items 列表，super_admin 可删除单条。

#### Scenario: 查看投票数据
- **WHEN** 管理员（任意 admin 角色）进入投票数据 Tab，选择一个 Session
- **THEN** 展示该 Session 下的 vote items（用户昵称/学校/奖项/提名/分数），支持分页

#### Scenario: super_admin 删除 vote item
- **WHEN** super_admin 点击某条 vote item 的删除按钮，确认后
- **THEN** 该条记录从列表消失，后端调用 `DELETE /api/v1/admin/vote-items/:id` 成功

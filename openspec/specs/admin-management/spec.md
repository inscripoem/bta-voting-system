## ADDED Requirements

### Requirement: VotingSession 状态机
系统 SHALL 维护 VotingSession 的四态状态机：`pending → active → counting → published`，状态转换由 `super_admin` 手动触发，无自动定时切换。

#### Scenario: super_admin 推进状态
- **WHEN** `super_admin` 调用 `PATCH /api/v1/admin/sessions/current/status`，提交合法的下一状态
- **THEN** 系统更新 `VotingSession.status`，返回 HTTP 200

#### Scenario: 非法状态跳转
- **WHEN** 请求的新状态不是当前状态的合法后继（如从 `pending` 直接跳 `published`）
- **THEN** 系统返回 HTTP 422，拒绝更新

#### Scenario: school_admin 尝试修改状态
- **WHEN** `role=school_admin` 的用户调用状态修改端点
- **THEN** 系统返回 HTTP 403

### Requirement: 学校管理权限分层
系统 SHALL 按角色区分学校数据的读写权限：`super_admin` 拥有全量 CRUD，`school_admin` 仅可修改本校的 `email_suffixes` 和 `verification_questions`。

#### Scenario: super_admin 创建新学校
- **WHEN** `super_admin` 调用 `POST /api/v1/admin/schools`，提交合法学校数据
- **THEN** 系统创建新 School 记录，返回 HTTP 201

#### Scenario: school_admin 修改本校验证配置
- **WHEN** `school_admin` 调用 `PUT /api/v1/admin/schools/:id`，仅含 `email_suffixes` 或 `verification_questions` 字段
- **THEN** 系统更新对应字段，忽略其他字段（name/code/is_active 字段在 body 中无效）

#### Scenario: school_admin 尝试修改他校数据
- **WHEN** `school_admin` 调用 `PUT /api/v1/admin/schools/:id`，`:id` 不属于其 `school_id`
- **THEN** 系统返回 HTTP 403

#### Scenario: super_admin 停用学校
- **WHEN** `super_admin` 调用 `DELETE /api/v1/admin/schools/:id`
- **THEN** 系统执行软删除：设置 `is_active=false`，返回 HTTP 204（不硬删除记录）

### Requirement: 奖项与提名管理
系统 SHALL 支持 `super_admin` 管理全局奖项（`mandatory`/`optional`），`school_admin` 仅可管理本校的 `entertainment` 奖项。两者均通过 `POST /api/v1/admin/awards` 创建，系统依据角色自动设置 category 和 school_id。

#### Scenario: super_admin 创建全局奖项
- **WHEN** `super_admin` 调用 `POST /api/v1/admin/awards`，`category` 为 `mandatory` 或 `optional`
- **THEN** 系统创建奖项，`school_id` 为 null，返回 HTTP 201

#### Scenario: school_admin 创建娱乐奖项
- **WHEN** `school_admin` 调用 `POST /api/v1/admin/awards`（body 中 category 无论填写何值）
- **THEN** 系统强制设 `category=entertainment`，`school_id=claims.school_id`，返回 HTTP 201

#### Scenario: school_admin 尝试操作他校奖项
- **WHEN** `school_admin` 调用 `PUT /api/v1/admin/awards/:id` 或 `DELETE /api/v1/admin/awards/:id`，对应奖项 `school_id` 不属于本校
- **THEN** 系统返回 HTTP 403

#### Scenario: 删除含提名的奖项
- **WHEN** 任何管理员删除一个奖项
- **THEN** 系统级联删除其所有 Nominee（Ent 级联）；Nominee 下若有关联 VoteItem，须先通过 Nominee 删除接口报 409

### Requirement: 提名管理
系统 SHALL 支持管理员通过 `?award_id=` 参数过滤提名列表，提名删除前须检查是否存在关联 VoteItem。

#### Scenario: 删除有票提名
- **WHEN** 管理员调用 `DELETE /api/v1/admin/nominees/:id`，该提名存在关联 VoteItem
- **THEN** 系统返回 HTTP 409，`{"error":"nominee has existing votes"}`，不执行删除

#### Scenario: school_admin 访问他校奖项下的提名
- **WHEN** `school_admin` 调用 `GET /api/v1/admin/nominees?award_id=x`，对应 award `school_id` 不属于本校
- **THEN** 系统返回 HTTP 403

### Requirement: VotingSession CRUD
系统 SHALL 支持 `super_admin` 对 VotingSession 进行完整 CRUD。

#### Scenario: 删除有票的 Session
- **WHEN** `super_admin` 调用 `DELETE /api/v1/admin/sessions/:id`，该 Session 下存在 VoteItem
- **THEN** 系统返回 HTTP 409，`{"error":"session has existing votes"}`，不执行删除

### Requirement: Admin API 分页公约
所有 Admin 列表端点 SHALL 遵循统一分页公约，支持服务端分页，不返回全量数据。

- 查询参数：`?page=1&page_size=20`（默认 page=1, page_size=20）
- page_size 最大值为 100；超出返回 HTTP 400 `{"error":"page_size must be <= 100"}`
- 响应格式统一为 `{"data":[...],"total":<int>,"page":<int>,"page_size":<int>}`
- 所有列表端点支持 `?q=` 按名称模糊搜索（`ILIKE %q%`）

### Requirement: 提名封面图 URL 构造
系统 SHALL 通过 `cover_image_key` 字段构造可访问的图片 URL，存储时仅保存 key，URL 在返回 API 响应时动态拼接。

- `cover_image_url = BACKEND_BASE_URL + "/static/" + cover_image_key`
- `cover_image_key` 为空字符串或 null → `cover_image_url` 返回 null
- `cover_image_key` 含 `..` 路径穿越字符 → `cover_image_url` 返回 null（同时 PUT nominee 接口返回 HTTP 400）
- 静态文件通过 `GET /static/<key>` 提供服务，无需认证

### Requirement: 数据库自动初始化
系统 SHALL 在 server 启动时自动执行数据库 schema 迁移，并在无 super_admin 账户时自动创建初始管理员。

#### Scenario: 首次启动
- **WHEN** server 启动，数据库中不存在 `role=super_admin` 的用户
- **THEN** 系统用 `crypto/rand` 生成 32 位随机密码（字母数字），bcrypt hash 后创建账户 `{email:"admin@bta.local", nickname:"super_admin", role:"super_admin", is_guest:false}`，并以 `log.Printf` 输出明文密码（不写入任何文件）

#### Scenario: 非首次启动
- **WHEN** server 启动，数据库中已存在 super_admin 用户
- **THEN** 跳过创建，无日志输出

### Requirement: score_config 格式验证
系统 SHALL 在创建/修改奖项时验证 `score_config` JSON 结构合法性：必须包含 `allowed_scores`（数组）和 `max_count`（对象，key 为 score 字符串）。

#### Scenario: 缺少 allowed_scores
- **WHEN** 创建奖项请求的 `score_config` 不含 `allowed_scores` 字段
- **THEN** 系统返回 HTTP 422

#### Scenario: max_count 引用不在 allowed_scores 中的 score
- **WHEN** `max_count` 的 key 对应的 score 不在 `allowed_scores` 中
- **THEN** 系统返回 HTTP 422

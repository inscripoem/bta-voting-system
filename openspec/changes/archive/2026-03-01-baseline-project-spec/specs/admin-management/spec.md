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
- **WHEN** `school_admin` 调用 `PATCH /api/v1/admin/schools/:id`，仅含 `email_suffixes` 或 `verification_questions` 字段
- **THEN** 系统更新对应字段，忽略其他字段

#### Scenario: school_admin 尝试修改他校数据
- **WHEN** `school_admin` 调用 `PATCH /api/v1/admin/schools/:id`，`:id` 不属于其 `school_id`
- **THEN** 系统返回 HTTP 403

### Requirement: 奖项与提名管理
系统 SHALL 支持 `super_admin` 管理全局奖项（`mandatory`/`optional`），`school_admin` 仅可管理本校的 `entertainment` 奖项。

#### Scenario: super_admin 创建全局奖项
- **WHEN** `super_admin` 调用 `POST /api/v1/admin/awards`，`category` 为 `mandatory` 或 `optional`
- **THEN** 系统创建奖项，`school_id` 为 null

#### Scenario: school_admin 创建娱乐奖项
- **WHEN** `school_admin` 调用 `POST /api/v1/admin/schools/:id/awards`
- **THEN** 系统创建 `category=entertainment` 的奖项，`school_id` 自动设为该校 id

#### Scenario: school_admin 尝试创建全局奖项
- **WHEN** `school_admin` 调用 `POST /api/v1/admin/awards`
- **THEN** 系统返回 HTTP 403

### Requirement: score_config 格式验证
系统 SHALL 在创建/修改奖项时验证 `score_config` JSON 结构合法性：必须包含 `allowed_scores`（数组）和 `max_count`（对象，key 为 score 字符串）。

#### Scenario: 缺少 allowed_scores
- **WHEN** 创建奖项请求的 `score_config` 不含 `allowed_scores` 字段
- **THEN** 系统返回 HTTP 422

#### Scenario: max_count 引用不在 allowed_scores 中的 score
- **WHEN** `max_count` 的 key 对应的 score 不在 `allowed_scores` 中
- **THEN** 系统返回 HTTP 422

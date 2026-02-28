## ADDED Requirements

### Requirement: Guest 升级为正式用户
系统 SHALL 支持 `is_guest=true` 的用户通过邮件验证流程升级为正式用户（`is_guest=false`），升级后须设置密码，历史所有 VoteItem 完整保留。

#### Scenario: 申请升级，发送验证邮件
- **WHEN** Guest 用户提交任意邮箱地址（无后缀限制）至 `POST /api/v1/auth/upgrade`
- **THEN** 系统向该邮箱发送含验证链接的邮件，链接有效期 24 小时

#### Scenario: 点击验证链接完成升级
- **WHEN** 用户点击邮件中的验证链接，`GET /api/v1/auth/verify-email` 收到有效 token
- **THEN** 系统将用户 `is_guest` 设为 `false`，`email` 更新为本次验证邮箱，要求用户设置密码

#### Scenario: 验证链接过期
- **WHEN** 用户点击超过 24 小时的验证链接
- **THEN** 系统返回 HTTP 410，提示链接已失效，引导重新申请

#### Scenario: 历史 VoteItem 保留
- **WHEN** Guest 用户完成升级
- **THEN** 该用户的所有历年 VoteItem 记录仍关联原 `user_id`，数据完整保留

### Requirement: 升级时邮箱选择
Path B 的 Guest（已有教育邮箱）在升级时 SHALL 可选择保留原教育邮箱或更换为新邮箱，两种情况均须重走完整邮件验证流程。

#### Scenario: Path B Guest 保留原教育邮箱升级
- **WHEN** Path B Guest 在升级时填写与原验证邮箱相同的地址
- **THEN** 系统向该邮箱重新发送验证邮件，走完整验证流程后完成升级

#### Scenario: Path B Guest 更换邮箱升级
- **WHEN** Path B Guest 在升级时填写不同于原验证邮箱的新地址
- **THEN** 系统向新邮箱发送验证邮件，验证通��后 `email` 更新为新地址

### Requirement: 密码设置
用户完成邮件验证后 SHALL 通过密码设置步骤才能完成升级，密码须经过安全哈希存储。

#### Scenario: 设置有效密码
- **WHEN** 用户提交符合强度要求的密码（最短 8 位）
- **THEN** 系统使用 bcrypt（或同等强度算法）对密码哈希后存储至 `password_hash` 字段

#### Scenario: 升级前 Guest 不可使用密码登录
- **WHEN** 尚未完成升级的 Guest 尝试通过 `POST /api/v1/auth/login` 登录
- **THEN** 系统返回 HTTP 401（password_hash 为空，登录不可用）

### Requirement: 学校绑定不可更改
用户的 `school_id` 在账户创建时绑定，系统 SHALL 拒绝任何更改 `school_id` 的请求，无论用户角色。

#### Scenario: 尝试修改 school_id
- **WHEN** 任意用户向 `PATCH /api/v1/me` 提交包含 `school_id` 字段的请求
- **THEN** 系统忽略该字段（或返回 HTTP 422），`school_id` 保持不变

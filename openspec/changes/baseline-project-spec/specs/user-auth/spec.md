## ADDED Requirements

### Requirement: Guest 账户创建
系统 SHALL 支持匿名用户通过学校验证（Path A 或 Path B）后自动创建 Guest 账户并颁发 JWT。
- 创建时须绑定 `school_id`，绑定后不可更改
- 昵称须全局唯一（跨所有学校）；若昵称已存在于其他学校，MUST 返回错误"昵称已被使用，请换一个"，不暴露冲突学校

#### Scenario: 新昵称通过验证，创建 Guest 账户
- **WHEN** 用户提交学校选择 + 昵称 + 验证信息，且昵称在系统中不存在
- **THEN** 系统创建 `is_guest=true` 的 User，绑定 `school_id`，返回 JWT（access + refresh token）

#### Scenario: 昵称与其他学校用户冲突
- **WHEN** 用户提交的昵称已被另一所学校的用户使用
- **THEN** 系统返回 HTTP 409，错误信息为"昵称已被使用，请换一个"，不包含冲突用户所属学校信息

#### Scenario: 昵称与同校用户冲突
- **WHEN** 用户提交的昵称已被同一学校的用户使用
- **THEN** 系统返回 HTTP 409，前端跳转"昵称冲突页"，提供重新验证或更换昵称选项

### Requirement: 正式用户密码登录
系统 SHALL 支持已升级为正式用户（`is_guest=false`）的用户通过邮箱 + 密码登录，成功后返回 JWT。

#### Scenario: 正确邮箱密码登录
- **WHEN** 用户提交有效邮箱和密码
- **THEN** 系统验证 `password_hash`，返回新的 access token 和 refresh token

#### Scenario: 密码错误
- **WHEN** 用户提交的密码不匹配存储的 `password_hash`
- **THEN** 系统返回 HTTP 401，不暴露具体失败原因（邮箱存在与否）

### Requirement: JWT 鉴权中间件
系统 SHALL 对所有需要认证的端点验证 Bearer JWT，Claims 中必须包含 `user_id`、`role`、`school_id`。

#### Scenario: 有效 Token 访问受保护路由
- **WHEN** 请求携带有效未过期的 JWT Authorization 头
- **THEN** 中间件将 Claims 注入 Echo Context，Handler 无需再查询数据库获取用户信息

#### Scenario: Token 缺失或过期
- **WHEN** 请求缺少 Authorization 头，或 Token 已过期
- **THEN** 系统返回 HTTP 401

### Requirement: Token 刷新
系统 SHALL 支持使用有效 Refresh Token 换取新的 Access Token，Refresh Token 本身不续期。

#### Scenario: 有效 Refresh Token
- **WHEN** 客户端提交有效未过期的 Refresh Token
- **THEN** 系统颁发新的 Access Token，原 Refresh Token 保持不变

#### Scenario: 无效或过期的 Refresh Token
- **WHEN** 客户端提交已过期或签名不合法的 Refresh Token
- **THEN** 系统返回 HTTP 401，客户端须重新走验证流程

### Requirement: 角色权限模型
系统 SHALL 实现三级角色：`voter`（普通投票者）、`school_admin`（学校管理员）、`super_admin`（超级管理员）。

#### Scenario: school_admin 访问他校数据
- **WHEN** `role=school_admin` 的用户尝试访问其他学校的管理资源
- **THEN** 系统返回 HTTP 403

#### Scenario: voter 访问管理端点
- **WHEN** `role=voter` 的用户访问 `/api/v1/admin/*` 下的任意端点
- **THEN** 系统返回 HTTP 403

## ADDED Requirements

### Requirement: Path A — 验证题验证
系统 SHALL 支持用户通过回答学校配置的验证题完成学校身份核验。验证题答案明文存储于 `school.verification_questions`，验证时直接比对，不区分大小写。

#### Scenario: 答案正确
- **WHEN** 用户提交的答案与 `verification_questions[i].answer` 匹配（忽略首尾空白）
- **THEN** 系统视为验证通过，继续创建/登入流程

#### Scenario: 答案错误
- **WHEN** 用户提交的答案不匹配
- **THEN** 系统返回 HTTP 422，提示答案错误，不暴露正确答案

#### Scenario: 获取验证题（不含答案）
- **WHEN** 客户端请求 `GET /api/v1/schools/:code`
- **THEN** 系统返回 `verification_questions` 数组，每项仅含 `question` 字段，不含 `answer`

### Requirement: Path B — 教育邮箱验证码
系统 SHALL 支持用户通过教育邮箱接收一次性验证码完成学校身份核验。邮箱后缀须匹配 `school.email_suffixes` 中的任意一项。

#### Scenario: 邮箱后缀匹配，发送验证码
- **WHEN** 用户提交的邮箱后缀在 `school.email_suffixes` 列表中
- **THEN** 系统发送 6 位数字验证码至该邮箱，验证码有效期 10 分钟

#### Scenario: 邮箱后缀不匹配
- **WHEN** 用户提交的邮箱后缀不在 `school.email_suffixes` 中
- **THEN** 系统返回 HTTP 422，提示"邮箱不符合该学校要求"

#### Scenario: 验证码正确
- **WHEN** 用户在有效期内提交正确验证码
- **THEN** 系统视为验证通过，继续创建/登入流程；用户记录中 `email` 字段更新为本次验证邮箱

#### Scenario: 验证码过期或错误
- **WHEN** 用户提交的验证码不正确或已过期
- **THEN** 系统返回 HTTP 422，提示验证码无效

### Requirement: 昵称冲突处理（同校）
当用户输入的昵称已被同校另一用户使用时，系统 SHALL 提供重新验证身份（找回账号）的通道，而非直接创建新账户。

#### Scenario: 原账号使用 Path A（无邮箱），重新验证
- **WHEN** 昵称对应的已有账号 `email` 为空
- **THEN** 前端展示"重新回答验证题"流程，通过后登入原账号

#### Scenario: 原账号使用 Path B（有邮箱），重新验证
- **WHEN** 昵称对应的已有账号 `email` 非空
- **THEN** 前端向原账号邮箱重发验证码，通过后登入原账号

#### Scenario: 用户选择更换昵称
- **WHEN** 用户在昵称冲突页点击"返回，换一个昵称"
- **THEN** 前端返回昵称输入步骤，清空已输入昵称

### Requirement: Verify 步骤注册引导
前端 Verify 步骤 SHALL 在提交按钮上方展示注册正式用户的引导文字，引导用户在完成验证后升级账户。

#### Scenario: 引导文字展示
- **WHEN** 用户进入 Verify 步骤（选择学校后）
- **THEN** 提交按钮上方显示："你也可以选择\n注册正式用户，保留历年记录"，"注册正式用户，保留历年记录"为 Next.js Link，指向 `/auth/register`

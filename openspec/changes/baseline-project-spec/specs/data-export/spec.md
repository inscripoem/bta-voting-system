## ADDED Requirements

### Requirement: 投票数据 CSV 导出
系统 SHALL 支持通过 `GET /api/v1/admin/votes/export` 导出 VoteItem 数据为 CSV 格式，供学校负责人核查。

#### Scenario: school_admin 导出本校数据
- **WHEN** `school_admin` 调用导出端点（不带或带 `school_id` 参数但为本校 id）
- **THEN** 系统返回仅包含本校 `school_id` VoteItem 的 CSV，`Content-Disposition: attachment; filename=votes_<school_code>.csv`

#### Scenario: school_admin 尝试导出他校数据
- **WHEN** `school_admin` 在请求中指定不属于本校的 `school_id`
- **THEN** 系统返回 HTTP 403

#### Scenario: super_admin 导出全量数据
- **WHEN** `super_admin` 调用导出端点，不带 `school_id` 参数
- **THEN** 系统返回所有学校的完整 VoteItem CSV

#### Scenario: super_admin 按学校筛选导出
- **WHEN** `super_admin` 调用导出端点，携带 `school_id=x` 参数
- **THEN** 系统返回仅该学校的 VoteItem CSV

### Requirement: CSV 字段规范
导出的 CSV 文件 SHALL 包含以下字段：`vote_item_id`、`user_id`、`nickname`、`school_code`、`award_id`、`award_name`、`nominee_id`、`nominee_name`、`score`、`ip_address`、`user_agent`、`created_at`、`updated_at`。

#### Scenario: IP 地址字段内容
- **WHEN** 生成 CSV 记录时，VoteItem 对应用户的最后写入 IP 为 IPv6
- **THEN** CSV 中 `ip_address` 字段为截取后的 `/48` 前缀，附注字段说明截取规则

#### Scenario: 导出文件编码
- **WHEN** 系统生成 CSV 文件
- **THEN** 文件编码为 UTF-8 with BOM，确保 Excel 正确显示中文

### Requirement: 导出权限与投票状态解耦
数据导出 SHALL 在任意 VotingSession 状态下均可使用，不限于 `counting` 或 `published` 状态。

#### Scenario: 投票进行中导出数据
- **WHEN** `VotingSession.status=active`，管理员调用导出端点
- **THEN** 系统返回截至当前时刻的所有 VoteItem 数据，包含尚未完成投票的用户记录

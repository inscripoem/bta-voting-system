## ADDED Requirements

### Requirement: 奖项三分类展示
系统 SHALL 将奖项按 `category` 分为 `mandatory`（必填正赛）、`optional`（选填正赛）、`entertainment`（学校娱乐）三类，前端展示规则不同。

#### Scenario: mandatory 奖项全量展示
- **WHEN** 用户进入投票页
- **THEN** 所有 `mandatory` 奖项不折叠，全部展示

#### Scenario: optional/entertainment 奖项默认折叠
- **WHEN** 用户进入投票页
- **THEN** `optional` 和 `entertainment` 奖项默认展示前 3 个，提供"展开全部 (N)"按钮

#### Scenario: entertainment 奖项仅对本校用户可见
- **WHEN** 用户的 `school_id` 与某 `entertainment` 奖项的 `school_id` 不匹配
- **THEN** 该奖项不出现在投票页面，对该用户不可见

### Requirement: 评分约束验证
系统 SHALL 对每次投票请求验证评分值合法性，违反约束须拒绝整个请求。

#### Scenario: score 不在 allowed_scores 范围内
- **WHEN** 请求中某条 VoteItem 的 `score` 不在 `award.score_config.allowed_scores` 中
- **THEN** 系统返回 HTTP 422，不写入任何记录

#### Scenario: score=1 数量超过 max_count
- **WHEN** 用户对同一奖项投出的 `score=1` 的提名数超过 `award.score_config.max_count["1"]`
- **THEN** 系统返回 HTTP 422，提示超出上限，不写入任何记录

#### Scenario: 合法评分批量提交
- **WHEN** 请求中所有 VoteItem 均满足评分约束
- **THEN** 系统执行 upsert，以 `(user_id, nominee_id, session_id)` 为唯一键，更新 `score`、`ip_address`、`user_agent`

### Requirement: 草稿自动保存
系统 SHALL 支持用户在投票期间随时保存当前进度，投票结束前可多次修改，以最后一次写入为准。

#### Scenario: 投票期间保存进度
- **WHEN** 用户修改任意提名的评分，前端触发 `PUT /api/v1/vote/items`
- **THEN** 系统 upsert 对应 VoteItem，返回 HTTP 200；`ip_address` 和 `user_agent` 更新为本次请求值

#### Scenario: 撤回投票（改回未作答）
- **WHEN** 用户将某提名评分改回"未作答"状态，前端调用 `DELETE /api/v1/vote/items/:id`
- **THEN** 系统删除对应 VoteItem 记录

### Requirement: 完成判定
系统 SHALL 以"所有 mandatory 奖项已有至少一条 VoteItem"作为投票完成的判定条件。

#### Scenario: 所有 mandatory 奖项已作答
- **WHEN** 用户的 VoteItem 记录覆盖了当届所有 mandatory 奖项的每个提名（即每个提名有 score 值）
- **THEN** 前端展示完成页，提示"投票已提交"

#### Scenario: 存在未作答的 mandatory 奖项
- **WHEN** 用户尝试进入完成页但仍有 mandatory 奖项未作答
- **THEN** 前端阻止跳转，高亮未完成奖项

### Requirement: 提名封面展示
前端 SHALL 在投票页每个提名旁展示封面缩略图，无图时使用 SVG 占位符。

#### Scenario: 提名有封面图
- **WHEN** `Nominee.cover_image_url` 非 null，用户进入投票页
- **THEN** 渲染 `<img src={cover_image_url}>` 缩略图（40×40，object-cover 裁切）

#### Scenario: 提名无封面图
- **WHEN** `Nominee.cover_image_url` 为 null，用户进入投票页
- **THEN** 渲染 40×40 灰色背景 SVG 占位��（图片图标）

### Requirement: 投票路由结构
投票页 SHALL 使用 `/session/[year]/vote` 动态路由结构，支持多届赛事访问；原 `/vote` 路由保留为重定向入口。

#### Scenario: 访问旧 /vote 路径
- **WHEN** 用户访问 `/vote`
- **THEN** 前端调用 `GET /api/v1/sessions/current` 获取当届年份，执行 `router.replace('/session/{year}/vote')`

#### Scenario: 直接访问指定年份
- **WHEN** 用户访问 `/session/2025/vote`
- **THEN** 前端以该年份加载对应 session，不发生重定向

### Requirement: 投票信息记录（IP/UA）
系统 SHALL 在每次 VoteItem 写入时记录客户端 IP 地址和 User-Agent，供事后核查。

#### Scenario: IPv6 地址截取
- **WHEN** 客户端 IP 为 IPv6 格式
- **THEN** 系统截取 `/48` 前缀存储（仅保留前 48 位），不存储完整 IPv6 地址

#### Scenario: IPv4 地址完整存储
- **WHEN** 客户端 IP 为 IPv4 格式
- **THEN** 系统存储完整 IPv4 地址字符串

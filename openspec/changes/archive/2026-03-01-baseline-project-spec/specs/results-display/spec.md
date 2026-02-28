## ADDED Requirements

### Requirement: 结果访问门控（published 状态）
系统 SHALL 仅在 `VotingSession.status=published` 时对外开放结果数据，其他状态下 `GET /api/v1/results` MUST 返回 HTTP 403 或空数据。

#### Scenario: 结果未发布时访问
- **WHEN** 任意用户调用 `GET /api/v1/results`，当届 `status` 不为 `published`
- **THEN** 系统返回 HTTP 403，不暴露任何得票数据

#### Scenario: 结果已发布时访问
- **WHEN** 任意用户调用 `GET /api/v1/results`，当届 `status=published`
- **THEN** 系统返回各奖项的提名得分汇总，无需认证

### Requirement: 结果聚合格式
系统 SHALL 以奖项为分组单位，返回每个提名的 `total_score`（所有用户 `score` 之和），按 `total_score` 降序排列。

#### Scenario: 结果数据结构
- **WHEN** 客户端请求已发布的结果
- **THEN** 响应包含数组，每项格式为 `{ award_id, nominee_id, total_score }`，同一奖项内按 `total_score` 降序

#### Scenario: 得分相同时的排序稳定性
- **WHEN** 同一奖项内多个提名得分相同
- **THEN** 系统按 `nominee.display_order` 升序作为次级排序键

### Requirement: 结果页复用历届可视化组件
前端结果页 SHALL 在设计风格上与 `bta-2024-visualization-next` 保持一致，通过复用或参考其可视化组件实现。

#### Scenario: 结果页视觉呈现
- **WHEN** 用户访问 `/results`，且当届状态为 `published`
- **THEN** 页面使用与历届一致的可视化组件（如动画数字、排行榜卡片）展示得分

#### Scenario: 未发布状态的 /results 页面
- **WHEN** 用户访问 `/results`，当届状态不为 `published`
- **THEN** 前端展示"结果尚未公布"占位页，不显示任何票数信息

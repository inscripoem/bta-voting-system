## Why

大二杯投票平台已完成核心业务设计与部分实现，但尚无正式的 Spec 文档体系记录各能力的需求边界。在引入新需求前，需先将现有设计约束化为可验证的 Spec，作为所有后续变更的基准（baseline）。

## What Changes

- 建立 `openspec/specs/` 目录，为平台的七个核心能力各创建 `spec.md`
- 将 `docs/plans/` 中的设计决策转化为机器可验证的约束集
- 为后续 `spec-plan` / `spec-impl` 提供可引用的需求基线

## Capabilities

### New Capabilities

- `user-auth`: 用户身份体系——Guest 创建、邮件验证码、密码登录、JWT 鉴权、角色模型（voter / school_admin / super_admin）
- `school-verification`: 学校身份验证——验证题（Path A）与教育邮箱验证码（Path B）两条通路，昵称冲突处理
- `voting`: 投票核心——奖项分类（mandatory / optional / entertainment）、评分约束、草稿自动保存、VoteItem upsert 规则
- `account-management`: 账户升级——Guest → Registered 完整流程、邮箱更换、密码设置、历史票数保留
- `admin-management`: 管理后台——VotingSession 状态机、学校/奖项/提名管理、角色权限边界
- `data-export`: 数据导出——school_admin 限本校、super_admin 全量、CSV 格式含 IP/UA 字段
- `results-display`: 结果展示——仅 `published` 状态对外开放、按奖项聚合得分

### Modified Capabilities

<!-- 无：这是初始 baseline，不存在已有 spec 需变更 -->

## Impact

- **代码**: 不修改任何业务代码；仅在 `openspec/specs/` 下新增文档
- **API**: 无变更，Spec 描述现有 `/api/v1/*` 端点约束
- **依赖**: 无新增依赖
- **团队**: 后续所有变更 PR 须在对应 spec 下声明 delta

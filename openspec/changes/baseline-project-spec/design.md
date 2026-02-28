## Context

大二杯投票平台是一个 Monorepo 全栈项目，前端 Next.js 15 部署于 Vercel，后端 Go + Echo 与 PostgreSQL 自托管于 Docker。当前代码库已实现核心投票逻辑、JWT 鉴权、ent ORM 数据层，但缺少 Spec 文档体系。本 design.md 的目标是记录现有架构决策与约束，而非引入新实现。

**当前实现状态（截至 2026-02-28）：**
- Backend: `internal/handler/`（5 文件）、`internal/service/`（6 文件）、`internal/ent/schema/`（6 实体）已实现
- Frontend: `app/` App Router 结构已搭建，`hooks/useVoteStore.ts`（Zustand）、`lib/api.ts` 已实现
- 工具链：Air 热重载、Taskfile、Docker Compose 已配置

## Goals / Non-Goals

**Goals:**
- 将现有设计决策转化为可验证的约束文档
- 明确各模块的技术边界与依赖关系
- 为后续 spec-plan / spec-impl 提供引用基线

**Non-Goals:**
- 不修改任何现有业务代码
- 不引入新功能或新依赖
- 不评估是否应重构现有实现

## Decisions

### D1: Monorepo 单仓库结构
**选择**: `backend/` + `frontend/` 两子目录，共享 Git 历史
**理由**: 前后端改动强相关（API contract 变更同步），单 PR 可覆盖全栈变更
**替代方案**: 双仓库——需维护跨仓库协调，被排除

### D2: ent ORM + Mixin 审计字段
**选择**: `entgo.io/ent` 作为 ORM，所有实体通过 `AuditMixin` 注入 `created_at`/`updated_at`
**理由**: 代码生成保证类型安全；Mixin 避免重复声明审计字段
**约束**: `internal/ent/` 目录下的生成代码禁止手动修改；变更 Schema → `go generate ./ent`

### D3: JWT 双 Token 方案
**选择**: Access Token（短期）+ Refresh Token（长期），均为 JWT
**理由**: 无状态鉴权适合 Vercel 前端 + 自托管后端的跨域场景
**约束**: JWT claims 包含 `user_id`、`role`、`school_id`；中间件从 Context 读取，不再查库

### D4: 邮件 Provider 抽象
**选择**: `EmailSender` interface，运行时通过 `EMAIL_PROVIDER` 环境变量切换 SMTP / Resend
**理由**: 开发环境用 SMTP，生产环境用 Resend，零代码改动切换
**约束**: 两个 provider 均须实现相同 interface；新增 provider 不得修改调用方

### D5: 投票记录设计（VoteItem upsert）
**选择**: `(user_id, nominee_id, session_id)` 唯一索引；前端每次改动触发 `PUT /api/v1/vote/items` 批量 upsert
**理由**: 草稿自动保存场景下，upsert 比 insert+update 更简单；唯一索引防止重复票
**约束**: `score` 必须在 `award.score_config.allowed_scores` 范围内；`score=1` 数量不超过 `max_count["1"]`

### D6: 学校娱乐奖项隔离
**选择**: `Award.school_id` 非空表示该奖项仅对特定学校可见；前端通过 `GET /api/v1/awards?school_id=x` 获取
**理由**: 不同学校的娱乐奖项互不可见，保证投票隐私
**约束**: 后端须验证投票用户的 `school_id` 与 Award 的 `school_id` 匹配

### D7: 前端状态管理（Zustand）
**选择**: Zustand store（`useVoteStore`）管理投票状态；localStorage 存储 JWT Token
**理由**: 轻量无模板代码；投票页 multi-step 流程跨组件共享状态
**约束**: JWT 存储于 `localStorage`（非 httpOnly cookie）；前端负责 token 刷新逻辑

## Risks / Trade-offs

- **[Token 存储安全]** localStorage 存 JWT 存在 XSS 风险 → 所有用户输入须经过 HTML 转义；管理端路由额外校验 role
- **[ent 代码膨胀]** 6 实体生成大量文件，PR diff 噪声大 → `.gitattributes` 将 `internal/ent/` 标记为 generated，review 时折叠
- **[IP 截取精度]** IPv6 截取 `/48` 前缀，可能导致同子网用户 IP 相同 → 结合 UA 字段辅助判断，导出时注明截取规则
- **[昵称全局唯一性]** 昵称全局唯一（跨学校），可能导致常见名被占用 → 在错误提示中说明"请换一个昵称"，不暴露冲突学校信息

## Open Questions

<!-- 无：本 design.md 记录现有约束，不存在待决策项 -->

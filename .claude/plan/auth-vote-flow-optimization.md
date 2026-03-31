# 实施计划：BTA 投票系统认证与投票流程优化

## 任务类型
- [x] 前端 (→ Gemini)
- [x] 后端 (→ Codex)
- [x] 全栈 (→ 并行)

## 技术方案

采用**分阶段实施**策略，优先修复高优先级问题，后续进行架构优化。

### Phase 1：快速修复（高优先级）

**1. 访客登录态持久化修复**
- **前端**：
  - 为 `useVoteStore` 添加 Zustand `persist` 中间件，持久化非敏感状态
  - 优化 `SessionVotePage` 的 401 恢复策略，区分 guest/formal 用户
  - 添加会话过期提示
- **后端**：无需修改（httpOnly cookie 机制已正确实施）

**2. 支持昵称或邮箱登录**
- **前端**：
  - 修改登录表单：标签改为"邮箱或昵称"，`type="text"`
  - 优化错误提示：通俗化错误信息
- **后端**：
  - 修改 `Login` 函数：支持 `identifier` 字段，自动判断是邮箱还是昵称
  - 添加输入规范化：`trim + lowercase`（邮箱）、`trim`（昵称）
  - **临时方案**：昵称登录时需要用户额外选择学校（因为当前昵称是全局唯一）

**3. 验证题逻辑加强**
- **前端**：
  - 分步展示：先显示验证题，答对后再显示邮箱绑定
  - 添加验证码发送倒计时（60s）
  - 优化错误提示
- **后端**：
  - 添加配置校验：`answer` 键缺失时返回配置错误
  - 验证码消费延后到业务校验成功后

**4. 投票流程 UX 优化**
- **前端**：
  - `SelectSchool`：添加搜索过滤功能
  - `Nickname`：冲突时直接在当前页显示错误及建议
  - `VoteForm`：添加 Skeleton 加载占位、优化自动保存提示
  - 全流程：添加焦点管理（自动聚焦到第一个输入框）

### Phase 2：架构优化（中优先级）

**5. 昵称唯一性改造**
- **后端**：
  - DB 迁移：去掉 `nickname` 全局唯一，改为 `(school_id, normalized_nickname)` 复合唯一
  - 修改所有相关逻辑：`CheckNickname`、`findOrCreateGuest`、`createRegistered`
  - 添加昵称规范化函数
- **前端**：
  - 移除登录时的学校选择（昵称改为同校唯一后不再需要）

**6. 其他优化**
- email 唯一性检查修复
- 验证码存储方案优化（改用 Redis）
- 补充 auth 主流程测试

## 实施步骤

### Phase 1：快速修复（预计 2-3 天）

**Step 1: 前端状态持久化**
- 文件：`frontend/hooks/useVoteStore.ts`
- 操作：添加 Zustand `persist` 中间件
- 预期产物：刷新页面后保留投票流程中间状态

**Step 2: 前端 401 恢复策略优化**
- 文件：`frontend/lib/api.ts`、`frontend/app/session/[year]/vote/page.tsx`
- 操作：区分 guest/formal 用户的恢复路径
- 预期产物：guest 失效后回到验证流，formal 去登录页

**Step 3: 登录表单 UI 优化**
- 文件：`frontend/app/auth/login/page.tsx`
- 操作：标签改为"邮箱或昵称"，`type="text"`
- 预期产物：支持昵称输入

**Step 4: 后端登录逻辑扩展**
- 文件：`backend/internal/service/auth.go`
- 操作：添加 `LoginWithIdentifier` 函数，支持邮箱或昵称登录
- 预期产物：后端支持昵称登录（临时需要学校上下文）

**Step 5: 验证题前端 UX 优化**
- 文件：`frontend/app/vote/steps/Verify.tsx`
- 操作：分步展示、添加倒计时
- 预期产物：验证流程更清晰

**Step 6: 验证题后端逻辑加强**
- 文件：`backend/internal/service/auth.go`
- 操作：添加配置校验、延后验证码消费
- 预期产物：验证题逻辑更健壮

**Step 7: 投票流程 UX 优化**
- 文件：`frontend/app/vote/steps/*.tsx`
- 操作：添加搜索、优化错误提示、添加焦点管理
- 预期产物：投票流程更流畅

### Phase 2：架构优化（预计 3-5 天）

**Step 8: DB 迁移 - 昵称改为同校唯一**
- 文件：`backend/cmd/migrate/main.go`、`backend/internal/ent/schema/user.go`
- 操作：创建迁移脚本，修改 schema
- 预期产物：昵称在同一学校内唯一

**Step 9: 后端逻辑适配**
- 文件：`backend/internal/service/auth.go`
- 操作：修改所有相关逻辑
- 预期产物：后端逻辑与新数据模型一致

**Step 10: 前端逻辑适配**
- 文件：`frontend/app/auth/login/page.tsx`
- 操作：移除学校选择
- 预期产物：登录流程更简洁

**Step 11: 补充测试**
- 文件：`backend/internal/service/auth_test.go`（新建）
- 操作：添加 auth 主流程测试
- 预期产物：测试覆盖率提升

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| frontend/hooks/useVoteStore.ts | 修改 | 添加 persist 中间件 |
| frontend/lib/api.ts | 修改 | 优化 401 恢复策略 |
| frontend/app/session/[year]/vote/page.tsx | 修改 | 优化异常分流逻辑 |
| frontend/app/auth/login/page.tsx | 修改 | 支持昵称输入 |
| frontend/app/vote/steps/Verify.tsx | 修改 | UX 优化 |
| frontend/app/vote/steps/SelectSchool.tsx | 修改 | 添加搜索功能 |
| frontend/app/vote/steps/Nickname.tsx | 修改 | 优化冲突提示 |
| frontend/app/vote/steps/VoteForm.tsx | 修改 | 添加 Skeleton、优化提示 |
| backend/internal/service/auth.go | 修改 | 支持昵称登录、加强验证题逻辑 |
| backend/internal/ent/schema/user.go | 修改（Phase 2） | 改为同校唯一 |
| backend/cmd/migrate/main.go | 修改（Phase 2） | 添加迁移脚本 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Phase 1 临时方案需要用户选择学校 | 在 Phase 2 完成后移除，用户体验影响有限 |
| DB 迁移可能影响现有数据 | 先在测试环境验证，确保迁移脚本正确 |
| 验证码消费延后可能导致并发问题 | 使用事务或乐观锁 |
| Zustand persist 可能导致状态不一致 | 只持久化非敏感状态，服务端数据为准 |

## 多模型分析摘要

### Codex（后端视角）核心发现

1. **昵称唯一性实现与需求冲突**：schema 是全局唯一，但业务逻辑按"同校唯一"处理
2. **访客持久化问题根源**：前端 401 恢复策略把 guest 和 formal 用户混为一谈
3. **验证题配置空值绕过**：后台配置缺少 `answer` 键时可被绕过
4. **验证码消费时机过早**：业务校验失败时验证码也被消耗
5. 登录仅支持精确邮箱匹配，未规范化输入
6. email 唯一性检查与 schema 约束不一致

**推荐方案**：改为 `(school_id, nickname)` 复合唯一，登录支持"邮箱+密码"或"昵称+密码+学校上下文"

### Gemini（前端视角）核心发现

1. **中间态丢失**：Zustand Store 未持久化，刷新页面后用户需从头开始
2. **登录表单 UI 限制**：`type="email"` 不支持昵称输入
3. **验证题流程复杂度高**：验证题 + 邮箱绑定 + 验证码，操作路径过长
4. 缺少视觉反馈：验证码发送后无倒计时
5. 投票流程各步骤的 UX 优化建议

**推荐方案**：使用 Zustand `persist` 中间件、优化登录表单 UI、分步展示验证流程

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: 019d4203-4d3e-7140-88a8-53d516387fc6
- GEMINI_SESSION: 11cdf22c-adf0-4c47-8fd6-1a7e91c746a0

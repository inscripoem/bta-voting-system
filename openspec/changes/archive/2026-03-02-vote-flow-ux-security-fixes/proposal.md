# OpenSpec Change: vote-flow-ux-security-fixes

**Status**: Research Complete → Pending Implementation
**Created**: 2026-03-02
**Scope**: Frontend (vote flow, admin schools) + Backend (auth service, handler)

---

## Context

多个投票流程问题被识别，分为三类：
1. **UI/UX 缺陷**：邮箱后缀显示、下拉溢出、邮箱格式验证
2. **交互逻辑问题**：昵称冲突检测时机、退出登录后状态残留
3. **安全设计重构**：游客账号强制绑定邮箱、昵称认领需邮箱验证

用户已确认三个关键设计决策：
- 邮箱后缀格式：在 TagInput 前显示灰色 `@` 前缀，管理员只输入域名部分，DB 存带 `@` 格式
- 验证题游客：确认改为「验证题 + 任意邮箱双验证」
- 昵称认领：与游客绑邮箱同步上线，统一用绑定邮箱验证

---

## Requirement Modules

### Module A: 邮箱后缀 @ 前缀显示（Admin Schools UI）

**Problem**: 管理面板 TagInput 的 placeholder 是 `例如: edu.cn`（不含@），而 DB 存储格式期望含 `@`（如 `@pku.edu.cn`）。导致管理员困惑，输入错误格式。

**Solution**: 重新设计邮箱后缀的 TagInput，在输入框前固定显示灰色 `@`，管理员只填域名部分（如 `pku.edu.cn`），组件自动补全为 `@pku.edu.cn` 存入 DB。

**Files**: `frontend/app/admin/schools/page.tsx`

**Constraints**:
- TagInput 保持原有的多值编辑能力
- 展示已有值时需去掉开头 `@` 作为显示（或直接在前面固定显示 `@`）
- 存入 state 和提交 API 时必须携带 `@`
- 若已有数据含 `@`（seed 数据已经含 `@`），读取时需正确渲染

**Success Criteria**:
- 管理员输入 `pku.edu.cn`，保存后 DB 存储 `@pku.edu.cn`
- 已有 `@pku.edu.cn` 在 TagInput 中显示为 `@` + `pku.edu.cn`（前缀固定，域名可见）

---

### Module B: 邮箱后缀下拉 UI 修复（Verify.tsx）

**Problem**: Verify.tsx 的 SelectTrigger（邮箱后缀选择器）的下拉箭头图标在 flex 容器中溢出或不可见，用户看不出可以点击切换后缀。

**Root Cause**: `<SelectTrigger className="w-auto border-0 border-l rounded-none shrink-0 text-muted-foreground text-sm focus:ring-0">` 在父级 `overflow-hidden` flex 容器中，Radix UI 的 ChevronDown 图标可能被裁剪。

**Solution**: 调整 SelectTrigger 的 CSS，确保箭头图标可见。可选方案：
- 给 SelectTrigger 设定最小宽度（min-w-[4rem] 或类似）
- 或去掉父 div 的 `overflow-hidden` 并改用 `rounded-md` 分别处理

**Files**: `frontend/app/vote/steps/Verify.tsx`

**Success Criteria**:
- 有多个邮箱后缀时，SelectTrigger 显示当前后缀和可见的下拉箭头
- 点击后弹出下拉列表

---

### Module C: 邮箱格式校验

**Problem**: 所有邮箱输入框均无格式验证，用户可以输入无效邮箱后触发发送请求。

**Affected Fields**:
1. `Verify.tsx` - 教育邮箱 `emailLocal` + suffix 拼合后的 fullEmail（在 sendCode 前验证）
2. `NicknameConflict.tsx` - email 输入框
3. `Register.tsx` - 注册邮箱输入框

**Solution**: 在「发送验证码」按钮的 `disabled` 条件中加入邮箱格式校验：
- 验证逻辑：`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` 简单 regex
- 或使用 `type="email"` 的 HTML input 配合 `checkValidity()`

**Constraint**: 不引入新的 UI 库，只用原有 pattern。

**Success Criteria**:
- 发送验证码按钮在邮箱格式无效时保持 disabled
- 格式无效不显示红色错误提示（只是 disabled，不打扰用户输入中）

---

### Module D: 昵称页即时预检（check-nickname API）

**Problem**: 昵称输入后直接进入验证流程，验证完成才发现昵称冲突，导致用户白白走一遍验证。

**Solution**: 在昵称页点「继续」时先调用 API 检查昵称可用性。

**New Backend Endpoint**:
```
GET /api/v1/auth/check-nickname?nickname={n}&school_code={s}
```
Response:
```json
// 可用
{ "available": true }

// 本校冲突（is_guest=true：游客可认领；is_guest=false：正式用户不可认领）
{ "available": false, "conflict": "same_school", "is_guest": true }
{ "available": false, "conflict": "same_school", "is_guest": false }

// 外校冲突（不可认领，换名）
{ "available": false, "conflict": "different_school" }
```

**Frontend Nickname.tsx Logic**:
- 调用 check-nickname
- `available: true` → 直接 `goTo("verify")`
- `conflict: "different_school"` → inline error "该昵称已被其他学校使用，请换一个"
- `conflict: "same_school" && is_guest: false` → inline error "该昵称已被正式用户注册，请登录或换一个昵称"（含 Link to /auth/login）
- `conflict: "same_school" && is_guest: true` → 直接跳到 conflict 步骤（快捷认领，跳过验证）

**Backend Constraints**:
- `GET` 请求，无需认证
- 不修改任何 DB 状态
- `is_guest` 字段仅在 `same_school` 冲突时返回

**Files**: `backend/internal/handler/auth.go`, `backend/internal/service/auth.go`, `frontend/app/vote/steps/Nickname.tsx`, `frontend/hooks/useVoteStore.ts`

**Success Criteria**:
- 正式用户昵称冲突：在昵称页即时提示，不进入验证流程
- 游客昵称冲突：在昵称页即时识别，直接跳到认领流程
- 无冲突：行为与现在相同，进入 verify

---

### Module E: 游客账号强制绑定邮箱（验证题 + 任意邮箱双验证）

**Problem**: 使用「验证题」方式创建的游客账号没有绑定邮箱，导致：
1. 昵称认领时无法通过邮箱验证身份
2. 存在安全隐患（只要知道问题答案就可随意创建/认领）

**Solution**: 验证题方式也必须绑定邮箱。流程变为：
1. 回答验证题（验证学校归属）
2. 填写任意邮箱 + 发送验证码（邮箱限流 + 身份绑定）
3. 输入验证码完成验证
4. 创建绑定了该邮箱的游客账号

**Backend Changes** (`backend/internal/service/auth.go`):
- `GuestByQuestion` 新签名：`(ctx, nickname, schoolCode, answer, emailAddr, code, ip, ua)`
  - 验证 answer 后，再验证 email code（schoolCode="" 即 SendEmailCode 时不校验后缀）
  - 创建 guest 时 SetEmail(emailAddr)
- `GuestByEmail` 无变化（已经绑定 edu 邮箱）
- `SendEmailCode` 已支持 schoolCode="" → 任意邮箱，无需修改
- 新增错误：`ErrEmailCodeRequired`（当 email/code 为空时）

**Handler Changes** (`backend/internal/handler/auth.go`):
- `guestRequest` 结构体 `Email`/`Code` 字段对 question 方法也必须传
- 调用 `GuestByQuestion` 时传入 email + code
- 新增错误 case mapping

**Frontend Changes** (`frontend/app/vote/steps/Verify.tsx`):
- question 分支增加邮箱步骤：
  ```
  [已有] 验证题答案输入框
  [新增] 邮箱输入框 + 发送验证码按钮
  [新增] 验证码输入框（发送后显示）
  ```
- Submit 时同时传 answer + email + code
- 邮箱格式校验同 Module C

**Constraints**:
- 验证题方式的邮箱不受学校 email_suffixes 限制（任意邮箱均可）
- 验证码发送时 school_code 为空（不校验后缀）
- NicknameConflict 组件同步改造（见 Module F）

**Success Criteria**:
- 选择验证题方式后，用户必须完成邮箱验证才能成为游客
- 创建的游客账号的 `email` 字段非空

---

### Module F: 昵称认领流程重构（NicknameConflict）

**Problem**: 当前 NicknameConflict 允许用验证题或教育邮箱重新验证，安全性低（知道问题答案即可夺取他人游客账号）。

**Solution**: 认领流程统一改为「输入绑定邮箱 → 发送验证码 → 验证完成认领」。

**正式用户处理**（需 Module D 配合）:
- 若昵称归属正式用户：不显示认领界面，直接显示提示卡片
  ```
  「{nickname}」已被正式用户注册。
  [去登录]  [返回，换昵称]
  ```

**游客用户认领界面**:
```
「{nickname}」这个昵称已被使用。
如果这是你，请通过之前绑定的邮箱验证身份。

[邮箱输入框]  [发送验证码]
[验证码输入框]（发送后显示）
[确认认领]

--- 或者 ---
[← 返回，换一个昵称]
```

**New Backend Endpoint** `POST /api/v1/auth/claim-nickname`:
```json
Request:
{
  "nickname": "xxx",
  "school_code": "univ-a",
  "email": "user@example.com",
  "code": "123456"
}
Response 200: { "access_token": "...", "refresh_token": "..." }
Response 409: { "conflict": "email_mismatch" }  // 邮箱与账号绑定邮箱不符
Response 401: { "message": "invalid or expired code" }
```

**Backend Logic** (`ClaimNickname` in service/auth.go):
1. 验证 email code
2. 查找 nickname 对应用户
3. 验证 user.email == emailAddr（精确匹配）
4. 确认 user.is_guest == true（非游客不走此流程，理论上不会出现）
5. 返回该用户的 tokens

**Deprecate**: `ReauthByQuestion` 和 `ReauthByEmail` 服务方法（handler 中的 `reauth` 分支也可移除）

**Files**:
- `backend/internal/service/auth.go`
- `backend/internal/handler/auth.go`
- `frontend/app/vote/steps/NicknameConflict.tsx`
- `frontend/lib/api.ts`（新增 `api.auth.claimNickname`）

**Constraints**:
- conflictType 字段需扩展存储 is_guest 信息（useVoteStore.ts 中 `conflictType` 需要配合）
- 或 conflict step 内部自行用 check-nickname 结果（可从 Module D 流程中携带）

**Success Criteria**:
- 正式用户昵称冲突：NicknameConflict 显示提示卡，无法认领
- 游客昵称冲突：只能通过绑定邮箱认领，验证题方式被彻底移除
- 错误邮箱：提示"邮箱与���账号绑定邮箱不符"

---

### Module G: 退出登录后投票页状态残留修复

**Problem**: 正式用户退出登录后直接访问投票页，页面仍渲染 VoteForm（voteStore step="vote"），后端返回 401 但页面不回到选择学校状态。需刷新才恢复正常。

**Root Cause Analysis**:
- `useVoteStore` Zustand 状态在内存中持久，退出登录不触发重置
- 投票页 `useEffect` 中，`api.me.get()` 失败后 catch 块什么也不做（未重置 store）
- `store.reset()` 仅在 `store.session?.year !== year` 时调用，年份匹配时跳过

**Fix 1** (`frontend/app/session/[year]/vote/page.tsx`):
```typescript
} catch {
  // Not logged in or guest — proceed with normal verification flow
  // But ensure stale "vote" step is reset
  if (store.step === "vote") {
    store.reset()  // clear stale state
  }
} finally {
  setLoading(false)
}
```
实际上更安全：若 `api.me.get()` 失败（非 guest 状态），且 store.step 不是 select-school/nickname/verify 类初始阶段，则重置。

**Fix 2** (`frontend/components/nav-actions.tsx`):
```typescript
const handleLogout = () => {
  clearTokens()
  clear()
  useVoteStore.getState().reset()  // 确保 voteStore 同步清除
  router.push("/auth/login")
}
```

**Systemic Note**: 这是通病。任何持久化 Zustand 状态（admin 页等）在 auth 变更后都可能出现类似问题。建议在 `useAuthStore.clear()` 中统一触发 voteStore.reset()，或建立全局 auth change listener。

**Files**:
- `frontend/app/session/[year]/vote/page.tsx`
- `frontend/components/nav-actions.tsx`
- `frontend/hooks/useVoteStore.ts`（可选：在 clear 中添加跨 store 清理）

**Success Criteria**:
- 退出登录后访问投票页，直接显示选择学校界面（而非残留的 VoteForm）
- 无需刷新，状态即时重置

---

## Constraint Summary

### Hard Constraints
- DB 中 email_suffixes 存储格式必须含 `@`（现有 seed 数据格式，backend 逻辑已依赖此格式）
- 游客创建后 email 字段必须非空（Module E 实施后）
- 昵称认领只允许邮箱验证，不允许验证题（安全）
- 正式用户昵称冲突不给重验机会，只能登录或换名

### Soft Constraints
- 不引入新 CSS 框架或 UI 库
- 复用现有 `codes` 内存 map 做验证码存储（生产环境问题已有，不在此变更范围内）
- 保持现有 API 命名风格（camelCase body，snake_case JSON）

### Implementation Order (Dependencies)
```
Module A (独立)
Module B (独立)
Module C (独立)
Module G (独立)
    ↓
Module D (需要新 BE endpoint)
    ↓
Module E (需要 BE 修改 GuestByQuestion)
    ↓
Module F (依赖 D + E，新 BE endpoint + FE 重构)
```

---

## Tasks

> 待 `/ccg:spec-plan` 阶段生成具体任务列表

### Phase 1: 独立修复（无依赖）
- [ ] A1: Admin schools TagInput 邮箱后缀 @ 前缀显示
- [ ] B1: Verify.tsx SelectTrigger 下拉溢出修复
- [ ] C1: 邮箱格式校验（Verify + NicknameConflict + Register）
- [ ] G1: 投票页 useEffect catch 块重置 voteStore
- [ ] G2: NavActions logout 重置 voteStore

### Phase 2: 后端新接口
- [ ] D-BE: `GET /auth/check-nickname` 接口 + service 方法
- [ ] E-BE: `GuestByQuestion` 增加 email+code 参数
- [ ] F-BE: `POST /auth/claim-nickname` 接口 + service 方法
- [ ] F-BE2: conflict 响应增加 `is_guest` 字段

### Phase 3: 前端配合
- [ ] D-FE: Nickname.tsx 调用 check-nickname，处理 3 种结果
- [ ] E-FE: Verify.tsx 验证题分支增加邮箱验证步骤
- [ ] F-FE: NicknameConflict.tsx 完全重构
- [ ] F-FE2: api.ts 新增 `claimNickname` + `checkNickname`
- [ ] F-FE3: useVoteStore 存储 conflict 时的 is_guest 信息

---

## Success Criteria (全局验收)

1. **邮箱后缀**: 管理员在学校管理面板输入域名，保存后 DB 存储含 `@` 格式
2. **下拉可见**: 多后缀时下拉箭头完整显示，可正常切换
3. **格式校验**: 邮箱格式错误时发送按钮保持 disabled
4. **即时预检**: 昵称页确认时立即反馈冲突，正式用户冲突不进入验证流程
5. **游客绑邮箱**: 验证题方式创建的游客账号必定有绑定邮箱
6. **安全认领**: 昵称认领必须通过绑定邮箱验证，无法只凭验证题夺取
7. **正式用户保护**: 正式用户昵称冲突不提供认领入口
8. **退出状态**: 退出登录后访问投票页，直接显示选择学校界面

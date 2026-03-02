# 📋 实施计划：registration-flow-refactor

## 任务概述

1. **修复直接注册邮箱 Bug** — `DirectRegisterFlow` 验证题路径创建无 email 用户，但 Login 依赖 email，需修复
2. **投票流程内联注册** — Verify 验证成功后，新增 `register` 步骤展示"进入投票 / 或者 / 注册并投票"
3. **顶栏个人中心** — 为登录用户（游客+正式）在顶栏添加昵称/图标，链接到 `/account`

---

## 任务类型

- [x] 全栈（前端 + 后端）

---

## 技术方案

### 核心决策

**Bug 修复（DirectRegisterFlow）**：使用 Option B（后端同时验证问题答案 + 邮箱验证码）
- `RegisterByQuestion` 额外接受 `emailAddr, emailCode` 参数，使用已有的内存验证码机制
- 前端 question method 增加"登录邮箱"输入区（任意邮箱，无后缀限制）

**内联注册（Vote Flow）**：用已有的 upgrade API 两步法（verifyEmail → upgrade）
- 邮箱验证游客：email 已在 guest 创建时设置 → 直接 `upgrade(password)` 即可
- 验证题游客：email 未设置 → `sendCode(email)` → `verifyEmail(email, code)` → `upgrade(password)`
- `Upgrade` handler 增加 email guard（user.Email == nil → 400）

**顶栏个人中心**：在 `NavActions` 添加 `User` 图标 + 昵称链接到 `/account`

### 两流程对比

| 场景 | DirectRegisterFlow（直接注册页） | 投票内联注册（Register 步骤） |
|------|------|------|
| 认证状态 | 未登录 | 已有 guest JWT |
| 邮箱验证 | 一步（backend RegisterByQuestion 同时验证） | 两步（verifyEmail → upgrade） |
| API | `POST /auth/register` | `POST /auth/verify-email` + `POST /auth/upgrade` |

---

## 实施步骤

### STEP 1 — Backend：修复 RegisterByQuestion（email 必填）

**文件**: `backend/internal/service/auth.go`

```go
// 新增错误
var ErrEmailRequired = errors.New("email_required")

// 修改签名：增加 emailAddr, emailCode 参数
func (s *AuthService) RegisterByQuestion(
  ctx context.Context, nickname, schoolCode, answer,
  emailAddr, emailCode, password, ip, ua string,
) (access, refresh string, err error) {
  // 1. 验证学校题目（原有逻辑不变）
  school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
  if err != nil { return "", "", ErrSchoolNotFound }
  questions := school.VerificationQuestions
  if len(questions) > 0 {
    expected := questions[0]["answer"]
    if !strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected)) {
      return "", "", ErrWrongAnswer
    }
  }
  // 2. 验证邮箱验证码（新增）
  if strings.TrimSpace(emailAddr) == "" { return "", "", ErrEmailRequired }
  s.mu.RLock()
  entry, ok := s.codes[emailAddr]
  s.mu.RUnlock()
  if !ok || entry.code != emailCode || time.Now().After(entry.expiresAt) {
    return "", "", ErrInvalidCode
  }
  s.mu.Lock()
  delete(s.codes, emailAddr)
  s.mu.Unlock()
  // 3. 创建用户（含 email）
  return s.createRegistered(ctx, nickname, school, &emailAddr, password)
}
```

**文件**: `backend/internal/handler/auth.go`

```go
// RegisterDirect handler - question case：传入 email+code
case "question":
  access, refresh, err = h.auth.RegisterByQuestion(
    ctx, req.Nickname, req.SchoolCode, req.Answer,
    req.Email, req.Code, req.Password, ip, ua,  // 已有字段，直接传
  )

// 错误处理新增 ErrEmailRequired
case service.ErrEmailRequired:
  return echo.NewHTTPError(http.StatusBadRequest, "email is required")
```

```go
// Upgrade handler - 增加 email guard
func (h *AuthHandler) Upgrade(c echo.Context) error {
  claims := c.Get(apimw.ClaimsKey).(*service.Claims)
  var req upgradeRequest
  if err := c.Bind(&req); err != nil { return 400 }
  if req.Password == "" { return 400 }

  // 新增：检查 user.email 是否已设置
  user, err := h.auth.DB().User.Get(c.Request().Context(), claims.UserID)
  if err != nil { return 404 }
  if user.Email == nil {
    return echo.NewHTTPError(http.StatusBadRequest, "email not verified: call /auth/verify-email first")
  }
  // 原有 hash + update 逻辑不变...
}
```

---

### STEP 2 — Frontend：扩展 useVoteStore

**文件**: `frontend/hooks/useVoteStore.ts`

```ts
// 扩展 VoteStep
export type VoteStep = "select-school" | "nickname" | "verify" | "register" | "vote" | "conflict"

// 新增状态
interface VoteStore {
  // ...原有字段...
  verifiedEmail: string | null          // 验证步骤使用的邮箱，验证题时为 null
  verificationMethod: "question" | "email" | null
  setVerificationResult: (method: "question" | "email", email: string | null) => void
}

// 实现
setVerificationResult: (method, email) => set({ verificationMethod: method, verifiedEmail: email }),
reset: () => set({
  ...原有重置字段...,
  verifiedEmail: null,
  verificationMethod: null,
}),
```

---

### STEP 3 — Frontend：修改 Verify.tsx（导向 register 步骤）

**文件**: `frontend/app/vote/steps/Verify.tsx`

```tsx
// handleSubmit 成功后，修改为：
const { setVerificationResult, goTo } = useVoteStore()

// 替换原来的 goTo("vote")：
saveTokens(res.access_token, res.refresh_token)
await refreshAuth()
setVerificationResult(method, method === "email" ? fullEmail : null)
goTo("register")  // ← 新增步骤
```

---

### STEP 4 — Frontend：新建 Register.tsx（内联注册步骤）

**新文件**: `frontend/app/vote/steps/Register.tsx`

UI 结构（伪代码）：
```tsx
export function Register() {
  const { verifiedEmail, verificationMethod, goTo } = useVoteStore()
  const { refresh: refreshAuth } = useAuthStore()

  const canUseVerifiedEmail = verificationMethod === "email" && !!verifiedEmail
  const [useVerifiedEmail, setUseVerifiedEmail] = useState(canUseVerifiedEmail)
  const [emailInput, setEmailInput] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // 发送验证码（任意邮箱，无后缀限制）
  async function handleSendCode() {
    await api.auth.sendCode(emailInput)  // 无 school_code
    setCodeSent(true)
  }

  // 注册并投票
  async function handleRegisterAndVote() {
    if (password !== confirmPassword) { setError("两次密码不一致"); return }
    try {
      if (!useVerifiedEmail || !canUseVerifiedEmail) {
        // 需要先验证并设置邮箱
        await api.auth.verifyEmail(emailInput, code)  // sets user.email
      }
      await api.auth.upgrade(password)  // sets is_guest=false + password_hash
      await refreshAuth()
      goTo("vote")
    } catch { setError(...) }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>验证成功</CardTitle>
        <CardDescription>{school?.name} · {pendingNickname}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 主要操作：直接投票 */}
        <Button className="w-full" onClick={() => goTo("vote")}>
          进入投票
        </Button>

        {/* 分割线 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">或者</span>
          </div>
        </div>

        {/* 注册区 */}
        <p className="text-sm font-medium">成为正式用户，保留历年投票记录</p>

        {/* 邮箱复用开关（Checkbox）*/}
        <div className="flex items-center gap-2">
          <Checkbox
            id="use-verified-email"
            checked={useVerifiedEmail && canUseVerifiedEmail}
            disabled={!canUseVerifiedEmail}
            onCheckedChange={(v) => setUseVerifiedEmail(Boolean(v))}
          />
          <label htmlFor="use-verified-email"
            className={cn("text-sm", !canUseVerifiedEmail && "text-muted-foreground")}
          >
            使用已验证的教育邮箱
          </label>
        </div>

        {/* 邮箱输入区 */}
        {useVerifiedEmail && canUseVerifiedEmail ? (
          // 已验证邮箱，置灰显示
          <input value={verifiedEmail!} disabled
            className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground" />
        ) : (
          // 需要输入新邮箱 + 验证码
          <div className="space-y-2">
            <div className="flex gap-2">
              <input type="email" placeholder="输入邮箱" value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <Button size="sm" variant="outline"
                onClick={handleSendCode} disabled={!emailInput || loading}>
                {codeSent ? "重发" : "发送"}
              </Button>
            </div>
            {codeSent && (
              <input placeholder="6位验证码" value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            )}
          </div>
        )}

        {/* 密码 */}
        <input type="password" placeholder="设置登录密码" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <input type="password" placeholder="确认密码" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" onClick={handleRegisterAndVote}
          disabled={loading || !password || !confirmPassword
            || (!useVerifiedEmail && !codeSent)
            || (!useVerifiedEmail && !code)}>
          注册并投票
        </Button>
      </CardContent>
    </Card>
  )
}
```

---

### STEP 5 — Frontend：注册步骤接入投票页

**文件**: `frontend/app/session/[year]/vote/page.tsx`

```tsx
import { Register } from "@/app/vote/steps/Register"

// JSX 中添加：
{store.step === "register" && <Register />}
```

---

### STEP 6 — Frontend：修复 DirectRegisterFlow（question method 增加邮箱）

**文件**: `frontend/app/auth/register/page.tsx`

新增状态：
```tsx
const [loginEmail, setLoginEmail] = useState("")
const [loginCode, setLoginCode] = useState("")
const [loginCodeSent, setLoginCodeSent] = useState(false)
```

新增发送验证码函数（任意邮箱）：
```tsx
const handleSendLoginCode = async () => {
  await api.auth.sendCode(loginEmail)  // 无 school_code → 任意邮箱
  setLoginCodeSent(true)
}
```

在 form 中，当 method="question" 时额外显示邮箱输入区：
```tsx
{method === "question" && (
  <div className="space-y-2">
    <Label>账户登录邮箱（任意邮箱）</Label>
    <div className="flex gap-2">
      <Input type="email" placeholder="your@email.com"
        value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
      <Button type="button" size="sm" variant="outline"
        onClick={handleSendLoginCode} disabled={!loginEmail || submitting}>
        {loginCodeSent ? "重发" : "发送"}
      </Button>
    </div>
    {loginCodeSent && (
      <Input placeholder="6位验证码" value={loginCode}
        onChange={(e) => setLoginCode(e.target.value)} />
    )}
  </div>
)}
```

修改 `handleRegister` 中 question method 提交：
```tsx
// 原来 question path 不含 email/code，现在要加：
const res = await api.auth.register({
  nickname: nickname.trim(),
  school_code: school.code,
  method,
  answer: method === "question" ? answer : undefined,
  email: method === "email" ? fullEmail : loginEmail,   // ← 统一传 email
  code: method === "email" ? code : loginCode,          // ← 统一传 code
  password,
})
```

并在提交前校验 question method 的 email+code 必填：
```tsx
if (method === "question" && (!loginEmail || !loginCode)) {
  setError("请输入邮箱并完成验证码验证")
  return
}
```

---

### STEP 7 — Frontend：顶栏个人中心

**文件**: `frontend/components/nav-actions.tsx`

```tsx
import { User } from "lucide-react"

// 在 user && 块中，admin link 后面添加：
{user && (
  <Link href="/account" className={navigationMenuTriggerStyle()}>
    <User className="h-4 w-4 mr-1 inline" />
    {user.nickname}
  </Link>
)}
```

注意：保留现有的"升级账号"和退出按钮，个人中心链接显示在它们之前（或之后均可，取决于布局优先级）。

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/internal/service/auth.go` | 修改 | RegisterByQuestion 新增 email+code 验证 |
| `backend/internal/handler/auth.go` | 修改 | question case 传入 email+code；Upgrade 增加 email guard |
| `frontend/hooks/useVoteStore.ts` | 修改 | 新增 VoteStep "register"，verifiedEmail/verificationMethod 字段 |
| `frontend/app/vote/steps/Verify.tsx` | 修改 | 成功后改为 setVerificationResult + goTo("register") |
| `frontend/app/vote/steps/Register.tsx` | 新建 | 内联注册步骤组件 |
| `frontend/app/session/[year]/vote/page.tsx` | 修改 | 增加 Register 步骤渲染 |
| `frontend/app/auth/register/page.tsx` | 修改 | DirectRegisterFlow question path 增加邮箱验证 |
| `frontend/components/nav-actions.tsx` | 修改 | 增加个人中心链接 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 已有 email=nil 的注册用户无法登录 | 此 bug 修复后新用户不会有此问题；历史用户可通过 admin 界面处理（out of scope） |
| 内联注册步骤中用户关闭页面 | 用户已是 guest，可通过顶栏"升级账号"链接随时回来升级 |
| Checkbox 无 Switch 视觉效果 | 使用已有 Checkbox 组件（已在 components/ui/checkbox.tsx）；若需 Switch 效果后续 `bunx shadcn@latest add switch` |
| Upgrade 新增 email guard 可能影响现有 UpgradeFlow | UpgradeFlow 已先调 verifyEmail（设置 email），再调 upgrade，不受影响 |
| DirectRegisterFlow question path 邮箱验证码和学校验证码在同一内存 map | sendCode 无 schoolCode 时 entry.schoolID 为零值，RegisterByQuestion 不读 schoolID，无冲突 |

---

## 注意事项

- `api.ts` 中 `api.auth.sendCode(email, schoolCode?)` schoolCode 为可选，不传即支持任意邮箱 ✓
- `api.auth.verifyEmail(email, code)` 调用 `/auth/verify-email`（需 JWT）→ 仅用于内联注册（已有 guest JWT）✓
- `api.auth.register` body 中 `email` 和 `code` 字段已有，后端 handler 直接传递 ✓
- 顶栏个人中心：游客和正式用户均显示（显示昵称 + User 图标 → /account）

---

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: `019caaec-42d6-7f42-abed-0a538a9477c8`
- GEMINI_SESSION: `b2380767-b11d-4420-9957-80d6a284cc84`

# Tasks: vote-flow-ux-security-fixes

**Status**: Ready for Implementation
**Created**: 2026-03-02
**Total Modules**: 7 (A–G)

---

## Resolved Constraint Set

| Domain | Constraint |
|--------|-----------|
| Nickname matching | Exact case-sensitive (no change to Ent query) |
| Email storage | `strings.ToLower(email)` before store/compare everywhere |
| Email claim match | `strings.ToLower(input) == strings.ToLower(stored)` |
| check-nickname validation | 400 if missing `nickname`/`school_code`; 404 if school not found |
| Reauth branches | REMOVE `reauth=true` branch from handler + `ReauthByQuestion`/`ReauthByEmail` service methods |
| TagInput prefix | Optional `prefix` prop, backward-compatible (AwardsPage not affected) |
| Email validation regex | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — disable send button, no error display |
| SelectTrigger fix | `min-w-[5rem] justify-between` on SelectTrigger |
| VoteStore new fields | `conflictIsGuest: boolean`, updated `setConflict(type, nickname, isGuest?)` |

---

## Phase 1: Independent Fixes (no backend dependency)

### A1 — Admin Schools: TagInput @-prefix for email_suffixes

**File**: `frontend/components/admin/tag-input.tsx`

Add optional `prefix?: string` prop. When `prefix` is set:
- Existing tags are displayed WITHOUT the prefix (strip it for display)
- On add tag: prepend `prefix` before calling `onChange`
- On delete tag: remove the full value (including prefix) from the array

**File**: `frontend/app/admin/schools/page.tsx`

Change:
```tsx
// Both edit and create dialogs — email_suffixes TagInput
<TagInput
  value={editingSchool.email_suffixes || []}
  onChange={(tags) => setEditingSchool({ ...editingSchool, email_suffixes: tags })}
  placeholder="例如: edu.cn"
/>
```
To:
```tsx
<TagInput
  value={editingSchool.email_suffixes || []}
  onChange={(tags) => setEditingSchool({ ...editingSchool, email_suffixes: tags })}
  placeholder="例如: pku.edu.cn"
  prefix="@"
/>
```
Same for the create dialog.

**Acceptance**:
- Input `pku.edu.cn` → tag shows `@pku.edu.cn` → `onChange` receives `["@pku.edu.cn"]`
- Existing tag `@pku.edu.cn` in value → displays as `pku.edu.cn` in tag chip (prefix visually prepended by component)
- AwardsPage `TagInput` usage unaffected (no `prefix` prop)

---

### B1 — Verify.tsx: Fix SelectTrigger overflow

**File**: `frontend/app/vote/steps/Verify.tsx`, line ~149

Change `SelectTrigger` className from:
```
"w-auto border-0 border-l rounded-none shrink-0 text-muted-foreground text-sm focus:ring-0"
```
To:
```
"min-w-[5rem] w-auto border-0 border-l rounded-none shrink-0 text-muted-foreground text-sm focus:ring-0 justify-between"
```

**Acceptance**:
- When school has multiple email_suffixes, SelectTrigger shows the current suffix + visible ChevronDown icon
- Clicking opens dropdown with all suffix options

---

### C1 — Email format validation (3 files)

Add a shared inline helper (per file, not a shared util — 3 simple lines):
```ts
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
```

**File**: `frontend/app/vote/steps/Verify.tsx` (email method):
- Button `disabled` condition: `!emailLocal || loading` → `!emailLocal || !isValidEmail(fullEmail) || loading`

**File**: `frontend/app/vote/steps/NicknameConflict.tsx`:
- Button `disabled` condition: `!email || loading` → `!email || !isValidEmail(email) || loading`

**File**: `frontend/app/vote/steps/Register.tsx`:
- Button `disabled` condition for "发送" button: `!email || loading` → `!email || !isValidEmail(email) || loading`

**Acceptance**:
- `user@example.com` → button enabled
- `notanemail` → button disabled (no error shown)
- `@example.com` → button disabled

---

### G1 — Vote page: reset stale store on failed auth

**File**: `frontend/app/session/[year]/vote/page.tsx`, catch block ~line 68:

Change:
```ts
} catch {
  // Not logged in or guest — proceed with normal verification flow
} finally {
  setLoading(false)
}
```
To:
```ts
} catch {
  // Not logged in — ensure no stale vote state remains
  if (store.step === "vote") {
    store.reset()
  }
} finally {
  setLoading(false)
}
```

**Acceptance**:
- Logged-in user (step="vote") clicks logout, navigates back to vote URL → sees SelectSchool, not VoteForm
- Normal unauthenticated visit → unaffected (step is already "select-school")

---

### G2 — NavActions: reset voteStore on logout

**File**: `frontend/components/nav-actions.tsx`

Add import at top:
```ts
import { useVoteStore } from "@/hooks/useVoteStore"
```

Change `handleLogout`:
```ts
const handleLogout = () => {
  clearTokens()
  clear()
  useVoteStore.getState().reset()
  router.push("/auth/login")
}
```

**Acceptance**:
- Clicking logout clears tokens + auth state + vote store
- Subsequent navigation to vote page starts from select-school

---

## Phase 2: Backend New Endpoints

### D-BE — service: CheckNickname

**File**: `backend/internal/service/auth.go`

Add method:
```go
type NicknameCheckResult struct {
    Available    bool
    ConflictType string // "same_school" | "different_school" | ""
    IsGuest      *bool  // non-nil only when ConflictType == "same_school"
}

func (s *AuthService) CheckNickname(ctx context.Context, nickname, schoolCode string) (NicknameCheckResult, error) {
    school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
    if err != nil {
        return NicknameCheckResult{}, ErrSchoolNotFound
    }
    existing, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
    if ent.IsNotFound(err) {
        return NicknameCheckResult{Available: true}, nil
    }
    if err != nil {
        return NicknameCheckResult{}, err
    }
    existingSchool, _ := existing.QuerySchool().Only(ctx)
    if existingSchool != nil && existingSchool.ID == school.ID {
        isGuest := existing.IsGuest
        return NicknameCheckResult{Available: false, ConflictType: "same_school", IsGuest: &isGuest}, nil
    }
    return NicknameCheckResult{Available: false, ConflictType: "different_school"}, nil
}
```

---

### D-BE2 — handler: GET /auth/check-nickname

**File**: `backend/internal/handler/auth.go`

Add method:
```go
func (h *AuthHandler) CheckNickname(c echo.Context) error {
    nickname := c.QueryParam("nickname")
    schoolCode := c.QueryParam("school_code")
    if nickname == "" || schoolCode == "" {
        return echo.NewHTTPError(http.StatusBadRequest, "nickname and school_code are required")
    }
    result, err := h.auth.CheckNickname(c.Request().Context(), nickname, schoolCode)
    if err == service.ErrSchoolNotFound {
        return echo.NewHTTPError(http.StatusNotFound, "school not found")
    }
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    resp := map[string]any{"available": result.Available}
    if !result.Available {
        resp["conflict"] = result.ConflictType
        if result.ConflictType == "same_school" && result.IsGuest != nil {
            resp["is_guest"] = *result.IsGuest
        }
    }
    return c.JSON(http.StatusOK, resp)
}
```

**File**: `backend/cmd/server/main.go`

Register route (no auth middleware needed):
```go
auth.GET("/check-nickname", authHandler.CheckNickname)
```

---

### E-BE — service: GuestByQuestion with email binding

**File**: `backend/internal/service/auth.go`

Add error var:
```go
ErrEmailCodeRequired = errors.New("email_and_code_required")
```

Change `GuestByQuestion` signature and body:
```go
func (s *AuthService) GuestByQuestion(ctx context.Context, nickname, schoolCode, answer, emailAddr, code, ip, ua string) (access, refresh string, err error) {
    school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
    if err != nil {
        return "", "", ErrSchoolNotFound
    }
    // Validate answer
    questions := school.VerificationQuestions
    if len(questions) > 0 {
        expected := questions[0]["answer"]
        if !strings.EqualFold(strings.TrimSpace(answer), strings.TrimSpace(expected)) {
            return "", "", ErrWrongAnswer
        }
    }
    // Validate email code (schoolCode="" so any email is accepted)
    if emailAddr == "" || code == "" {
        return "", "", ErrEmailCodeRequired
    }
    normalizedEmail := strings.ToLower(strings.TrimSpace(emailAddr))
    s.mu.RLock()
    entry, ok := s.codes[normalizedEmail]
    s.mu.RUnlock()
    if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
        return "", "", ErrInvalidCode
    }
    s.mu.Lock()
    delete(s.codes, normalizedEmail)
    s.mu.Unlock()
    return s.findOrCreateGuest(ctx, nickname, school, &normalizedEmail, ip, ua)
}
```

**Note**: `SendEmailCode` with empty `schoolCode` already accepts any email — no change needed.

**File**: `backend/internal/handler/auth.go`

Update `Guest` handler, non-reauth question case:
```go
case "question":
    access, refresh, err = h.auth.GuestByQuestion(ctx, req.Nickname, req.SchoolCode, req.Answer, req.Email, req.Code, ip, ua)
```

Add error case in the `if err != nil` switch:
```go
case service.ErrEmailCodeRequired:
    return echo.NewHTTPError(http.StatusBadRequest, "email and code are required for question method")
```

---

### F-BE1 — service: conflict response includes is_guest

**File**: `backend/internal/service/auth.go`

Update `findOrCreateGuest` to return a richer conflict error. Since Go errors are strings, use a new error type:

Add after existing `var (...)`:
```go
// ErrNicknameConflictSameSchoolFormal: existing user is a registered (non-guest) user
ErrNicknameConflictSameSchoolFormal = errors.New("nickname_conflict_same_school_formal")
// ErrNicknameConflictSameSchoolGuest: existing user is a guest user
ErrNicknameConflictSameSchoolGuest = errors.New("nickname_conflict_same_school_guest")
```

Remove: `ErrNicknameConflictSameSchool` (replace all usages).

Update `findOrCreateGuest`:
```go
if existing != nil {
    existingSchool, _ := existing.QuerySchool().Only(ctx)
    if existingSchool != nil && existingSchool.ID == school.ID {
        if existing.IsGuest {
            return "", "", ErrNicknameConflictSameSchoolGuest
        }
        return "", "", ErrNicknameConflictSameSchoolFormal
    }
    return "", "", ErrNicknameConflictDifferentSchool
}
```

Update `createRegistered` similarly (same pattern):
```go
if existing != nil {
    existingSchool, _ := existing.QuerySchool().Only(ctx)
    if existingSchool != nil && existingSchool.ID == school.ID {
        if existing.IsGuest {
            return "", "", ErrNicknameConflictSameSchoolGuest
        }
        return "", "", ErrNicknameConflictSameSchoolFormal
    }
    return "", "", ErrNicknameConflictDifferentSchool
}
```

**File**: `backend/internal/handler/auth.go`

Update all `ErrNicknameConflictSameSchool` references to handle both new errors:
```go
case service.ErrNicknameConflictSameSchoolGuest:
    return c.JSON(http.StatusConflict, map[string]any{"conflict": "same_school", "is_guest": true})
case service.ErrNicknameConflictSameSchoolFormal:
    return c.JSON(http.StatusConflict, map[string]any{"conflict": "same_school", "is_guest": false})
```

Apply this change in: `Guest` handler and `RegisterDirect` handler (both have the same switch).

---

### F-BE2 — service+handler: POST /auth/claim-nickname

**File**: `backend/internal/service/auth.go`

Add method:
```go
var ErrEmailMismatch = errors.New("email_mismatch")

func (s *AuthService) ClaimNickname(ctx context.Context, nickname, schoolCode, emailAddr, code string) (access, refresh string, err error) {
    // Verify email code
    normalized := strings.ToLower(strings.TrimSpace(emailAddr))
    s.mu.RLock()
    entry, ok := s.codes[normalized]
    s.mu.RUnlock()
    if !ok || entry.code != code || time.Now().After(entry.expiresAt) {
        return "", "", ErrInvalidCode
    }
    s.mu.Lock()
    delete(s.codes, normalized)
    s.mu.Unlock()

    // Find target user
    school, err := s.db.School.Query().Where(entschool.Code(schoolCode)).Only(ctx)
    if err != nil {
        return "", "", ErrSchoolNotFound
    }
    user, err := s.db.User.Query().Where(entuser.Nickname(nickname)).Only(ctx)
    if err != nil {
        return "", "", errors.New("user not found")
    }
    // Verify bound email matches
    if user.Email == nil || strings.ToLower(*user.Email) != normalized {
        return "", "", ErrEmailMismatch
    }
    // Safety: only guest accounts can be claimed
    if !user.IsGuest {
        return "", "", ErrNicknameConflictSameSchoolFormal
    }
    // Verify school matches (prevent cross-school claim)
    existingSchool, _ := user.QuerySchool().Only(ctx)
    if existingSchool == nil || existingSchool.ID != school.ID {
        return "", "", errors.New("school mismatch")
    }

    return s.issueTokens(ctx, user)
}
```

**File**: `backend/internal/handler/auth.go`

Add:
```go
type claimNicknameRequest struct {
    Nickname   string `json:"nickname"`
    SchoolCode string `json:"school_code"`
    Email      string `json:"email"`
    Code       string `json:"code"`
}

func (h *AuthHandler) ClaimNickname(c echo.Context) error {
    var req claimNicknameRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if req.Nickname == "" || req.SchoolCode == "" || req.Email == "" || req.Code == "" {
        return echo.NewHTTPError(http.StatusBadRequest, "all fields required")
    }
    access, refresh, err := h.auth.ClaimNickname(c.Request().Context(), req.Nickname, req.SchoolCode, req.Email, req.Code)
    if err != nil {
        switch err {
        case service.ErrInvalidCode:
            return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired code")
        case service.ErrEmailMismatch:
            return c.JSON(http.StatusConflict, map[string]string{"conflict": "email_mismatch"})
        case service.ErrNicknameConflictSameSchoolFormal:
            return echo.NewHTTPError(http.StatusForbidden, "cannot claim formal user account")
        case service.ErrSchoolNotFound:
            return echo.NewHTTPError(http.StatusNotFound, "school not found")
        default:
            return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
        }
    }
    return c.JSON(http.StatusOK, map[string]string{
        "access_token":  access,
        "refresh_token": refresh,
    })
}
```

**File**: `backend/cmd/server/main.go`

Register (no auth middleware):
```go
auth.POST("/claim-nickname", authHandler.ClaimNickname)
```

---

### F-BE3 — handler: Remove deprecated reauth branch

**File**: `backend/internal/handler/auth.go`, `Guest` handler:

Remove the entire `if req.Reauth { ... }` block. Remove `Reauth bool` from `guestRequest` struct.

**File**: `backend/internal/service/auth.go`:

Remove methods: `ReauthByQuestion`, `ReauthByEmail`.

---

## Phase 3: Frontend — Wiring New Backend

### D-FE1 — api.ts: Add checkNickname + claimNickname

**File**: `frontend/lib/api.ts`

Add to `api.auth`:
```ts
checkNickname: (nickname: string, schoolCode: string) =>
  request<{ available: boolean; conflict?: "same_school" | "different_school"; is_guest?: boolean }>(
    `/auth/check-nickname?nickname=${encodeURIComponent(nickname)}&school_code=${encodeURIComponent(schoolCode)}`
  ),
claimNickname: async (body: {
  nickname: string
  school_code: string
  email: string
  code: string
}): Promise<TokenResponse | { conflict: "email_mismatch" }> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const res = await fetch(`${BASE}/auth/claim-nickname`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (res.status === 409) return res.json()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
  }
  return res.json()
},
```

Also update `ConflictResponse` type to include is_guest:
```ts
export interface ConflictResponse {
  conflict: "same_school" | "different_school"
  is_guest?: boolean
}
```

---

### D-FE2 — useVoteStore.ts: Add conflictIsGuest field

**File**: `frontend/hooks/useVoteStore.ts`

Add `conflictIsGuest: boolean` to state interface and initial state.

Update `setConflict` signature:
```ts
setConflict: (type: "same_school" | "different_school", nickname: string, isGuest?: boolean) => void
```

Update implementation:
```ts
setConflict: (conflictType, pendingNickname, isGuest) =>
  set({ conflictType, pendingNickname, conflictIsGuest: isGuest ?? false, step: "conflict" }),
```

---

### D-FE3 — Nickname.tsx: Pre-check before proceeding

**File**: `frontend/app/vote/steps/Nickname.tsx`

Add state: `const [loading, setLoading] = useState(false)`

Update `handleContinue`:
```ts
async function handleContinue() {
  const trimmed = nickname.trim()
  if (!trimmed) { setError("请输入昵称"); return }
  if (!school) return
  setLoading(true)
  setError("")
  try {
    const result = await api.auth.checkNickname(trimmed, school.code)
    if (result.available) {
      setNickname(trimmed)
      goTo("verify")
    } else if (result.conflict === "different_school") {
      setError("该昵称已被其他学校使用，请换一个昵称")
    } else if (result.conflict === "same_school") {
      if (!result.is_guest) {
        setError("该昵称已被正式用户注册，请登录或换一个昵称")
        // Show login link (see JSX below)
      } else {
        setNickname(trimmed)
        setConflict("same_school", trimmed, true)
      }
    }
  } catch {
    setError("检查昵称失败，请重试")
  } finally {
    setLoading(false)
  }
}
```

Add `setConflict` to destructured store values.

For the "正式用户" case, add a help text below `{error}` when error contains "正式用户":
```tsx
{error && error.includes("正式用户") && (
  <Link href="/auth/login" className="text-sm text-primary underline">
    前往登录
  </Link>
)}
```

Import `Link` from `"next/link"` and `api`, `APIError` from `"@/lib/api"`.

---

### E-FE — Verify.tsx: Question path adds email+code

**File**: `frontend/app/vote/steps/Verify.tsx`

Add states:
```ts
const [guestEmail, setGuestEmail] = useState("")
const [guestCode, setGuestCode] = useState("")
const [guestCodeSent, setGuestCodeSent] = useState(false)
```

Add `isValidEmail` helper (inline):
```ts
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
```

Add handler for question path email send code:
```ts
async function handleSendGuestCode() {
  setLoading(true)
  setError("")
  try {
    await api.auth.sendCode(guestEmail) // no schoolCode → any email
    setGuestCodeSent(true)
  } catch (err) {
    setError(err instanceof APIError ? err.message : "发送失败，请重试")
  } finally {
    setLoading(false)
  }
}
```

Update `handleSubmit` to pass email+code for question method:
```ts
const res = await api.auth.guest({
  nickname: pendingNickname,
  school_code: school.code,
  method,
  answer: method === "question" ? answer : undefined,
  email: method === "question" ? guestEmail : fullEmail,
  code: method === "question" ? guestCode : code,
})
```

Update JSX for question path — after the answer input, add:
```tsx
{method === "question" && (
  <div className="space-y-3">
    {/* existing answer field */}
    ...
    {/* new email fields */}
    <div className="space-y-1">
      <label className="text-sm font-medium">绑定邮箱</label>
      <p className="text-xs text-muted-foreground">用任意邮箱绑定账号，认领昵称时需要</p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="your@email.com"
          type="email"
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleSendGuestCode}
          disabled={!guestEmail || !isValidEmail(guestEmail) || loading}
        >
          {guestCodeSent ? "重新发送" : "发送验证码"}
        </Button>
      </div>
    </div>
    {guestCodeSent && (
      <div className="space-y-1">
        <label className="text-sm font-medium">验证码</label>
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="6位验证码"
          value={guestCode}
          onChange={(e) => setGuestCode(e.target.value)}
        />
      </div>
    )}
  </div>
)}
```

Update submit button `disabled`:
```ts
disabled={
  loading ||
  (method === "question" && (!answer || !guestEmail || !guestCodeSent || !guestCode)) ||
  (method === "email" && (!emailLocal || !codeSent || !code))
}
```

Also apply Module C email validation for the email path send-code button:
```ts
disabled={!emailLocal || !isValidEmail(fullEmail) || loading}
```

---

### F-FE — NicknameConflict.tsx: Full rewrite

**File**: `frontend/app/vote/steps/NicknameConflict.tsx`

Complete replacement:
```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { api, APIError, saveTokens } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVoteStore } from "@/hooks/useVoteStore"
import { useAuthStore } from "@/hooks/useAuthStore"

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export function NicknameConflict() {
  const { school, pendingNickname, conflictIsGuest, goTo } = useVoteStore()
  const refreshAuth = useAuthStore((s) => s.refresh)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Formal user conflict: no claim allowed
  if (!conflictIsGuest) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>昵称已被正式用户注册</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            「{pendingNickname}」这个昵称已被正式用户注册，无法认领。
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/auth/login">前往登录</Link>
            </Button>
            <Button variant="outline" onClick={() => goTo("nickname")}>
              ← 返回，换一个昵称
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Guest conflict: claim via bound email
  async function handleSendCode() {
    setLoading(true)
    setError("")
    try {
      await api.auth.sendCode(email)
      setCodeSent(true)
    } catch (err) {
      setError(err instanceof APIError ? err.message : "发送失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim() {
    if (!school) return
    setLoading(true)
    setError("")
    try {
      const res = await api.auth.claimNickname({
        nickname: pendingNickname,
        school_code: school.code,
        email,
        code,
      })
      if ("conflict" in res) {
        if (res.conflict === "email_mismatch") {
          setError("邮箱与账号绑定邮箱不符，请确认后重试")
        } else {
          setError("认领失败，请重试")
        }
        return
      }
      saveTokens(res.access_token, res.refresh_token)
      await refreshAuth()
      goTo("vote")
    } catch (err) {
      setError(err instanceof APIError ? err.message : "认领失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>昵称已被使用</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          「{pendingNickname}」这个昵称已被使用。如果这是你，请通过之前绑定的邮箱验证身份。
        </p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="输入之前绑定的邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendCode}
              disabled={!email || !isValidEmail(email) || loading}
            >
              {codeSent ? "重发" : "发送"}
            </Button>
          </div>
          {codeSent && (
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="6位验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          onClick={handleClaim}
          disabled={!codeSent || !code || loading}
        >
          {loading ? "验证中…" : "确认认领"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">或者</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => goTo("nickname")}>
          ← 返回，换一个昵称
        </Button>
      </CardContent>
    </Card>
  )
}
```

---

## PBT Properties

| Invariant | Falsification Strategy |
|-----------|----------------------|
| Guest creation via question must always bind email | Call GuestByQuestion with empty email → must return 400 |
| Claim must fail if email doesn't match bound email | Send code to attacker@evil.com, claim nickname with that code → must return 409 email_mismatch |
| Formal user nickname cannot be claimed | check-nickname returns is_guest=false → UI shows no claim option; direct claim-nickname call must return 403 |
| checkNickname(nick, school) = available → exactly one create can succeed (TOCTOU) | Concurrent guest creates with same nickname → DB unique constraint catches second attempt |
| Email storage always lowercase | Create guest with "User@Example.COM" → user.email = "user@example.com" |
| Logout clears vote step | Log in, reach vote step, logout, navigate to vote URL → store.step = "select-school" |
| SelectTrigger visible with min-w-[5rem] | Render Verify.tsx with 2 suffixes → ChevronDown icon visible in DOM |

---

## Checklist

**Phase 1 (Independent)**:
- [x] A1: TagInput prefix prop
- [x] B1: SelectTrigger CSS fix
- [x] C1: Email validation in 3 files
- [x] G1: Vote page catch reset
- [x] G2: NavActions logout reset

**Phase 2 (Backend)**:
- [x] D-BE: CheckNickname service method
- [x] D-BE2: GET /auth/check-nickname handler + route
- [x] E-BE: GuestByQuestion with email+code
- [x] F-BE1: Split ErrNicknameConflictSameSchool → Formal/Guest variants
- [x] F-BE2: ClaimNickname service + handler + route
- [x] F-BE3: Remove reauth branch + ReauthByQuestion/ReauthByEmail

**Phase 3 (Frontend)**:
- [x] D-FE1: api.ts checkNickname + claimNickname
- [x] D-FE2: useVoteStore conflictIsGuest field
- [x] D-FE3: Nickname.tsx pre-check
- [x] E-FE: Verify.tsx question email binding
- [x] F-FE: NicknameConflict.tsx full rewrite

**Post-review fixes**:
- [x] Verify.tsx submitDisabled: answer only required when question exists
- [x] RegisterByQuestion/RegisterByEmail/VerifyEmailCode: normalize email before code map lookup

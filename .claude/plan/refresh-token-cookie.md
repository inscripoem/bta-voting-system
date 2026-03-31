# 实施计划：Refresh Token with httpOnly Cookie

## 任务类型
- [x] 后端 (→ Codex)
- [x] 前端 (→ Gemini)
- [x] 全栈 (→ 并行)

## 技术方案

采用 **Stateless Cookie JWT** 方案，使用 httpOnly cookie 存储 JWT token，实现自动刷新机制。

### 核心改动

**后端：**
- 添加 cookie 配置项和辅助函数
- 修改所有认证端点返回 cookie 而非 JSON
- 添加 `/auth/refresh` 端点（从 cookie 读取 refresh_token）
- 修改 JWT 中间件支持从 cookie 读取（优先 cookie，兼容 header）
- 添加 `/auth/logout` 端点清除 cookie

**前端：**
- 移除所有 localStorage 操作
- 所有请求添加 `credentials: 'include'`
- 移除手动 Authorization header 设置
- 实现 401 自动刷新逻辑（单次重试，防死循环）
- 添加 logout 功能调用后端清除 cookie

### 安全策略

- **httpOnly cookie**：防止 XSS 攻击，JavaScript 无法访问
- **SameSite=Lax**：防止 CSRF 攻击（同站点部署）
- **Secure 属性**：确保 HTTPS 传输（生产环境）
- **Path 限制**：refresh_token 仅在 /api/v1/auth 路径有效

### Cookie 配置

| Cookie | HttpOnly | Secure | SameSite | Path | Max-Age |
|--------|----------|--------|----------|------|---------|
| access_token | true | true(prod) | Lax | / | 900 (15分钟) |
| refresh_token | true | true(prod) | Lax | /api/v1/auth | 604800 (7天) |

## 实施步骤

### 后端改动（7个步骤）

#### Step 1: 添加 Cookie 配置
**文件：** `backend/internal/config/config.go`

添加配置项：
```go
type Config struct {
    // ... 现有字段
    CookieSecure   bool   // 从 COOKIE_SECURE 读取，默认 true
    CookieSameSite string // 从 COOKIE_SAMESITE 读取，默认 "Lax"
    CookieDomain   string // 从 COOKIE_DOMAIN 读取，默认 ""
}
```

**预期产物：** 配置结构体支持 cookie 参数

---

#### Step 2: 添加 Cookie 辅助函数
**文件：** `backend/internal/handler/auth.go`

在 `AuthHandler` 结构体中添加方法：

```go
// setCookie sets an httpOnly cookie with security attributes
func (h *AuthHandler) setCookie(c echo.Context, name, value string, maxAge int, path string) {
    cookie := &http.Cookie{
        Name:     name,
        Value:    value,
        Path:     path,
        MaxAge:   maxAge,
        HttpOnly: true,
        Secure:   h.cfg.CookieSecure,
        SameSite: parseSameSite(h.cfg.CookieSameSite),
    }
    if h.cfg.CookieDomain != "" {
        cookie.Domain = h.cfg.CookieDomain
    }
    c.SetCookie(cookie)
}

// clearCookie clears a cookie by setting MaxAge to -1
func (h *AuthHandler) clearCookie(c echo.Context, name string, path string) {
    cookie := &http.Cookie{
        Name:     name,
        Value:    "",
        Path:     path,
        MaxAge:   -1,
        HttpOnly: true,
    }
    c.SetCookie(cookie)
}

// parseSameSite converts string to http.SameSite
func parseSameSite(s string) http.SameSite {
    switch s {
    case "Strict":
        return http.SameSiteStrictMode
    case "None":
        return http.SameSiteNoneMode
    default:
        return http.SameSiteLaxMode
    }
}
```

**预期产物：** Cookie 设置和清除的辅助函数

---

#### Step 3: 修改认证端点返回 Cookie
**文件：** `backend/internal/handler/auth.go`

修改以下方法，将 token 写入 cookie 而非返回 JSON：

**Login():**
```go
func (h *AuthHandler) Login(c echo.Context) error {
    var req loginRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    access, refresh, err := h.auth.Login(c.Request().Context(), req.Email, req.Password)
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
    }

    // 设置 cookie
    h.setCookie(c, "access_token", access, 900, "/")
    h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

    return c.JSON(http.StatusOK, map[string]string{"message": "success"})
}
```

**RegisterDirect()、Guest()、ClaimNickname():** 同样修改，设置 cookie 后返回 `{message: "success"}`

**Upgrade():** 重新签发 access cookie（因为 is_guest 已变化）

**预期产物：** 所有认证端点返回 cookie

---

#### Step 4: 添加 Refresh 端点
**文件：** `backend/internal/handler/auth.go`

新增方法：

```go
// Refresh refreshes the access token using the refresh token from cookie
func (h *AuthHandler) Refresh(c echo.Context) error {
    // 从 cookie 读取 refresh_token
    cookie, err := c.Cookie("refresh_token")
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "missing refresh token")
    }

    // 验证 refresh token
    userID, err := h.auth.JWT().ParseRefresh(cookie.Value)
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "invalid refresh token")
    }

    // 回库查询用户（确保最新 role/school/is_guest）
    user, err := h.auth.DB().User.Query().
        Where(entuser.ID(userID)).
        WithSchool().
        Only(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
    }

    // 生成新的 access + refresh token
    var schoolID *uuid.UUID
    if user.Edges.School != nil {
        sid := user.Edges.School.ID
        schoolID = &sid
    }

    access, err := h.auth.JWT().GenerateAccess(user.ID, user.Role, schoolID, user.IsGuest)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate access token")
    }

    refresh, err := h.auth.JWT().GenerateRefresh(user.ID)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate refresh token")
    }

    // 设置新 cookie
    h.setCookie(c, "access_token", access, 900, "/")
    h.setCookie(c, "refresh_token", refresh, 604800, "/api/v1/auth")

    return c.JSON(http.StatusOK, map[string]string{"message": "refreshed"})
}
```

**预期产物：** /auth/refresh 端点实现

---

#### Step 5: 添加 Logout 端点
**文件：** `backend/internal/handler/auth.go`

新增方法：

```go
// Logout clears the authentication cookies
func (h *AuthHandler) Logout(c echo.Context) error {
    h.clearCookie(c, "access_token", "/")
    h.clearCookie(c, "refresh_token", "/api/v1/auth")
    return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}
```

**预期产物：** /auth/logout 端点实现

---

#### Step 6: 修改 JWT 中间件支持 Cookie
**文件：** `backend/internal/middleware/auth.go`

修改 `JWT()` 中间件：

```go
func JWT(jwtSvc *service.JWTService) echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            var token string

            // 优先从 cookie 读取
            if cookie, err := c.Cookie("access_token"); err == nil {
                token = cookie.Value
            } else {
                // 回退到 Authorization header（向后兼容）
                header := c.Request().Header.Get("Authorization")
                if strings.HasPrefix(header, "Bearer ") {
                    token = strings.TrimPrefix(header, "Bearer ")
                }
            }

            if token == "" {
                return echo.NewHTTPError(http.StatusUnauthorized, "missing or invalid authorization")
            }

            claims, err := jwtSvc.ParseAccess(token)
            if err != nil {
                return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
            }
            c.Set(ClaimsKey, claims)
            return next(c)
        }
    }
}
```

**预期产物：** JWT 中间件支持 cookie 和 header

---

#### Step 7: 注册新路由
**文件：** `backend/cmd/server/main.go`

在路由注册部分添加：

```go
// Auth
v1.GET("/auth/check-nickname", authH.CheckNickname)
v1.POST("/auth/guest", authH.Guest)
v1.POST("/auth/claim-nickname", authH.ClaimNickname)
v1.POST("/auth/register", authH.RegisterDirect)
v1.POST("/auth/send-code", authH.SendCode)
v1.POST("/auth/login", authH.Login)
v1.POST("/auth/refresh", authH.Refresh)  // 新增：无需 JWT 中间件
v1.POST("/auth/upgrade", authH.Upgrade, jwtMW)
v1.POST("/auth/verify-email", authH.VerifyEmail, jwtMW)
v1.POST("/auth/logout", authH.Logout, jwtMW)  // 新增：需要 JWT 中间件
```

**预期产物：** 新路由注册完成

---

### 前端改动（5个步骤）

#### Step 8: 修改 API 客户端基础函数
**文件：** `frontend/lib/api.ts`

**删除：**
```typescript
export function saveTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access)
  localStorage.setItem("refresh_token", refresh)
}

export function clearTokens() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
}
```

**修改 request() 函数：**
```typescript
let isRefreshing = false
let refreshPromise: Promise<void> | null = null

async function refreshToken(): Promise<void> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) {
    throw new Error("Refresh failed")
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",  // 新增
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 401 && typeof window !== "undefined") {
    // 尝试刷新 token（单次）
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = refreshToken()
        .then(() => {
          isRefreshing = false
          refreshPromise = null
        })
        .catch(() => {
          isRefreshing = false
          refreshPromise = null
          // 刷新失败，跳转登录
          if (!window.location.pathname.startsWith("/auth/")) {
            const next = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.href = `/auth/login?next=${next}`
          }
          throw new APIError(401, "Unauthorized")
        })
    }

    // 等待刷新完成后重试
    if (refreshPromise) {
      await refreshPromise
      // 重试原请求
      return request<T>(path, init)
    }

    throw new APIError(401, "Unauthorized")
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
  }

  if (res.status === 204) {
    return null as unknown as T
  }

  return res.json() as Promise<T>
}
```

**修改 requestBlob() 函数：** 同样添加 `credentials: "include"`，移除 token 读取

**预期产物：** API 客户端支持 cookie 和自动刷新

---

#### Step 9: 修改认证 API 定义
**文件：** `frontend/lib/api.ts`

在 `api.auth` 中添加 logout：

```typescript
export const api = {
  // ... 现有代码
  auth: {
    // ... 现有方法
    logout: () =>
      request<{ message: string }>("/auth/logout", {
        method: "POST",
      }),
  },
  // ...
}
```

**预期产物：** logout API 定义

---

#### Step 10: 修改认证页面
**文件：** `frontend/app/auth/login/page.tsx`

修改 handleSubmit：

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)
  setLoading(true)

  try {
    await api.auth.login(email, password)  // 移除 saveTokens
    window.location.href = next
  } catch (err) {
    setError(err instanceof Error ? err.message : "登录失败")
  } finally {
    setLoading(false)
  }
}
```

**文件：** `frontend/app/auth/register/page.tsx`

同样移除 `saveTokens()` 调用

**预期产物：** 认证页面不再操作 localStorage

---

#### Step 11: 修改投票流程认证
**文件：** `frontend/app/vote/steps/Verify.tsx`

移除所有 `saveTokens()` 调用

**文件：** `frontend/app/vote/steps/NicknameConflict.tsx`

移除所有 `saveTokens()` 调用

**预期产物：** 投票流程不再操作 localStorage

---

#### Step 12: 添加 Logout 功能
**文件：** `frontend/components/NavActions.tsx`

修改 logout 处理：

```typescript
const handleLogout = async () => {
  try {
    await api.auth.logout()  // 调用后端清除 cookie
    // 清除前端状态
    if (typeof window !== "undefined") {
      // 清除 voteStore 等状态
      window.location.href = "/auth/login"
    }
  } catch (err) {
    console.error("Logout failed:", err)
    // 即使失败也跳转登录页
    window.location.href = "/auth/login"
  }
}
```

**预期产物：** Logout 功能完整

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| backend/internal/config/config.go | 修改 | 添加 cookie 配置项 |
| backend/internal/handler/auth.go | 修改 + 新增 | 添加 cookie 辅助函数、refresh/logout 端点，修改现有认证端点 |
| backend/internal/middleware/auth.go | 修改 | JWT 中间件支持从 cookie 读取 token |
| backend/cmd/server/main.go | 修改 | 注册 refresh 和 logout 路由 |
| frontend/lib/api.ts | 修改 | 移除 localStorage，添加 credentials，实现自动刷新 |
| frontend/app/auth/login/page.tsx | 修改 | 移除 saveTokens 调用 |
| frontend/app/auth/register/page.tsx | 修改 | 移除 saveTokens 调用 |
| frontend/app/vote/steps/Verify.tsx | 修改 | 移除 saveTokens 调用 |
| frontend/app/vote/steps/NicknameConflict.tsx | 修改 | 移除 saveTokens 调用 |
| frontend/components/NavActions.tsx | 修改 | 添加 logout 功能 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| CSRF 攻击 | 使用 SameSite=Lax（同站点部署）或补充 CSRF token（跨站点） |
| Cookie 大小限制（4KB） | JWT payload 已精简（约 200 字节），无风险 |
| 开发环境 HTTPS 要求 | Secure 属性根据环境动态设置（开发环境 false） |
| 刷新失败导致死循环 | 添加 isRefreshing 标志位，失败后不再重试 |
| 多标签页同步问题 | Cookie 自动同步，无需额外处理 |
| Refresh token 泄漏 | 7天窗口内有风险，后续可升级为 rotating token |
| 调试困难 | 提供开发模式下的 token 查看接口（可选）|
| 并发 401 请求 | 使用 refreshPromise 共享刷新过程 |

## 验收标准

- ✅ 所有认证流程正常（login/register/guest/upgrade/claim）
- ✅ Token 通过 httpOnly cookie 传输
- ✅ Access token 过期时自动刷新（用户无感知）
- ✅ Refresh token 过期时跳转登录
- ✅ Logout 正确清除 cookie
- ✅ 开发者工具无法读取 token（httpOnly）
- ✅ 跨域请求正常工作（credentials: include）
- ✅ 多标签页 token 自动同步
- ✅ 并发请求不会触发多次刷新

## 环境变量配置

需要在 `backend/.env` 中添加：

```bash
# Cookie 配置
COOKIE_SECURE=false  # 开发环境 false，生产环境 true
COOKIE_SAMESITE=Lax  # Lax | Strict | None
COOKIE_DOMAIN=       # 留空使用默认，跨子域时设置为 .example.com
```

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: 019d4015-4cb6-7ea1-a6c3-3c28ff0c4078
- GEMINI_SESSION: N/A (调用失败)

## 后续优化建议

1. **Rotating Refresh Token**：每次刷新时轮换 refresh token，提升安全性
2. **Token Reuse Detection**：检测 refresh token 重复使用，识别潜在攻击
3. **设备管理**：记录 refresh token 对应的设备信息，支持单设备登出
4. **主动刷新**：在 access token 即将过期前主动刷新，减少 401 延迟
5. **CSRF Token**：如果跨站点部署，补充 CSRF token 机制


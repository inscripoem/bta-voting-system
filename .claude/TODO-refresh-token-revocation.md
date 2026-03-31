# TODO: Refresh Token 撤销机制

## 优先级：High（安全增强）

## 问题描述

当前 refresh token 是无状态 JWT，存在以下安全风险：
- 一旦泄漏，攻击者可持续刷新 access token 长达 7 天
- 用户点击 logout 只清本地 cookie，无法让已泄漏 token 失效
- 无法实现"单设备登出"或"撤销所有会话"功能

## 实施方案

### 方案 A：Refresh Sessions 表（推荐）

**优点**：
- 完整的会话管理能力
- 支持设备管理、异常检测
- 可记录 IP、User-Agent 等元数据

**实施步骤**：

1. **创建数据库迁移**
```sql
CREATE TABLE refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_user_id (user_id),
    INDEX idx_jti (jti),
    INDEX idx_expires_at (expires_at)
);
```

2. **修改 Ent Schema**
```go
// backend/internal/ent/schema/refreshsession.go
type RefreshSession struct {
    ent.Schema
}

func (RefreshSession) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.UUID("user_id", uuid.UUID{}),
        field.String("jti").Unique(),
        field.Time("expires_at"),
        field.Bool("revoked").Default(false),
        field.String("ip_address").Optional(),
        field.String("user_agent").Optional(),
        field.Time("created_at").Default(time.Now),
    }
}

func (RefreshSession) Edges() []ent.Edge {
    return []ent.Edge{
        edge.From("user", User.Type).
            Ref("refresh_sessions").
            Field("user_id").
            Required().
            Unique(),
    }
}
```

3. **修改 JWT Service**
```go
// backend/internal/service/jwt.go

// GenerateRefresh 添加 jti
func (s *JWTService) GenerateRefresh(userID uuid.UUID, jti string) (string, error) {
    claims := jwt.RegisteredClaims{
        Subject:   userID.String(),
        ID:        jti,  // 添加 jti
        ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.refreshTTL)),
        IssuedAt:  jwt.NewNumericDate(time.Now()),
    }
    return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.refreshSecret)
}

// ParseRefresh 返回 userID 和 jti
func (s *JWTService) ParseRefresh(tokenStr string) (uuid.UUID, string, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (interface{}, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, errors.New("unexpected signing method")
        }
        return s.refreshSecret, nil
    })
    if err != nil {
        return uuid.Nil, "", err
    }
    if claims, ok := token.Claims.(*jwt.RegisteredClaims); ok && token.Valid {
        userID, err := uuid.Parse(claims.Subject)
        return userID, claims.ID, err
    }
    return uuid.Nil, "", errors.New("invalid refresh token")
}
```

4. **修改 Auth Service**
```go
// backend/internal/service/auth.go

// 登录/注册时创建 session
func (s *AuthService) createRefreshSession(ctx context.Context, userID uuid.UUID, ip, ua string) (string, error) {
    jti := uuid.New().String()

    // 创建 session 记录
    _, err := s.db.RefreshSession.Create().
        SetUserID(userID).
        SetJti(jti).
        SetExpiresAt(time.Now().Add(7 * 24 * time.Hour)).
        SetIPAddress(ip).
        SetUserAgent(ua).
        Save(ctx)
    if err != nil {
        return "", err
    }

    // 生成 token
    return s.jwt.GenerateRefresh(userID, jti)
}

// Refresh 时验证并轮换
func (s *AuthService) refreshSession(ctx context.Context, oldJti string, ip, ua string) (userID uuid.UUID, newRefreshToken string, err error) {
    // 查询 session
    session, err := s.db.RefreshSession.Query().
        Where(refreshsession.JtiEQ(oldJti)).
        Where(refreshsession.RevokedEQ(false)).
        Where(refreshsession.ExpiresAtGT(time.Now())).
        Only(ctx)
    if err != nil {
        return uuid.Nil, "", errors.New("invalid or expired refresh token")
    }

    // 撤销旧 session
    err = s.db.RefreshSession.UpdateOneID(session.ID).
        SetRevoked(true).
        Exec(ctx)
    if err != nil {
        return uuid.Nil, "", err
    }

    // 创建新 session
    newRefreshToken, err = s.createRefreshSession(ctx, session.UserID, ip, ua)
    return session.UserID, newRefreshToken, err
}
```

5. **修改 Refresh Handler**
```go
// backend/internal/handler/auth.go

func (h *AuthHandler) Refresh(c echo.Context) error {
    cookie, err := c.Cookie("refresh_token")
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "missing refresh token")
    }

    userID, oldJti, err := h.auth.JWT().ParseRefresh(cookie.Value)
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "invalid refresh token")
    }

    // 验证并轮换 session
    ip := c.RealIP()
    ua := c.Request().UserAgent()
    newUserID, newRefreshToken, err := h.auth.RefreshSession(c.Request().Context(), oldJti, ip, ua)
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, err.Error())
    }

    // 查询用户信息
    user, err := h.auth.DB().User.Query().
        Where(entuser.ID(newUserID)).
        WithSchool().
        Only(c.Request().Context())
    if err != nil {
        return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
    }

    // 生成新 access token
    var schoolID *uuid.UUID
    if user.Edges.School != nil {
        sid := user.Edges.School.ID
        schoolID = &sid
    }

    access, err := h.auth.JWT().GenerateAccess(user.ID, user.Role, schoolID, user.IsGuest)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate access token")
    }

    h.setCookie(c, "access_token", access, 900, "/")
    h.setCookie(c, "refresh_token", newRefreshToken, 604800, "/api/v1/auth")

    return c.JSON(http.StatusOK, map[string]string{"message": "refreshed"})
}
```

6. **修改 Logout Handler**
```go
// backend/internal/handler/auth.go

func (h *AuthHandler) Logout(c echo.Context) error {
    // 撤销 refresh session
    cookie, err := c.Cookie("refresh_token")
    if err == nil {
        _, jti, err := h.auth.JWT().ParseRefresh(cookie.Value)
        if err == nil {
            // 撤销 session（忽略错误，因为 cookie 可能已过期）
            _ = h.auth.RevokeRefreshSession(c.Request().Context(), jti)
        }
    }

    h.clearCookie(c, "access_token", "/")
    h.clearCookie(c, "refresh_token", "/api/v1/auth")
    return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}
```

7. **添加清理任务**
```go
// 定期清理过期 session
func (s *AuthService) CleanupExpiredSessions(ctx context.Context) error {
    _, err := s.db.RefreshSession.Delete().
        Where(refreshsession.ExpiresAtLT(time.Now())).
        Exec(ctx)
    return err
}
```

### 方案 B：Token Version（简化版）

**优点**：
- 实施简单，无需新表
- 可快速撤销用户所有 token

**缺点**：
- 无法单独撤销某个设备
- 无法记录会话元数据

**实施步骤**：

1. **修改 User Schema**
```go
field.Int("token_version").Default(0)
```

2. **Refresh 时验证 version**
```go
// 在 access token claims 中添加 version
// Refresh 时对比 DB 中的 version
// Logout 时递增 version
```

## 预估工作量

- 方案 A：2-3 小时（推荐）
- 方案 B：1 小时

## 相关文件

- `backend/internal/ent/schema/refreshsession.go`（新建）
- `backend/internal/service/jwt.go`
- `backend/internal/service/auth.go`
- `backend/internal/handler/auth.go`
- `backend/cmd/migrate/main.go`（添加迁移）

## 测试要点

- [ ] Refresh token 轮换后旧 token 失效
- [ ] Logout 后 refresh token 无法使用
- [ ] 并发 refresh 请求的处理
- [ ] 过期 session 的清理
- [ ] Token reuse detection（可选）

## 参考资料

- [OWASP: JSON Web Token Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [RFC 6749: OAuth 2.0 - Refresh Tokens](https://datatracker.ietf.org/doc/html/rfc6749#section-1.5)

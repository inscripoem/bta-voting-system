# 大二杯投票平台设计文档

> 创建日期：2026-02-28
> 基于策划案：第二届"大二杯"2025年度人气动画评选策划案

---

## 一、整体架构

### 部署方案

前端部署于 Vercel（CDN 全球加速），后端与数据库部署于自托管服务器（Docker）。

```
用户浏览器
    │
    ▼
Vercel CDN（Next.js 15 前端）
    │ HTTPS + CORS
    ▼
自托管服务器（Docker）
    ├── Go + Echo API        api.bta.<domain>
    ├── PostgreSQL
    └── gocloud.dev/blob（封面图存储）
```

### 仓库结构

Monorepo，两个子目录：

```
bta-voting-system/
├── frontend/   # Next.js 15
└── backend/    # Go + Echo
```

前后端通过 OpenAPI 契约共享类型定义。

### 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 15 App Router |
| 前端 UI | shadcn/ui (new-york) + Tailwind CSS + Framer Motion |
| 后端框架 | Go + Echo |
| ORM | ent（audit 字段用 Mixin） |
| 数据库 | PostgreSQL |
| 日志 | slog |
| 邮件 | Resend / SMTP（可配置切换） |
| 图片存储 | gocloud.dev/blob |
| 配置 | 环境变量 |
| 包管理（前端） | Bun |

---

## 二、数据库模型

### User

```
User
├── id (uuid)
├── nickname (unique)           // 所有用户全局唯一
├── email (nullable)            // Path B 验证后存教育邮箱；升级后存任意邮箱
├── password_hash (nullable)    // 升级为正式用户后设置
├── role: voter | school_admin | super_admin
├── school_id (FK → School, nullable)  // 通过验证后绑定，不可更改
├── is_guest: bool
└── [audit mixin: created_at, updated_at]
```

### School

```
School
├── id (uuid)
├── name
├── code (unique)               // 短标识符，如 "pku"
├── email_suffixes: JSON        // ["@pku.edu.cn", "@stu.pku.edu.cn"]
├── verification_questions: JSON // [{question: string, answer: string}]
│                                // answer 明文存储，验证时直接比对
├── is_active: bool
└── [audit mixin]
```

### VotingSession

```
VotingSession
├── id (uuid)
├── year: int                   // e.g. 2025
├── name                        // e.g. "第二届大二杯"
├── status: pending | active | counting | published
│           待开始    投票中    计票中      已公布
│           （状态由 super_admin 手动切换，无开始/结束时间字段）
└── [audit mixin]
```

### Award

```
Award
├── id (uuid)
├── session_id (FK → VotingSession)
├── school_id (FK → School, nullable)   // null=全体学校；非null=该校娱乐奖项
├── name
├── description
├── category: mandatory | optional | entertainment
│             必填正赛   选填正赛   学校娱乐
├── score_config: JSON
│   {
│     "allowed_scores": [1, 0, -1],   // 1=支持, 0=没看过, -1=不支持
│     "max_count": { "1": 4 }         // score=1 最多投 4 个
│   }
├── display_order: int
└── [audit mixin]
```

### Nominee

```
Nominee
├── id (uuid)
├── award_id (FK → Award)
├── name
├── cover_image_key             // gocloud.dev/blob object key
├── description
├── display_order: int
└── [audit mixin]
```

### VoteItem

核心投票记录，一用户一提名一条。

```
VoteItem
├── id (uuid)
├── user_id (FK → User)
├── session_id (FK → VotingSession)
├── school_id (FK → School)     // 冗余自 user.school_id，方便导出时免 JOIN
├── award_id (FK → Award)
├── nominee_id (FK → Nominee)
├── score: int                  // 按 award.score_config.allowed_scores 取值
├── ip_address: string          // 最后一次写入的 IP（IPv6 截取前缀）
├── user_agent: string          // 最后一次写入的 UA
└── [audit mixin: created_at, updated_at]

唯一索引：(user_id, nominee_id, session_id)
```

计票查询：
```sql
SELECT award_id, nominee_id, SUM(score) AS total
FROM vote_items
WHERE session_id = ?
GROUP BY award_id, nominee_id
ORDER BY award_id, total DESC
```

---

## 三、用户流程

### 3.1 投票流程（前端 multi-step）

```
Step 1  选择学校

Step 2  输入昵称 + 选择验证方式
        Path A  回答验证题（学校配置的题目，answer 明文比对）
        Path B  输入教育邮箱（须匹配 school.email_suffixes）→ 收验证码

        验证通过后：
          昵称不存在          → 创建 guest user，绑定 school_id，颁发 JWT
          昵称存在 + 同学校   → 昵称冲突页（见 3.2）
          昵称存在 + 不同学校 → 报错"昵称已被使用，请换一个"
                               （不暴露该昵称属于哪所学校）

Step 3  投票页面
        · mandatory awards：全部展示，无折叠
        · optional awards：默认展示前 3 个，"展开全部 (N)" 按钮
        · entertainment awards（本校）：默认展示前 3 个，"展开全部 (N)" 按钮
        · 每个奖项实时校验：score=1 不超过 max_count["1"]
        · 每次改动自动保存（PUT /api/v1/vote/items）

Step 4  完成页
        · 所有 mandatory awards 已作答即视为完成
        · 投票结束前可随时回来修改
```

### 3.2 昵称冲突页（同学校）

```
┌──────────────────────────────────────┐
│  「xxx」这个昵称已被使用              │
│  如果这是你，请重新验证身份           │
│                                      │
│  [重新验证身份]                       │
│                                      │
│  ─── 或者 ───                        │
│                                      │
│  [← 返回，换一个昵称]                │
└──────────────────────────────────────┘
```

重新验证方式与原账号一致：
- 原账号 email 为空（Path A）→ 重新回答验证题
- 原账号 email 非空（Path B）→ 向已存档邮箱重新发验证码

### 3.3 账户升级流程（guest → registered）

```
账户页 → 填写任意邮箱（无后缀限制）
       → Resend/SMTP 发验证邮件
       → 点击链接确认
       → 设置密码
       → is_guest = false，email 更新为本次填写的邮箱
       → 历年 VoteItems 全部保留
```

Path B guest 升级时可保留原教育邮箱也可更换，一律重走完整邮件验证。

---

## 四、API 设计

### 认证

```
POST /api/v1/auth/guest            // 验证通过 → 创建/登入 guest，返回 JWT
POST /api/v1/auth/login            // 正式用户密码登录
POST /api/v1/auth/refresh          // 刷新 JWT
POST /api/v1/auth/upgrade          // 申请升级：发验证邮件（任意邮箱）
GET  /api/v1/auth/verify-email     // 邮件链接回调，完成升级
```

### 公开数据

```
GET  /api/v1/sessions/current      // 当前届信息（status、year、name）
GET  /api/v1/schools               // 学校列表（id、name）
GET  /api/v1/schools/:id           // 含 verification_questions（只返回 question，不含 answer）
GET  /api/v1/awards                // 当届奖项 + nominees
GET  /api/v1/awards?school_id=x    // 含该校 entertainment awards
```

### 投票（需 JWT）

```
GET    /api/v1/vote/items          // 获取当前用户本届所有 VoteItems
PUT    /api/v1/vote/items          // 批量 upsert VoteItems（草稿自动保存）
DELETE /api/v1/vote/items/:id      // 撤回某一条（用户改回"未作答"时调用）
```

### 结果（status=published 后公开）

```
GET  /api/v1/results               // 各奖项得分汇总（nominee_id, award_id, total_score）
```

### 用户

```
GET   /api/v1/me                   // 当前用户信息
PATCH /api/v1/me                   // 修改昵称等
```

### 管理端

```
// 投票控制（super_admin）
PATCH  /api/v1/admin/sessions/current/status

// 学校管理
GET    /api/v1/admin/schools                       // super_admin
POST   /api/v1/admin/schools                       // super_admin
PATCH  /api/v1/admin/schools/:id                   // super_admin 全字段；
                                                   // school_admin 限 email_suffixes、verification_questions
// 奖项管理
GET    /api/v1/admin/awards                        // super_admin
POST   /api/v1/admin/awards                        // super_admin（mandatory / optional）
POST   /api/v1/admin/schools/:id/awards            // school_admin（entertainment）
PATCH  /api/v1/admin/awards/:id                    // 各自权限范围内
POST   /api/v1/admin/awards/:id/nominees           // 各自权限范围内
PATCH  /api/v1/admin/nominees/:id

// 数据导出
GET    /api/v1/admin/votes/export?school_id=x      // school_admin 限本校；super_admin 全量
```

---

## 五、前端页面路由

```
/                  首页（活动介绍、当前状态）
/vote              投票入口（学校选择 → 验证 → 投票）
/results           结果页（status=published 后解锁，复用上届可视化组件）
/account           账户页（升级、历史记录）
/admin             管理后台（role 鉴权）
  /admin/schools   学校管理
  /admin/awards    奖项管理
  /admin/session   投票状态控制
  /admin/export    数据导出
```

---

## 六、邮件发送

通过环境变量切换实现，Go 侧定义 `EmailSender` interface：

```
EMAIL_PROVIDER=resend  → Resend SDK
EMAIL_PROVIDER=smtp    → net/smtp（需配置 SMTP_HOST / PORT / USER / PASS）
```

---

## 七、设计约束与说明

- 每个自然人只能参与一所学校的投票，`user.school_id` 绑定后不可更改
- 投票期间 VoteItems 可随时修改，voting session 结束时刻的状态为最终结果
- VoteItem 记录最后写入的 IP（IPv6 截取 /48 前缀）和 UA，供学校负责人导出核查
- 学校娱乐奖项（`award.school_id` 非空）仅对该校用户可见和可投
- 管理后台与投票前台共用同一 Next.js 应用，通过 JWT role 字段鉴权
- 上届结果可视化组件（`bta-2024-visualization-next`）在 `/results` 页面复用，保持设计风格一致

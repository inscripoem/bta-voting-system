# BTA 投票系统生产部署指南

本文档提供完整的生产环境部署流程，包括后端（Docker Compose）和前端（Vercel）的配置说明。

## 部署架构

```
┌─────────────────┐         HTTPS          ┌──────────────────────┐
│  前端 (Vercel)  │ ◄──────────────────────► │  后端 (Docker)       │
│  Next.js App    │                          │  Go API + PostgreSQL │
│  自动 HTTPS/CDN │                          │  你的服务器          │
└─────────────────┘                          └──────────────────────┘
```

- **前端**：部署到 Vercel，自动 HTTPS、全球 CDN
- **后端**：Docker Compose 部署到你的服务器，包含 Go API + PostgreSQL

---

## Part 1: 后端部署（Docker Compose）

### 1.1 服务器准备

**最低配置要求：**
- CPU: 2 核
- 内存: 4GB
- 磁盘: 20GB
- 操作系统: Ubuntu 20.04+ / Debian 11+ / CentOS 8+

**安装 Docker 和 Docker Compose：**

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# 验证安装
docker --version
docker compose version
```

### 1.2 配置文件准备

**1) 克隆代码到服务器：**

```bash
git clone https://github.com/your-org/bta-voting-system.git
cd bta-voting-system
```

**2) 创建生产环境配置文件：**

```bash
cp backend/.env.production.example backend/.env.production
```

**3) 编辑 `backend/.env.production`，修改以下必填项：**

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | 数据库密码（修改 `CHANGE_ME_STRONG_PASSWORD`） | `postgres://bta:MyStr0ngP@ssw0rd@db:5432/bta_voting?sslmode=disable` |
| `JWT_SECRET` | JWT 签名密钥（运行 `openssl rand -hex 32`） | `a1b2c3d4e5f6...` |
| `JWT_REFRESH_SECRET` | JWT 刷新密钥（运行 `openssl rand -hex 32`，与上面不同） | `f6e5d4c3b2a1...` |
| `FRONTEND_URL` | Vercel 前端域名 | `https://bta-voting.vercel.app` |
| `BACKEND_BASE_URL` | 后端公网访问地址 | `https://api.yourdomain.com` |
| `EMAIL_FROM` | 发件人邮箱 | `noreply@yourdomain.com` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | SMTP 邮件服务器配置 | 根据你的邮件服务商填写 |

**生成强密钥：**
```bash
# 方式一：使用 task 命令（推荐）
task gen:jwt-secrets

# 方式二：手动生成
# 生成 JWT_SECRET
openssl rand -hex 32

# 生成 JWT_REFRESH_SECRET（再运行一次，使用不同的值）
openssl rand -hex 32
```

**4) 创建 `.env` 文件（用于 docker-compose）：**

```bash
cat > .env << EOF
POSTGRES_USER=bta
POSTGRES_PASSWORD=MyStr0ngP@ssw0rd
POSTGRES_DB=bta_voting
DB_PORT=5432
BACKEND_PORT=8080
EOF
```

⚠️ **注意**：`.env` 中的 `POSTGRES_PASSWORD` 必须与 `backend/.env.production` 中 `DATABASE_URL` 的密码一致。

### 1.3 启动服务

**首次启动前，创建数据目录：**

```bash
# 创建数据持久化目录
mkdir -p data/postgres data/uploads

# 设置权限（PostgreSQL 需要特定权限）
chmod 700 data/postgres
```

```bash
# 构建并启动容器（后台运行）
docker compose -f docker-compose.prod.yml up -d --build

# 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 查看服务状态
docker compose -f docker-compose.prod.yml ps
```

### 1.4 获取 super_admin 密码

首次启动时，系统会自动创建 super_admin 账户，密码会输出到日志中：

```bash
# 查看后端日志，找到 super_admin 密码
docker compose -f docker-compose.prod.yml logs backend | grep "super_admin created"
```

输出示例：
```
[INIT] super_admin created: email=admin@bta.local password=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

⚠️ **重要**：请立即保存此密码，后续无法再次查看。

### 1.5 验证部署

```bash
# 测试后端 API
curl http://localhost:8080/api/v1/sessions/current

# 预期返回（如果还没有会话数据）：
# {"data":null}
```

### 1.6 配置反向代理（可选）

如果需要通过域名访问后端，配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后配置 SSL 证书（推荐使用 Let's Encrypt）：

```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## Part 2: 前端部署（Vercel）

### 2.1 连接 GitHub 仓库

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New Project"
3. 选择你的 GitHub 仓库 `bta-voting-system`
4. Vercel 会自动检测到 Next.js 项目

### 2.2 配置构建设置

**Root Directory:** `frontend`

**Build Command:** `bun run build`

**Output Directory:** `.next`

**Install Command:** `bun install`

### 2.3 配置环境变量

在 Vercel 项目设置中，添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api/v1` | 后端 API 地址 |

⚠️ **注意**：
- 如果后端没有配置域名，可以使用 `http://your-server-ip:8080/api/v1`
- 但强烈建议配置 HTTPS 域名，否则浏览器可能阻止跨域请求

### 2.4 部署

点击 "Deploy" 按钮，Vercel 会自动：
1. 安装依赖（`bun install`）
2. 构建项目（`bun run build`）
3. 部署到全球 CDN
4. 分配一个 `*.vercel.app` 域名

### 2.5 配置自定义域名（可选）

1. 在 Vercel 项目设置中，进入 "Domains"
2. 添加你的域名（如 `bta-voting.yourdomain.com`）
3. 按照提示配置 DNS 记录（CNAME 或 A 记录）
4. Vercel 会自动配置 SSL 证书

### 2.6 更新后端 CORS 配置

部署完成后，将 Vercel 域名添加到后端的 `FRONTEND_URL`：

```bash
# 编辑 backend/.env.production
FRONTEND_URL=https://bta-voting.vercel.app

# 如果有自定义域名，也需要添加
# 注意：后端目前只支持单个域名，如果需要多个域名，需要修改代码
```

重启后端服务：
```bash
docker compose -f docker-compose.prod.yml restart backend
```

---

## Part 3: 首次使用

### 3.1 登录管理后台

1. 访问前端地址：`https://your-vercel-domain.vercel.app`
2. 使用 super_admin 账户登录：
   - 邮箱：`admin@bta.local`
   - 密码：（从后端日志中获取）

### 3.2 创建基础数据

登录后，依次创建：

1. **学校**：进入"学校管理"，添加真实的学校信息
2. **投票会话**：进入"投票会话"，创建年度投票会话
3. **奖项**：进入"奖项管理"，为会话添加奖项
4. **提名**：为每个奖项添加提名作品

### 3.3 开放投票

在"投票会话"中，将会话状态改为 `active`，用户即可开始投票。

---

## Part 4: 数据备份与恢复

### 4.1 数据目录结构

生产环境的所有数据存储在项目根目录的 `data/` 文件夹中：

```
bta-voting-system/
├── data/
│   ├── postgres/      # PostgreSQL 数据库文件
│   └── uploads/       # 用户上传的文件（封面图等）
├── backend/
├── frontend/
└── docker-compose.prod.yml
```

**优势：**
- 所有数据集中在一个目录，方便备份和迁移
- 可以直接打包整个 `data/` 目录进行迁移
- 不依赖 Docker 的 named volumes

### 4.2 完整备份（推荐）

**备份整个 data 目录：**

```bash
# 停止服务（可选，确保数据一致性）
docker compose -f docker-compose.prod.yml stop

# 打包备份
tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz data/

# 重启服务
docker compose -f docker-compose.prod.yml start
```

**恢复备份：**

```bash
# 停止服务
docker compose -f docker-compose.prod.yml down

# 解压备份（会覆盖现有 data/ 目录）
tar -xzf backup_20260403_020000.tar.gz

# 启动服务
docker compose -f docker-compose.prod.yml up -d
```

### 4.3 数据库单独备份

**使用 pg_dump 备份：**

```bash
# 备份数据库
docker exec bta-db pg_dump -U bta bta_voting > backup_$(date +%Y%m%d_%H%M%S).sql

# 定期备份（添加到 crontab）
0 2 * * * cd /path/to/bta-voting-system && docker exec bta-db pg_dump -U bta bta_voting > backups/backup_$(date +\%Y\%m\%d).sql
```

**恢复数据库：**

```bash
# 恢复数据库
docker exec -i bta-db psql -U bta bta_voting < backup_20260403_020000.sql
```

### 4.4 迁移到新服务器

**方式一：完整迁移（推荐）**

在旧服务器上：
```bash
# 停止服务
docker compose -f docker-compose.prod.yml down

# 打包整个项目（包含代码和数据）
cd ..
tar -czf bta-voting-system.tar.gz bta-voting-system/

# 传输到新服务器
scp bta-voting-system.tar.gz user@new-server:/path/to/
```

在新服务器上：
```bash
# 解压
tar -xzf bta-voting-system.tar.gz
cd bta-voting-system

# 启动服务
docker compose -f docker-compose.prod.yml up -d
```

**方式二：仅迁移数据**

在旧服务器上：
```bash
# 打包数据目录
tar -czf data-backup.tar.gz data/

# 传输到新服务器
scp data-backup.tar.gz user@new-server:/path/to/bta-voting-system/
```

在新服务器上：
```bash
# 克隆代码
git clone https://github.com/your-org/bta-voting-system.git
cd bta-voting-system

# 解压数据
tar -xzf data-backup.tar.gz

# 配置环境变量
cp backend/.env.production.example backend/.env.production
# 编辑 backend/.env.production

# 启动服务
docker compose -f docker-compose.prod.yml up -d
```

### 4.5 上传文件单独备份

```bash
# 备份 uploads 目录
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz data/uploads/

# 恢复 uploads 目录
tar -xzf uploads_backup_20260403.tar.gz
```

---

## Part 5: 常见问题

### 5.1 前端无法连接后端

**症状**：前端页面加载正常，但无法获取数据

**排查步骤**：
1. 检查 Vercel 环境变量 `NEXT_PUBLIC_API_URL` 是否正确
2. 检查后端 `FRONTEND_URL` 是否包含 Vercel 域名
3. 检查后端服务是否正常运行：`docker compose -f docker-compose.prod.yml ps`
4. 检查后端日志：`docker compose -f docker-compose.prod.yml logs backend`
5. 测试后端 API：`curl https://api.yourdomain.com/api/v1/sessions/current`

### 5.2 邮件发送失败

**症状**：用户无法收到验证邮件

**排查步骤**：
1. 检查 `backend/.env.production` 中的邮件配置
2. 测试 SMTP 连接：
   ```bash
   docker exec -it bta-backend sh
   # 在容器内测试 SMTP 连接
   ```
3. 查看后端日志中的邮件发送错误

### 5.3 数据库连接失败

**症状**：后端启动失败，日志显示数据库连接错误

**排查步骤**：
1. 检查 `.env` 和 `backend/.env.production` 中的数据库密码是否一致
2. 检查数据库容器是否正常运行：`docker compose -f docker-compose.prod.yml ps db`
3. 检查数据库日志：`docker compose -f docker-compose.prod.yml logs db`

### 5.4 忘记 super_admin 密码

**解决方法**：

```bash
# 1. 停止后端服务
docker compose -f docker-compose.prod.yml stop backend

# 2. 删除 super_admin 用户（通过数据库）
docker exec -it bta-db psql -U bta bta_voting -c "DELETE FROM users WHERE email='admin@bta.local';"

# 3. 重启后端服务（会自动重新创建 super_admin）
docker compose -f docker-compose.prod.yml start backend

# 4. 查看新密码
docker compose -f docker-compose.prod.yml logs backend | grep "super_admin created"
```

---

## Part 6: 更新部署

### 6.1 更新后端

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建并启动
docker compose -f docker-compose.prod.yml up -d --build backend

# 3. 查看日志确认启动成功
docker compose -f docker-compose.prod.yml logs -f backend
```

### 6.2 更新前端

Vercel 会自动监听 GitHub 仓库的 push 事件：

1. 推送代码到 `main` 分支
2. Vercel 自动触发构建和部署
3. 访问 Vercel Dashboard 查看部署状态

**手动触发部署**：
- 在 Vercel Dashboard 中点击 "Redeploy"

---

## Part 7: 监控与日志

### 7.1 查看日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 查看后端日志
docker compose -f docker-compose.prod.yml logs -f backend

# 查看数据库日志
docker compose -f docker-compose.prod.yml logs -f db
```

### 7.2 监控资源使用

```bash
# 查看容器资源使用情况
docker stats bta-backend bta-db
```

### 7.3 健康检查

```bash
# 检查服务健康状态
docker compose -f docker-compose.prod.yml ps

# 测试后端 API
curl https://api.yourdomain.com/api/v1/sessions/current
```

---

## 附录：完整的环境变量清单

### 后端环境变量（`backend/.env.production`）

```bash
# 数据库
DATABASE_URL=postgres://bta:PASSWORD@db:5432/bta_voting?sslmode=disable

# JWT
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

# 邮件
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply@yourdomain.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password

# 文件存储
BLOB_PROVIDER=file
BLOB_FILE_PATH=./uploads

# 服务器
SERVER_PORT=8080
FRONTEND_URL=https://your-vercel-domain.vercel.app
BACKEND_BASE_URL=https://api.yourdomain.com
UPLOAD_DIR=./uploads

# Cookie
COOKIE_SECURE=true
COOKIE_SAMESITE=Lax
COOKIE_DOMAIN=
```

### Docker Compose 环境变量（`.env`）

```bash
POSTGRES_USER=bta
POSTGRES_PASSWORD=<与 DATABASE_URL 中的密码一致>
POSTGRES_DB=bta_voting
DB_PORT=5432
BACKEND_PORT=8080
```

### Vercel 环境变量

```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

---

## 支持

如有问题，请提交 Issue 到 GitHub 仓库。

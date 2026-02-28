# DX 增强设计文档

> 创建日期：2026-02-28

## 概述

对项目进行五项开发体验（DX）增强：环境变量文档化、Docker 构建修复、Air 热重载、统一构建系统。

---

## 任务 1 & 2：`backend/.env.example` 注释完善

**问题**：当前 `.env.example` 无任何说明，新开发者不知道如何填写各字段，尤其是邮件相关配置。

**方案**：为每个变量添加中文注释，说明：
- `EMAIL_PROVIDER` 的两个合法值（`smtp` / `resend`）及切换逻辑
- `EMAIL_FROM` 是所有外发邮件的发件人地址（已在代码中实现，补充文档）
- SMTP vs Resend 分组，注明哪些字段在哪种 provider 下生效
- JWT 密钥需使用强随机值（生产环境）
- `BLOB_PROVIDER` 的选项说明

---

## 任务 3：修复 Docker 构建 + 中国网络支持

**问题**：
1. `backend/Dockerfile` 使用 `golang:1.23-alpine`，但 `go.mod` 要求 `go 1.24.2`，版本不匹配导致构建失败
2. 未设置 `GOPROXY`，中国大陆网络下拉取 Go 依赖超时

**方案**：
- 将基础镜像升级为 `golang:1.24-alpine`
- 在 `go mod download` 前设置 `GOPROXY=https://goproxy.cn,direct`
- 运行 `docker compose build` 验证修复

---

## 任务 4：Air 热重载（`go tool` 模式）

**方案**：使用 Go 1.24 新增的 `tool` 指令管理开发工具依赖：

```
go get -tool github.com/air-verse/air@latest
```

- `go.mod` 新增 `tool github.com/air-verse/air` 行
- 开发者无需全局安装 air，用 `go tool air` 启动
- 新增 `backend/.air.toml`：监听 `.go` 文件变化，重新构建并运行 `cmd/server`

---

## 任务 5：统一构建系统（Taskfile）

**选型**：Taskfile（`taskfile.dev`）
- 跨平台（Linux/macOS/Windows 原生支持）
- YAML 格式，支持 `dev:frontend` 命名风格
- 支持 `dir:` 键，无需 `cd && cmd` shell 语法，天然跨平台

**Taskfile 结构**（项目根目录 `Taskfile.yml`）：

| 任务 | 说明 |
|---|---|
| `task dev:backend` | 后端开发服务器（`go tool air`）|
| `task dev:frontend` | 前端开发服务器（`bun dev`）|
| `task docker:build` | `docker compose build` |
| `task docker:up` | `docker compose up` |
| `task db:migrate` | 运行数据库迁移 |
| `task test` | 运行后端测试 |

安装方式（也可加入 README）：
```bash
go install github.com/go-task/task/v3/cmd/task@latest
```

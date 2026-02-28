# Contributing to BTA Voting System

## Spec 体系

本项目使用 OpenSpec 管理需求边界。`openspec/specs/` 下的每个目录对应一个核心能力，每个 `spec.md` 记录该能力的约束集（SHALL 语句 + 场景）。

**提交新功能前必须：**

1. 找到对应的 `openspec/specs/<capability>/spec.md`
2. 在文件中以 `## ADDED` 或 `## MODIFIED` 节声明新约束或变更约束
3. 将 spec delta 与实现代码一起提交，保持约束与实现同步

示例：新增"支持微信邮箱后缀验证"须在 `openspec/specs/school-verification/spec.md` 下添加对应 Requirement。

## 开发流程

1. Fork 并创建 feature 分支
2. 更新对应 spec（如有新能力边界）
3. 实现功能，确保代码与 spec 约束一致
4. 本地验证 Smoke Test 清单（见 README.md）
5. 提交 PR，描述中注明影响的 spec 路径

## 角色与权限约定

- `super_admin`：全量 CRUD，状态机推进
- `school_admin`：仅本校数据，仅 `entertainment` 奖项管理
- `voter`：仅投票端点，无管理权限

跨角色越权访问 MUST 返回 HTTP 403，不得通过过滤隐式忽略。

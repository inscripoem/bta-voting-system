## 1. Spec 归档（将 changes 迁移至 specs 目录）

- [ ] 1.1 运行 `openspec apply --change baseline-project-spec` 将所有 spec 归档到 `openspec/specs/`
- [ ] 1.2 验证 `openspec/specs/` 下存在 7 个能力目录：`user-auth`、`school-verification`、`voting`、`account-management`、`admin-management`、`data-export`、`results-display`
- [ ] 1.3 验证每个目录下含 `spec.md`，内容与 change 阶段一致

## 2. 后端约束验证

- [ ] 2.1 确认 `user-auth` spec：`internal/service/auth.go` 中昵称冲突（同校/跨校）返回正确 HTTP 状态码
- [ ] 2.2 确认 `school-verification` spec：`internal/handler/school.go` 返回 `verification_questions` 时不含 `answer` 字段
- [ ] 2.3 确认 `voting` spec：`internal/service/vote.go` 对 `score_config.allowed_scores` 和 `max_count["1"]` 的校验逻辑存在
- [ ] 2.4 确认 `admin-management` spec：`internal/middleware/auth.go` 对 `school_admin` 访问他校资源返回 HTTP 403
- [ ] 2.5 确认 `data-export` spec：`internal/handler/admin.go` 导出 CSV 使用 UTF-8 with BOM 编码
- [ ] 2.6 确认 `results-display` spec：`GET /api/v1/results` 在 `status != published` 时返回 HTTP 403

## 3. 前端约束验证

- [ ] 3.1 确认 `voting` spec：`app/vote/steps/VoteForm.tsx` 在 `optional`/`entertainment` 奖项默认仅展示前 3 个
- [ ] 3.2 确认 `voting` spec：`hooks/useVoteStore.ts` 在评分变更时自动触发 `PUT /api/v1/vote/items`
- [ ] 3.3 确认 `results-display` spec：`app/results/page.tsx` 在非 `published` 状态显示占位页

## 4. 文档补全

- [ ] 4.1 在 `README.md` 中添加 Spec 体系说明，引导开发者阅读 `openspec/specs/`
- [ ] 4.2 在 `CONTRIBUTING.md`（如不存在则创建）中说明：新功能须先在对应 spec 下声明 delta，再提交 PR

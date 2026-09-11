# 开发与验证

这份页面是参与 hbar 开发的最短入口。详细工程约束在仓库的 [贡献指南](https://github.com/He-Jiahui/hbar/blob/master/CONTRIBUTING.md) 与 [项目工程规范](https://github.com/He-Jiahui/hbar/blob/master/.agents/skills/hbar-engineering/SKILL.md) 中；后者定义了模块边界、MVVM/MVC、严格类型、增量同步和逐子功能提交要求。

## 安装与基础检查

```powershell
bun install --frozen-lockfile
bun run check
bun run build
```

`bun run check` 串行运行严格 lint、TypeScript 类型检查和 Bun 测试。`bun run build` 验证 Web 产物。只有文档改动时，至少运行下面的本地链接检查和格式检查：

```powershell
bun run check:docs
bunx --no-install prettier --check docs/wiki
```

## 按改动范围补充验证

| 改动                         | 至少补充的验证                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| React 工作台或用户交互       | `bun run build`，相关 E2E 与截图检查                                                               |
| Host、协议、异步执行或持久化 | 对应 Bun 集成测试；必要时确认取消、恢复和幂等性                                                    |
| 插件公开接口                 | SDK/插件测试，最小示例或生命周期验证                                                               |
| 桌面                         | 按 [验证说明](https://github.com/He-Jiahui/hbar/blob/master/docs/testing.md) 构建并运行 smoke test |
| 文档与 Wiki                  | `bun run check:docs`、局部 Prettier 检查，以及链接目标核对                                         |

不要为了通过检查而使用 `any`、`@ts-ignore`、忽略退出码或全局排除。测试产生的截图、报告和本地运行数据应保留在忽略跟踪的 `artifacts/`、`test-results/`、`playwright-report/` 或 `.dev/` 中。

## 提交纪律

从 `master` 的最新提交开始，在自己的短生命周期分支上完成一个完整、可验证的子功能；通过对应检查后，立即只提交该子功能的文件。提交前检查暂存差异和 `git diff --cached --check`，不要把无关格式化、其他人未提交的改动或秘密一起带入提交。

提交标题沿用仓库风格，例如 `feat(web): ...`、`fix(host): ...`、`docs: ...`；正文记录变更目的与实际运行的验证命令。遇到缺陷时，先检查相关 Git 历史和已有 diff，再用可复现的测试确认原因。

提交、PR、CI 和受保护分支的协作流程见 [GitHub Flow](GitHub-Flow.md)。

# 测试与验收

hbar 的确定性检查不需要真实模型账号，也不会把测试数据写入你的日常 Host。贡献代码时先跑最窄的相关检查，再根据影响面扩大范围。

## 常用命令

```powershell
bun install --frozen-lockfile
bun run check
bun run build
bun run check:docs
bun run check:github-flow
```

`bun run check` 会依次执行 ESLint、TypeScript 类型检查和 `tests/` 下的 Bun 测试。`bun run build` 验证 Web 产物；`bun run check:docs` 检查 README、贡献指南、`docs/` 和 Wiki 源码中的本地 Markdown 链接。
`bun run check:github-flow` 则只运行工作流、模板、CODEOWNERS 和 Wiki 发布器的契约回归测试，适合修改 `.github/` 时快速反馈。

## 按改动范围验收

| 改动范围               | 额外建议                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Web 工作台或交互       | `bun run test:e2e`，并检查桌面/手机布局与错误状态                                       |
| Host、协议、队列或存储 | 相关 Bun 集成测试，覆盖取消、幂等、重连和恢复                                           |
| 插件或 SDK             | 插件包测试、作用域释放和最小示例                                                        |
| 桌面/Tauri             | `bun scripts/build-host.ts`、Rust 构建与 `bun scripts/desktop-smoke.ts`（按环境可用性） |
| 性能或并发             | `bun run bench`，记录 `artifacts/benchmark.json` 中的运行时和机器信息                   |
| 文档/Wiki/CI           | 局部 Prettier、`bun run check:docs`，并审阅工作流权限和触发条件                         |

## 手工验收边界

自动测试使用 Local fixture 和临时目录，不代表真实 provider、商业限流、复杂 VPN、不同硬件或所有磁盘故障都已验证。涉及这些条件时，在 PR 中明确写“未运行”的原因；真实模型检查只应由拥有可信凭据和额度的维护者在确定性检查通过后运行。

测试产物放在被忽略的 `artifacts/`、`test-results/` 或 `playwright-report/` 中，不要提交截图、数据库、日志或密钥。更完整的覆盖范围与性能基线见主仓库的 [验证说明](https://github.com/He-Jiahui/hbar/blob/master/docs/testing.md)。

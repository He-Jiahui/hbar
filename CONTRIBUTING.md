# 贡献指南

感谢参与 hbar。项目当前处于早期开发阶段，提交前请先阅读：

- [README](README.md)：安装、启动方式和功能边界
- [架构说明](docs/architecture.md)：进程、运行模型、持久化和扩展边界
- [插件开发](docs/plugins.md)：Host/Client 插件接口和生命周期
- [验证说明](docs/testing.md)：自动化测试、性能基线和手动验收
- [Wiki](docs/wiki/Home.md)：快速开始、会话与安全边界、架构和协作入口
- [GitHub Flow](docs/wiki/GitHub-Flow.md)：分支、PR、CI 和 Wiki 发布约定
- [项目工程规范](.agents/skills/hbar-engineering/SKILL.md)：模块边界、MVVM/MVC、工作台设计、增量同步、严格检查和逐功能提交要求

## 开发环境

- Bun 1.4.0（版本由 `package.json` 和 `bun.lock` 固定）
- 浏览器开发和 Host 开发不需要 Rust
- 桌面开发还需要 Rust 工具链、Visual Studio C++ 工具、Windows SDK 和 WebView2

安装依赖并确认基础检查通过：

```powershell
bun install --frozen-lockfile
bun run check
bun run build
```

提交涉及界面、网络或桌面行为时，请按改动范围补充运行 `bun run test:e2e`、桌面 smoke test 或手动验收。文档或 `docs/wiki/` 改动还要运行 `bun run check:docs`，确认本地 Markdown 链接没有失效；修改 `.github/` 或 GitHub Flow 时再运行 `bun run check:github-flow`。测试和基准生成的文件应留在被忽略的 `artifacts/`、`test-results/` 或 `playwright-report/` 中。

## 代码约定

- 使用 TypeScript、ES modules 和仓库现有的 Bun workspace 结构。
- 运行时协议和持久化边界的变更需要同步更新 `packages/contracts`、相关测试及架构文档。
- 新增插件接口时同时提供最小示例或测试，并说明生命周期、权限和副作用。
- 使用 `bun run format` 格式化，使用 `bun run format:check` 验证格式。
- 不要提交 API key、设备凭据、`.dev/`/`.hbar/` 数据目录或构建产物。
- GitHub Wiki 页面以 `docs/wiki/` 为唯一规范源；不要只在 GitHub Wiki 网页中改动，否则下一次同步会覆盖未回写到仓库的内容。

## GitHub Flow

`master` 是可集成主线。请从最新 `master` 创建一个单一目的的短生命周期分支，例如 `feat/...`、`fix/...`、`docs/...`；自动化代理分支可使用 `codex/...`。通过 Pull Request 合并，而不是把未审阅的大功能直接推到 `master`。

每个可验证子功能完成后立即独立提交。提交前只暂存当前子功能文件，并检查 `git diff --cached`、`git diff --cached --check` 和 `git status --short`；不要清理、暂存或提交其他人已有的工作区改动。

打开 Draft PR 后尽早说明影响面、设计取舍和计划中的验证。准备合并前，补齐 PR 模板中的实际测试结果、兼容性/迁移说明、已知风险和回滚路径。GitHub Actions 的 `Verify / verify` 会在 PR 与 `master` 推送上执行无密钥的 lint、类型检查、测试、文档链接检查和 Web 构建；它不会执行真实模型请求。

`PR Triage` 会根据变更路径添加 `area:*` 标签并更新一条可追溯的摘要；它只读取 PR 元数据，不执行贡献者代码。`.github/CODEOWNERS` 为 CI、Wiki、公共契约、Host、存储和桌面原生边界指定维护者复核人。

仓库管理员仍需要在 GitHub Settings 中启用原生 Wiki，并为 `master` 配置 PR、审阅和 `verify` required check 等保护规则。工作流文件不会自行改变这些仓库设置。

## 提交与合并请求

提交信息应简洁说明变更目的。合并请求请包含：

1. 变更内容和影响范围。
2. 已运行的检查命令及结果。
3. 用户界面或协议变更对应的截图、迁移说明或兼容性说明。
4. 尚未覆盖的风险和后续工作。

保持每个提交可独立构建和检查；与当前改动无关的格式化或重构请拆分处理。

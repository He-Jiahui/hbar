# 贡献指南

感谢参与 hbar。项目当前处于早期开发阶段，提交前请先阅读：

- [README](README.md)：安装、启动方式和功能边界
- [架构说明](docs/architecture.md)：进程、运行模型、持久化和扩展边界
- [插件开发](docs/plugins.md)：Host/Client 插件接口和生命周期
- [验证说明](docs/testing.md)：自动化测试、性能基线和手动验收

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

提交涉及界面、网络或桌面行为时，请按改动范围补充运行 `bun run test:e2e`、桌面 smoke test 或手动验收。测试和基准生成的文件应留在被忽略的 `artifacts/`、`test-results/` 或 `playwright-report/` 中。

## 代码约定

- 使用 TypeScript、ES modules 和仓库现有的 Bun workspace 结构。
- 运行时协议和持久化边界的变更需要同步更新 `packages/contracts`、相关测试及架构文档。
- 新增插件接口时同时提供最小示例或测试，并说明生命周期、权限和副作用。
- 使用 `bun run format` 格式化，使用 `bun run format:check` 验证格式。
- 不要提交 API key、设备凭据、`.dev/`/`.hbar/` 数据目录或构建产物。

## 提交与合并请求

提交信息应简洁说明变更目的。合并请求请包含：

1. 变更内容和影响范围。
2. 已运行的检查命令及结果。
3. 用户界面或协议变更对应的截图、迁移说明或兼容性说明。
4. 尚未覆盖的风险和后续工作。

保持每个提交可独立构建和检查；与当前改动无关的格式化或重构请拆分处理。

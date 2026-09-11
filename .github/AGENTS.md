# CI 与仓库协作规范

`.github/` 中的改动会改变贡献者和维护者的交付路径，应与产品改动同等审阅。

- `Verify / verify` 是 GitHub Flow 的确定性质量门：保持最小权限、冻结锁文件安装，并且不得读取密钥或调用付费/真实模型服务。
- `Publish Wiki` 只允许在受信任的 `master` 推送或手动触发时使用 `HBAR_WIKI_PUSH_TOKEN`；绝不把该 token 或任何发布密钥暴露给 Pull Request。
- 修改工作流后，运行变更相关的本地检查、`bunx --no-install prettier --check .github` 和 `actionlint`（若环境已提供）。不要用 `continue-on-error`、忽略退出码或宽泛权限掩盖失败。
- 仓库 Settings、规则集、required check、secrets 与发布权限不是工作流文件能自动配置的内容；变更它们需要仓库管理员明确操作与确认。

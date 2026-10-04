# Windows 成品构建记录：启动验收尚未通过

2026-10-04（Asia/Shanghai）。用户要求构建 hbar Windows 桌面成品。
原始主工作区为 `master` / `d9b8bdbb`，存在用户未提交的
`apps/web/src/ChatSessionChrome.tsx` 修改（移除标题旁 h/Pi）；保留并纳入当前工作区
构建，但未夹带提交或还原。构建修复提交为 `0281fe5d`、`7cdd2143`、`acf3826a`。

## 产物与结论

- 候选安装包：`dist/release-20261004/hbar_0.1.0_x64-setup-candidate.exe`。
- Windows x64、NSIS current-user、版本 0.1.0；46,402,405 bytes，未签名。
- SHA-256：`6654bd13a6910bcbe53373ad6b1a0960592b05bbb2426ead40e3fde22624e604`。
- 包含当前生产网页、Bun 1.4.0、Host、Storage Worker 和原生查询模块。
- **构建成功不等于可用成品：Release 原生启动验收失败，不建议安装或发布这个包。**

真实 Release 程序使用独立临时 profile／项目启动，打包 Host 实际报错：

```text
PLUGIN_CYCLE: goal.codex -> budget.codex -> goal.codex
```

这是启动阶段的真实错误，不是 UI 超时猜测。`plugins/goal/src/index.ts` 保留 UI 分支的
budget 依赖，`plugins/budget/src/index.ts` 又保留主分支的 goal 依赖。两个 merge parent
各自的依赖图原本没有这个环。Budget 的混合 accounting 代码还引用不存在的 `event`，
根类型检查也已指出此错误。继续交付需要独立整合 Goal／Budget 服务与续作职责，
不能只删除一条依赖、禁用必需插件、放宽类型检查或回退用户业务能力。

## 已完成的构建阻断修复

1. `0281fe5d`：`af6511a3` 合并后的 Web entry 保留了不存在的三份 legacy CSS，
   又把 React import 改成 StrictMode 却仍使用 React.StrictMode。恢复已合入的
   LanguageApp、Lumen／document 样式、原生连接／窗口、主题和缩放 bootstrap；
   保留 ReactBits reference fixture 路由，没有重新设计布局。
2. `7cdd2143`：恢复 Rust `exit_service` 结束括号，以及错放的 `existing` 函数头和
   `read_ui_zoom` command attribute。命令回到顶层；权限与动作行为不变。
3. `acf3826a`：`writeSettings` 缺少结束括号，`d9b8bdbb` 在文件尾补括号使语法有效，
   却把 method table 和 Worker message listener 包入未调用 helper。将结束括号移回
   正确位置，Worker RPC 恢复响应；随后才显露上述插件启动环。

## 验证范围与失败

- Web production build、Host bundle、native query、Tauri optimized Release 和最终
  NSIS bundle 均成功。保留 large-chunk、Cargo config deprecation 等 warning。
- 原生 Rust 测试：10 pass / 0 fail。
- native connection／language／bundle copy／smoke fixture：29 pass / 105 assertions。
- direct storage／path storage：17 pass / 79 assertions；worker scoped typed lint 通过。
- 新 `e2e/web-entry-bootstrap.spec.ts` 在最终快照 production assets 上通过，验证实际
  shell、已保存语言／缩放、样式、刷新和无 pageerror。entry scoped typed lint、
  格式和暂存 diff 检查通过。
- 根 TypeScript 仍失败，包含 merged CLI／legacy UI／contracts／storage overload／
  budget／goal／fixtures 等错误，不声称全仓检查通过。
- settings-storage 三项 Kernel 测试失败，原因同上述 PLUGIN_CYCLE；其余 direct storage
  已通过，不把混合组合记成全绿。
- 旧 desktop-capability source-regex 和旧 web-shell heading 断言失败；前者仍匹配 `url`
  与旧命令列表，后者期待已不存在的 Select a session。未改它们或冒称通过。
- 最终原生启动失败，不宣称发送／审批／安装／升级或全部产品功能验收通过。

## 隔离构建与证据

另一任务 PID 22768 的 `sandbox-host.test.ts` 已加载原生模块，主路径覆盖得到 EBUSY。
未中断它或用户程序。Git archive 快照位于
`artifacts/release-build-20261004/source`；应用本次修复和用户原有标题改动，hbar-ui
使用其 clean commit `d8284377`。快照自行链接工作区包，复用当前 vendor dependencies。
快照 frozen-lockfile 安装尝试失败，未解冻或修改用户 lockfile；此记录不声明可重复
的干净依赖安装已验证。

在 VS x64 环境中先构建 Web／Host；最终从快照 `apps/desktop` 运行
`bunx --no-install tauri build --ci`，Cargo 使用本机缓存及 offline 环境。
最终日志为 `artifacts/release-build-20261004/tauri-release-worker-fixed.log`。
其它证据同目录：`native-host-diagnostic.log`、`native-startup-worker-fixed.log`、
`native-startup.json`、`native-rust-tests.log`、`storage-direct-tests.log`、
`storage-tests.log`、`entry-isolated-e2e.log`、`typecheck-after-startup-fixes.log`。

owned 原生／Host 和临时 profile／项目已清理，45570／45571 无监听。
未安装、重启现用程序、调用付费模型、push 或发布；用户标题修改仍保持未提交。

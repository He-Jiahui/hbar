# Windows 桌面安装包：原生启动验收已通过

首次构建记录为 2026-10-04；最终修复、原生验收和安装包交付为
2026-10-05 00:15（Asia/Shanghai）。当前最终包对应生产修复提交 `b5756deb`，
包含此前的 `a84a13c1` 与 `dc7cafaa`，不是下面的失败 candidate。

## 当前交付

- 最终安装包：`dist/release-20261004/hbar_0.1.0_x64-setup.exe`。
- Windows x64、NSIS current-user、版本 0.1.0；46,416,756 bytes，约 44.3 MiB，未签名。
- SHA-256：`d338370d5ae7304d1641973e5c9dfe601c90c84e6f11fa02f326cfa42eecdf51`。
- 交付文件与 Tauri 最终 NSIS 输出的 SHA-256 一致。
- 当前生产 Web、Bun、Host、Storage Worker、原生查询模块均已重新打包。
- 实际 optimized Release 原生窗口及其打包 Host 启动成功；不是 dev server、
  仅编译成功或 fixture 单测代替原生验收。

## 本轮修复与职责

1. `a84a13c1`：整合 `af6511a3` 的混合 Goal／Budget／Plan 服务图。
   Budget 仅依赖 Storage，通过已有 `budget.committed` 由 Goal 投影预算状态；
   `budget.beforeContinue` 使任何现存 Goal 接管生命周期，避免双重续作或绕过显式停止。
   保留仅 Budget 的有界续作。Plan 不再反向读取 Goal 服务，由
   `plan.implementationRequested` 交给 Goal 执行已显式开启的自动化。
   同时修复 Budget 的未定义 `event` 和 Goal 的未定义 `autoBlocked` 合并残留。
2. `dc7cafaa`：Host 已健康但原生窗口仍超时；桌面误把自己启动的 Supervisor PID
   与连接文件中的 live Host PID 比较。连接记录新增 `supervisorPid`，保留 `pid` 的
   Host 含义；桌面校验真实启动者，仍检查 loopback 和健康实例 ID，兼容旧直接 Host。
3. `b5756deb`：已知预算／Goal 准入拒绝被 durable command 层错误包装为 sticky
   `RESULT_UNKNOWN`。在查询 canonical receipt 后保留 `BUDGET_EXHAUSTED` 和
   `GOAL_NOT_ACTIVE`，恢复后原先未受理的请求键可正常提交；真正未知结果和丢失 ACK
   仍要求对账，不重放可能已提交的副作用。

## 最终原生验收与门禁边界

`bun artifacts/release-build-20261004/native-startup.ts` 实际启动
`apps/desktop/src-tauri/target/release/hbar-desktop.exe`，使用独立临时 profile、项目、
loopback CDP 端口和 local-fixture 模型。已实际验证：

- 打包 Host 的 data root、项目及原生 Windows bootstrap 正确，中文 UI 显示已连接。
- Host 读取 owned 项目真实文件，正文一致。
- 真实本地 fixture Run 完成，Goal 与 Session Budget 都记录 60 tokens。
  该 fixture 的单次响应超过测试用 1-token 限额后如实记账；不承诺单次模型请求绝不超额。
- Goal 转为 `budget_limited`；后续发送明确拒绝为 `BUDGET_EXHAUSTED`，没有新增 Run
  或重复续作。页面错误为 0，截图已检查。
- owned 原生／Host 进程及临时数据已清理；未调用付费模型、安装或重启日常桌面。

分项验证：

- Goal／Budget／Plan／恢复／Storage 组合回归：113 pass，526 assertions，16 files。
- 最后准入修复的 Goal／Budget RPC 与 durable Run 回归：16 pass，78 assertions。
  与前一组有重叠，不相加为独立总数。丢失 ACK 的恢复和未知结果禁止重放仍通过。
- Supervisor／身份／bundle／owned fixture 回归：25 pass，65 assertions。
- 优化原生 Rust 测试：11 pass；Web、Host、native query、Release、NSIS 构建成功。
- 所有本轮修改文件的类型感知 ESLint、Prettier 和 Git diff 检查通过。
- 全仓 TypeScript **未通过**：仍有 87 项 merged legacy UI／CLI／contracts／storage
  overload／fixture 等诊断，本轮修改文件无诊断。全仓 lint 在 8 GiB 堆上限 OOM，
  exit 134；没有排除业务目录或放宽规则，不声称全仓 `check` 通过。
- 广泛 server 诊断仍有两项非本轮范围的旧 restart 响应预期失败，日志保留。
  RPC 拒绝测试的 Bun 直接 rejects matcher 曾停滞，改为先显式等待同一 RPC 再断言；
  错误码、无 Run、恢复原键和去重断言均保留。失败记录没有覆盖。
- 未执行安装器的安装／升级流程、全部 UI 流程或真实 Provider 任务，未做数字签名。
- 全仓 `check:docs` 仍失败：旧文档引用缺失的忽略截图／报告，或仓库外参考路径。
  本交付文档没有新增 Markdown 链接且无该文档的链接诊断；格式与 diff 检查通过。

## 当前证据

所有新证据在 `artifacts/release-build-20261004/`：

- `tauri-release-admission-fixed.log`、`host-admission-fixed.log`：最终构建。
- `native-release-final.log`、`native-release-final/native-startup.json`：最终原生通过。
- `native-release-final/native-release-startup.png`：实际 Release UI。
- `goal-budget-final-tests.log`、`goal-budget-admission-final-tests.log`、
  `desktop-host-identity-tests.log`、`native-launcher-identity-tests.log`：分项回归。
- `goal-budget-root-lint.log`、`goal-budget-admission-typecheck.log`：未通过的全仓门禁。

隔离 source 快照复用下面记录的 vendor dependencies，应用所有修复及用户原有标题修改。
用户 `ChatSessionChrome.tsx` 的四行删除保持未提交；没有夹带、还原或删除它。
快照 frozen-lockfile 安装未通过，仍不宣称全新依赖安装可复现。未 push 或对外发布。

## 历史：首次失败候选（不是最终交付包）

以下记录只描述 `hbar_0.1.0_x64-setup-candidate.exe` 的首次失败。
该文件保留用于追溯，不建议安装；最终结论及检查边界以上文为准。

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

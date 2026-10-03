# hbar App UI 生产迁移验证回执

日期：2026-10-03 UTC。实现依据为已批准的 38 类、300 变体会话工作台方案。
取用范围见[迁移台账](app-ui-migration-ledger.md)，数据/动作所有者见[生产映射](app-ui-production-mapping.md)。
本回执把目录检查、预览、生产业务和原生系统证据分别记录；旧参考审计不因生产接入而重新签核。

## 实际交付

- canonical `@lumen/app-ui` 的受控插槽和公开子入口接入外壳、会话、工具、设置及新增页面；保留 300 个稳定 ID。
- Shell09/04 会话工作台、Sidebar03/05/06 与 Navbar01/06/11；桌面布局由独立描述持久化并投影到 FlexLayout，部分 custom slots 保留同一 shell；窄屏保留导航、草稿及原目标。
- 输入、模型/thinking、附件、mention、模式、Goal/Plan、审批、问卷、工具结果、Agent、取消、文件和三层设置继续使用原业务 runtime。
- 工作区提示模板 CRUD/CAS、变量校验、分页、原草稿追加/替换；真实 readiness 引导；Run/Plan 看板的分页、详情、取消/重试；真实预算、请求过滤、时间窗口和导出。
- Host/Storage Worker 持久化通知、源事件去重、已读/偏好/receipt；桌面 opt-in 与后台/托盘隐藏新事件投递；排期 CRUD/CAS、IANA/分钟 Cron、预览、正常 Run/审批链、有界并发和恢复。

## 工程与浏览器检查

| 检查                 | 实际结果与范围                                                                                                                                                                  | 本地产物                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初始目录/预览        | 38 类、300 唯一 ID；300/300 挂载，1280×800 深色下 0 页面/控制台错误及页面横溢；18 个代表变体 320px 抽查。                                                                       | [render-report.json](../artifacts/app-ui-migration-audit/render-report.json)                                                                         |
| 根严格 lint          | `bun run lint` 全仓通过；覆盖维护源码、脚本、测试及 canonical workspace。最终通知时序、原生回执边界和验收脚本包含在收尾检查中。                                                 | [lint-final-delivery.log](../artifacts/app-ui-migration-audit/lint-final-delivery.log)                                                               |
| 根类型检查           | `bun run typecheck` 通过；strict、noUncheckedIndexedAccess 及已启用的严格选项。                                                                                                 | [typecheck-final-delivery.log](../artifacts/app-ui-migration-audit/typecheck-final-delivery.log)                                                     |
| canonical 构建       | `npx --yes pnpm@12.3.4 --dir hbar-ui --filter @lumen/app-ui build` 通过。                                                                                                       | [canonical-build-delivery.log](../artifacts/app-ui-migration-audit/canonical-build-delivery.log)                                                     |
| Web 构建             | `bun run build` 通过；主 JS 约 1.84 MB、gzip 508.5 kB，保留大 chunk 提示。                                                                                                      | [web-build-delivery.log](../artifacts/app-ui-migration-audit/web-build-delivery.log)                                                                 |
| 完整 Bun 文件集      | 731 个文件分 13 批，每批最多 60，顺序运行 `bun test --smol <显式 ./ 路径> --tsconfig-override ./tsconfig.json --timeout 20000`；4803 通过、0 失败、51830 断言。                 | [summary](../artifacts/app-ui-migration-audit/test-final-chunks-summary.json)、[全量日志](../artifacts/app-ui-migration-audit/test-final-chunks.log) |
| 后续布局修复         | 27 测试通过：partial custom header、侧栏展开可达、无空默认 header、描述迁移和 Goal 视图。                                                                                       | [layout-final-regressions.log](../artifacts/app-ui-migration-audit/layout-final-regressions.log)                                                     |
| 后续通知顺序修复     | 21 测试通过：快照先于新事件、列表/未读不重复、初始历史不 replay、后台有界投递、Client 事件和 Host 重启。                                                                        | [notification-order-final.log](../artifacts/app-ui-migration-audit/notification-order-final.log)                                                     |
| 最终通知回归         | 37 测试通过、104 断言：runtime、domain、投影/Host、Client、native adapter、后台投递和原目标导航。                                                                               | [notification-final-regression.log](../artifacts/app-ui-migration-audit/notification-final-regression.log)                                           |
| 真实 Host 功能浏览器 | 4/4 通过（39.4s）：模板中英文 CRUD/变量/追加替换/首次草稿/删除；排期 CRUD/五次预览/IANA/暂停/原会话；通知全局已读/偏好刷新/原目标跳转；Run 看板取消/重试/详情。各页另看 320px。 | [production-features-final.log](../artifacts/app-ui-migration-audit/production-features-final.log)                                                   |
| 通知故障浏览器       | 4/4 通过：冲突保留未读、未知写入只查询原 receipt、外部 read/unread 同步、中文长内容/重复 ID/401 条分页在 320px 保持 400 上限且键盘可操作。                                      | [notifications-controlled-final.log](../artifacts/app-ui-migration-audit/notifications-controlled-final.log)                                         |
| lazy chunk           | 2/2 通过：首次 suspension 保原 props，chunk 拒绝后在保留 shell 的前提下重试。                                                                                                   | [lazy-surface-final.log](../artifacts/app-ui-migration-audit/lazy-surface-final.log)                                                                 |
| 规范 guards          | 内容、图标、flow guard 对本轮实质修改组件/样式通过；普通内容 flex，桌面 vendor 停靠的容器边界单独拥有。                                                                         | 各子功能提交正文与测试输出                                                                                                                           |
| Rust                 | 通知权限、参数边界、UTF-8 上限、标题空正文、dedup 及只读回执相关 7 测试通过；隔离 release 编译通过。                                                                            | [native-tests-final.log](../artifacts/app-ui-migration-audit/native-tests-final.log)                                                                 |

完整 Bun 单进程的前一次运行曾在 Paywall 浏览器启动 hook 报 Windows `ENOTSOCK`：4796 通过、1 失败。
该文件单独重跑为 1 通过/20 断言；随后上述 731 文件分批全部通过，没有跳过 Paywall 或修改其断言。
后续修复的 focused 结果单列，不把多次计数拼成一次全量检查。临时 Host 全部使用本地 fixture 模型与临时 profile。

`bun run bench` 本次通过：[benchmark.json](../artifacts/benchmark.json)。Windows/Bun 1.4.0、Ryzen 7 7700X、31 GiB 内存，
10,000 条历史消息、30 次读取 60 条快照，p95 7.87ms、25,816 bytes；8 个并发会话、40 次取消受理，
p95 82.40ms、max 88.00ms，全部最终 cancelled。Host RSS 287 MiB。
这是当前机器同时运行构建检查时的本地 fixture 样本，不包含商业模型网络时间，不保证所有部署环境的延迟。

## 原生桌面与 Windows 通知

`scripts/desktop-smoke.ts` 在隔离 release 程序和临时 Host/项目执行。
release 实际读取 `resource_dir/runtime/host.js`、`runtime/web` 与 `native`，并非把 Web bundle 固化在 exe 中；
因此每次先构建 canonical/Web/Host，再同步到测试拥有的 release 资源目录，核对源与运行资源 SHA256。
用户已安装的 `hbar-desktop.exe` 未覆盖。

最终 [smoke-final-delivery.log](../artifacts/ui-redesign/tauri/smoke-final-delivery.log) 通过，
[退出码](../artifacts/ui-redesign/tauri/smoke-final-delivery.exit) 为 0，覆盖真实自动认证、
外观保存/刷新/重置、首次发送/计划审批、New Session/原草稿、附件 chooser、搜索键盘、
文件/Markdown/技能/Provider 往返、命令输出/原参/Copy、默认与最小窗口、分栏恢复、
侧栏隐藏/展开、托盘隐藏、Host 退出回读及独立 SDK 取消。
实际自动投递与重放证据保存在 [native-notification-auto-qa.json](../artifacts/app-ui-migration-audit/native-notification-auto-qa.json)：
原事件 `d651df5d-65f9-4986-a1d1-64874c23cefb`，原生窗口 isVisible=false / isFocused=false，
自动回执 accepted=true、唯一手动 replay=false，退出后原通知仍 readAt=null。
WebView 实际加载 `index-p-SRNCjb.js`；[资源身份](../artifacts/app-ui-migration-audit/final-native-asset-identity.json)
记录 source/runtime SHA256 同为 `5BA6CA318D0BCCCA79C40136B97F6C76FE2FE37E6E83B6E4A09461BEC6173FD1`。
查看[默认窗口](../artifacts/ui-redesign/tauri/session-default-window.png)和[最小窗口](../artifacts/ui-redesign/tauri/session-min-window.png)。
原生 fixture 与 capability 边界另为 21 测试、47 断言通过，见
[native-fixture-boundary-final.log](../artifacts/app-ui-migration-audit/native-fixture-boundary-final.log)。

验收脚本按原 ID 查询原生只读投递回执，有界等待自动接受记录后再检查一次 replay；查询不发送通知、不登记 ID、不修改未读。
早期 JS invoke 观察器无效：Tauri 将 invoke 定义为不可写属性，替换并未成功，相关 timeout 不能推断自动调用不存在。
直接在异步自动调用完成前手动 send 也会抢先登记 ID，不能用这样的重放结果推断生产失败或通过。

Windows OS 正向证据为 [windows-title-only-positive-evidence.json](../artifacts/app-ui-migration-audit/windows-title-only-positive-evidence.json)：
WinRT `GetHistory(dev.hbar.workbench)` 返回的 9 条历史中，对唯一标题
`hbar-os-qa-title-only-20261003015756468` 精确匹配 1 条，XML 正文为空且 audio silent。
另一次 `...015839994` probe 的 native API 首次接受、重复拒绝，但该 token 未查到 OS history，
独立 [negative report](../artifacts/app-ui-migration-audit/windows-title-only-toast-history.json) 保留；generic 历史不归因该 token。
OS history receipt 不代表 popup 现场可见、用户点击或已读。完全退出桌面后的新事件由 Host 保存，下次同步应用内记录。

## 可重复入口与核心提交

收尾验收脚本提交 `3396a49d`：使用只读原生回执确认自动投递完成后再验证重放，替代无效的 invoke 替换。

基础命令仍为 `bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`；
当前机器的大文件集复核使用显式路径分批，避免把 Bun 名称过滤误当文件路径而扫描生成目录。

| 功能              | 主要回归入口                                                                                                                                                                                                                                                                   | 关键本地提交                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 模板 / 原目标列表 | [template runtime](../tests/prompt-templates-runtime.test.ts)、[template service](../tests/prompt-templates.test.ts)、[target catalog](../tests/workspace-session-targets.test.ts)                                                                                             | ad017bf9、498326a1                                           |
| 排期              | [runtime](../tests/schedule-runtime.test.ts)、[form](../tests/schedule-form.test.ts)、[controller](../tests/schedule-host-controller.test.ts)、[runner](../packages/kernel/src/schedule-runner.test.ts)、[service](../packages/kernel/src/schedule-service.test.ts)            | abf4c98f、36ff2276                                           |
| 看板 / 用量       | [board runtime](../tests/run-board-runtime.test.ts)、[production page](../tests/run-board-production-page.test.tsx)、[budget](../tests/usage-budget-runtime.test.ts)、[requests](../tests/usage-requests-runtime.test.ts)                                                      | cce857fe、27fcd111                                           |
| 引导 / 草稿       | [readiness](../tests/onboarding-readiness.test.tsx)、[draft reload](../tests/session-drafts-reload.test.ts)、[draft persistence](../tests/session-draft-persistence.test.ts)                                                                                                   | 52f6a4c9、c62346a7                                           |
| 通知              | [runtime](../tests/notifications-runtime.test.ts)、[projection](../tests/notification-projection.test.ts)、[domain](../tests/notifications-domain.test.ts)、[navigation](../tests/notification-navigation.test.ts)、[delivery](../tests/notification-desktop-delivery.test.ts) | 52ce35d4、167f1529、a5a3c4fc、39755382、60ac0c12             |
| 原生通知边界      | [Rust](../apps/desktop/src-tauri/src/main.rs)、[WebView capability](../tests/desktop-capability-boundary.test.ts)、[fixture](../tests/desktop-smoke-fixture.test.ts)                                                                                                           | 381cd504、a2a17da6                                           |
| 桌面布局          | [app-react](../tests/app-react.test.tsx)、[descriptor](../tests/shell-layout.test.ts)、[native script](../scripts/desktop-smoke.ts)                                                                                                                                            | 6073c959、174c7e89、d35c67e9、13d61596；canonical 970cf5fcf2 |

检查失败均保留日志并修复相关范围。所有交付为本地独立提交；未 push、发布、安装到用户目录或改写 Git 历史。
历史参考 strict 差异、商业模型/计费与账户/团队范围没有被升级为本轮生产能力。

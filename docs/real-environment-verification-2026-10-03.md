# hbar 真实供应商与桌面使用验收

验收日期：2026-10-03，Asia/Shanghai。被测代码 HEAD：`5e15a9e0`，分支 `codex/hbar-app-ui`。
用户明确授权消耗 token，并在 hbar 窗口手动添加供应商后继续验证。

结论：真实外部供应商的消息、流式输出、停止、工具审批和单次排期链路可用；本轮将菜单和下拉栏提升为独立的 Popover 顶层，浏览器回归已验证其固定定位和视口边界；
当前桌面的运行看板和侧栏通知入口未通过，不能据此宣布 App UI 已全部通过真实使用验收。
本轮补充的是生产桌面与真实供应商结果，300 个组件/变体的目录及预览检查仍见
[迁移台账](app-ui-migration-ledger.md)与[先前验证回执](app-ui-migration-verification.md)。

## 被测环境与配置恢复

| 项目       | 实际环境                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面       | 当前分支的新隔离 release `apps/desktop/src-tauri/artifacts/app-ui-migration-audit/desktop-target-ui-fix-20261003/release/hbar-desktop.exe`；已结束旧壳并启动新壳 PID 25284 |
| Host       | 持久化、非 demo；`demo=false`，实例 `cf9d675a-7ea9-4ef7-98fc-ee550a51ffb3`，PID 39312                                                                                      |
| 供应商     | 用户配置 `niuma grok`，模型名称 `grok-4.6`，`openai-responses`，外部 HTTPS，`hasKey=true`、`canExecute=true`                                                               |
| 推理与审批 | 验收 Run 使用 `medium`、`ask`、`default`；上游模型身份仅按用户的配置名称记录                                                                                               |
| 持久化路径 | `%LOCALAPPDATA%/hbar/data` 与 `%LOCALAPPDATA%/hbar/cache`                                                                                                                  |
| 验收工作区 | `artifacts/real-environment-20261003/workspace`，只包含本轮合成文本与批准写入的验证文件                                                                                    |
| 会话       | `真实验收 2026-10-03`；排期另建 `Scheduled run`。用户手动的 `测试` 会话保持原样，不计入验收用量                                                                            |

启动时发现 `%LOCALAPPDATA%/hbar/paths.json` 指向已经不存在的临时 `next-data`、`next-cache` 目录。
先保存[原路径指针](../artifacts/real-environment-20261003/original-path-pointer.json)，
再经公开 `system.paths.set` 改为上述正常持久化目录。
结束自有桌面进程后，撤去进程路径覆盖并重新启动，实际读取修正后的默认路径、复用同一 Host，供应商、历史、标签和中文草稿均恢复。
原指针的历史来源尚未确认；当前 `tests/system-commands.test.ts` 注入私有指针，不能把现象直接归因于当前测试。

用户原安装文件 `%LOCALAPPDATA%/hbar/hbar-desktop.exe` 的修改时间为 2026-09-09，本轮没有覆盖该安装。
因此本次结果对应当前分支的 release，原安装快捷方式不等于这一被测版本。

运行身份复核：exe SHA256 `18DC78B0069D6C346D19D90B65FF8B5EC0FDBFAB1AA5A5BAB7E72CAE2888710C`；
运行 Web 资源 `index-p-SRNCjb.js` SHA256 `5BA6CA318D0BCCCA79C40136B97F6C76FE2FE37E6E83B6E4A09461BEC6173FD1`。
供应商地址细节、API 密钥和 Host 连接 token 不写入回执或验收输出。

## 真实行为结果

SDK 提交与 Windows 原生窗口操作分别列明。SDK 与窗口连接同一持久化 Host；没有把 fixture 回复当成真实模型回复。

| 验收项         | 入口及实际观察                                                                                                                                               | 结果与证据                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真实模型连通   | 公开 SDK 提交；返回精确两行 `HBAR_REAL_20261003_OK`、`19×23=437`；Run 从开始到结束 4.516 秒                                                                  | 通过：[result-basic.json](../artifacts/real-environment-20261003/result-basic.json)                                                                                                                                                                                                      |
| 原生发送       | 在 Windows 桌面编辑器输入、确认当前会话后点击发送；精确返回 `HBAR_UI_SEND_20261003`，只生成一个匹配 Run；执行 1.665 秒                                       | 通过：[result-ui-send.json](../artifacts/real-environment-20261003/result-ui-send.json)                                                                                                                                                                                                  |
| 真实流式与停止 | 原生发送长输出请求；SDK 捕获 `running` 与已增长文本，窗口实际流式显示后点击停止；最终 `cancelled`、`USER_CANCELLED`                                          | 停止通过，部分文本持久化有下述限制：[取消前观察](../artifacts/real-environment-20261003/cancellation-before.json)、[取消后快照](../artifacts/real-environment-20261003/session-cancelled.json)                                                                                           |
| 工具允许       | SDK 提交，模型真实请求 `write_file`；批准前文件不存在；在原生审批卡检查路径与内容并点击“允许这次”，同一 Run 随后 `read_file` 核对                            | 通过：[result-write.json](../artifacts/real-environment-20261003/result-write.json)、[实际文件](../artifacts/real-environment-20261003/workspace/real-tool-proof.txt)                                                                                                                    |
| 工具拒绝       | SDK 提交，原生审批卡点击“拒绝”；工具结果为 `denied`、`executionStarted=false`，模型按拒绝继续返回最终回复，目标文件仍不存在                                  | 通过：[result-deny.json](../artifacts/real-environment-20261003/result-deny.json)、[桌面截图](../artifacts/real-environment-20261003/real-approval-denied.png)                                                                                                                           |
| 草稿隔离与恢复 | 中文未发送草稿切换到用户 `测试` 会话时不泄漏；切回精确恢复。`Ctrl+R` 和实际桌面进程重新启动后仍恢复                                                          | 通过：[刷新后 UI](../artifacts/real-environment-20261003/ui-draft-after-refresh.txt)、[桌面重启截图](../artifacts/real-environment-20261003/real-desktop-reopen.png)                                                                                                                     |
| 模板保存与套用 | 原生窗口新建中文模板、声明必填变量；未声明变量阻止保存，缺失必填值阻止套用；填写后追加到指定原草稿，原文保留、变量替换正确；前后 Run ID 集合与用量不变       | 通过，错误文案有下述限制：[Host 模板与前后数据](../artifacts/real-environment-20261003/features-after-template.json)、[原生追加结果](../artifacts/real-environment-20261003/real-template-applied.png)                                                                                   |
| 单次真实排期   | 公开 SDK 预览并创建一次性排期；Host 新建会话并调用外部模型，精确返回 `HBAR_SCHEDULE_REAL_20261003`；原生排期页面显示一次已完成记录，侧栏打开真实会话可见回复 | 通过，启动时间有下述轮询延迟：[result-schedule.json](../artifacts/real-environment-20261003/result-schedule.json)、[原生执行记录](../artifacts/real-environment-20261003/real-schedule-completed.png)、[模型回复截图](../artifacts/real-environment-20261003/real-scheduled-session.png) |
| 运行看板       | 原生页面实际显示“运行看板加载失败: COMMAND_NOT_FOUND”；同 Host 的专用公开 SDK 能读到正确记录                                                                 | 未通过：[原生失败截图](../artifacts/real-environment-20261003/real-run-board-command-failure.png)、[公开端口最小复现](../artifacts/real-environment-20261003/board-port-reproduction.json)                                                                                               |
| 通知入口       | Host 正确保存 8 条全局未读记录；原生铃铛浮层在可访问树中打开，但第一条记录点击位置为窗口外 `(-127, 783)`，窗口中看不到完整浮层                               | 原生入口未通过；本轮未完成从该入口进入完整通知中心或原目标跳转：[UI 树](../artifacts/real-environment-20261003/ui-notification-popover-offscreen.txt)、[原生截图](../artifacts/real-environment-20261003/real-notification-popover-offscreen.png)                                        |
| 菜单与下拉顶层 | 新 release 已启动；浏览器 E2E 验证会话菜单和 Provider preset 下拉使用 `popover="auto"`、`position: fixed`，并且完整位于视口内                                | Web 证据：`e2e/session-context-menu.spec.ts` 两种 locale 通过；Provider 流程已执行浮层断言，后续在旧的模型选项可见性断言处失败。原生 CUA 通道本轮返回 `Transport closed`，没有新增原生视觉断言                                                                                           |

审批允许 Run 的总执行时间 97.892 秒、拒绝 Run 52.034 秒，包含等待操作员点击审批的时间，不能作为供应商响应延迟。
上述简短响应时间属于单次样本，不代表延迟分位数或供应商 SLA。

## 已确认问题与边界

### 1. 运行看板端口组装缺失

生产 [App 组合根](../apps/web/src/App.tsx)把 `createRunCommandClient(client)` 传入 `run`；
[Runtime](../packages/app-runtime/src/index.ts)又把 `options.run` 用作看板查询端口。
[看板 Runtime](../packages/app-runtime/src/run-board.ts)查询 `run.board.list`，但
[Run Client](../packages/client/src/run.ts)只注册 Run 操作定义，
[命令客户端](../packages/commands/src/client.ts)在发送前就拒绝没有定义的命令。

真实 Host 上的最小复现使用完全相同的公开适配器：Run 端口返回 `COMMAND_NOT_FOUND`，
专用 `createRunBoardCommandClient` 在相同会话读到 5 条记录，含 4 条完成和 1 条取消。
因此不是供应商或 Host 没有记录，需要在生产组合根与 Runtime 显式注入看板查询端口。
已查阅 `a28e3805`、`a09031c0` 及相关路径历史；未做历史版本对比，不把最后修改提交直接认定为唯一引入提交。

### 2. 左下角通知浮层落到窗口外

当前侧栏铃铛位于窗口左侧；canonical
[铃铛样式](../hbar-ui/packages/lumen-app-ui/src/notifications-bell-reference.css)
将宽浮层按触发器右端对齐并在其下方展开，未根据该生产位置处理边缘碰撞。
实测 UI 树可见记录、鼠标目标中心却在窗口外，截图中浮层不可见。
保留了失败证据，未用 SDK 导航替代这个失败的原生入口，也没有把用户的通知全部标为已读。
后续需处理锚点、可用空间和侧栏裁剪，并在真实侧栏位置验证指针及键盘操作。

### 3. 菜单和下拉栏必须脱离自动布局

本轮在 `hbar-ui` 子模块提交 `ff7077313e`，将 `LumenActionMenu` 和 `LumenComboBox` 的弹出内容改为 `popover="auto"`，使用 `position: fixed` 的视口顶层定位；根据触发器和可用空间选择上下方向，限制最大高度，并在滚动、缩放时重新计算。`details` 的键盘/Escape 语义、受控 ComboBox 回退和焦点恢复继续保留。

主仓库提交 `5e15a9e0` 为两类弹出层增加视口边界回归。会话菜单 E2E 在 `en-US` 和 `zh-CN` 均通过；Provider persistence 场景已通过新的下拉层断言，但随后仍在既有模型选项可见性契约处失败。原生新 release 已启动，但 CUA 传输在读取窗口时关闭，所以这次没有把浏览器证据升级为原生视觉通过。

### 4. 看板费用与用量账本口径不一致

同一批真实记录中，`usage.query` 汇总费用为 `value=null`、`availability=unavailable`、
`PRICE_COVERAGE_INCOMPLETE`；`run.board.list` 仍返回 `availability=available` 的估算数值。
例如基础 Run 的看板费用为 `0.29583 USD`、`estimated=true`；取消 Run 的值为 0，不能据此认定取消没有计费。

[看板存储投影](../packages/storage/src/run-board.ts)直接累加 `usage.recorded.cost` 并设为 available，
[用量服务](../packages/usage/src/service.ts)则检查价格和缓存价格覆盖。
该差异已经由同 Host 公开 SDK 结果与代码确认，后续应统一费用可用性和估算标签。
本轮没有验证供应商账单，不给出实际费用金额。

### 5. 停止后的部分输出未持久化

停止前已观察到真实文本增量；停止后的快照只保留该 Run 的用户消息，没有 assistant 消息，刷新后部分数字输出消失。
后续模型可见前一个未获 assistant 回复的请求，本轮下一请求的思考文本也提到了两个请求；
这支持记录上下文边界问题，但不单凭模型文字断定协议根因。
停止动作已经生效，“保留已生成片段”和取消请求的最终上下文语义仍需另行完善。

### 6. 排期延迟及中文校验文案

一次排期预约于上海时间 `11:58:28.930`，Run 受理于 `11:58:55.226`，晚 26.296 秒；
模型执行 3.227 秒，Run 结束于 `11:58:58.456`，排期完成状态更新于 `11:59:25.239`。
[Host 控制器](../apps/host/src/schedule-host-controller.ts)默认每 30 秒检查到期与运行状态，解释了本次延迟。
`occurrence.attempt=3` 由[存储状态转换](../packages/storage/src/schedules.ts)逐次递增，不能理解为调用了模型三次；
本轮实际只产生一个排期 Run、一次模型 attempt，最后复核仍只有一个已完成 occurrence。

模板缺失必填值已正确拦截，但中文界面显示英文错误
`Missing required prompt template variable: name`，需要经过宿主中文文案映射。
这是可观察的本地化缺口，模板成功套用不代表错误文案也通过了中文验收。

## 用量、证据与收尾

本轮验收拥有的 6 个 Run 为 5 个 completed、1 个 cancelled，共 9 个模型 attempt：
基础请求 1、允许工具 3、原生发送 1、取消 1、拒绝工具 2、单次排期 1。
用户手动 `测试` 的请求单列排除。

| 账本字段       | 核心验收会话 | 排期会话 |   合计 |
| -------------- | -----------: | -------: | -----: |
| input          |       72,079 |    9,729 | 81,808 |
| output         |        1,085 |       45 |  1,130 |
| cacheRead      |       50,560 |      128 | 50,688 |
| cacheWrite     |            0 |        0 |      0 |
| billableTokens |       22,604 |    9,646 | 32,250 |

以上数值是 hbar 账本字段，来自[最终公开 SDK 快照](../artifacts/real-environment-20261003/features-final.json)。
计数、文件与前后状态核对另见[验收汇总](../artifacts/real-environment-20261003/acceptance-summary.json)。
取消中的部分生成未获得完整最终供应商 usage，上述账本数值不等于最终供应商计费。
流式及事件观察记录见[本轮事件序列](../artifacts/real-environment-20261003/live-events.jsonl)。
这些日志和截图保存在被忽略的 `artifacts/`，未提交凭据或本地运行产物。

最终 [环境诊断](../artifacts/real-environment-20261003/environment-inspection.json)为 `activeRuns=0`；
没有创建循环排期，验收单次排期已经完成，未发送的模板草稿仍留在原验收会话。
保留当前真实供应商桌面窗口及 Host，便于用户查看。

本轮未开启系统通知（`nativeEnabled=false`），未验证 OS 弹窗点击、供应商限流、断网重连、多供应商、图片输入或长时间 Goal/Plan。
先前 fixture 的相关测试结果仍是独立证据，不能替代本轮真实使用结果；
先前浏览器检查虽然有通过日志，本轮上述两个原生入口失败必须保留，不能据其日志覆盖失败。

本轮除真实环境复核外，提交了 `hbar-ui` 顶层弹出层修复和对应 E2E 边界断言；没有新增付费模型请求，也没有读取或写入供应商密钥。
文档交付检查为变更文件 Prettier、相对链接与 `git diff --check`；根 `build`、`typecheck`、canonical TypeScript 与目标组件测试在本轮修复后通过。`@lumen/app-ui` 直接 `build` 仍受本机 pnpm 11.19.0 不满足包声明的 pnpm 12.3.4 限制，未把该命令写成通过。

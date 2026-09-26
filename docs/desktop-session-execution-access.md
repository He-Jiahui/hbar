# 外部归档保留视图：执行准备与结果核对

这是 cc-haha Desktop 交互迁移中的一个独立闭环，不代表全部桌面入口迁移完成。

## 用户可见行为

外部客户端归档当前会话后，已经打开的观察视图继续保留历史、未发送文本、原附件及 Files。输入区附近明确说明会话已归档，并提供原工程的归档列表入口；该入口只打开列表，不暗中恢复、发送、切换会话或重开页签。

| 能力                                                                | 已确认归档后的行为                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 新 Send／Queue、Run Retry、完成后提案的 Implement／Continue         | 禁止准备和派发新执行，UI 与 runtime 都校验原目标                               |
| 新附件、模型／思考更改、持久 Plan 模式、Goal 新建／Resume／编辑保存 | 按同一目标能力限制；已经打开的编辑器保留原稿                                   |
| 历史阅读、文本本地修改、已有附件本地移除、Files                     | 保留，不因为会话归档自动关闭或清空                                             |
| 模型查看、旧提交／附件／模型／模式／Retry 的结果核对                | 保留读取；不把核对实现为第二次写入                                             |
| 已有 Run Stop、原审批／问卷／同 Run Plan Exit、Goal Pause／Clear    | 继续按其自身目标和状态决定，不连同整个输入区一起禁用                           |
| 显式 Restore                                                        | 收到更新的确认事实才解除限制；原观察位置、稿件、Files 保留，退休页签不自动复活 |

缺少事实、读取失败、目标不匹配和导航未确认属于“尚未确认”，不能伪装成已归档。选中 B 也不能解除 pinned A 编辑器的限制。

## 参考与问题证据

- 参考原组件 [running-tab-close](../artifacts/reference-ux-v2/29-reference-tabs-running-close-dialog-1440.png) 的目标明确、继续运行与停止分开表达。本图是原 TabBar／Workbench 隔离挂载，不是 Archive／Restore 的业务截图。cc-haha 普通 Session Delete 具有不同破坏性语义，不能照搬为 hbar 的可恢复归档。
- 原 hbar 的 [外部归档审计](desktop-external-archive-readonly-audit.md) 已证明保留历史／草稿／Files 正确，但所有新执行准备入口仍可用。此次真实 Host 验收再次使用保存的旧 production bundle 重现 Send 仍可点击的红测；没有回退当前工作树或把已修改源码冒充红色基线。
- 新流程复现了另一个旧问题：`sessionArchive.restore` 前置 `session.get` 接收 archived A 时会触发 `onSessionUnavailable`，导致显式恢复后原 A 变成空选择。修复为恢复专用的有界观察读取，不通过自动重新打开 A 掩盖。用户明确执行 Archive 以及普通目录读取仍保留原有导航语义。
- 历史核对：`e855123` 建立项目内归档／恢复，`35a2852` 建立确认事实和退役页签的版本边界；`67285cd` 的未知 Retry 原先复用同一个 key 重放写入。此次保留它们的目标／幂等语义，补充执行准备限制和真正只读的恢复路径，不把最后修改者当作所有问题的引入证明。

状态说明使用宿主提供的中英文文案和共享 `sm` 图标，遵循正常 flex 流。图标与说明属于同一行，归档列表按钮在窄容器自然换行；没有固定内容高度或截图坐标布局。归档列表继续复用既有 100 条有界分页，不引入第二份会话列表。

## 运行时与 Host 边界

`session-execution-access` 从 canonical Directory 和已确认 Session 事件派生能力，只保留当前目标的身份／版本／归档标记。旧版本的 false 不能解锁较新的 archive；当前目标的同版本矛盾维持未确认，只有更高版本能够恢复。非当前目标从公开 canonical reader 检查，不复制完整 Session 缓存或额外保留每个历史目标的版本映射。

每次准备捕获 exact session＋workspace，异步步骤之后、具体写派发之前再次检查。未打开目标可通过同一有界 Directory 路径读取验证。该端口由 runtime 组合根注入；View 不直接执行 RPC 或访问 Host 内部状态。

这些是**已经观察到归档后、尚未派发的新准备**的限制，不是新的 Host 原子归档策略。模型／模式／Goal 写已经派发后，迟到的归档事实不能撤销它：仍保留原 key、原目标、ACK、unknown 和 partial。Goal 已创建但后续 Run 受阻时，明确保留已创建 Goal 的事实，不回滚、自动清除或伪报零写。Host 既有 Run enqueue 仍在事务中拒绝归档目标；归档前已有的 Run 与回执不能被抹除。

## 真正只读的未知结果恢复

新内部 API query `session.getModelReceipt` 读取已有 Settings 持久回执，按认证 actor、原 idempotency key、exact session scope 与层链校验。没有新增数据表，也不调用 `settings.apply`。返回的是提交时的历史模型／思考值与版本，不是当前配置冒充的回执。

composer 先验证原目标、请求值、原基线到提交的版本变化；确认后另外读取当前模型，避免较旧回执覆盖后来配置。回执为空、身份／字段／版本不符、读取失败或当前版本倒退，均继续 unknown。Settings 回执本身经过重启测试；这不代表 UI 的待恢复意图已经跨应用重启持久化。

未知 `run.retry` 同样只读原 `run.getReceipt(..., 'run.retry')`，不再重发 Retry。Run action 公开区分 retry 与 cancel，UI 只为原 retry 展示“核对结果”；一次读取期间禁止重复点击，查不到回执时保留原 key 和 unknown。畸形 ACK 不能当作确定失败从而允许新 key 重发。

## 验证记录

当前独立定向验证已覆盖：

- 派发前归档／验证读取失败零写；派发后保留 ACK／unknown／Goal partial；原稿和附件不丢。
- exact A/B、pinned A、旧版本／同版本矛盾、缓存缺席、有界 owner、dispose／取消。
- Restore 保留原视图；明确 Archive 仍按原语义清当前选择；原有归档页／页签回归。
- 已派发 detached proposal 的回执恢复不受新准备门禁阻断，与同 Run Plan Exit 分开。
- 真实 Host／SQLite 的模型原回执读取、不同 actor／scope 隔离、历史值、后续写与重启。
- 中英文 UI、原操作能力分离、每 Run 的 retry／cancel 身份区分、长说明与窄屏正常流。

最终独立 production 构建通过（1.21 秒，`index-DlFZXpLl.js`），真实 Host **10/10、37.0 秒**通过。最后一次完整矩阵包含新请求 `Retrying` 与原回执 `Check result` 的真实阶段区分，不拿较早候选 bundle 的通过覆盖后来的修改。

关键视觉证据：

- [中文桌面保留 Files](../artifacts/session-execution-access/evidence/final/gated-zh-CN-1440.png)、[中文窄屏](../artifacts/session-execution-access/evidence/final/gated-zh-CN-320.png)、[英文窄屏](../artifacts/session-execution-access/evidence/final/gated-en-US-320.png)。宽屏与窄屏是归档前已加载的独立观察器，不是归档后重新打开的假保留。
- [真实恢复回复尚未释放](../artifacts/session-execution-access/evidence/final/restore-reply-held-zh-CN-1440.png)、[恢复后原视图](../artifacts/session-execution-access/evidence/final/restored-zh-CN-1440.png)。Host 已写入 false 但观察器尚未收到 ACK 时仍受限；原真回复到达后才在原位置解除限制。
- [原 Retry 请求进行中](../artifacts/session-execution-access/evidence/final/retry-original-request-held-320.png)、[查不到回执时继续未知](../artifacts/session-execution-access/evidence/final/unknown-retry-no-receipt-320.png)。模型／mode／Run submit／Retry 均有真实先写入再丢失回复的故障注入，核对没有第二次写入。

最终浏览器证据 30 张 PNG、6 份 JSON，主线人工复核了宽／窄图、只读模型菜单、Restore 和 Retry。相关脚本自身 strict lint、strict TypeScript、格式通过；清理后独立 Web／Host 端口 45025／45027 已释放。

首轮完整 `bun run check` 的 lint／typecheck通过，Bun **1908 pass / 1 fail / 14195 assertions，344 文件，267.50 秒**。唯一失败是旧权限准备测试把异步访问验证之前的同步瞬间当作已进入权限准备；保留立即竞争的 detached Plan 必须 BUSY／零 Run 断言，把状态检查放到异步准备后，定向 **30/30、134 assertions** 重跑通过。首轮日志保留在 `artifacts/session-execution-access/first-integrated-check.log`。后续串行检查曾被新原生验收脚本的 `no-unsafe-finally` 阻断，未进入该次完整测试；不将其计为通过。

原回执／runtime／detached proposal 的最终补充 **30/30、221 assertions** 通过。真实配对 Host 的 20 次历史模型回执 loopback 读取基准 p95 约 0.50ms、max 约 0.53ms，且后续层版本保持不变；这是本机小样本、不含外部网络的查询基准，不是生产延迟保证。

原生独立验收脚本最终 **exit 0**：中英各一条真实 demo 历史的保留／恢复场景、各一条独立无 Files 的 900 控件场景，以及真实 active BUSY → Stop → cancelled。12 张截图；主线复核了 900 保留 Files、1440 恢复后和 900 独立只读模型菜单。

原生视口有明确边界：900×600 的 Files 是既有覆盖抽屉，会挡住部分 composer 控件。测试在 900 保留原稿／附件／同一 Files DOM，再将**真实原生窗口**扩为 1440×960 点击模型菜单和准确工作区归档列表、接收 Restore ACK，最后回 900 复核同一 DOM。没有 force click、隐藏覆盖层或关闭 Files；不能宣称 900 打开 Files 时被遮住的控件仍可操作。独立无 Files 的 900 场景补充验证可见模型入口和准备限制。

- [原生结果](../artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/verification.json)、[清理结果](../artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/cleanup.json)。
- [900 保留 Files](../artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/archived-retained-files-zh-CN-900.png)、[1440 恢复后的同一视图](../artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/restored-retained-zh-CN-1440.png)、[独立 900 只读模型菜单](../artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/archived-no-files-controls-zh-CN-900.png)。

使用既有 debug launcher 与本轮 fresh Host/Web resources（3048 modules、`index-DlFZXpLl.js`），**没有重新构建桌面 exe**。测试自行结束，捕获的 desktop／supervisor／Host 均已退出，唯一临时 profile／workspace 已清理，9443 与随机 Host 端口 57913 已释放；未碰其他实例或既有受阻进程。

首原生红例保留于 `native/hbar-native-session-execution-lYIeZW/verification.json`：900 Files 抽屉截获模型点击。另修复验收脚本的退出／日志无界等待风险：stderr 直接写文件，按确切身份逐个清理已捕获子进程，再有界等待 desktop；失败聚合在 finally 外，保留原错误。旧等待具体卡在 native exit 还是 stderr EOF 未独立证实，不归因为已经确认的 Host pipe 继承。

最后串行 `bun run check`：原生工具构建、根 strict lint、根 typecheck均通过；Bun **1909 pass / 1 fail / 14208 assertions，344 文件，242.98 秒**，总命令 **exit 1**。唯一失败为 `lumen-canonical-boundary.test.ts` 的 canonical controls 检查，定位到并行未提交的 `hbar-ui/packages/lumen-app-ui/src/notifications.tsx` 中 Bell 新增原生 `<button>`（1413、1414、1416、1424、1434 行，核对时点）。独立重跑该边界文件仍为 2 pass / 1 fail。已核其子模块 diff 与历史，没有修改、暂存或夹带该文件，也没有降低检查规则。完整日志：`artifacts/session-execution-access/final-check.log`。

最后集中运行本单元及相邻回归：**214 pass / 0 fail / 1194 assertions，16 文件，22.36 秒**，日志 `artifacts/session-execution-access/final-feature-tests.log`。覆盖 execution access／runtime／composer／UI、模型持久回执、原模型／意图／权限／附件／草稿、detached proposal、归档／页签及 Run activity。

本单元定向、production 和原生验证不能替代上述仍未通过的全仓门禁。外部工作树保持原样；本单元交付不声称整个仓库已经全绿。

## 明确不包含

不新增普通 Session Delete、不改变 Files 的 workspace 维护权限、不为归档会话添加全局 Host 配置禁写、不自动取消 Run、不创造“已归档＋仍有活动 Run”的虚假 Host 测试事实。真实活动 Run 的归档返回 BUSY 后，验证的是原 Stop 仍可安全取消；已完成提案与活动 Plan Exit 使用不同真实流程。

没有声称所有 Desktop 入口已经迁移，也没有以本单元代替尚未完整通过的通用 `desktop-smoke`。后续工作继续登记于[总入口矩阵](desktop-entry-audit-2026-09-26.md)。

# 模型入口：配置变化与就近恢复

本单元修复 Provider 已变化、会话仍显示旧模型可发送的断链。高频模型和推理强度保留在 composer 附近；配置不可用时，就近说明原因并提供恢复，不切换会话、不替用户选模型、不发送 Run。

## 参考与已复现问题

2026-09-26 基线为 `32dc7d3`，前一个 Plan 单元为 `342a788` / `4bbdd30`。开始时检查当前差异；其他任务的 Host、组件库和脚本修改不属于本单元。

- 原产品完整画面：`D:/Git/cc-haha/docs/images/app/zh-CN/model-picker.webp`。模型触发器、独立推理强度、分 Provider 列表和当前项标记位于输入区。该图不证明空配置流程。
- 原组件隔离证据：`artifacts/model-entry-recheck/reference/empty-original-{en-US,zh-CN}-{1440,320}.png`。未修改的 `ChatInput` / `ModelSelector` 使用合成 store，不连接原 Host。空配置触发器的含义变为“配置模型供应商”；点击调用原 store 的 Providers 设置入口，保留原会话和草稿。夹具没有挂载 Settings 页，因此不把 store 切换证据当作已渲染 Settings 截图。
- 原源码：cc-haha 当前 `e28d0a65`，上述两个参考文件无未提交修改。`desktop/src/components/controls/ModelSelector.tsx` 的 `activeRuntimeSelection` 排除已删除 Provider，`openSelector` 在事实已知为空时直接进入 Providers，未加载时先查清事实；`providerStore.ts` 的删除动作刷新 selector 使用的同一 store。
- hbar 旧生产证据：`artifacts/model-entry-recheck/settings-delete-v3`。中英均通过真实设置页确认删除当前 Provider，返回 A 后 Host `session.getModel` 已为 unavailable，UI 却继续显示原模型、原推理值且 Send 可用；观察一秒没有新模型读取。只有打开菜单才刷新，刷新后又只有“选择模型”，缺乏不可用说明和配置恢复入口。

主线亲看原完整模型菜单、原空配置 320 图、hbar 删除后英文宽屏及中文不可用窄屏。原 empty 触发器在极窄屏也会截断文字；不复制该视觉缺陷，不用固定坐标或隐藏入口解决容量问题。

历史查证：`89de53e` 的 Provider 确认后刷新只覆盖 schema 选项；`54cd963` 的模型投影刷新仅识别 schema 设置路径；`62ea90d` 后 composer picker 只在整个 catalog 为空时提供配置入口。Host 已发布 `host.changed(kind:'models')`，客户端没有接到模型投影的失效链路。这是已验证的组合缺口，未进行 bisect，不能归因为某个最近提交独自引入。

## 实现边界

- Runtime 通过可选 typed `modelEvents` 接收 models/resync 与连接变化；Web 组合根过滤已有事件，不新增 Host 方法或协议。
- 当前窗口的 Provider save/delete ACK，以及原 unknown 的有效核对，也通知同一个失效入口。通知在列表重读之前发生：已确认的业务更改不能因后续列表读取失败而继续授权使用旧模型。
- 会话模型事实和 catalog 都有明确读取所有者。失效立即撤销旧发送配置；模型读取只影响模型字段，不重载 usage、budget 或整个 timeline。旧目标、旧 generation、被替换连接和 dispose 后的结果不能落到当前视图。
- 每种模型读取类别最多 2 个实际请求。会话模型队列另保留 1 个原目标业务读取候选和 1 个可替换的最新可见投影候选；可见投影失效不能取消原 receipt owner 的精确读取。底层不合作取消时，在实际 Promise 结束前不释放槽位。同一批重复失效合并，不声称跨网络、无版本信息的所有通知都能识别成同一变更。
- 已提交但结果未知的模型写入仍属于原 key/receipt owner。新事实读取不等于原请求已确认，Provider 变化不得清掉 unknown 或重新发送写入。
- UI 区分未选择、读取中、确认不可用、读取失败与断线。空 catalog 必须经过成功读取确认，不能将初始化空数组或读取失败解释为“尚未配置”。隐藏但仍被 Host 确认为有效的模型不被误判为已删除。
- 配置恢复复用 `app.openSettings({ scope:'global', section:'providers' })` 和已有 return context；设置属于 Host 全局，返回原会话，不消费原草稿、附件和工具上下文。
- 所有提示由宿主 en/zh typed copy 提供，错误 code 映射为安全恢复文字，不直接展示原服务端消息。结构采用正常 flex 阅读流，模型列表沿用已有 4096 契约上限、60 行分页与列表自身滚动。
- 冷启动首次点击允许先查清事实，只有原打开意图、原导航、原弹层和连接仍有效时，确认空 catalog 才直接进入 Providers。关闭、离开或后台失效不会建立导航意图。读取失败的 Retry 保留为同一个等待按钮；完成不抢已移走的焦点。隐藏但有效的模型与空可选目录可以同时存在，因此列表空文案只说明“没有可选择的模型”。

## 验收范围

下列矩阵描述验收范围；实际结果与候选版本边界分别记录，不借用上一单元的绿灯。

- Runtime：同窗口 Provider ACK、列表读取失败、第二客户端事件、事件合并、非合作取消时在途上限、A→B→A、旧读取与写 ACK、pending/unknown 原 key 保留、连接恢复、dispose。
- UI：已配置、未选择、确认不可用、读取中、读取失败、空 catalog、隐藏但有效模型；中英与长标识、1440/320 正常流、键盘及可访问名称；错误后就近重读，空配置原始点击的有效意图与迟到响应隔离。
- 真实 Host：删除／编辑使原模型失效、另一客户端变更、返回原会话、恢复到另一模型仅在 ACK 后可发送；保留草稿、附件和 Files；无 Run、付费请求或供应商验证。
- 原生窗口：使用已有 launcher 和新 Host/Web 资源、独立 profile，验证实际窗口内的模型失效和恢复，不连接用户 Host，不重建 launcher，不冒称通用 smoke 全覆盖。

### 已执行检查与候选发现

- 原生产包 `index-CisI4tXi.js` 的维护 E2E 先得到中英 2/2 红：真实删除并返回后，Send 在 8 秒期待窗口仍 enabled；原稿、附件、dirty Files 与会话身份断言先通过。没有点击 stale Send，不把错误可用反馈扩大为 Host 验证被绕过。
- Runtime 核心及现有回归 5 文件 **60 pass / 281 assertions**，新增专项为 **9 pass / 61 assertions**。主线 Provider 确认回调整合文件为 **11 pass / 97 assertions**；V2 UI、Provider、session workspace 四文件为 **37 pass / 312 assertions**。这些组合部分重叠，不合计成独立测试总数。
- V1 完整 `bun run test`：**2458 pass / 1 fail / 26141 assertions**，377 files、356.14s。唯一失败是外部认证组件的 canonical Lumen 控件边界（Invitation、PasswordReset、Quote、WorkspacePicker），没有修改或放宽该测试。见 [全仓日志](../artifacts/model-provider-recovery/full-test-v1.log)。完整运行后只调整空目录文案和布局条件，并补充定向几何回归，不声称在最终这些微调后又重跑了全仓。
- 根 strict lint 仍被 `hbar-ui/packages/lumen-app-ui/src/authentication/primitives.tsx:44` 的未注册 `react/no-unused-prop-types` 规则阻断；本单元 scoped lint 通过。根类型检查、相关格式与 flow/content/icon guards 分别运行。不能声称整仓 check 全绿。
- V1 新恢复 E2E **8/8**、旧模型入口 **2/2**；V2 加强完整裁剪边界与 center-hit 后仍 **8/8**，旧模型入口 **2/2**，原生 **4/4**。但亲看旧模型入口长名称对比图发现新增全局 flex-wrap 使正常模型与推理强度从同行变成两行；这些绿灯不能证明最终视觉完成。已加入 1440 宽度的同行几何回归，并将 wrap 限于实际显示关闭态恢复提示的容器。
- 原生第一轮夹具把大写 locale 放入 Provider ID，客户端 schema 按小写 ID 契约拒绝，未发 Provider 写请求。修正夹具后才开始行为验证；失败证据与新临时目录保留，精确进程清理为 0 错误。它不是产品故障或通过记录。

### 最终 V3 生产与原生验收

当前冻结资源为 `index-nPgKLkjA.js` / `index-BoYVj6Fm.css`，构建 3117 modules，源码树同时包含其他任务的 `d521794`。Web 和 Host resources 构建通过；既有大 chunk、Cargo 配置文件弃用和 linker stdout 警告保留，没有降级阈值或屏蔽。未重建 Tauri launcher、未安装软件、未重启用户 Host。

- 新维护 E2E **8/8 passed、35.1s**：中英 1440/320，真实 Host、原附件上传和 dirty Files；32 份 JSON 核对 66 个实际可见元素的完整裁剪边界与中心命中，0 失败。Provider 更改没有额外 usage/budget 刷新；两语言的重连用例也记录 usage 1→1、budget 1→1、连接数 2。这是实际用例观察，不声称所有 timeline resync 永远不做既有全量读取。详见 [完整红绿台账](../artifacts/model-provider-recovery/report.md) 与 `artifacts/model-provider-recovery/v3-final`。
- 原模型入口维护 E2E **2/2 passed**，覆盖原有目录 60 行边界、深页已选、搜索、推理滑杆预览／确认／取消与焦点，外加 1440 下 model/thinking 中心 Y 差不超过 1。新增断言先在 V2 得到实际 32px 差的红证据，V3 通过；原断言没有删除或改宽。最终 28 图在 `artifacts/model-provider-recovery/legacy/v3-screenshots`，主线亲看英文宽屏同行恢复图。
- 原生 **4/4 passed**：中英 × 900×600 / 1440×960，独立 SDK 删除当前 Provider 后，真实 WebView 不用手动重开模型菜单就显示不可用并禁用 Send；从就近入口进入 Providers，再返回原会话和原稿；真实 UI 选择 `local-fixture` 后恢复发送。4 次 UI 模型选择、0 Run、0 商业模型请求，page errors/console 为空。主线亲看中文 900 恢复浮层和英文 1440 恢复后输入区。此原生范围不包含附件、读取故障注入、设置页删除、冷空配置首次导航，不能借浏览器覆盖冒称原生已测。
- 原生证据目录：`artifacts/model-provider-recovery/native/hbar-native-session-model-recovery-IXLPiW`，包含 12 图、`verification.json`、`cleanup.json` 与 `directory-cleanup.json`。精确自有进程链为 `34188 → 13352 → 42612`，Host 63957、调试端口 9443；按捕获的 executable/parent/argv/createdAt 重验后退出，0 清理错误。新 profile `IXLPiW` 和 workspace `xVchvM` 已删除且存在性复核为 false；旧失败 `R094Ys` / `G1a3DX` 保留，保护进程与旧拒删目录均未处理。
- 新恢复 E2E 的 10 个 Host 均通过自有 stdin 正常退出 0，10 个新目录经 resolved-temp 与前缀验证后删除；原稿／附件只是临时测试数据，删除后不能从本轮目录恢复，截图与 JSON 仍保留。原模型入口的私有端口 45211/45212 已独占 bind 确认释放。没有使用真实密钥或供应商验证。

最终本单元 TS 的 strict ESLint、Prettier、flow/content/icon guards、diff check 通过，交付前根 TypeScript 再次通过。临近交付再次跑 UI 定向测试时，外部 `kanban.tsx` 所导入的 `kanban/BoardReference` 尚未落地，得到 0 pass / 4 加载错误；该文件随后由其所有者创建，重跑同组合又因同一外部入口的 `kanban-reference.css` 尚未落地得到 0 pass / 4 加载错误。两次失败均保留在 [旧入口验收记录](../artifacts/model-provider-recovery/legacy/verification-report.md)。外部所有者补齐 CSS 后，同四文件组合最后实跑 **36 pass / 306 assertions、18.15s、exit 0**，见 [最终定向日志](../artifacts/model-provider-recovery/legacy/final-focused.log)。本任务未补写或删改外部文件，没有把加载错误当作业务测试通过；完整测试仍有前述认证边界失败，根 lint 阻断也未由本单元处理。

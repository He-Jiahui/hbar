# Goal 生命周期：顶部摘要与持久历史卡

本单元迁移 cc-haha 的“当前目标在会话标题下、历史目标在 transcript 内”的分工，不改变 hbar 的 Goal 调度或计费。它是完整桌面体验迁移的已验收子集，不代表全部入口已达到最终预期。

已独立提交 Host 查询 `7c6e6e9`、runtime 恢复 `3e2d02b` 和 UI `bea70a7`。后续验证提交只补消息窗口／原生验收与证据，不修改这些业务语义。

## 参考证据与有意适配

先挂载原 `MessageList` 的七种 GoalEventCard，而非复制私有卡片；再挂载原 `ActiveSession` 整页与 typed stores，确认真正的 SessionChatHeader → ActiveGoalStrip → MessageList 顺序。参考 HEAD 为 `e28d0a65`。

- [原中文 1440 active](../artifacts/goal-lifecycle/header-reference-zh-CN-1440-active.png)、[900 paused](../artifacts/goal-lifecycle/header-reference-zh-CN-900-paused.png)、[完成后摘要消失](../artifacts/goal-lifecycle/header-reference-zh-CN-1440-completed.png)。
- [原 320 mobile guard](../artifacts/goal-lifecycle/header-reference-zh-CN-320-active.png)、[历史卡展开](../artifacts/goal-lifecycle/reference-zh-CN-320-expanded.png)、[折叠](../artifacts/goal-lifecycle/reference-zh-CN-320-collapsed.png)。
- 原 ActiveSession 检查 en/zh × 1440/900/390/320 × active/paused/completed，共 24 组；API/provider/WS 被拒绝。它们证明原组件表达，不证明 hbar 的真实 Host 接线。[DOM observations](../artifacts/goal-lifecycle/header-reference-observations.json) 与 [fixture 说明](../artifacts/goal-lifecycle/header-reference/README.md) 保留输入、字体和边界。

原 mobile 会隐藏整个 header 和 Goal strip。hbar 保留已有工具 header、Pause/Resume/Clear/Expand 能力及紧凑目标摘要，这是明确的功能可达性适配，不声称逐像素照搬。当前目标只有一条摘要；完成后隐藏。目标动作的 pending/unknown/error/清除确认仍在摘要旁，创建目标的 partial/unknown/reconcile 反馈留在 composer 旁。

历史卡默认展开，整行标题是有 `aria-expanded`/`aria-controls` 的原生语义按钮，Enter/Space 不失焦。卡片没有当前 Goal 的变更、消息 Copy 或 Fork 操作。长目标默认两行预览，提供只读全文展开，避免 4000 字符目标在每张卡初始占满窗口。文案和格式由 Host 的中英文 typed labels 提供；图标使用 Lumen 语义 `sm` 等级，布局是正常 flex 流。

## 数据与恢复边界

- [Host 查询](desktop-goal-history-query.md) 仅读取 canonical created/updated/accounted/cleared，在同一 Worker 事务内按部分索引逆向取 `limit+1`，固定 anchor；不扫描全日志、不从当前 Goal 倒推过去。
- runtime 显式可选 `goalHistory` port，8 会话 LRU、每会话 1000 个事实、每页 100 个、窗口补齐最多 10 页、读取超时 12 秒。复用原会话 watcher，stream token 不触发历史读取；重连、seq 缺口、选中会话变化和 late response 有 generation 保护。
- 消息页和 Goal 页的游标不同。只将已加载消息窗口中的 Goal 事实排入 transcript，窗口前最近事实只做前置状态。未读 `preceding:null` 不冒充已确认历史起点。
- 生命周期按同目标状态／objective／tokenBudget 变化生成；新身份根据前目标是否完成区分设置／替换。纯计费不刷卡，完成后追加计费不改写完成时卡片。清除使用紧邻前置目标，而不是后来新目标。
- 只有 Host 状态进入 complete 才显示完成；普通 Run completed、assistant 文本、pending 消失均不是完成证据。历史没有稳定 actor 或清除原因，不虚构“用户点击”。
- 消息分页成功而 Goal 查询失败时，消息保留，历史给出独立 gap/error 和重同步入口；容量、stale、unsupported 也有明确反馈。Goal-only 会话可独立翻页，不制造人类消息或 Run。
- React View 通过 runtime 公共数据类型获取历史；不直接新增 View → Host contracts 依赖。View 不拥有第二套应用事实。

## 实际验证

| 范围                  | 已执行结果与限制                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host/Storage/contract | 18 tests / 257 assertions，通过；认证、Fork、畸形数据、固定 anchor、clear 前置状态、2005 普通事件的稀疏页与索引计划。                                                                                                                                                                 |
| runtime/timeline      | 14 tests / 122 assertions，通过；1000/8 边界、重连／回退、pending live、取消、12 秒超时、Goal 失败不撤回消息，stream 不重读。                                                                                                                                                         |
| presentation          | 13 tests / 218 assertions，通过；同目标状态、计费去重、历史快照、身份／会话隔离、seq 合并、语义 disclosure 和双语。                                                                                                                                                                   |
| 真实 Host 浏览器      | `goal-lifecycle.spec.ts` + 既有真实自动续作 `goal-continuation.spec.ts`，5/5；en/zh 与 1440/900/390/320、接近 4000 字符目标、清除／换目标／刷新、键盘折叠、106 条 Goal-only 页与有界虚拟 DOM。                                                                                        |
| 消息窗口强集成        | `goal-history-message-window.spec.ts`，en/zh 2/2；108 个真实 Goal facts、142 人工消息、一个人工 seed 的 settled source=goal Run。只注入一次旧 Goal 页 READ_FAILED，消息／草稿保留，显式恢复后顺序正确；未读窗口前 Goal 不跳顶，空输入不成为空白消息。这个 Run seed 不是实际自动调度。 |
| 原生 WebView2         | 现有 debug launcher + 本轮新 Host/Web resources；独立 profile，1440×960 与 900×600，通过旧目标 complete/clear/new paused Goal、摘要位置、长目标、键盘、刷新、刷新前草稿保护及无横溢。无 provider Run，不声称重编译桌面 exe 或 memory-only 草稿跨 reload 持久化。                      |
| 静态／构建            | root typecheck、严格 scoped lint、三 CSS flow guard、生产 Web 与 Host resources 构建通过。现有 bundle size 与 cargo config warning 仍保留。                                                                                                                                           |

当前画面：[hbar 中文 1440](../artifacts/goal-lifecycle/host-zh-CN-1440-expanded.png)、[320 展开](../artifacts/goal-lifecycle/host-zh-CN-320-expanded.png)、[320 折叠](../artifacts/goal-lifecycle/host-zh-CN-320-collapsed.png)、[完整消息页 320](../artifacts/goal-lifecycle/message-window/zh-CN-320.png)、[原生 900×600](../artifacts/goal-lifecycle/native/history-expanded-900.png)、[原生验收 JSON](../artifacts/goal-lifecycle/native/verification.json)。

首轮全量 Bun 1694 tests：1691 pass / 3 fail。自有失败是新增 View 直连 contracts 的依赖门禁，已改 runtime 公共 DTO 导出并重跑通过；另两项分别在并行修改的 notifications 原生控件边界、decision-laya 持久工具测试。本次不修改这些外部任务文件。最终全量重跑结果另行记录，不将这次红测称为整仓通过。首轮 root lint 的 floating promise 位于并行 laya fixture，也不是本单元修改。日志：`artifacts/goal-lifecycle/unit-suite.log`。

原生首轮在进程身份校验处 fail closed：supervisor 启动参数保留 `../../../dist`，字符串比较误拒。新脚本用 Windows CommandLineToArgvW 读取 argv，对 exe、脚本、唯一 data/cache/workspace 参数规范化后精确比较，保留 PID 父链与创建时间检查；新 fixture 验收通过且正常清理。首失败现场仍保留：临时 Host PID 48668／supervisor PID 9572，以及 `C:\Users\HeJiahui\AppData\Local\Temp\hbar-native-session-goal-sFuoqy`、`...\hbar-native-goal-workspace-UU4B3r`。主线准确校验后的 PowerShell 清理调用被执行策略拒绝，未尝试绕过或终止用户窗口。

## 后续总目标

回到[桌面逐入口审查](desktop-entry-audit-2026-09-26.md)：完整 Goal 的本单元已闭环，但全局语言入口、插件安装管理、归档批操作与全部入口矩阵还需逐项核对真实契约。通用 desktop-smoke 导航材质门禁尚未重验，不能用本原生 Goal 子集替代。Browser/terminal/schedule/MCP/template/rewind 也不能靠占位入口宣称参考等价。总 Goal 继续保持 active。

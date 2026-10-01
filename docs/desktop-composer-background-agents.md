# Composer 后台 Agent 停止入口

本单元在 `1af0730b` 基线上完成输入区的独立后台 Agent Stop，日期为
2026-10-01。仅修改隔离 `codex/session-launch-target` 工作树，CC-haha、主工作区
与共享 hbar-ui 均只读；多 agent 分别复核 CC 入口、运行时与导航证据。

## 参考与真实差距

已查看 CC 随仓库提供的 `D:/Git/cc-haha/docs/images/app/en/session-main.webp`，
它证明圆形、实心、右侧的主 Stop 层级，但不是“空闲父会话 + 后台 Agent”的截图。
该特定状态的直接证据是 CC readonly `ChatInput.tsx:1479-1493`：主会话空闲且
`hasRunningSubagents` 时，在正常 Run/Send 前插入另一枚 danger 圆形 Stop。
`ChatInput.test.tsx:1026-1064` 验证 Stop 与 Run 同时存在且各自工作；
`chatStore.ts:2159-2208` 的 Stop 请求覆盖当前可取消后台 Agent。
不把源码推导宣称为已实测 CC 的此状态，也不照搬截图坐标或未提供的能力。

hbar 既有 `5c83ef3c` 已迁移主 Send/Stop 层级，但它仅取消当前主 Run。
后台 Agent 可从详情取消，输入区却没有直接入口。旧生产 build 的本单元红测确认
`.hbar-composer-background-stop` 不存在。这是入口缺口，不是已有取消目标错乱，
也不是侧栏缺少父子任务聚合；后者已有独立交付与回归。

## 实现与边界

- 输入区没有主 Run 且有可停止直接子 Agent 时，模型/思考等级后、Send 前显示
  独立 danger Stop。Send、草稿、主 Run Stop、Queue 和原提交门禁不变。
  使用公开 Lumen Button/Icon、`md` 图标 tier 和既有主动作点击目标；
  自有 composer 增加公开 slot，不改共享组件或隐藏其私有 DOM。
- View 只渲染宿主提供的中英文 typed labels、计数与状态；普通内容使用 flex 流。
  状态反馈位于输入区上方，区分请求中、已接受待结束、未知、核对中、已结束、失败。
  “本次停止目标已结束”不意味着新来的 Agent 已停止。
- 独立 runtime 模块经公开 `agent.list/result.get/cancel` 协调，没有新增 Host
  `cancelAll` 或越过审批/插件内部状态。列表最多 100+28=128 个直接子 Agent，
  foreign、duplicate、非法 cursor、超容量均显式失败，不从部分列表发起取消。
  Session/workspace/source-tab instance/archived 状态在动作前校验。
- 新 Stop 捕获当前快照，取消并发最多 4。`created + runId=null` 尚不可取消，
  不计入入口；`cancelRequested` 只等待事实，不重复发送取消。
  请求有 12 秒上限及 AbortSignal 竞速，忽略 signal 的 adapter 也能停止等待；
  dispose 不发布迟到结果。状态缓存最多 32 个 Session，不静默丢弃 unresolved 目标。
- 取消期间刷新保留动作状态；较旧刷新不能覆盖新快照。已接受的原目标仅在严格
  Agent/parent/child Session/request 身份匹配且真的 terminal 后转为已结束。
  Unknown 要先核对原目标；核对只读取结果，不重新取消。
  Failed 重试只重试原失败目标，不把刷新后新增 Agent 混入旧请求。
  切换到其他会话不会改变已捕获动作对象，其他会话的 Agent 不受影响。
- 保留 CC 的入口位置与核心逻辑，但不是原子 Host 批量停止，不自动扫入之后新增的
  Agent，也未新增全局后台 Stop 快捷键。现有 Cmd/Ctrl+. 的主 Run 语义不变。
  Team、bash/dream 后台任务和持久化跨客户端取消恢复不在本单元范围。

## 实际验证

- 最终 focused Bun tests：**23 passed / 448 assertions，4 个文件**。
  覆盖 runtime 分页/目标/失败重试/未知核对/created、刷新竞争、busy 刷新、
  reconcile 单飞与 dispose；React localized/long copy、0/1/3/128/129 计数、
  非提交按钮、独立 Send，以及原 composer/session workspace 回归。
- 最终真实临时 Host **4/4，通过 20.6 秒**：新增后台 Stop 主流程，中文主 Run
  Queue/Stop，中文父会话工具创建 Agent，Project/Time 侧栏父子任务状态联动。
  后台流程实际取消两名原 Agent；在响应延迟期间切换会话，另一会话的 Agent
  仍等待审批。丢失响应后核对不重新取消，新来的 Agent 仍等待；之后实际 Send
  完成唯一主 Run、清空原草稿，并继续展示后台 Stop。未批准 fixture 文件写入。
- 主 agent 查看最终 desktop 1440 与 narrow 320 截图，确认 Stop/Send 不重叠、
  无横向溢出、草稿与反馈自然换行。截图位于
  `artifacts/background-agents-v40/final-results/composer-background-agents-a1c82--cancelling-another-session/`。
- scoped strict TypeScript、类型感知 ESLint 零警告、内容/图标/flow guard、
  Prettier 和 diff check 通过。生产 build 成功，3399 modules，最终
  `artifacts/background-agents-v40/web/assets/index-mVuwe_WW.js` /
  `index-PW5qbQCx.css`。既有大 chunk 警告仍存在。
- 首版真实测试暴露 requested 没有随真实 terminal 推进、因此新的 Stop 保持禁用；
  已修正并重跑通过。最终 runtime 复核另修正 stale refresh 覆盖与 reconcile
  dispose/单飞缺口，均加入可重复行为测试，没有把失败检查报告为通过。

仅运行独占 localhost preview、临时 Host 与 local-fixture，资源随测试关闭。
Bun 仍报告既有 tsconfig override directory-mismatch，但测试退出 0；
Host 关闭时 Vite 的 ECONNRESET 不代表流程失败。未跑全仓门禁、原生 desktop
build/smoke；未安装依赖、改真实 Provider 配置、调用付费模型、merge、push 或部署。
本单元完成的是一个后台停止入口，不等于整体 desktop UI 迁移完成。

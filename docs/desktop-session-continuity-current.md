# 会话核心操作的当前证据与剩余语义

本轮以隔离 `codex/session-launch-target` 的 `6c7a34dd` 为当前实现，
只读 CC-haha `e28d0a65` 为参考。它更新当前会话流程的验收证据，
不因旧审计缺口已修复而宣称整个 desktop 迁移完成。

## 本轮实际检查

主 agent 重新查看 CC 完整 `docs/images/app/zh-CN/session-main.webp`，
以及未修改原 ChatInput 的隔离渲染
`D:/Git/hbar/artifacts/reference-ux-v2/queued-cards-reference-1440.png`。
前者证明运行状态、Activity 与输入区的位置关系，后者证明排队卡紧邻输入区，
每条消息拥有 Guide/Edit/Remove。隔离画面不是原 CC Host 的引导成功证据。

当前源码核对了 `composer-add-menu.tsx`、`composer-permission-picker.tsx`、
`composer-model-picker.tsx`、`composer-intent-controls.tsx` 与 `queued-user-runs.tsx`：
模型与思考归输入区右侧；Plan 归执行菜单；Goal 准备归 Add/slash 入口；
当前 Goal 摘要和历史事实分开；队列行绑定原 operation，而非当前消息文本。
CC `MessageList.tsx:295` 的 GoalEventCard 同样默认展开，不能把 hbar 的展开历史
误报为参考独有的折叠规则，或擅自折叠所有 Goal 事实。

复用 `6c7a34dd` 生产资产 `artifacts/selection-validity-v29/web/`，
JS `index-CJWhhNoY.js`、CSS `index-BUG_tiWa.css`。
实际运行两条定向流程，**2/2 passed，25.1s**：

1. `composer-goal-plan` 中文：Goal 准备、创建、暂停/恢复、文档编辑/丢弃/保存/清除，
   持久 Plan 进入、连续输入、只读工具约束与退出后继续输入。
2. `queued-run-guide`：真实 Kernel/Pi 与受控 localhost Provider，选中一条队列消息
   引导进仍运行的原 Run；canonical 用户消息唯一，后续 Provider 请求携带该消息；
   其余队列与未发送草稿保留，剩余队列随后按原顺序执行。

主 agent 查看了这次更新的中文 Plan 菜单、Goal 文档与 Guide 后320px画面。
相关动态内容正常换行，入口与草稿仍可见；行为依据实际 Host 断言，
不由静态画面推断。输出在 `artifacts/core-continuity-v30/host/`；
既有 Goal/Plan 用例仍将画面写入隔离树的 `artifacts/reference-ux-v2/`。
没有增加新按钮/尺寸矩阵、产品改动或假 capability。

所有 Host/Provider 为本次拥有的临时目录和 localhost 进程，已结束；
没有真实配置、付费流量、native 启动、安装、push 或 merge。
Vite ECONNRESET 出现在临时 Host 关闭阶段。此次不重复计入前一单元的
build/TypeScript/lint 统计，也不声称已新运行全仓门禁。

## 尚不能视为完成的差距

- **Goal + Plan 共存**：当前是两个互斥准备方式。改成“先规划、再按 Goal 执行”
  会改变 durable 执行语义，不是移动一个按钮。此前问题未获得选择，
  本轮保持现状，不把模型/思考选择的答复当作对该组合的授权。
- **`/agent` 路径**：CC 把整条指令交给父会话，hbar 直接创建子 Session/Run。
  需要确定最终希望哪条执行路径；已有子会话来源返回不能证明这两者等价。
- **等待审批时 Guide**：hbar 仍只接受 running Run，不旁路审批等待。
  当前 production Guide 流程通过，不代表 waiting-approval 分支已对齐 CC。
- **原生 Browser、PTY、Team 等**：现有自动化或单个 Agent 不等于原生预览、
  交互终端或 Team timeline；继续遵守[公开能力边界](desktop-workbench-remaining-audit.md)
  和[Browser 安全边界](desktop-browser-preview-boundary.md)。

这两条当前真实流程证明已交付的主要会话操作仍成立；没有发现新缺口并不等于
全目标完成。新一轮并行只读审查在执行，未返回的结果不计作审核通过。

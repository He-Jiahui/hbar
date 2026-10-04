# Plan 退出决策：参考与交互边界

## 参考依据

参考 `cc-haha/desktop/src/components/chat/PermissionDialog.tsx` 的 `ExitPlanModePermissionDialog`，以及 `MessageList.tsx` 中原请求的渲染和 `chatStore.ts` 的 `respondToPermission`。批准与继续规划回答同一个 `requestId`，不是发送一条新消息。

直接渲染原组件的隔离证据保存在 `artifacts/plan-proposal-v2/01-reference-plan-1440.png` 和 `02-reference-plan-continue-390.png`。这不是完整应用或真实服务截图。观察到的层级为：等待决定的标题 → Markdown 计划文档 → 可选反馈 → 批准/继续规划。响应后仍保留计划，移除输入与动作。

hbar 实现使用相同阅读与动作顺序、普通 flex 流、Lumen 控件和语义图标等级。一个计划正文最多 20,000 字符，反馈最多 4,000 字符；文档区域自身滚动，反馈和动作不放在文档滚动区内。中英文文案由 Web 宿主提供。

## Host 事实与安全边界

- Plan 模式提供 `exit_plan_mode` 工具，必须人类明确决定，不能由 Run 的 `allow` 自动通过，也不能用普通 `approval.resolve` 代替。
- `planExit.resolve` 绑定 session、approval、run、call 与认证 actor。批准切换原 Run 的有效模式与后续会话模式为 Default；历史 `Run.input.mode` 保持 Plan。
- 继续规划将反馈返回原工具结果，不创建 detached Run，不退出 Plan，不允许写工具。
- 批准计划不是提升工具权限。普通 `ask` 写操作仍需审批，`deny` 仍拒绝。没有复制参考的全局权限更新。
- 审批与模式事实只写一个 fsync 的 canonical `plan_exit.resolved` 事件，SQLite 投影和 Plan 模式从同一记录恢复。Workflow 不把这个控制决定记作修改或验证进度。
- 同 actor 的相同已确认决定返回原事实，不再追加记录；不同决定不能覆盖首个决定。晚到的取消后决定不生效。
- 丢回复保持 unknown，UI 禁止重新决定。`planExit.get` 用原身份只读核对，不依赖“pending 消失”或过期事件游标。
- Host 重启仍按既有规则中断活动 Run；记录可核对，但没有声称自动续跑。
- 快照将 pending 审批优先保留，审批总量最多 80；已响应 Plan 历史仅随当前有界消息页精确关联的 call/result 返回。刷新后计划与反馈仍可读。

## 验证入口

- `tests/plan-exit-host.test.ts`：三种权限模式、原 Run 的下一模型请求、写工具权限、反馈、取消、重复决定和只读核对。
- `tests/plan-exit-storage.test.ts`：单记录投影重建、截断记录、身份/模式不一致、快照页关联与容量。
- `tests/workflow-sequence.test.ts`：active/blocked Workflow 中审批可达，且不伪造 mutation/progress。
- `tests/plan-exit-ui.test.tsx`：中英文文档、容量、unknown 禁止重写、精确身份和只读恢复。
- `e2e/plan-exit-entry.spec.ts`：临时真实 Host、中英文、1440/390/320、Markdown 内部滚动、键盘批准、反馈、持久模式、刷新后回看。输出放 `artifacts/plan-exit/results`。
- `scripts/verify-desktop-plan-exit.ts`：独立临时 profile 的原生 WebView 验证已通过，加载本轮 Host/Web 资源，在 900×600 批准、结算并刷新回看；截图在 `artifacts/plan-exit/native`。使用现有 debug 适配层，不声称新 exe 构建成功。

本页只描述这个交互闭环，不宣称旧的完成后 `proposed_plan` 提案动作已经变成同轮审批或完整 Goal 生命周期卡已完成。通用 desktop smoke 在已有导航选中态标记检查处失败；原生 debug 构建因用户正在运行的 exe 占用而失败，未结束该进程。定向原生验证不能替代这两项全桌面门禁。

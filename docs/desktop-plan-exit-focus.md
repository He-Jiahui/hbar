# Plan 同轮决定后的原位焦点

本单元补齐审批决定的阅读/输入连续性，不修改 Plan Host 状态机、审批身份或 Run 提交。只在隔离工作树 `codex/session-launch-target` 实施；CC、主工作区及共享 UI submodule 保持只读。

## 参考与原因

CC `e28d0a65` 的 `desktop/src/components/chat/PermissionDialog.tsx` 中 `ExitPlanModePermissionDialog` 保持同一个请求卡：pending 时显示计划、可选反馈和批准/继续规划；responded 后保留文档，移除反馈和动作。主线程查看了旧原组件/原主题隔离截图 `D:/Git/hbar/artifacts/plan-proposal-v2/01-reference-plan-1440.png`、`02-reference-plan-continue-390.png` 和 `02-reference-plan-approved-390.png`，并核对源码。它们不证明完整 CC App、真实 Host 或完成后的焦点行为；CC 原组件本身没有明确 post-decision focus owner。

hbar 的 `7d9f0f78` 已交付同 Run 审批，但同样没有给完成态 card 可聚焦语义。审批按钮卸载后，旧 `e2e/plan-exit-entry` 只检查文档/状态/Host mode，没有检查键盘落点。当前 Web `index-DY4RW4j3.js` 的真实中文 Host 流程新增原位焦点断言后失败：状态已批准、原 section 保留，但 `toBeFocused` 为 inactive（15.5s；`artifacts/plan-return-v23/red/`）。这是已复现的界面连续性缺口，不是 Host 执行失败。

## 交付

- 卡片使用 `tabIndex=-1`，不增加普通 Tab 顺序中的额外停靠点；可访问描述关联原卡的真实状态文本。
- Implement、Continue 及同身份 Reconcile 保存触发按钮的临时焦点所有权。只有确认已完成且焦点仍属于原按钮/其卸载后的 BODY 时，才把焦点留在原卡；`preventScroll` 不要求跳回输入区或重排消息。
- 用户主动 pointer/keyboard/focus 转去 composer、其他控件或会话会撤销旧焦点所有权。窗口没有焦点、modal/popover 存在、原卡隐藏或卸载时不移动焦点；事件监听在卸载时清理。禁用按钮后的重复 Enter/Space 不当作转去其他目标。
- 用原已有 Host 文案、图标等级和文档流，不新增 CSS、演示内容、后台写入或默认配置。这个原位可达性补强与已交付 ProposedPlan 的 focus lease 一致，但不声称 CC 原组件有同样的显式焦点机制。

## 实际验收

最终生产 Web `artifacts/plan-return-v23/web/assets/index-DBzGJMo5.js`，CSS 保持 `index-D-gDr7-e.css`，3382 modules；build 通过，已有大 chunk 警告仍在。中英文真实临时 Host 连续流 **2/2，通过18.1s**：批准→原 Run 完成且 mode=default；反馈继续→原 Run 完成且 mode=plan；确认前主动回 composer→原输入焦点保留。三轮独立 Run 对应三次用户决定，没有额外 Run，所有步骤的未发送草稿保留，刷新后原计划/反馈仍可读。第三轮只在浏览器传输边界暂存原请求，释放后交给真实 Host，不伪造结果。

额外中文正常滚动阅读流程通过（9.7s），截图 `artifacts/plan-return-v23/reading/.../plan-exit-approved-zh-CN-320.png` 与 `plan-exit-continued-zh-CN-320.png` 可见原位完成状态；滚动是浏览器真实 wheel 操作，没有 DOM 注入或改变产品 followLatest。完整原位/输入焦点截图位于 `artifacts/plan-return-v23/final-current/`。原截图未能显示卡头是跟随最新消息后的实际视口，不被包装成卡片全图证据。

既有 Host/storage **16 tests / 121 assertions** 通过。修改范围严格 TypeScript、零警告 ESLint、文案/图标 guard、Prettier 和 diff 检查通过。测试的 held release 原先用闭包变量导致 TS 控制流收窄为 never，改为有类型的对象字段后检查通过。未运行全仓/native/旧 Lumen SSR，不安装缺失的 submodule 依赖。自有 Host/Web preview 都已停止；teardown 的 Vite ECONNRESET 不等于页面错误。

连续阅读截图还暴露了另一个待核对问题：继续规划的用户决定之后，通用工具结果仍可显示“Tool failed / User denied the tool call”。该工具拒绝事实与“返回规划”用户意图的显示关系需要独立审查；本单元不把它悄悄改成工具成功。

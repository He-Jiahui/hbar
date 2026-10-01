# 审批与问卷完成后的原位操作连续性

本单元以 `5946ce50` 为基线，仅在隔离 `codex/session-launch-target` 工作树实施。
CC-haha、主工作区和共享 hbar-ui 保持只读，不改变审批策略、Host 状态机或 Run 提交。

## 参考与复现

主 agent 查看了 readonly CC 原组件与主题的既有隔离截图
`D:/Git/hbar/artifacts/reference-ux-v2/14-decisions-pending.png` 和
`16-decisions-resolved.png`，并核对 PermissionDialog 与 AskUserQuestion 源码。
视觉表达为：待决定时在当前工具附近显示动作；回答后保留原卡和内容、移除写入动作。
截图外层与记录是 fixture，不代表完整 CC runtime。
CC 原组件没有显式的 post-decision focus owner；本次不声称逐字复制了其焦点实现。

hbar `092e4082` 引入普通原位决策卡，完成后卸载动作，但 section 没有可聚焦落点。
`9623fa37` 已补齐 Plan 的同轮焦点，不覆盖普通审批/问卷。
真实中文临时 Host 对上一版生产 Web `artifacts/plain-actions-v36/web/`
新增完成后原卡焦点断言，允许结果已确认、动作消失，但 section 仍为 inactive，红测失败。
记录在 `artifacts/decision-focus-v37/red-results/`；这是操作连续性缺口，不是文件执行失败。

## 实现

- 普通审批与问卷卡有 `tabIndex=-1`，不增加普通 Tab 顺序中的新停靠点。
  可访问描述关联当前卡的真实 Host 状态文本；没有新增可见文案。
- 将既有 Plan 的焦点所有权提取为内部 `useDecisionResultFocus`，
  普通 Allow/Deny、问卷 Submit 和原身份 Reconcile 复用同一行为。
  只有完成确认到达、焦点仍属于触发按钮或该按钮禁用/卸载后的 BODY 时，
  才把焦点留在原卡，使用 `preventScroll`，不跳到输入框或改变导航。
- 用户主动转到其他控件、输入区或会话，会撤销旧所有权。
  窗口无焦点、modal/popover 存在、原卡隐藏/卸载时不主动聚焦；监听随组件卸载清理。
  重复 Enter/Space 不增加决定或 Run。
- 普通卡有语义 focus-visible outline；内容继续正常 flex 流和自然换行。
  沿用宿主文案、原图标尺寸与原数据契约，没有演示内容或第二份业务状态。
- Plan 仅替换内部焦点 helper，文档、反馈、原 Run、审批身份和模式转换保持不变。

## 实际验证

- 中英文普通决策与中文 Plan 真实 Host 连续流 **3/3，通过 21.2 秒**。
  普通流验证：Allow 后原卡聚焦并可读状态；问卷 Space 提交后原卡聚焦且答案保留；
  刷新恢复原卡；第三次 Deny 的原请求在浏览器传输边界短暂等待，
  主动回 composer 后释放给真实 Host，结果不得抢焦点、草稿保留、文件不被拒绝写入，
  同 Session 只有对应三次 Run。没有伪造成功响应。
  Plan 回归仍验证 Implement、Continue、反馈保留和确认前主动回 composer。
- 单元、SSR、决策 runtime/recovery 和 Plan UI **40 tests / 253 assertions** 通过。
  初次命令误写了不存在的 `plan-exit-runtime.test.ts`，Bun 只执行另外三份；
  最终改为实际 `plan-exit-ui.test.tsx` 并确认执行四份，不虚算未执行项。
  Bun 的既有 override directory-mismatch 诊断仍出现，最终测试进程退出 0。
- 最终生产构建成功，3394 modules：
  `artifacts/decision-focus-v37/web/assets/index-CWUEbQbb.js` /
  `index-BHaq9uWZ.css`；保留已有大 chunk 警告。
- 主 agent 查看最终中文320px 的 `approval-confirmed`、`questionnaire-confirmed`、
  `approval-newer-composer-focus` 三张截图，前两张原卡有焦点描边，后一张保持输入区焦点。
  文件在 `artifacts/decision-focus-v37/final-results/` 的中文普通决策目录。
  保留既有路径的宽/窄截图，不新增按钮 × 尺寸矩阵。
- 改动范围严格 TypeScript、类型感知 ESLint 零警告、文案/图标/flow guard、
  Prettier 与 diff 检查通过。没有将视觉截图替代 Host 身份、唯一写入或焦点断言。

使用独占 localhost、临时真实 Host 和 local-fixture；没有商业调用、真实配置变更、
依赖安装、全仓门禁、原生构建/启动、push 或 merge。
测试自有 Host/browser/preview 已结束；teardown 的 Vite ECONNRESET 不等于 pageerror。
本单元补齐决策卡操作连续性，不宣称整体 CC desktop 迁移完成。

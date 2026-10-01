# Desktop 核心体验的当前复核

本记录绑定隔离 `codex/session-launch-target` 的 `af9162a6`，参考为只读 CC-haha
`e28d0a653481ef41b7a329411eeb2f0fd5656731`。它收敛当前事实与下一步，
不把早期审计中的“当时缺失”继续当作当前缺陷，也不声明完整桌面体验已经迁移完成。

2026-10-01 更新：用户已确认推荐语义。Goal + Plan 共存已在后续
[composer 交付](desktop-composer-entry-parity.md)实现并验证；`/agent` 选择父会话
prompt 路径，仍需独立 Host/tool 交付。waiting-approval Guide 保留限制。
下文的“未决”是本次基础复核时的历史状态，不再要求用户重复选择。

后续独立交付包括[排队卡动作层级](desktop-queued-action-hierarchy.md)与
[首发模型目录连续刷新](desktop-first-send-model-catalog.md)。后者补上存活首发页的
Provider 变更失效链路，保留已选择模型/思考与草稿；其新证据独立记录，不混入下面
基础复核的执行统计。

[差异评论后继续输入](desktop-file-review-continuity.md)随后补齐可见原会话 composer
的连续衔接，窄屏保持阅读与原草稿/引用/唯一 Run；没有以自动导航代替来源归属。

[首发选择失效恢复](desktop-first-send-selection-validity.md)进一步处理 Provider
删除模型或调整思考等级后的真实显示与发送有效性：保留显式选择及草稿，
就近提示并等待用户确认，不用显示 fallback 冒充已确认选择。

[会话连续操作的当前证据](desktop-session-continuity-current.md)在 `6c7a34dd`
生产资产上新执行 Goal/Plan 与同 Run Guide 两条主线，收敛已交付行为和仍需
明确的执行语义；其统计独立于下面基础复核。

## 当前入口组织与可观察完成条件

| 核心路径                           | 当前实现与完成条件                                                                                      | 当前证据范围                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 模型与思考 → 首发                  | 发送前显示实际有效默认模型和思考；切项目保留已显示选择；发送只创建一次用户 Run                          | 本轮生产 Web + 临时真实 Host 通过；默认入口的 CC 原组件依据见[首发记录](desktop-first-send-default-model.md)                        |
| 会话内模型选择                     | 输入区原位搜索、Provider 分组、选中项、目录追加与独立思考入口；不清草稿、不跳全局设置                   | 当前 `composer-model-picker.tsx` 与此前[模型记录](desktop-model-interaction-reference.md)；本轮未重新运行完整模型目录/故障矩阵      |
| Goal 准备 → 创建 → 生命周期        | Add 菜单准备，发送后确认真实 Goal 与唯一用户 Run；暂停/恢复、目标编辑、取消替换和清除归原目标           | 本轮 `composer-goal-plan` 中文真实 Host 流程通过；参考见[Goal 生命周期](desktop-goal-lifecycle.md)                                  |
| Goal 状态与实际执行                | 暂停续作不等于停止 Run；父/直接子 Agent 活动、等待审批、停止后的状态与未发送草稿明确区分                | 本轮 `goal-running-status` 真实 Host 流程通过；参考见[状态记录](desktop-goal-running-status.md)                                     |
| Plan → 文档 → 决定 → 同 Run 继续   | 执行菜单持久 Plan 模式；原工具旁审批文档、继续规划反馈、实施；确认后保留文档与草稿，尊重用户后续焦点    | 本轮 `plan-exit-entry` 中文真实 Host 流程通过；[原组件依据](desktop-plan-exit-reference.md)与[焦点交付](desktop-plan-exit-focus.md) |
| 运行中输入 → 排队 → 编辑/引导/停止 | 卡片紧邻 composer；编辑全文和多行保真，取消不写入；引导只作用于原 Run；Stop 不误取消后来排队项          | 当前源码与上一轮[多行编辑交付](desktop-queued-message-multiline.md)；引导执行合同见[存储记录](queued-run-guidance-storage.md)       |
| 导航与二级功能                     | 侧栏项目/会话归属，标题区 Files/Activity 与 More；Goals/Agents/Monitoring/Session settings 保留二级入口 | 本轮核对 `lumen-workspace-shell.tsx`、`session-tools-menu.tsx`；只证明入口结构，不替代全部 Files/Settings 端到端验收                |

当前全局 Search chats 已有真实 `chat-search` 入口，不能继续用旧报告中的
“仅有 Commands、缺少聊天搜索”描述当前状态。会话有 same-Run Plan Exit，
不能因另一个已完成文本 proposal 会创建新 Run，就误报此能力不存在。

## 本轮真实执行与画面

复用当前生产构建 `artifacts/queue-multiline-v24/web/`，资产
`index-DvD4Rxol.js` / `index-BUG_tiWa.css`。所有 Host 均为临时目录、
local-fixture 模型与独占 localhost 49168；Vite preview 使用 49169。
没有真实 Provider 配置、付费流量、原生启动或依赖安装。

- `pre-session-default-model`、`composer-goal-plan` 中文、`plan-exit-entry` 中文：
  **3/3 通过，1.4 分钟**。输出 `artifacts/core-continuity-v25/host/`。
- `goal-running-status`：**1/1 通过，14.0 秒**。
  输出 `artifacts/core-continuity-v25/goal-status/`；该既有测试将截图写入
  `artifacts/goal-running-reference-v12/hbar-*.png`，此次运行更新的是隔离树中的证据，
  不是修改主工作区或 CC 参考。
- 原测试保留其已存在的宽/窄画面检查，没有新增按钮或尺寸组合矩阵。
  第一次组合 grep 没匹配 Goal status 的实际测试名，因此后来单独执行，
  不把未被选择的测试记入第一次通过数。
- 主 agent 查看首发 ready-to-send、Plan Continue 与 Goal paused-background-narrow 实测截图，
  并查看 CC 的完整 `docs/images/app/zh-CN/session-main.webp`。
  首发与 Goal 内容在正常文档流；Plan 截图证明可见原位状态/文档，
  完整操作与焦点依据测试断言，不仅依赖静态截图。
- Vite 的 ECONNRESET 出现在临时 Host 关闭阶段；流程内 pageerror 检查通过。
  运行后 49168/49169/49170 无监听。

这些新证据支持上述四条核心路径仍然成立，不证明其他所有页面、商业模型、
原生窗口、安装包或全仓门禁已通过。本轮不重复计入上一轮的类型/lint/构建结果。
本轮文档提交仅执行文档格式与 diff 检查。

格式检查的一次诊断曾将工作副本行末差异误写为历史正文格式差异。
按仓库配置且规范化 CRLF/LF 后，历史正文与当前已提交内容都匹配 Prettier；
重新格式化未产生 Git 内容差异，最终两篇文档格式检查通过。

## 未决差异，不默默选择

1. **Goal + Plan 组合。** 当前准备 Goal 会离开 Plan；是否改为先规划、审批后执行 Goal，
   需要用户选择。已经重新发出自包含的问题，未以无回复当作同意。
2. **`/agent` 语义。** CC 将整条指令发给父会话；hbar 直接创建子 Session/Run。
   这是执行路径差异，不是仅改菜单位置。已经请求选择，未擅自切换。
3. **等待审批时 Guide。** CC 仍显示入口；hbar 的 View 和 runtime 都只接受 running。
   暂不绕过审批等待边界。当前行为与完整入口一致性仍有差距，不能视为已对齐。
4. **装饰与状态区分。** 当前某些按钮短横线来自 Lumen 默认 lamp。
   `LumenButton` 可显式选择 none 且保留 focus-visible；`LumenIconButton` 没有该公开选项。
   不向后者传无效 prop，不改只读共享组件，也不把状态/焦点显示当装饰删除。
   随后的[排队卡动作层级](desktop-queued-action-hierarchy.md)已对 queued surface 实施；
   其他按钮家族仍需依据其实际状态归属核对，不作全局隐藏。

Terminal PTY、不可信内嵌 Browser、Team、市场安装、定时任务等仍见
[公开能力与参考边界](desktop-workbench-remaining-audit.md)和
[Browser 安全边界](desktop-browser-preview-boundary.md)。不能用静态入口冒充后端能力，
也不能用本轮四条流程替代这些未完成项。Goal 保持 active。

# Desktop 核心体验的当前复核

本记录绑定隔离 `codex/session-launch-target` 的 `af9162a6`，参考为只读 CC-haha
`e28d0a653481ef41b7a329411eeb2f0fd5656731`。它收敛当前事实与下一步，
不把早期审计中的“当时缺失”继续当作当前缺陷，也不声明完整桌面体验已经迁移完成。

## 2026-10-02 主工作区当前复核

此补充绑定同步后的 `codex/hbar-app-ui` / `9f9ba9b9`，不是下文隔离树的旧执行统计。
主 agent 新执行四条代表路径，最终各通过一次：跨项目首次发送与目标 Files、
Goal + Plan 同 Run 审批、会话设置中修改全局 Provider 默认值，以及 Files dirty
文档往返 Settings／Status／工具后回到原稿。只沿用用例已有的内容变化与宽窄流程，
没有新增逐按钮／尺寸矩阵。

跨项目旧断言来自 `931b5c70`，仍要求 Markdown 阅读区出现原始 `#`。
`6ce5527f` 已把默认阅读改为语义 Markdown；本次分别验证真实标题，以及切 Source
后 `[data-source-code]` 的逐字原文，避免将行号混入正文比较。初跑三条通过、一条
旧断言失败；第一次 Source 断言也错误包含行号。修正后的单独目标流程通过，
前两次失败日志保留，不计成通过或产品回退。

补充草稿基础回归暴露另一旧同步假设：`prompt-drafts.test.ts` 在 dispatch 后立即
断言 uploading。`c6c2e52a` 引入 Host 会话校验，`27a38f1c` 的共享 transfer core
在 reservation 前保留该异步校验。测试现在等待受控上传 port 真正进入，再验证
12 项容量、上传中修改正文和最终合并；没有 sleep，也没有修改产品上传策略。
首次五文件组合为 80 pass / 1 fail；最终加入现有附件恢复测试后六文件
**95 pass / 586 assertions**。中间失败及最终通过分别记录，不能宣称全套 Bun 已通过。

本次生产资产仍为 `dist/web` 与 `dist/desktop-resources/web` 的
`index-ntEDYbqQ.js` / `index-D2rR5rhZ.css`，与已通过的 owned 临时原生
`run-20261002-30` 相同。本次只改测试与记录，未重新启动原生或构建；旧 native run
不能记成新一次原生通过。主 agent 亲看该 run 的模型／思考、Goal + Plan 准备／
批准、Files 阅读和 contextual Provider 图，并查看本次真实 Host 的 Markdown
Reading／Source、390 审批与 session settings dirty 图。

日志：`artifacts/desktop-experience/core-current-9f9ba9b9.log`、
`core-current-project-final.log`、`core-current-project-confirmed.log`、
`core-current-focused-unit.log`、`core-current-focused-unit-confirmed.log`。
实际新截图位于 `artifacts/desktop-experience/core-current-9f9ba9b9/results` 与
`project-confirmed`。临时 Host／preview 的 45539／45540 已释放，没有付费 Provider。

这些证据证明四条核心路径在当前资产上成立，不替代完整 E2E、商业 Provider、
原生英文／故障分支、Edit／Save／长 diff 的 native 验收或新后台能力实现。
两个独立只读 gpt-6-luna/max agent 另按当前源码和实际参考／native 图核对核心入口。
导航 agent 曾将 generic `app.openPanel` 的 followActive 测试误判为当前会话 Files
差异；主线追踪实际按钮的 `sessionTools.toggle` 与按 workspace/session 保存的 Owner
后，agent 已撤回该结论。`cdf2b49c` 已交付该行为；旧 P2 审计不能覆盖当前事实。
本次另新执行英文 A Files／dirty／材料 → B 初次关闭 → B Monitoring → A 恢复 →
Settings／Status Back → 主动切 B 的完整路径，**1/1 通过，18.9 秒**，零 Run／写入。
沿用该维护用例已有 viewport 循环，不增加新矩阵。日志为
`core-current-session-ownership.log`，截图写入既有
`artifacts/session-tool-ownership/final/`；此后 45539／45540 仍无监听。

根 `bun run lint`、`bun run typecheck`、四个改动文件的 Prettier 检查及
`git diff --check` 均通过；未执行全套 `bun run check`／E2E，未重建或安装桌面。
根检查日志为 `core-current-root-lint.log` 与 `core-current-typecheck-final.log`。

当前收束按用户后续明确的完成条件：核心流程成立、内容变化后布局自然，不再扩展
逐按钮／尺寸校验。模型／思考、Goal + Plan、运行／排队／Guide／Stop、真实父 Agent
路径、侧栏／搜索／标签、Files 阅读／编辑／diff 和 Settings／Provider／Skills／Plugins
入口及返回均有对应完整交付，权威索引见[当前交互地图](desktop-interaction-map-current.md)。
保存、主工作区同步和授权临时原生核心验收均已完成，因此本次现有 UI 体验迁移目标
可收束；不等于完整 CC 产品功能复制，也不把尚无契约的新后台能力纳入已完成范围。

## 基础复核与后续交付索引（历史）

2026-10-01 更新：用户已确认推荐语义。Goal + Plan 共存已在后续
[composer 交付](desktop-composer-entry-parity.md)实现并验证；`/agent` 的
[父会话 prompt 与真实 Host/tool 路径](desktop-agent-parent-route.md)已独立实现并验证。
waiting-approval Guide 保留限制。
下文保留基础复核时的历史行为，并明确对应的当前处理结果；不再要求用户重复选择。

2026-10-02 核心只读审计与后续 owned 原生验收进一步确认：模型／思考 → Goal + Plan →
同 Run 审批 → 原草稿返回没有发现新的、证据充分的 UI 缺口。实际执行仍以
[同步记录](desktop-ui-synchronization.md)中对应资产／run 的范围为准；最新图示
[阅读交付](desktop-mermaid-reading.md)的 `run-20261002-26` 也保留并通过这些核心断言。
这不证明商业模型、全部页面、英文原生故障分支或完整 CC 能力已经迁移。

后续[普通审批历史衔接](desktop-approval-history-continuity.md)补齐了原工具旁的
已决定卡片在刷新后的恢复，来源是 Host 保存的原审批，而不是工具结果推断。
它保留有界当前消息页和 pending 优先级；该单元的新证据独立记录。

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

## 历史差异及当前处理结果

1. **Goal + Plan 组合已确认并交付。** 基础复核时准备 Goal 会离开 Plan；用户随后
   明确选择共存。[composer 交付](desktop-composer-entry-parity.md)与
   [当前交互地图](desktop-interaction-map-current.md)记录独立准备和同 Run 的审批／
   执行衔接。不能继续把历史“需要选择”写成当前行为，也不应再次询问相同选择。
2. **`/agent` 父会话路径已确认并交付。** 基础复核时 hbar 直接创建子 Session／Run，
   与 CC 把整条指令交给父会话不同。用户明确选择父会话路径，随后
   [Agent Tool 交付](desktop-agent-parent-route.md)通过真实父 Run 创建／打开子会话并
   返回原草稿；没有把改菜单位置当作执行路径已经相同。
3. **等待审批时 Guide。** CC 仍显示入口；hbar 的 View 和 runtime 都只接受 running。
   用户已确认保持 restricted；这是有意执行边界，不是本轮待补的核心 UI 缺口，
   也不声称与 CC 的完整入口行为相同。
4. **装饰与状态区分。** 基础复核时某些按钮短横线来自 Lumen 默认 lamp。
   `LumenButton` 可显式选择 none 且保留 focus-visible；`LumenIconButton` 没有该公开选项。
   不向后者传无效 prop，不改只读共享组件，也不把状态/焦点显示当装饰删除。
   随后的[排队卡动作层级](desktop-queued-action-hierarchy.md)已对 queued surface 实施；
   其他按钮家族仍需依据其实际状态归属核对，不作全局隐藏。
   后续[普通图标入口层级](desktop-plain-action-hierarchy.md)已收敛 shell 与 Add 的八个入口，
   保留显式忙碌、选中和键盘焦点；共享 Send/Stop 及其他家族仍不在该单元范围。

Terminal PTY、不可信内嵌 Browser、Team、市场安装、定时任务等仍见
[公开能力与参考边界](desktop-workbench-remaining-audit.md)和
[Browser 安全边界](desktop-browser-preview-boundary.md)。不能用静态入口冒充后端能力，
也不能用基础复核时的四条流程替代这些能力。它们是独立产品功能范围，
不是当前核心 UI 迁移尚缺的静态按钮；本次完成范围以本页顶部当前收束为准。

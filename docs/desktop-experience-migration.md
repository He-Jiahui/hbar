# Desktop 操作体验迁移记录

本轮迁移以 cc-haha 清楚的目标归属、稳定的入口位置、局部反馈和渐进披露为目标。参考仓库 `D:/Git/cc-haha` 保持只读，审查基线为 `e28d0a65`；参考包括仓库真实界面截图、用户提供的 Goal/Plan 图，以及直接渲染原组件的隔离证据。隔离组件预览不代表真实后端执行。

较早的底座修复、原生增量打包背景与被替代的首轮方案保留在 [首轮历史记录](desktop-experience-initial-pass.md)。当前入口以本文所列独立交付及审计为准，不用历史“模型跳设置”等旧方案冒充已经符合参考。

## 从参考提炼出的规则

- 会话正文是阅读主线，工具、参数与运行过程不应占同等视觉重量。
- 输入区左侧组织材料与本次执行意图，右侧组织用量、模型、思考和提交动作；选择过程保留原草稿与阅读位置。
- 项目动作属于项目行，会话动作属于会话行，工具审批属于发起调用；操作携带原目标，不在异步结束后重新猜当前选择。
- 详情按需展开。错误、等待用户决定和风险确认必须就近可见，不能为了简洁藏掉。
- 菜单选项要说明实际含义。hbar 不支持的权限、终端、市场或搜索能力，不用无行为按钮或相似名称冒充。
- 视觉采用语义图标等级和正常 flex 文档流；中英文、长内容、桌面和窄窗口使用同一份交互所有权。

## 已验证并独立提交

| 单元              | 交付行为                                                             | 本地提交  | 依据与验收                                            |
| ----------------- | -------------------------------------------------------------------- | --------- | ----------------------------------------------------- |
| 模型与思考        | composer 局部搜索、提供商分组、能力限定档位与键盘调节                | `62ea90d` | [模型记录](desktop-model-interaction-reference.md)    |
| Goal / Plan 意图  | 本轮意图切换、Goal 条、暂停/恢复/清除、目标编辑与预算披露            | `9f3ee84` | [意图记录](desktop-composer-intent-reference.md)      |
| 项目新建          | 目标明确时直接创建，未选择项目时使用专用选择器                       | `4298a8f` | [导航审计](desktop-navigation-interaction-audit.md)   |
| 对话阅读          | 助手正文优先、工具调用与结果对应、过程披露及确认后的复制反馈         | `c49412b` | [消息记录](desktop-session-message-integration.md)    |
| 文件草稿          | 跨导航保存、共享文件事实、冲突/丢回执后保留原稿与核对                | `05d8030` | [导航审计](desktop-navigation-interaction-audit.md)   |
| 用量入口          | 模型旁的小入口、真实预算含义与未知状态、告警仍可见                   | `2af5d12` | [用量记录](desktop-usage-interaction-reference.md)    |
| Plan 提案         | 原消息旁执行或反馈继续讨论，绑定原提案版本，不消费普通草稿           | `e3b27a1` | [提案记录](desktop-proposed-plan-integration.md)      |
| 行内重命名        | Enter 保存、Escape 取消、标题原子比较、冲突与未知恢复                | `11d93f5` | [导航审计](desktop-navigation-interaction-audit.md)   |
| 本次权限          | 输入区四种真实策略、自动批准确认、捕获到原 Run、失联核对             | `8329581` | [权限记录](desktop-composer-permission-reference.md)  |
| 会话工具栏        | 五个直接可达的具名图标入口，标题缩短，保留键盘与选中状态             | `a65825e` | [标题栏记录](desktop-session-header-reference.md)     |
| 运行摘要          | 当前状态与恢复动作可见、20 条按需历史、停止优先真实执行任务          | `002671c` | [运行记录](desktop-run-activity-reference.md)         |
| 归档恢复          | 原行确认、项目归档分页、恢复不导航、未知只读核对                     | `e855123` | [归档记录](desktop-session-archive.md)                |
| 原生入口回归      | 隔离 WebView、首次选项目、直接新建、重命名、模型/意图及原生附件      | `a39ca7c` | [验证说明](testing.md)                                |
| 工具旁审批/问答   | 唯一调用关联、实际参数/片段、明确决定、持久回答与断线事件核对        | `092e408` | [决定与恢复记录](desktop-session-decisions.md)        |
| Provider 渐进编辑 | 基础/高级分层、草稿取消、原入口焦点、未知保存和凭据边界              | `c332ffe` | [Provider 记录](desktop-provider-progressive-edit.md) |
| 排队与停止        | 空草稿保留停止，有稿明确加入队列；Enter 不误停，停止绑定真实执行 Run | `c240ec0` | [运行输入动作](desktop-composer-running-actions.md)   |
| 输入材料          | 选择/拖放/文件粘贴、12 项批量预约、原会话所属与未知只读核对          | `84f91b7` | [附件记录](desktop-composer-attachments.md)           |
| 路径错误恢复      | 无效目录在写入前明确失败，保留错误码并允许修正；未知写入不洗成失败   | `b3fbd45` | [项目入口验证](desktop-project-shortcut.md)           |
| 项目快捷新建      | 项目行直接入口、菜单去重、键盘顺序与窄屏点击区、原草稿保留           | `1d3801a` | [项目快捷记录](desktop-project-shortcut.md)           |

表中提交为本地交付，不代表已经推送、发布或安装到用户正在运行的窗口。各单元的精确测试数量、截图位置与边界以对应记录为准。

## 尚需继续核对的体验差异

完整逐入口审计见 [会话](desktop-conversation-interaction-audit.md)、[导航与文件](desktop-navigation-interaction-audit.md)、[设置](desktop-settings-interaction-audit.md)。它们保留起始基线与交付复核的区别。

优先差异包括材料预览、文件树与 Changes/diff 的工作区路径、会话/文件页签及返回来源。`@`、`/`、会话分支、插件/技能详情、诊断和存储入口必须逐一核对真实公开契约；不以模型工具或命令目录里存在某个名称代替完整应用能力。

原先全仓 `check` 的九项失败已修复：`7379632` 明确区分 composer 与面板的 Goal 消费者并补监听释放，`357c9a7` 补齐漏登命令。最终稳定产品代码的 `bun run check` 已全部通过：严格 lint、TypeScript、**1,304 tests / 10,025 assertions**，269 个测试文件，测试阶段 242.81s。完整输出在忽略目录 `artifacts/reference-ux-v2/integrated-check-final.log`。

最新 Windows x64 debug 构建通过（Rust 编译 10.84s），隔离 WebView 的原生 smoke 通过，包含首次项目选择、新建/重命名/模型与意图入口、真实文件选择上传、最小窗口、隐藏与 Host 生命周期。未覆盖/重启用户正在运行的桌面进程。共享 hbar-ui 的普通 API 生成命令仍受 pnpm 版本不匹配阻止，Send/Stop 所在源文件还有八项与修改前完全一致的共享 lint 历史违规；不能把根仓库门禁通过外推为这些共享检查已通过。

最后使用同一新生产构建组合运行 15 个相关 E2E 文件：**29 passed / 2.3m**，覆盖中英文模型/思考、Goal/Plan、权限、审批/问答、计划提案、附件、排队/停止、Provider、消息/复制、重命名、归档分页、运行历史、工具栏与用量。另有项目入口三项和完整 connected 工作台回归通过；没有把重复运行次数累计成更多独立用例。组合输出为 `artifacts/reference-ux-v2/integrated-browser-final.log`。参考、fixture、真实 Host 和原生证据分别标注，不宣称没有测试的 reference 全功能已经等价。

长历史滚动与恢复另行复核通过（1 passed / 9.1s）：180 条历史分页、有界渲染、加载更早内容后的阅读锚点、新消息不抢阅读位置、明确跳到最新以及断线恢复。其截图保留在 `artifacts/ui-redesign/session/after/long-history-*.png`。

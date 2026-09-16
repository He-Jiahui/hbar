# 命令优先重构实施记录

本文件只记录已核验的实施进度，不替代总计划的完整目标。起始代码为 `857206a`；旧 Web 行为从 `7ae9740` 查证，当前外壳由 `6ec3b46` 提供。2026-09-17 起逐里程碑实施。

## A0：基线、功能映射与包依赖门禁（完成）

功能迁移入口见 [implementation-inventory.json](implementation-inventory.json)。每个当前 RPC 在一个领域下登记；未重命名的 RPC 暂定保持原 ID，`renames` 明确记录规范命令名变化；具体读写/参数/输出目前以 `packages/contracts/src/index.ts` 中的 rpcSchemas/RpcResults 为历史契约。正式命令定义在迁移该领域时替代该历史契约。自动检查会在增加/删除 RPC 或终端入口而遗漏清单时失败。

每个领域记录 handler 所有者、状态所有者、分类、实施里程碑与已有测试位置。测试位置表示回归证据入口，不表示其已经验证命令架构。所有领域初始 pending；子 Agent 与监控聚合明确标记为新能力。

| 旧 UI 入口（历史 `7ae9740`）                                                   | 目标 command/模块                                                  | 状态与目标                              | 迁移验收                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------- | -------------------------------------- |
| App/Sessions：选择工程/会话、新建、改名、归档、分支、历史导出                  | app.setWorkspace/setSession；workspace/session 领域                | Host 实体；runtime 当前 ID              | 重名、归档、分页、两个窗口、原目标回调 |
| Chat/ModelPicker/PermissionSelector：发送、模型、思考、权限                    | run.submit；session.setModel/setThinkingLevel；settings/permission | Host 规则；runtime 草稿                 | 提交捕获目标/版本；继续输入不丢失      |
| DecisionPanels：审批、问卷回答                                                 | approval.resolve；questionnaire.answer                             | Host approval/request ID                | 过期、重复、拒绝、断线核对             |
| BudgetPane/GoalPane/PlanPane/SessionTools：预算/目标/计划/模式编辑             | budget、goal、plan、settings                                       | Host 事实；runtime FormState            | 校验、冲突、保存失败、运行约束         |
| ComposerMenu：图片/文件附件、预算/目标/计划编辑器、扩展动作                    | attachment.*；app.openCommandForm；扩展 command                    | draft/artifact ID、sessionId            | 上传取消/限制、草稿保留、扩展停用      |
| Settings/AppearanceSettings/PathSettings：供应商/模型/凭据/插件/权限/路径/外观 | settings/provider/plugin/paths；preferences                        | Host settings vs device profile         | 来源、分层冲突、凭据排除、restart 状态 |
| Files/CodeEditor：文件树、读取、编辑、附件下载                                 | file.*；attachment.query                                           | workspace/path/artifact ID              | 路径权限、分页、保存冲突               |
| ActivityPanel/SessionCapabilityDialog：事件、运行取消、能力表单                | query/run.cancel；app.openSettingsEditor                           | session/run/operation ID                | 原对象反馈、隐藏时订阅释放             |
| BrowserPanel：导航、历史、快照、动作、关闭                                     | browser.*；app.openPanel/closePanel                                | Host context/page/session ID            | 原目标、权限、取消、生命周期           |
| TerminalPanel/CommandPalette：slash、补全、分类、开关                          | commands；terminal adapter；app.openPanel/closePanel               | runtime 与规范 command ID               | 不再保留 UI handler 闭包或第二套业务   |
| Pairing/设备/托盘：配对、撤销、窗口与退出                                      | connection/pairing/device；app.openWindow/closeWindow              | connection generation、device/window ID | 认证、撤销、定向、无 GUI 不可用        |
| App 布局、Modal：工具面板、侧栏、状态/设置、关闭图标、Escape                   | app surface commands；layout.commit/restore                        | runtime panel/window instance           | 显式开关、同实例幂等、恢复描述         |

上述旧 View 已移除，后续按历史功能补齐而不恢复可写 store。UI 内部 hover/选区/IME/拖拽过程/树展开/ComboBox 弹出为清单内豁免；持久布局、共享草稿和逻辑窗口/子页面不豁免。

权限沿现有认证、作用域检查与执行/审批链保持。每个领域迁移时必须细化能力字符串、目标权限、预期版本和取消/恢复行为，不能将历史“连接已认证”当作新命令按目标授权完成。删除条件统一为替代命令 + CLI + 投影 + 对应领域权限/恢复测试全部通过。

`scripts/architecture/workspace-boundaries.ts` 解析 TS 源码导入、导出、类型导入和动态导入，检查跨 workspace 私有入口、基础框架的反向依赖与包级循环。框架不允许计算出的动态 import 绕过规则。测试既扫描实际源码，也注入非法边验证门禁会拒绝；后续按真实包增加生命周期与只读快照行为测试。

初始验证：`bun run check` 通过 lint、typecheck、174 个测试。当前已有 153 项其他任务/用户工作树改动，包含组件预览、UI 组件、Cargo 配置、package script 及旧计划路径删除；未还原、stash 或夹带。根 package.json 的既有变化仅增加 integrations 验证脚本，本里程碑不修改它。

交付验证：`bun run check` 通过 lint、typecheck、178 个测试（50 个文件）；新增门禁/清单测试 4 项通过。30 个相对文档链接有效。此里程碑未改 UI 或桌面行为，不运行 build/E2E/desktop smoke。原始日志位于忽略目录 `artifacts/command-first-a0-check.log`。

后续里程碑：A1 命令包 → A2 runtime/会话选择 → A3 预算 Host/CLI 闭环 → A4 参数表单；剩余 A5–A15 与 B1–B7 继续按 [P6](06-migration-validation.md) 执行。

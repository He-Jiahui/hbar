# @hbar/app-runtime

A2 提供无 React 的客户端运行时：每实例独立的当前工作区/会话、私有 Zustand vanilla 目录投影、只读订阅和具名调用。A4 另提供预算命令的参数表单状态与本地命令。目录、导航、表单、状态封装与装配入口分别维护。

```ts
import { createAppRuntime } from '@hbar/app-runtime'
import { createDirectoryQueryAdapter } from '@hbar/client'

// client 是组合根已经完成认证的 HbarClient；View 不接收它。
const runtime = createAppRuntime({
  instanceId: 'terminal-one',
  hostId: host.instanceId,
  directory: createDirectoryQueryAdapter(client),
})
const view = runtime.view
await view.commands.execute('app.setWorkspace', { workspaceId })
await view.executeText('app.setSession "审查"')
const page = await view.commands.execute('session.list', { workspaceId, limit: 60 })
const selection = view.state.navigation.getSnapshot()
const unsubscribe = view.state.navigation.subscribe(renderSelection)
unsubscribe()
runtime.dispose()
```

`runtime.view` 只提供身份、StateReader、typed commands 和文本入口，不公开 dispose、registry、setState、ClientTransport、数据库或 Zustand StoreApi。dispose 归创建 runtime 的组合根。状态对象及嵌套实体冻结；稳定的 getSnapshot 可供后续 React selector 适配。一个订阅者抛错不会阻止其他订阅者或改写命令结果，异常交给组合根的 onSubscriberError。

`app.setSession` 支持明确 sessionId、sessionName 或文本 selector 三选一。名称仅在明确/当前 workspace 内精确匹配；同名返回 SESSION_AMBIGUOUS 和候选 ID，归档、缺失与跨工作区不匹配分别报错。显式跨工作区选择同时传 workspaceId。选择过程中保存原选择，成功后统一更新；较早的请求不能覆盖更新的导航意图。

`workspace.list/get`、`session.list/get` 的 Schema 与定义在 `@hbar/contracts/commands`，同源 DTO 在 `/directory`。Host 通过 commands 注册的目录查询服务调用 Storage Worker；列表在数据库按稳定 ID 分页，最大每页 200 项，不读取整个 bootstrap 或消息历史。RPC 是这些查询的兼容传输入口，Web/CLI 组合根用同一 Client adapter。

目录投影最多缓存 1,000 个 Session 和 200 个 Workspace，淘汰时保留当前选择。返回页独立于缓存，调用者按 nextCursor 获取后续数据；查询重复不互相报取消，旧查询结果不会替代同查询更新的投影。Session 更新按 seq/updatedAt 合并。明确刷新 session.get 得到删除/归档时清除失效选择，不自动选中另一会话。

目录保持 A2 的分页查询投影。B2 的 Session timeline 在选择变化后读取有界快照，再从快照 cursor 订阅增量事件和 stream delta；重复事件、迟到旧 Session、缺失 stream version/offset 和 Host resync 都不会静默污染当前投影。切换或 dispose 释放精确 follow，Host 或身份换代时组合根销毁旧 runtime 后创建新实例，不停止 Host Run。View 通过 `view.state.timeline` 只读取得 messages、runs、approvals、userInputs、usage、streams、cursor 与恢复状态。历史分页、草稿、发送及交互命令由后续 B2 切片接入。

预算参数表单由组合根可选地注入 `createBudgetCommandClient(client)`。`app.openCommandForm({ commandId: 'session.setBudget', sessionId, formId })` 从 Host 读取当前预算并固定原 Session 目标；`form.setField` 只改本实例的草稿，`form.submit` 使用 A3 的持久命令和独立幂等键。View 通过 `view.state.forms` 只读订阅原文、字段问题、dirty、状态与回执。断线/超时进入 unknown，`form.reconcile` 使用同一 actor、Session、键查询回执；查不到时保持 unknown，不用新键重发。成功后修订版本更新而在途的新编辑仍为 dirty；失败保留草稿。`app.closeCommandForm` 关闭实例，不取消已送出的 Host 写入。

提示词草稿按 Session 保存在 `view.state.drafts`，只能经内部应用命令 `draft.setText` 与 `draft.setAttachments` 修改。`run.submit` 捕获原 Session、草稿 revision、附件和单次幂等键；等待回执时允许继续编辑，成功只清除未变化的原草稿，失败保留内容。断线或超时进入 unknown，`draft.reconcileSubmission` 用原键查询权威受理回执，不能以新键盲目重发。`operation.cancel` 和其余 Run 命令继续委托同一个 Host command port。

审批与问卷分别调用 `approval.resolve` 和 `questionnaire.answer`。`view.state.interactions` 按原 approvalId/requestId 显示 submitting、unknown、failed 或 succeeded；断线未知结果不会冒充失败，后续 timeline 中的审批终态或问卷移除会把原操作收敛为成功。容量达到上限时只淘汰已结束反馈，不能丢掉仍在提交或等待核对的动作。

问卷字段同样不由 React 私有业务状态保存。`questionnaire.setAnswer` / `questionnaire.resetAnswers` 修改 `view.state.questionnaires`，验证 requestId、questionId、原 Session 和可选 revision；请求终结后 timeline 自动释放草稿。`view.state.runActions` 记录 `operation.cancel` 的提交、未知、失败与成功，阻止同一 operation 的重复在途取消。

`view.state.controls` 按当前 Session 组合 `session.getModel`、`usage.query` 与 `session.getBudget` 的权威结果，保留各来源独立错误及 available/empty/unavailable 语义。选择和 Host 重同步会刷新全部控制数据；usage、run 结算或 budget 事实只触发有界刷新，普通 stream delta 不发查询。模型和思考等级修改仍执行 Host command，自动生成单次幂等键，迟到的旧 Session 查询不能覆盖新选择。

`view.state.settings` 由 `app.openSettings` 的逻辑 panel 驱动，按 global/workspace/session 与 target 保存最多 32 个独立表单。字段写入、重置、恢复继承、提交与未知核对均使用 internal `settingsForm.*` command；提交捕获原 scope、版本向量、revision 和幂等键。恢复继承发送 unset，在途新编辑不会被旧回执覆盖。组合根只需注入 Host settings command port，View 不取得 Client。

当前包提供无 React 的 ViewModel/命令入口；React 绑定在 `@hbar/app-react`，Schema renderer 在 `@hbar/schema-react`。命名 CLI context、完整 CLI/TUI 路由、窗口与工具面板由对应模块承担。此包不包含业务执行器或 UI renderer。

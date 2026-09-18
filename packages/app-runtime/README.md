# @hbar/app-runtime

A2 提供无 React 的客户端运行时：每实例独立的当前工作区/会话、私有 Zustand vanilla 目录投影、只读订阅和具名调用。目录、导航、状态封装与装配入口分别维护。

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

当前为 A2 的分页查询投影；事件游标、增量订阅/恢复、跨连接 generation 切换和消费者引用计数在 A11/P2.5 扩展。Host 或身份换代时组合根销毁旧 runtime 后创建新实例；dispose 拒绝迟到结果并清理订阅，不停止 Host Run。查询 port 的底层 I/O 是否可取消取决于适配器，既有 SDK 仍以请求超时收尾。

草稿、预算、参数表单、命名 CLI context、完整 CLI/TUI 路由、窗口与工具面板按 A3–A7 后续里程碑交付。此包不包含业务执行器或 UI renderer。

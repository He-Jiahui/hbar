# @hbar/app-react

`@hbar/app-react` 是 `@hbar/app-runtime` 的受控 React 绑定层。`HbarRuntimeProvider` 接收已由平台组合根创建的 runtime view，`useHbarRuntimeState` 用 `useSyncExternalStore` 订阅只读 StateReader。此包不导入 Client、Host、Storage、Tauri 或 hbar 领域 contracts；展示类型从 app-runtime 的公开 ViewModel 推导。

```tsx
const runtime = createAppRuntime({
  instanceId: crypto.randomUUID(),
  hostId,
  directory,
  timeline,
  run,
  settings,
  commandCatalog,
})

root.render(
  <HbarRuntimeProvider view={runtime.view}>
    <HbarWorkspaceShell labels={labels.shell} connection="connected" onReconnect={reconnect} sidebarWidthRem={18}>
      <HbarSessionWorkspace sessionTitle={title} labels={labels.session} connected />
    </HbarWorkspaceShell>
  </HbarRuntimeProvider>,
)
```

Workspace/Session 选择、面板打开/关闭、草稿、表单、保存、取消、命令搜索和状态分区都通过 runtime command facade 修改状态。仅 hover、焦点、IME、树展开和组件弹出等短命 UI 过程使用 React 局部状态。所有可见文案、时间/金额格式化、枚举名称和空/错误状态由宿主的类型化 labels 提供。

`HbarWorkspaceShell` 组合 AppShell/AppSidebar；`HbarSessionWorkspace` 组合对话、活动、审批、PromptInput 和 AI Usage；其余公开工作台分别对应命令目录、Schema 设置/ProviderDialog、Files、Monitoring、子 Agent、目标/计划、扩展与全局状态。组件本身不负责 runtime 的创建或 dispose。

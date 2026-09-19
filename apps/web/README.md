# Web 组件宿主

Web 组合根现在通过 `@hbar/app-react` 将真实 Client、只读 `@hbar/app-runtime`
与 `hbar-app-ui/workbench` 连接。AppShell/AppSidebar 显示 Host 连接状态、分页的
Workspace → Session 树，并且会话选择、命令入口、状态中心和设置入口全部执行应用命令。
没有 Host 时保留可操作外壳和明确的重连状态，不填充演示会话。

`src/App.tsx` 是平台/传输组合根，`shell-copy.ts` 提供类型化中英文内容，
`shell-layout.json` 描述并恢复外壳尺寸，`shell-layout.ts` 校验描述。
选中 Session 后显示真实 timeline、流式 Markdown、活动/审批/问卷、PromptInput 和可靠
AI Usage。`@hbar/app-react` 只订阅读状态并把交互转换为命令；旧 localStorage 数据不会读取或删除。

```powershell
bun run web
bun run build
bun run test:e2e
```

E2E 使用 Vite preview 和真实浏览器验证无 Host 降级、中英文、桌面/窄屏、键盘命令入口、
侧栏滚动和刷新；临时真实 Host 场景还覆盖文件编辑、命令参数表单、发送/审批/取消、三层设置、
ProviderDialog、Session Monitoring、子 Agent、目标计划、扩展入口和 Performance/Usage/Git 状态中心。
连接 Host 的 390px 场景会逐项重开工具并检查侧栏、主区和水平溢出。组件预览仍使用
`bun run app-ui:preview`。

B1–B7 的生产组合已完成。新功能继续向 runtime 注入类型化 port、向 command catalog 注册行为，
并由 `@hbar/app-react` 读取投影；不得将旧 store、直达业务 RPC 的视图回调或预览数据重新引入 Web View。

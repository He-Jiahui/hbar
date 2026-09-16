# Web 组件宿主

旧 Web 工作台已按命令优先重构的清理要求移除。当前应用只挂载
`hbar-app-ui/workbench` 中的 AppShell、AppSidebar 和维护提示，暂不连接 Host，
也不提供会话、设置、审批、命令面板或文件操作。业务运行仍由现有 Host、CLI/TUI
和 Client SDK 提供；本轮没有完成新的命令运行时。

`src/App.tsx` 仅组装组件，`shell-copy.ts` 提供中英文内容，`shell-layout.json`
描述外壳尺寸和可见性，`shell-layout.ts` 校验描述。`document.css` 只处理挂载文档尺寸，
组件布局和样式属于 `packages/hbar-app-ui`。旧 localStorage 数据不会读取或删除。

```powershell
bun run web
bun run build
bun run test:e2e
```

E2E 使用 Vite preview 和真实浏览器，验证无 Host 启动、中英文、桌面/窄屏、刷新、
无业务请求和无假操作按钮。旧 Web 页面和 store 专属测试已随实现删除；组件库、Host、
CLI 与协议测试保留。组件预览仍使用 `bun run app-ui:preview`。

后续依照命令优先计划先实现独立命令运行时和只读状态，再接入受控组件。不要将旧
store、页面 CSS、业务 RPC 回调或预览数据重新引入 Web View。

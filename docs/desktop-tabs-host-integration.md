# 桌面会话页签接线与视觉验收

这是一轮针对 `D:/Git/cc-haha/desktop` 原 `TabBar`、`tabStore` 与关闭对话框的实际入口迁移。原组件证据见 [desktop-tabs-interaction-audit.md](desktop-tabs-interaction-audit.md) 和忽略目录 `artifacts/reference-ux-v2/29-reference-tabs-*`。原版标签是上沿的横向自然滚动带、活动项与关闭按钮在同一标签内；窄屏不改成第二套导航。运行中的关闭分别允许取消、保持运行、停止并关闭；“停止请求受理”不等于任务已结束。

本单元将受控 `HbarWorkspaceTabs` 和 `HbarWorkspaceTabsCloseDialog` 接到真实 Web/desktop 工作台：

- 会话页签位于布局描述文件 `apps/web/src/shell-layout.json` 的 workspace 内容之前；旧 v2 布局补上同一 `tabs` 配置，不接纳任意定位、脚本或超过 32 的值。
- 视图读取 runtime 的 `workspaceTabs` refs、导航、目录与会话时间线；标题来自 Host 会话，打开/切换/重排由公开运行时 action 负责。此处不复制消息、Run 或草稿。既有每会话草稿保持原 Store 所有权。
- 关闭 scope 在触发时捕获原始 tab instance；协调器以完整 Host 活动查询判定空闲、待停止和未知。未知状态也提供明确的“保留运行并关闭视图”，但不提供再次自动发送取消的 Stop。关闭视图不归档或删除 Host 会话。
- 未经 Host 确认空闲的非活动页签在标签上不绘制误导的绿色/黄色运行点；已知正在运行才显示语义标记。真正停止与否在关闭确认时重新查 Host，不根据最近 40 条时间线推断。
- 选择与重排的就近错误只属于最新 UI 意图；旧的异步失败不覆盖新的选择。恢复或保存失败有就近重试；布局及服务端状态仍由各自所有者处理。

## 实际验证

`e2e/workspace-tabs-host.spec.ts` 使用真实临时 Host、生产构建和浏览器，已验证：

1. 两个会话各自草稿切换不串、关闭活动页签只移除原视图并选邻居、刷新恢复存活页签、原会话仍在 Host；
2. 32 个标签达到上限后第 33 个选中请求被拒，新的会话创建不会在 Host 发生；320 窄屏标签仍能看到当前项且整页无横向溢出；
3. 原目标的右键菜单“关闭左侧 / 关闭其他”准确作用在点击的页签，关闭活动目标后选存活邻居且焦点回到其标签，刷新后状态保持。
4. 浏览器注入一次 Host 活动读取回复丢失（其他目录/会话仍是真实临时 Host）：弹窗进入未知态，仅给出“核对”或“保留运行并关闭”，没有 Stop 按钮；选择保留后只关闭原实例、返回邻居焦点、零次发送 `operation.cancel`，Host 两个会话仍存在。

四项真实 Host E2E 均通过，其中第四项故障被明确注入，不伪称真实运行中任务；稳定截图在 `artifacts/reference-ux-v2/hbar-tabs-host-{selected-1440,selected-320,overflow-320,unknown-1440}.png`，临时数据结束时删除。关闭弹窗按原参考做成自然内容高度、约 29rem 的不透明面板和简单灰幕，而不是以截图坐标定位。生产 Vite 构建、flow/content/icon/design-system 守卫和独立组件测试通过。根类型检查需与并行 App Shell Adaptive 和文件树任务的即时状态分开报告；本单元没有改动那两个任务的代码。

## 尚未宣称完成

当前真实页签是 Session。原 cc-haha 的 Files/Browser/terminal/agent 工作台扩展及 Back 返回来源仍需要单独的 surface/tab 生命周期实现；组件 fixture 中出现 Workbench 图标不代表该流程已接线。当前文件面板仍可独立开启，本单元不改变其文档缓存或脏草稿约束。真实运行中的 Stop→终态和断线后重查仍需专门的受控 Host 延迟测试；未知读取的故障注入测试不代表真实 Run 已经停止。

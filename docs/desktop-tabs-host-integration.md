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

## Files 工作台扩展的后续闭环

`b54624a`、`0c1df46` 和 `c6c2e78` 将上述预留的 Workbench kind 接到真实 Files 面板：

- 会话或项目 Files 面板使用原 `panelInstanceId` 固定到源 workspace/session，再作为临时工作台页签显示在中央。文件树、diff、文档预览和未保存草稿沿用原运行时条目，不复制第二份文件内容。切到会话页签期间面板从 dock 隐藏但保留绑定；重选工作台仍看到同一草稿。
- Back 先验证仍存在的来源会话再返回并关闭临时页签；来源已关闭/归档时安全退到有效邻项。项目级 Files 没有来源会话时返回原工作区空页。X 仅关闭视图并选邻居，不等同 Back；混合批量关闭中的工作台目标 `sessionId:null`，不会为了关文件视图查询或停止来源 Run。
- 临时工作台不写入持久页签集合。刷新时恢复普通会话，项目级无来源时只在 Host 验证原工作区仍存在后恢复该工作区；失联不激活未验证目标。外部关闭或重绑定 Files 面板会使原工作台引用失效，晚到的旧引用不能关闭新实例。
- 标题栏提供就近展开、返回和关闭入口，中英文文案由 Web 宿主供给；图标使用共享语义等级。320/1440 宽度维持正常文档流，关闭与返回后焦点移到存活页签或空页区域。

新增 `e2e/file-workbench-tabs.spec.ts` 对真实临时 Host 验证中英文展开、草稿保留、Back/X、无来源项目入口与刷新；同一生产构建组合会话页签、All 树与 Changed/diff 的 12 项 E2E 全通过，桌面/窄屏截图在 `artifacts/reference-ux-v2/hbar-workbench-{en-US,zh-CN}-{1440,320}.png`。后续 `e96968b` 根据原生截图修正 All 树在宽页的按钮默认居中，并用 390/1440 几何断言回归。运行时 47 项聚焦测试、238 个断言通过；内容/图标/流式布局守卫、生产 Vite 构建及根 TypeScript 检查通过。全仓 `bun run check` 复跑通过 1,402 tests / 10,583 assertions；Windows x64 debug 构建与通用隔离 WebView smoke 通过。忽略的原生 smoke 扩展另实际点击 Files 展开与 Back、验证页签选中和无横向溢出；原生未测草稿/批关，这由真实 Host 生产浏览器 E2E 负责。

## 尚未宣称完成

Files 工作台已接线，但参考的 Browser/terminal/agent/Team 等页签仍需要逐一落实各自的公开能力、来源关联与生命周期；不能把 Workbench 图标概括成这些功能已完成。当前只支持一个 Files 工具面板实例在中央与 dock 之间切换，不等于多文件独立预览页签或嵌入浏览器。文件草稿仍只在当前 runtime 生命周期保留，不承诺应用重启后恢复。真实运行中的 Stop→终态和断线后重查仍需专门的受控 Host 延迟测试；未知读取的故障注入测试不代表真实 Run 已经停止。

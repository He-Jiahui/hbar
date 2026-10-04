# 项目行快捷新建会话

## 参考与入口归属

只读参考为 `D:/Git/cc-haha` 的 `docs/images/app/zh-CN/session-new.webp`：项目行右端依次为更多菜单与新建图标。当前 `desktop/src/components/layout/Sidebar.tsx` 的项目行也明确采用这一顺序；桌面 hover/focus 显示，移动侧栏常显，创建回调绑定该项目目录。图片已人工查看，源码行为与图片分别记录，不宣称已运行参考应用的真实创建服务。

此前 `4298a8f` 已完成 hbar 直接创建与专用项目选择器，但项目内新建仍藏在“…”菜单中。本单元将它移到项目行右端，并移除该菜单里的重复动作；全局新建的当前项目语义不变。

- 使用宿主 `createSessionInWorkspace(name)` 格式化的中英文可访问名称与 tooltip，语义 `md` 的 SquarePen 图标。桌面点击区 2rem，窄屏的更多与新建点击区均为 2.75rem。
- 项目标题、菜单、新建是独立的正常 flex 流兄弟控件；长标题省略不挤掉动作。聚焦项目行后按钮可见，Tab 从更多菜单移到快捷新建，Enter 激活。
- 新按钮仍调用原 `newSession(workspace.id)`，复用原目标捕获、single-flight、已确认/失败/未知状态和核对动作。忙碌指示属于原项目行，断线或未知结果禁止创建第二个目标。
- 行折叠只改变列表呈现；创建成功才依原导航用例打开新会话。原会话草稿保留，另一项目不会因全局当前选择而收到错误创建。

## 验证与发现的问题

- React/导航定向测试 25 passed / 162 assertions：宿主长中文名称、空列表、单项目唯一入口、缓存项目断线禁用、目标与原选择、快速重复、未知恢复及销毁。
- 真实临时 Host 项目入口 E2E 3 passed / 26.7s：101 项分页、项目选择、双语目标创建和草稿保留。增加 1440/900/390/320 的聚焦、横向容量、动作不重叠、快捷按钮点击区检查。
- 最终增加窄屏更多菜单 44px 几何断言后，双语项目入口再通过；connected 工作台完整回归也通过（1 passed / 25.1s）。后者先等待 Goal 编辑器真实输入值就绪，再测布局，避免把异步加载中间帧当最终布局。
- root TypeScript、定向 ESLint、content/icon/flow guards、生产构建、格式与 scoped diff 检查通过。
- 截图为 `artifacts/desktop-experience/session-entry/quick-create-{en-US,zh-CN}-{1440,900,390,320}.png`，已人工查看桌面和中文 320px，确认项目动作常显/聚焦与长名称缩短。

本轮回归也复现了旧路径校验问题：不存在目录的文件系统错误被转成泛化执行失败，进入 unknown 后不能修正。该修复由独立单元处理：只读路径校验失败返回 `INVALID_WORKSPACE`，运行时保留错误码，真正的存储写入异常仍保持未知语义。不能以快捷入口测试通过掩盖这项发现，也不把它与 UI 定位变更混为一个提交。

同一稳定产品代码的整仓 `bun run check` 已通过：严格 lint、TypeScript、1,304 tests / 10,025 assertions。独立 x64 Windows debug 构建及隔离 WebView smoke 通过，包含真实文件选择上传和 900×600 最小窗口。用户与其他任务的工作区改动保持不动；这不代表参考中尚未迁移的页签、文件 diff 等功能已经完成。

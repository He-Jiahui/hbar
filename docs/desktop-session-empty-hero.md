# 新会话空态：参考、行为与验收

cc-haha 已发布的 `D:/Git/cc-haha/docs/images/app/en/session-new.webp` 与 `model-picker.webp` 显示：新会话主区域有居中的品牌标记、标题和一段简短说明；模型菜单仍锚定在下方输入区，打开菜单不替换欢迎状态。其 `desktop/src/pages/ActiveSession.tsx` 只在无持久消息、活动输出及首轮提交时展示欢迎内容。hbar 修改前的真实 Host 截图 `artifacts/desktop-experience/session-entry/created-en-US-{1440,320}.png` 只有内容区顶部的一行小提示，缺少明确视觉重心。参考结构是主内容区的自然流空态，不是固定坐标覆盖层。

本单元由 `HbarSessionEmptyHero` 渲染 hbar 已有的 `apps/web/public/favicon.png` 标记、宿主提供的中英文标题和说明。图像地址属于 Web 宿主文案契约，组件不硬编码品牌路径或示例会话。会话内容区通过 flex 填满可用空间并居中空态；内容、图标与输入区仍在正常文档流中，320px 窄窗口和矮窗口保留滚动与底部操作。没有复制 cc-haha 的品牌图或用截图坐标定位。设计系统边界要求可见 DOM 由 Lumen 组件承载，所以装饰性标记使用 LumenFrame 的宿主提供背景图；矮窗口使用安全居中和紧凑间距，避免内容较高时标记从滚动区顶端被裁切。

欢迎态必须满足当前选中的会话与已加载时间线 ID 一致、连接正常、加载完成、无更早历史、无消息/Run/流/待审批/问答，且本次草稿没有提交中、结果未知、失败或已受理记录。模型选择和未提交的文字草稿不会使它消失；首轮提交开始或 Host 接受 Run 后退出。加载、离线、失败和旧空历史只显示原状态/重试或独立的“暂无可显示消息”，不冒充新会话。

验证：`bun test tests/session-empty-hero.test.tsx tests/session-workspace.test.tsx` **6/6、100 次断言**；根 TypeScript、定向严格 ESLint、Prettier、flow/content/icon guard 和隔离生产构建均通过。真实临时 Host 的 `e2e/session-empty-hero.spec.ts` **中英 2/2**：新建、1440/900/390/320、矮窗口、品牌资源加载、菜单保持、选模型、草稿保持及首发后消失。第一次 E2E 在未给新会话选模型时等待禁用的 Send 超时；测试补上真实模型选择后重跑通过，没有更改产品的模型前置条件。最终截图为 `artifacts/desktop-experience/empty-hero-{en-US,zh-CN}-{1440,900,390,320}.png`，已人工查看桌面和窄屏。

Windows x64 release 应用与 NSIS 安装包构建成功；隔离数据目录启动的原生 WebView2 验证品牌图、欢迎标题及模型菜单打开时空态保持，截图 `artifacts/desktop-experience/native-empty-hero.png` 已人工查看。原生 demo 未发送第一条消息；首发转换由上述真实 Host 浏览器用例验证。未安装或重启用户正在运行的窗口。首次整仓检查在设计系统边界测试中复现原生 `<img>` 违规（1,574 通过、1 失败）；改为 LumenFrame 后该测试、根类型检查及中英文真实 Host E2E 均复跑通过，整仓结果以后续复跑为准。

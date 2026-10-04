# 会话工具栏的层级与入口

视觉依据是 cc-haha 的 `docs/images/app/zh-CN/session-main.webp`：会话工具以顶部紧凑图标行呈现，正文与输入区占主要空间。窄屏对照 `h5-session.webp`，不把桌面工具文字挤成多层导航。

hbar 保留文件、监控、子 Agent、目标与计划、会话设置五个真实入口及原来的目标绑定；只改变呈现密度。五个按钮直接可达，使用同一 sm 图标等级、独立点击区域、宿主提供的 aria-label/title；选中状态和键盘焦点不变。标题与项目名按 normal flex 缩短，完整文字保留在原生 title；运行状态不隐藏，窄屏在图标行上方按内容流排列。

验证：4 个组件测试、67 次断言；真实生产 Host 的中英文 E2E 共 2 passed（21.0s），逐一在 1440/900/390/320 宽度用键盘打开、关闭四个工具和进入/返回会话设置，确认原草稿与会话不变，五个入口无重叠、无水平溢出，空闲页头不超过 80px。人工检查桌面和 320 截图。严格 scoped lint、root typecheck、生产 build、content/icon/flow guards 全部通过。

截图：`artifacts/desktop-experience/session-tools-{locale}-{width}.png`。此验证不代替运行中审批卡、活动折叠或原生桌面 smoke 的独立验收。

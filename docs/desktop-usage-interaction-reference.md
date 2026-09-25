# 会话用量入口：参考依据与边界

参考 `cc-haha` 的 `desktop/src/components/chat/ContextUsageIndicator.tsx:458` 和现有整应用截图 `docs/images/app/zh-CN/session-main.webp`、`h5-session.webp`：常态只是 composer 模型旁的小入口，详细信息在桌面锚定浮层、窄屏底部 sheet 内展开。当前 hbar 没有同义的 context-window occupancy 事实，不能把会话预算消耗改名为上下文占用率。

本单元把常驻统计卡替换为“用量与预算”局部入口，使用既有 `SessionControlsState`。预算百分比明确含“预算”文字；没有预算显示“用量”，没有费用/速率显示不可用，而不是编造 0。展开可查看累计输入/输出、费用、速率与预算剩余，并进入原会话用量监控。打开、关闭、缩放和键盘操作不调用模型/预算/用量查询；既有增量投影仍负责更新。预算低于 20% 与耗尽状态继续在输入区直接提示。

新浮层内只有四项固定指标，属于有界内容流；max-height 限制整个真实 overlay，正文按 flex 纵向排列并可滚动。桌面初次截图发现旧 inline 控件的横向 flex-basis 在 column+wrap 中变成高度，导致指标溢出；已经改为 `nowrap` 与内容自适应 basis，并增加 popup 自身及每项指标的边界检查。这不是用截图坐标排列内容。

验证记录：

- 10 个聚焦单测、100 个断言，覆盖不可用、0/1/79/80/81/100/101 预算边界、长中文、错误与工作区接线。
- root TypeScript、scoped strict ESLint、production build、content/icon/flow guards。
- 真实 Host 浏览器用例：英文/中文 × 1440/900/390/320，键盘打开、Escape/关闭回焦、保留草稿、不重复查询、监控入口；另保留原工具标题布局回归。
- 截图：`artifacts/reference-ux-v2/hbar-usage-{en-US,zh-CN}-{1440,900,390,320}.png`。这是生产 App 配真实临时 Host 与本地 fixture 模型；不调用付费模型，不修改用户会话。

页头工具、运行活动、发送/停止和权限仍分别验收；本单元不代表整工作台已完成迁移。

# Sidebar Search 的入口层级

本切片以 `966b6050` 为 hbar 基线，修正全局搜索入口的视觉职责与操作顺序，
复用已有 Host Search、索引、结果列表和导航。不是新搜索实现，也不宣告整体
CC desktop 体验已经迁移完成。

## 视觉与流程依据

只读参考 `D:/Git/cc-haha`，当前 commit
`e28d0a653481ef41b7a329411eeb2f0fd5656731`。
主 agent 实际查看 `docs/images/app/zh-CN/session-main.webp`，并渲染原始
`desktop/src/components/layout/Sidebar.tsx`：Search 是带细边框/底色的宽触发器，
左侧 search 图标，中间可收缩标签，右侧快捷键 badge；刷新和批量管理紧邻它，
不是把三者拆到不同区域。顺序为 Search → refresh → batch。

原组件截图保存为 `artifacts/sidebar-search-entry-v33/cc-search-1440.png` 与
`cc-search-320.png`。实际 DOM 观察为宽屏控制高 36px、窄屏 44px；Search 图标
为 15px，hbar 按语义映射为 `sm`，不增加单独的 15px 图标等级。原 fixture 复用
此前的 original Sidebar＋合成会话、本地偏好，阻断外部请求；不是完整 CC Host。
没有 pageerror。原 CC 只显示 macOS shortcut，不应照搬到 Windows hbar。

hbar 原入口使用普通 SidebarAction，且批量按钮在刷新之前。现在抽为
`SidebarSearchEntry`：单个 button 声明 dialog 展开状态，宿主提供 label 和平台
shortcut；明确边框/底色、正常 flex 流、可收缩长标签和不可换行的快捷键。
相邻管理动作保留原 ref、busy/disabled 状态与 handler，只对齐顺序和控制尺寸。
保留现有 icon button 的状态指示，没有用全局 CSS 隐藏共享组件能力。

触发器是单项内容增长控件，不拥有列表、query 或 navigation state。搜索弹窗
继续负责有界列表/滚动、近期 8 条、搜索结果最多 50 条、键盘选择和就近错误。
长标签可缩略，但完整值保留在可访问名称和 title；窄屏不使用截图坐标。

## 最终验证

- SSR entry、原快捷键与搜索 View：10 tests / 92 assertions。包括中英文、中文
  长 label、dialog 状态、唯一 button、平台快捷键、空/边界/错 ID/错误等原 View
  回归。SSR 使用 ignored scoped tsconfig workspace alias；Bun 仍报告 directory
  mismatch 内部警告，test runner 实际退出 0。
- 原搜索 controller 与 port：11 tests / 57 assertions。包含 debounce/composition、
  有界读取、旧响应、indexing、断线恢复和原目标导航，未将这些写成新实现。
- 最终 production Web＋临时真实 Host：en-US 1440 / zh-CN 320 两条通过，10.5 秒。
  验证点击新入口、recent/body search、排除仅标题/已归档、打开隐藏工程会话、
  Ctrl K 再打开、Esc 关闭和 Commands 的独立入口；没有 Run 提交或浏览器错误。
  合成 DOM composition 不等于 OS IME 验收。
- 主 agent 查看最终宽/窄截图并修正首轮英文 shortcut 换行：shortcut 使用
  正常 nowrap，标签占剩余宽度。没有扩大按钮固定高度来藏溢出。
- scoped strict TypeScript、ESLint 零警告、Prettier、content/icon/flow guards 与
  diff 检查通过。首轮新增测试用 Playwright evaluateAll 的隐式 any，已改为直接
  locator 顺序断言，修正后 lint 通过。
- Web build 为 3,390 modules：`index-B1gpj1JT.js` / `index-Ddfvs7XW.css`，位于
  `artifacts/sidebar-search-entry-v33/web/`，既有大 chunk 警告保留。

交付截图位于 `artifacts/sidebar-search-entry-v33/delivery/hbar-search-en-1440.png`
和 `hbar-search-zh-320.png`；完整流程和 cleanup 记录在 `final-screenshots/`。
owned reference/preview/Host 释放后 49158/49168/49169 无监听。

两位 gpt-6-luna/max 的只读审计请求遇到 429 并失败，不算作审计通过；本项依据
主 agent 的源代码、原始渲染、真实 Host 流程完成。未安装依赖、修改用户配置、
启动 native 应用、push 或 merge；全仓/native 门禁未认证。

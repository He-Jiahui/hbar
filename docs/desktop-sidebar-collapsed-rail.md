# 桌面折叠侧栏仍保留直接入口

隔离 `codex/session-launch-target` 上的独立导航单元；不修改主工作区、CC-haha 或共享
`hbar-ui`。空会话切项目保留模型与思考等级的推荐语义不变。

## 参考与迁移原则

主 agent 查看 CC 公开 `docs/images/app/zh-CN/session-main.webp` 与已有
`D:/Git/hbar/artifacts/ui-reference/cc-haha-runtime/current/sidebar-390x844.png`：
主要操作在导航上部、设置在底部、阅读主区稳定，窄屏采用抽屉。
参考版本 `e28d0a653481ef41b7a329411eeb2f0fd5656731` 的
`desktop/src/components/layout/Sidebar.tsx:1019–1065,1459–1477,2357–2395`
证明桌面折叠后 NavItem 仍是可聚焦按钮，保留 aria-label/title，隐藏文字而不隐藏动作。
`globals.css:1189–1190,1775–1777` 定义 72px rail。
本次没有新捕获 CC 的折叠动画/画面；桌面 rail 依据其实际源码，画面提供布局与层级语境。

hbar 原先 `sidebarOpen=false` 会隐藏整个 drawer，用户每次进入 New、Extensions、Search、
Status、Settings 都要先 Show。公开 Lumen shell 没有 collapsed slot，因此不能靠覆盖
私有 CSS 把隐藏 drawer 强行显示，也不修改只读共享组件。

## 已完成行为

- 宿主组合公开 shell：宽桌面折叠时在 sidebar slot 渲染独立 rail，用公开宽度控制；
  展开仍用原 sidebarLayout/resizer，窄屏仍由既有 drawer 规则管理。
- `shell-layout.json` 的 projects size 描述 `collapsedRem: 4.5`，旧 v3 保存数据缺少该字段
  时由 schema 注入默认值；展开宽度、visibility、其他模块、版本迁移和 CAS 不变。
  没有增加另一个持久化偏好或声称原本不持久化的 toggle 现在会持久化。
- 上部 Expand / New / Extensions / Search，底部连接状态 / Status / Settings；
  仅接入现有真实动作，断线有原 Reconnect。不伪造 Scheduled、Market、PTY、Browser 或 Team。
- 所有 label/title/aria 与状态值由宿主提供；功能图标用公开 md tier，连接标记用公开 sm
  tier（共享 LumenIcon 当前没有 xs），不覆盖绘图尺寸或私有样式。
  rail 是正常 flex pane，头尾固定在其文档流，中段有界滚动，反馈不因折叠消失。
- 折叠/展开后焦点落在对应 toggle；搜索 Escape 返回原 rail 入口，绑定 runtime 与原
  workspace/session，不覆盖后来主动移走的焦点。Settings Back 保留入口焦点和原草稿。
- 宿主 `data-hbar-sidebar-expanded` 描述树是否展开；共享 `data-sidebar-open` 在桌面 rail
  可见时为 true，不能再代表“树展开”。现有相关 E2E 机械迁移到宿主语义标记。

## 验证与限制

- 布局迁移/保存、rail 中文宿主与长标签/忙碌/选中/断线、中英文快捷键回归：
  21 tests / 171 assertions 通过。
- 新的真实 Host 核心链直接依次进入 Settings、Extensions、Search、Status、New；
  返回保留原草稿；展开恢复 resizer，再进入 390px 验证无 rail 的抽屉和无横向溢出。
  一个同名 New session 的夹具定位歧义改为原 session ID 定位，不以 nth 猜测目标。
- 最终组合：该链、中文原 sidebar resize、180 条消息阅读返回、未保存 Files 的
  Settings/Status/模态/workbench 返回，4/4 通过，22.1 秒。
  旧 Files 回归仍把 Ctrl+K 当 Commands，已改为当前真实 Ctrl+Shift+P；Ctrl+K 仍是 Search。
  没有新增按钮 × 尺寸矩阵；沿用原 resizer 测试自己的尺寸覆盖。
- 包含 App 的严格作用域类型检查、变更文件类型感知 lint 零警告、content/icon/flow
  guards、格式、diff 与生产 Web build 通过。全仓与原生门禁未运行。
- 最终生产资产 `artifacts/sidebar-rail-v43/web`：`index-zDtoxPo6.js` /
  `index-CQRvz66V.css`。截图位于该目录
  `final-results/sidebar-rail-collapsed-des-bf5a0-w-screens-retain-the-drawer`。
  主 agent 原尺寸查看 `collapsed-rail-1440.png` 与 `drawer-return-390.png`，
  入口没有消失，阅读/输入区自然伸展，窄屏输入内容保持正常流。

这一单元没有安装依赖、启动原生 app、调用付费 Provider、push/merge 或部署。
临时 Host 关闭阶段的 WS ECONNRESET 没有产生流程内 pageerror。
完整桌面迁移仍按独立核心路径推进，不能把这次导航闭环当成所有能力都已与 CC 等价。

# 标签菜单随工作台布局保持可达

隔离 `codex/session-launch-target` 上的独立改进；不修改主工作区、CC-haha 或共享
`hbar-ui`。这是 hbar 本地菜单健壮性修复，不是声称 CC 已经解决了同一问题。

## 现象、历史与参考

在 `2c3ddb06` 的生产 Web 预览中，打开 Session 002 的 More 菜单后将工作台从
1440px 缩到 390px，菜单仍是打开状态，但整块留在视口外。仅检查 DOM 可见性不能发现
这一问题；真实 Host 回归通过菜单实际边界确认了失败，并保留修复前宽窄截图。

历史提交 `231ef3cc` 建立了 trigger-anchored popover，但只在 `openMenu` 中读取一次
入口位置。此后布局变化没有重新定位。相关历史和当前差异已核对；本轮不将问题归因于
最近的 rail 提交，也不声称复现了历史提交当时的完整运行环境。

CC 参考版本 `e28d0a653481ef41b7a329411eeb2f0fd5656731` 的
`desktop/src/components/layout/TabBar.tsx:205,410,680` 同样保存一次 `clientX/clientY`，
其 `useDismissable` 调用没有启用 `closeOnViewportChange`。因此 CC 的关闭、关闭其他、
关闭左/右侧语义与顶部标签区域是参考，但窗口变化后的可达性属于 hbar 自身补强。
已有 CC `docs/images/app/zh-CN/session-main.webp` 提供顶部导航的视觉语境；本轮没有新捕获
CC 菜单缩放截图，不能把源码推断当成参考实渲结果。

## 已完成行为与布局边界

- 菜单保留打开时捕获的 tab ID 和原入口；窗口 resize、标签区 resize 或滚动时重新读取
  原入口的真实几何关系。每帧最多一次定位，关闭或卸载时释放监听、observer 与待执行帧。
- 原入口被移除、隐藏或完全滚出视口时关闭菜单；来源 tab 消失或进入 busy 也关闭。
  不将旧菜单动作重定向到后来选中的会话。
- 仅真正覆盖内容的菜单容器定位；五个动作沿用正常 flex 文档流、宿主类型化中文/英文
  文案、公共图标与原有禁用语义，没有覆盖共享组件私有结构或新增 Host 命令。
- 菜单宽度仍是 `min(18rem, viewport - 1rem)`；最大高度改为当前入口下方的剩余空间。
  长文本自然换行，容量固定的五项菜单在必要时由自身滚动，不给普通内容添加固定高度。
- 原关闭范围、存活标签选择、草稿归属不变；Escape 消费当前菜单事件，沿用原标签焦点
  返回。延迟初始聚焦前核对 popover 仍打开，不聚焦已关闭的菜单。

## 验证与证据

- 纯布局、既有 React tabs 与 runtime tabs 测试：26 tests / 137 assertions，通过。
- 严格作用域 TypeScript、类型感知 lint 零警告、content/icon/flow guards、格式与 diff
  检查通过。生产 Web build 通过（3404 modules）；没有宣称全仓检查或原生构建通过。
- 新真实 Host 核心链：两个会话各留草稿 → 打开同一个菜单 → 1440 缩至 390 → 菜单边界
  在视口内 → 关闭其他 → Session 002 仍选中且聚焦、草稿不变 → 重开 Session 001 原稿
  不变。未生成 Run，也没有 pageerror。
- 该链与既有真实 Host 多标签范围关闭/邻居返回回归组合 2/2 通过，7.9 秒；没有扩展
  按钮 × 尺寸矩阵。临时 Host 关闭期间 Vite WS ECONNRESET 不影响流程结果。
- 修复前图与 trace 位于 `artifacts/tab-menu-v44/red-results`；最终图位于该目录的
  `final-results/workspace-tab-menu-layout--ab9e5-e-only-their-original-scope`。
  主 agent 人工查看宽窄实渲：菜单动作完整可达，主内容与输入区自然流动。
- 最终预览生产资产在 `artifacts/tab-menu-v44/web`：`index-CR6lVyp-.js` /
  `index-CQwCF_WD.css`。临时 Host 和 Vite 在测试结束后关闭。

本轮没有安装依赖、启动/重启原生 app、调用真实付费 Provider、修改主工作区或共享 UI，
也没有 push、merge 或部署。完整迁移的完成状态不能仅由这一项菜单修复推导。

# Search chats 的可见键盘选择

本子功能基线为 `1a334627`，参考是只读 `D:/Git/cc-haha` 的 `e28d0a65`。
主 agent 查看原 `GlobalSearchModal` 源码，以及保留的原组件实渲
`artifacts/desktop-next-entry-audit/search-reference/evidence-complete/en-US-1440-recent.png`。
输入保持焦点，方向键选择结果，当前行有明确底色，Enter 打开所选会话；这些
截图使用原组件、原主题及合成记录，不是 CC 原生 Host 的搜索证明。

## 当前红测与原因

在最终 Skills 生产资源 `index-C7t828-W.js` 上，新断言驱动真实隔离 Host 的
近期列表，按 ArrowDown 后 `aria-selected` 正确，但选中和未选中行的 computed
background 都是透明。主 agent 亲看红测截图，无法从画面识别 Enter 的目标。
`artifacts/chat-search/current-selection-red` 保留画面、失败与 exit 0 的 owned
cleanup；不是仅凭 CSS 推测问题。

历史 `a03912cd` 引入本地 `[aria-selected]` 背景规则。当前共享 Lumen 的
`fb03b2e28c` 让 canonical variant paint 优先于组合层旧背景重置，并通过
`data-lumen-state='selected'`／aria-current／aria-pressed 提供选中 paint。
Search View 只传了 aria-selected，没有将同一选中事实接到公开 indicatorState。
历史是因果线索，当前生产红测与公开控件实际规则证明了本次覆盖关系；本切片
不降级共享 UI、不改共享仓库，也不把纯业务选择再复制成独立状态。

## 修复与实际验证

行的 indicatorState 由原 selectedSessionId 派生，与 aria-selected 同步；删去
会竞争共享 paint 和焦点轮廓的本地状态 CSS，保留原 normal flex 布局、50／8
容量、宿主中英文、纯文本片段和精确 session/workspace 导航。

- 新 SSR 回归验证原选择、idle 与失效 ID 不生成假 selected paint。相关 View、
  controller、port、侧栏入口组合 19 tests／133 assertions 通过；既有 Bun
  directory-mismatch 诊断保留，终端 exit 0。
- 全仓 lint、根严格 typecheck 通过；最后变化的测试与原生脚本 scoped ESLint
  通过。作用域 Prettier、content／icon／flow guard、diff 检查通过。
- 生产 Web build 3548 modules，`index-BjffMGlO.js`／`index-Fadl9qq8.css`；
  既有大 chunk 警告没有提高阈值。最终资产经 SHA256 核对后，两条完整路径
  en-US 1440／zh-CN 320，2／2 通过，12.4 秒。
  驱动真实近期读取→键盘选择且可见→Enter 打开原对象→Ctrl K→正文搜索→隐藏
  工程会话→返回／关闭，并核对无 Run 提交及错误；两份 cleanup 都确认删除。
  主 agent 亲看最终宽／窄画面；鼠标离开列表后等待共享过渡结算，未选中行恢复
  透明，而不是只看 HTML 的 aria-selected。
- 首次绿运行的中文旧断言查找桌面 tab；当前窄屏把 tabs 放入导航菜单。保留失败
  后改为验证实际可见的当前 conversation region／标题，宽屏仍核对所选 tab。
  没有改 fixture 内容、减小搜索结果或修改产品导航来让旧断言通过。
- MSVC 环境下离线刷新 standalone 资源，复用已有调试 exe，原生 smoke 的新
  `run-20261002-19` 完整终端 exit 0。增加一条拥有的近期记录，通过唯一幂等键
  创建；真实原生 Ctrl K→ArrowDown 的选择有可见差异，Esc 返回保留未发送
  草稿。原模型/high、Goal Plan、同 Run 审批、Files 搜索、Skills 阅读和窗口／
  Host 生命周期仍通过。主 agent 查看实际原生搜索截图；owned profile／项目
  清理完成，拥有的 exe 已退出。没有用户应用安装、重启、付费模型或用户数据写入。

原生 `run-17` 的新步骤只有一条记录、`run-18` 的创建请求缺少幂等键，都如实
保留为 harness 失败，不算产品失败或成功次数；只有最终 run-19 算原生通过。
最终截图位于 `artifacts/chat-search/current-selection-settled` 和原生 run 的
`artifacts/ui-redesign/tauri/chat-search-keyboard-selected.png`，均在 ignored
目录。此修复只关闭搜索当前行的可见反馈断点，不宣称总体 CC desktop Goal 完成。

## 导航等待后的恢复（后续独立子功能）

基线为选择反馈提交 `e0b00dcf`。新的会话 agent 与主 agent 各自用 controller
的真实 action/deferred 复现：openRow 尚未结算时改变 query／retry 或 Host bind，
旧结果因 read generation 过时而被忽略，但 openingSessionId 留存。View 据此将
所有新结果 disabled，直到用户关闭弹窗。相关代码仍来自 `a03912cd`；旧测试只
检查 stale 导航的返回值与错误，没有检查 busy 释放，不能作为本问题已覆盖的证据。

真实页面进一步确认：最终基线资源上持有原 session.get 请求，用户输入新 needle
查询；另一个 paired fixture Client 通过公共 SDK 将原 Session 归档，再释放请求。
Host 返回真实归档事实，导航实际失败结算，但新结果持续 disabled。没有伪造成功
内容或响应。红记录保留在 `artifacts/chat-search/navigation-failed-owner-red`；最初
释放成功导航会正常离开弹窗，不能用来证明“失败后新结果仍卡住”，该探索记录
也保留，不把它误报为第二种产品失败。

修复为读取代次与导航 request 身份分别归属：query／retry 不提前释放仍在执行的
single-flight 导航，原请求 finally 只清理自身 busy；Host 离开、close、dispose
明确丢弃 UI owner。同一个 Session 在新 Host／重开弹窗中的新请求不能被旧 finally
清掉；过时错误仍不写进当前查询。本功能没有新增自动重试、变更导航目标或
把 UI owner 清理声称为物理取消。

最终生产 Web 为 `index-CfF1VfQk.js`／`index-Fadl9qq8.css`，3548 modules。
SHA256 核对后的真实 Host 三条路径通过，17.1 秒：新增的 held→真实归档失败→
新结果恢复→打开另一个会话，加上原英文桌面／中文窄屏的键盘选择与正文搜索。
主 agent 查看了恢复后的实际结果画面。严格类型、全仓 lint、最终测试／原生脚本
scoped lint、Prettier 与 diff 检查通过。最终 View／controller／port 组合
20 tests／123 assertions 通过，其中 controller 10 tests／56 assertions；包括
query→retry 后旧成功／失败结算、Host 重绑与 close/reopen 后同 ID 新 owner 保留。

MSVC 环境下离线刷新资源后，新 `run-20261002-20` 完整 native smoke exit 0，
主 agent 查看了仅当前选择有底色的原生画面。这里 native 证明最终资源下的搜索
选择/Esc 草稿和既有核心链仍成立，迟到导航失败恢复由前述真实 Host 浏览器链与
controller 回归证明，不宣称在原生窗口也注入了归档竞态。owned cleanup 完成，
没有应用安装、用户项目或付费模型操作。

同轮另两位 gpt-6-luna/max agent 分别只读复核 Settings 和 Files／workbench。
Files 主链未发现新的证据充分断点；Settings 提出 session/workspace form 中
Provider 全局默认操作的作用域候选，尚未现场点击复现，不能写成已确认或已修复。
下一独立检查应沿这个具体候选继续，不以本次搜索闭环宣告全部体验完成。

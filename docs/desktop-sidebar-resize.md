# Desktop 侧栏调宽与窄输入区闭环

本单元把已有布局描述中的工程侧栏宽度，落实成用户可操作的入口，并保证调宽后合法的窄聊天区仍可用。它接续[全入口审计](desktop-final-entry-audit.md)，不代表整个桌面迁移已经完成。

## 参考与真正的差距

参考是本地 cc-haha `e28d0a65` 的原 `Sidebar`／`useSidebarResize`，而不是重新画出的相似示例。受控原组件中，英文／中文 1440px 实测 280 → 方向键 300 → 拖动 420 → 刷新 420 → 双击 280；320px 不显示分隔条。该证据只证明原组件行为，不冒充原 Host。

hbar 基线 `a62f098`、`fbz8IPGL/BBy3EzVG` 的工程侧栏始终为272px，拖边缘不改变宽度，也没有侧栏 separator。已有右工具分隔条不能替代项目导航入口。详细截图和逐入口边界在[导航审计](desktop-navigation-final-entry-audit.md)。

- [原 Sidebar 调宽后的英文画面](../artifacts/desktop-final-entry-audit/navigation/cc-original-sidebar-dragged-en-US-1440.png)
- [旧 hbar 边缘拖动仍为固定宽度](../artifacts/desktop-final-entry-audit/navigation/hbar-sidebar-drag-selects-text-en-US-1440.png)

保留 hbar 的12–24rem、默认17rem及显式 Hide／Show；没有借本次改动仿造参考的折叠窄轨。宽度不是截图坐标，而是受主区最小可用空间约束的流式分栏。

## 实现与交互边界

- 工程侧栏与主框架之间增加普通 flex 流中的分隔条。拖动只预览，松开提交一次；Escape、pointercancel、几何失效或禁用取消预览。左右方向键调整，Home／End 到当前界限，Enter／双击恢复默认；修饰键、输入法和已消费事件让行。
- 宿主提供类型化中英文标签、宽度值、重置提示和保存反馈。设备尚未完成偏好恢复时不能调宽；保存失败明确保留局部失败／原位置重试，不谎报持久化成功。
- 复用原布局 v3 和唯一 canonical layout CAS owner，只改 `projects.size.preferredRem`；不引入平行 localStorage 偏好，也不重置右工具宽度、可见性或其他模块。重试读取最新描述后合并原宽度。
- 同挂载 owner 更换取消旧手势；捕获的回调核对 runtime／target，迟到 Promise 不能清掉新 owner 的 pending 或 preview。共享分隔条接受宿主 authoritative status，外部 Retry 成功后不残留内部 failed。
- 390／320继续原窄屏导航策略，不新增伪抽屉模式。正在聚焦的分隔条消失时由宿主返回可用的侧栏开关／当前面板；不夺取后来用户焦点或 native dialog 焦点。
- 草稿、A／B会话选择、dirty Files、Settings／Status返回与右侧工具宽度保持独立。这里只保证操作期间草稿，不声称刷新后会话草稿持久化。

共享公开组件与布局契约在 hbar-ui；宿主布局保存、文案、焦点目标和输入区样式留在 hbar。没有把 Host 业务和 DOM 查找藏进共享分隔条。

共享实现独立提交 `64a5b14fe1`，保留此前外部 `0c77c126d7` 为祖先；根仓只更新到包含该实现的gitlink，不夹带 Authentication 的后续未提交工作。

## 人工看图补出的窄容器缺陷

第一份侧栏候选通过了“页面无横向溢出”，但900px窗口中，侧栏12rem、Files分栏与合法20rem聊天区组合仍有真实叠字。`CQS-FXxo/--i3eJYTI` 的英文 Thinking 与 Send 矩形相交17.25×30px，模型／预算文字超出按钮；中心命中检查本身也抓不到。

历史核对到共享 toolbar 的 viewport-only 响应式、`2af5d12e` 的 options 包装，以及 `58fb77c` 已有 footer container。没有历史二分，不把这些提交夸大为已证明的首个引入点。参考 `ChatInput.tsx:270–299` 则按测得的 shellWidth 选择 compact controls。

修复复用宿主 `session-project-context` 容器：实际宽度不超过40rem时，工具栏按内容流分组换行，模型文字有界，Send／Stop保留独立空间，Queue仍可换行。不提高主区20rem限制、不隐藏模型／权限／Goal，也不强制 Files 退回整页来掩盖。

- [原候选真实交叠红图](../artifacts/desktop-final-entry-audit/navigation/sidebar-composer-red/composer-controls-en-US-900.png)
- [最终原生英文900：聊天区320px](../artifacts/sidebar-resize/native/hbar-native-session-sidebar-xDvufv/composer-controls-en-US-900.png)
- [最终原生中文900：聊天区320px](../artifacts/sidebar-resize/native/hbar-native-session-sidebar-xDvufv/composer-controls-zh-CN-900.png)

维护测试既检查按钮二维不相交与文字边界，也普通点击模型／思考／预算菜单、确认可见再Escape关闭；Send仅trial，无派发。主线和agent均实际看过最终截图。

## 验证、失败记录与范围

最终产品资源为 `index-D1saJc7c.js`／`index-DIGCkbQF.css`，3072 modules。根生产构建通过，有既有大 bundle warning。原生工具及新Host/Web resources构建通过，复用现有launcher；没有重编桌面exe或宣称通用desktop smoke通过。

| 层级                           | 实际结果                                                           |
| ------------------------------ | ------------------------------------------------------------------ |
| 共享 sidebar/resizer Vitest    | 29/29，含键鼠、owner切换、迟到回执、窄屏、focus和原tool方向        |
| 根布局／保存／持久化           | 24/24，187 assertions                                              |
| 根布局／焦点补充集合           | 37/37，216 assertions；与上一行部分重叠，不相加                    |
| 新真实Host侧栏                 | 4/4，20.2s；中英×四宽、拒写恢复及最小聊天区                        |
| 同资源P1／P2／P3真实Host旧回归 | 19/19，3.2min，0skip                                               |
| 原生窗口                       | 中英×900×600／1440×960四组通过，另两组900+Files+main320通过，30PNG |

原生新增几何结果两语言均 `mainWidth:320`、`overlaps:[]`；4按钮中心命中自身且文字有界，3菜单真实开关。原生会话0Run／0消息／0pageerror／0native console错误；新侧栏浏览器4例0Run／不保存文件。旧回归保留各自受控本地fixture的审批、Stop和文件保存，不能把它们也写成全部只读。

同一最终资源额外执行模型、权限、Goal／Plan、Queue／Stop四个真实Host suite共8例，加基础工作台几何1例和未连接Host的shell6例，最终 **15/15，50.7s**；目录 `artifacts/sidebar-resize/final-composer-flow-regressions`。未连接场景的代理ECONNREFUSED和fixture清理时ECONNRESET不是被忽略的UI测试失败，命令实际exit0。它们与上表19例是不相同的维护测试。

窄屏焦点落到BODY、外部Retry后旧failed、旧composer交叠的真实红测分目录保留。旧布局测试只量sidebar→frame的假设已更新为sidebar→separator→frame连续关系，仍验证分栏推挤和正命中宽度。旧全局 `footer` 选择器在原fbz基线也同时匹配隐藏关闭对话框，改为命名侧栏内footer，没有删除连接状态断言。

另一次输入区旧回归初跑7pass／1fail：英文Queue正常换行后，旧测试只接受Stop在同一行右侧。原fbz基线同样失败；共享 `bf117f073a` 明确允许该组 `flex-wrap:wrap`。测试改为右侧或后一行的有序二维不相交，并新增两按钮中心命中与trial普通点击，保留全部真实排队、Stop和未执行写文件断言；不是隐藏产品交叠。

完整根 `bun run check` 在容器CSS补丁之前实跑：native build、strict lint、typecheck通过，全量 **2047 pass／1 fail／15235 assertions，355文件，256.10s**，总exit1。唯一失败为外部 `QuoteAuthentication.tsx:native-visible-control`；日志 `artifacts/sidebar-resize/final-frozen-check.log`。CSS定稿后根全量lint／typecheck再次通过，布局子集24/24、单独canonical边界仍2pass／1fail。同一外部失败未改；不能把专项绿写成全仓全绿，或把CSS前完整Bun计数说成CSS后的完整重跑。

共享仓标准 `pnpm -F @lumen/app-ui typescript`、`pnpm proptypes`、`pnpm docs:api` 实际因本机11.19.0与要求12.3.4不匹配被阻断。直接本地严格TS、Vitest、scoped ESLint、Prettier及生产build／声明产出通过；没有全局升级、放宽门禁或宣称上述pnpm命令已通过。

原生仅清理本次精确PID身份链和新建临时目录；现有用户桌面与保护PID未触碰。证据保留在ignored artifacts，索引之外的并行工作保持原状。

## 后续

本单元不关闭全入口Goal。下一独立单元仍是设置动态选项的原位只读重试、鉴权图片回看；项目组织、查找和快捷键继续按审计矩阵落实。全局全文搜索、PTY、任意内嵌Browser、市场／Team／定时任务不能用占位入口冒充能力。

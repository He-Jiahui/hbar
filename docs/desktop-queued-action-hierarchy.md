# 排队卡的动作层级

本单元以 `5ad12a5f` 为 hbar 基线，只修改隔离工作树中的 queued View。
CC-haha `e28d0a65` 和共享 hbar-ui 保持只读。

## 参考与原因

CC `desktop/src/components/chat/ChatInput.tsx:1228-1247` 的保存使用 tonal，取消使用 ghost。
既有原 ChatInput 实际渲染截图
`D:/Git/hbar/artifacts/reference-ux-v2/queued-cards-edit-reference-1440.png`
显示同一卡内保存比取消更醒目，没有两枚按钮各自的常驻下划线。
这是带隔离数据的原组件证据，不代表完整 CC Host 流程。

当前 hbar 两枚按钮都使用 Lumen text 默认值，下面各有 lamp。
`ea402c85` 引入编辑动作时未指定 indicator；不是 `af9162a6` 的多行控件改动所致。
LumenButton 在未指定时默认 `indicator='lamp'`、`indicatorEdge='bottom'` 和 idle 状态。
它们不表达排队结果或保存进度；进度、未知结果、错误早已由原位文案与禁用语义表达。
排队卡的 Guide/Edit/Remove 则已显式使用 none，因此编辑动作与相邻行操作不一致。

## 实现

- 保存使用既有 Lumen outlined 的轻量底色，取消仍为 text；不复制参考颜色/字体像素。
- 此 queued surface 的一次性动作、结果核对、关闭和分页都显式 indicator none。
- 不删原位排队/读取/保存/引导状态、错误和恢复文案，不改变 callbacks、目标或 pending 锁。
- none 按钮的键盘焦点由 canonical Lumen `:focus-visible` outline 提供。
  不以隐藏所有 indicator 的 CSS 绕过共享组件，不向 LumenIconButton 传未支持的 prop。
- 本次没有修改 CSS、布局、图标等级或文案；仍按原正常流和同一卡动作顺序呈现。

## 实际验证

- RED：新行为断言在旧 `artifacts/queue-multiline-v24/web/` 上失败，
  保存的实际属性为 lamp/text。证据 `artifacts/queued-actions-v26/red/`。
- 新 Web build 成功，3382 modules，
  `artifacts/queued-actions-v26/web/assets/index-CXMN2kRV.js`；
  CSS 仍为 `index-BUG_tiWa.css`。保留既有大型 chunk 警告。
- 中英文真实临时 Host 原位编辑 E2E **2/2，26.7 秒**，继续验证多行保真、
  Enter/Shift+Enter、取消不写入、主 composer 草稿保留和保存后真实 Host 回读。
  同一路径追加 Tab 到保存、焦点和实际 solid outline 断言，不新增尺寸矩阵。
- 主 agent 查看最终中文宽屏键盘焦点与 320px 长内容截图：
  `artifacts/queued-actions-v26/final/queued-run-edit-queued-mes-36df9-ktop-and-narrow-width-zh-CN/`
  下的 `queued-edit-keyboard-focus-zh-CN.png` 与 `queued-edit-zh-CN-320.png`。
  保存和取消无 lamp 子元素；窄屏动作正常换行。
- runtime/queued edit storage-client 回归 **15/15，117 断言**。
  改动范围严格 TypeScript、零警告 ESLint、内容/图标 guard、Prettier 与 diff 检查通过。
- SSR queued view 测试尝试后仍在导入只读 MUI 子模块时缺少 `prop-types`，
  0 条测试执行，不报告通过。未安装依赖、运行 full check 或原生 build/smoke。

只使用独占 localhost preview、临时真实 Host 和 local-fixture 模型，无商业请求或真实配置。
Vite ECONNRESET 为临时 Host 关闭时的输出，浏览器 pageerror 为空。
这完成 queued 动作家族的视觉层级，不宣称侧栏所有图标、其他动作家族或整体迁移已完成。

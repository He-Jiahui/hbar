# 差异评论 → 原会话继续输入

本单元接续[选区与评论](file-selection-context-ui.md)，在隔离
`codex/session-launch-target` 修复评论成功后的操作衔接；hbar 基线 `e36e4910`，
CC 参考只读 `e28d0a65`。不改变引用内容、草稿/Run 合同或 Files 的导航归属。

## 参考与红证据

主 agent 查看 CC 已发布 `docs/images/app/en/workspace-diff.webp`，以及既有原组件
画面 `artifacts/file-selection-reference/desktop-1440-diff-comment-editor.png`、
`desktop-1440-diff-comment-added.png`。它们证明 diff 中的就近评论与引用卡布局；
夹具使用原 WorkspacePanel/WorkspaceDiffSurface/AttachmentGallery 与合成数据，
不是原生 CC Host，部分图标字体为 fallback，不能用这些图片证明真实提交或输入焦点。

焦点行为依据 CC `WorkspacePanel.tsx:1526-1553`：`addDiffCommentToChat`
加入 reference 后，只定位相同 sessionId 的可见 composer 并 focus，不关闭工作台、
切到别的会话或自动发送。整文件路径、普通选区及源代码行评论的添加没有这个动作，
本单元不将差异评论行为扩张到所有添加入口。

核对 `db6c33aa` 差异与当前源码：hbar 的 `closeReview` 同时用于取消和成功，
都会将焦点送回差异行。真实临时 Host/Git + 基线生产 Web `index-D01-VGwD.js`
完成评论添加后，新 composer focus 断言失败；截图/trace 在
`artifacts/file-review-continuity-v28/red/`。已有引用/Run E2E 没有这条连续输入断言。

## 已交付行为

- 成功添加差异评论后，若原会话输入区仍可见可用，焦点回到它，Files 保持打开，
  用户可直接继续提问。不发送 Run、不修改其他会话或切换页面。
- 捕获原 composer DOM、差异行、Files/预览/原页签实例与组件 lifetime；
  所有权改变、卸载、目标不可用、模态打开或用户焦点已移出原编辑交互时不抢焦点。
  窄屏/展开工作台没有可见输入区时，保持在可用的原差异行。
- 焦点归 View 生命周期，不新增业务状态副本或 Host 命令。成功与取消分离：
  取消沿原差异行返回；失败保留原编辑器/错误；普通选区/路径添加不变。
- 候选一次 requestAnimationFrame 方案在窄屏出现焦点遗漏；成功返回时 DOM 中
  的行仍可能禁用，单次可用性检查会跳过。最终在 React 已提交解锁控件的 layout
  阶段处理，取消 pending focus 的释放路径明确，不用延时循环或强制跳转补偿。
- 无 UI 文案、图标、CSS 或截图坐标布局变化；复用既有可用元素检查，正常内容流不变。

## 实际验证

开工时在 `e36e4910` 构建复核中文 Files 完整引用/Run 与 Settings 分组保存/返回：
**2/2，通过15.2s**，记录 `artifacts/secondary-continuity-v28/host/`。
这只是基础核对，不能混作下面新构建的全页面验收。

最终生产 Web `artifacts/file-review-continuity-v28/web/`，JS `index-C3_X9Xoh.js`、
CSS `index-BUG_tiWa.css`，3384 modules，保留已有大 chunk 警告。
最终中英真实临时 Host/Git 连续流 **2/2，通过17.6s**，输出
`artifacts/file-review-continuity-v28/final-current/`：

- 原材料、整文件 mention、选区/源注释/diff 注释与行范围保留；桌面评论后输入区聚焦，
  Files 仍可见；同一流程转窄屏重添相同评论，回差异行而不是不可见 composer。
- 重复评论不增卡；单项删除不影响其余材料；A/B 会话隔离；发送后的唯一 Run
  含准确保留的代码、diff side、note 与文件，成功后 composer/cards 清空。
- 主 agent 亲看最终中文桌面 `diff-comment-to-composer-1440.png` 和窄屏
  `diff-comment-retains-narrow-reader.png`，没有新增按钮/宽度组合矩阵。

相关引用 runtime 与焦点决策 **12 tests / 47 assertions** 通过。
其他焦点、失效 owner、缺失/不可用 composer 的边界来自纯决策测试；未冒称全部是
浏览器故障注入。受影响严格 TypeScript、零警告 ESLint、内容/图标 guard、格式与 diff
检查通过；无新 CSS，未重新生成全量视觉基线。

两个 gpt-6-luna/max 只读 agent 初次及各一次重试均返回503，没有产生审查结论。
本轮依据由主 agent 查证和实测，不计为并行审查通过。临时 Host/preview 已关闭，
无收费模型、真实 profile、主工作区/CC 修改、依赖安装、原生启动、推送或合并。
没有认证全仓/native/旧 Lumen SSR。整体迁移与 Goal+Plan、`/agent` 等未决项仍见
[当前复核](desktop-core-continuity-current.md)，本单元不把这些差异记为完成。

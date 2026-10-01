# 返回会话时保留阅读位置

本单元在隔离 `codex/session-launch-target` 的 `931b5c70` 上完成；不修改主工作区、
只读 CC-haha 或共享 `hbar-ui`。空会话切项目仍保留当前模型、思考与草稿。

## 参考与实际断点

参考版本为 CC-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731`。
主会话公开画面 `docs/images/app/zh-CN/session-main.webp` 展示稳定的阅读主区、
底部输入区与按需工具区；它不是设置返回的动态截图。
`desktop/src/components/chat/MessageList.tsx` 的 sessionScrollSnapshots 跨卸载保留读点；
`MessageList.test.tsx:5121–5223` 明确覆盖卸载后 A → B → A，以及新会话不继承旧读点。
本次阅读了这些源码与测试，并查看公开会话图，没有启动 CC Host 或声称重放其动态路径。

hbar 的 Lumen viewport 已有挂载期间的消息锚点，但锚点属于组件生命周期。
`App.tsx` 打开 Settings 或全屏 Files workbench 会替换会话子树，返回后原锚点丢失，
阅读中途变成最新消息。临时真实 Host、生产资产和实际滚轮操作重现了这个断点；
不能用与初始定位竞争的直接 scrollTop 赋值作为重现证据。
Git 历史与本地差异已核对，没有将最近的 composer 提交当作已证实的引入原因。

## 实现与边界

- Runtime 用独立 Zustand 状态保存最多 128 个短暂几何锚点，按 workspace、session、
  source tab instance 精确绑定。只保存消息 ID、行内偏移与是否在末尾；不保存正文、
  DOM、路径、scrollTop、磁盘偏好或另一份时间线。读取无副作用，相同位置不通知订阅。
- View 在真实滚动与导航替换前记录读点，通过公开 controlled scrollTarget/result
  定位。每次恢复使用独立 request ID，避免 A → B → A 被上次的完成标志误跳过。
  对已裁切的虚拟消息，再做最多 500ms 的有界测量校正，结束前等待几何稳定。
- 缺失的旧消息复用 timeline.loadOlder，最多 17 页、每次观察最多 12 秒，遵守现有
  60 条分页与 1,000 条窗口上限。不增加 Host/协议命令，不冒充按 ID 直达任意历史。
- 滚轮、触摸、指针、阅读导航键或打开 Find 会接管恢复。关闭来源 tab、切会话、
  卸载与 dispose 清理自己的定时器/帧与缓存；迟到读取不重定位其他会话。
  取消 UI 等待不等于底层 Host read 被强制取消。
- 无法恢复时使用宿主中英文文案就近说明；新会话仍从最新开始，输入草稿与运行不变。
  本单元不改变现有布局/CSS，不修改共享组件或覆盖其私有样式。

## 本次验证

- `conversation-reading` 与 `session-workspace`：11 tests / 89 assertions 通过。
- 新的中文 1440px 真实 Host 链：180 条历史、设置返回、已加载旧页、Files workbench
  返回、A → 新 B → A、原草稿、无额外 Run 与无 pageerror；修正后曾连跑三次通过。
- 最终组合：上述新链、中文 Files workbench、中文 320px Find、后台 Agent Stop，
  4/4 通过，27.1 秒。没有新增按钮 × 尺寸组合矩阵。
- 变更图的严格 scoped TypeScript、7 文件类型感知 ESLint 零警告、content guard、
  生产 Web build、格式与 diff 检查通过。Bun 输出了 tsconfig override 的内部目录警告，
  测试仍以零退出码完成；Vite 的 WS ECONNRESET 发生在临时 Host 关闭阶段。
- 最终资产位于忽略的 `artifacts/reading-return-v42/web`，
  `index-Df_zBkjZ.js` / `index-PW5qbQCx.css`。
  实渲 before/after 位于同目录 `final-results/session-reading-return-rea-33328-ithout-following-the-latest`。
  主 agent 查看了设置返回、工作台前后画面：相同旧消息仍在阅读区，草稿和输入区完整。

没有运行全仓 lint/typecheck、原生 build/smoke、真实付费 Provider 或跨应用发布。
这些 focused 检查不是全仓门禁通过的声明。折叠侧栏快捷入口属于下一项独立单元，
不能以本次阅读修复宣称整体迁移已完成。

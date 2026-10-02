# Composer 主动作层级迁移

本单元以 `1dcb155f` 为基线，在隔离 `codex/session-launch-target` 工作树完成
Send / Stop 的视觉层级迁移。CC-haha、主工作区与共享 hbar-ui 均保持只读。
运行、排队、取消、审批和 Goal / Plan 的策略没有变化。

## 参考与差距

主 agent 查看了 CC 随仓库提供的
`D:/Git/cc-haha/docs/images/app/en/session-main.webp`：
composer 最右侧是实心圆形红色 Stop，模型与思考等级在它左侧，审批卡独立显示。
readonly `desktop/src/components/chat/ChatInput.tsx:1508-1530` 明确复用同一圆形
icon-only 主动作：空闲为 accent ArrowUp，运行中为 danger Stop；源码说明桌面
使用原控件的 32 尺寸、触屏使用 44 的点击目标。
这不是一套普通内容的截图坐标，也不表示必须逐像素照搬 CC。

两名 gpt-6-luna/max agent 分别检查核心状态与公开组件边界，并复审新 View。
核心运行逻辑本来已经对齐；本轮发现的是视觉层级差距，不能称为运行逻辑缺陷。
hbar `1dcb155f` 仍使用共享 composer 内的文本样式 IconButton 与短灯条，
主动作与其他工具图标接近。旧生产 Web 的中文真实流程红测确认 Send
`data-lumen-variant="text"`、没有 `indicator="none"`；证据在
`artifacts/composer-actions-v39/red-results/`。

## 实现与所有权

- app-react 内部 `HbarPromptComposer` 接管 View，并直接接收公开的
  `LumenPromptComposerProps`。共享 composer 没有公开的 action slot；因此不通过
  私有 DOM 隐藏动作、不插入重复按钮、不深层导入 SessionGlyph，也不改只读子模块。
- 复用公开 Surface、Textarea、FilePicker、Button、Icon、Text；
  两个生产调用点是 pre-session landing 和已有 session workspace。
  宿主提供草稿、所有文案、模型、权限、Goal / Plan、附件与动作回调。
  View 没有新的业务状态、网络请求或 Host 命令。
- Send / Stop 都是实心圆形、仅图标的主动作，使用 ArrowUp / Square 的 `md` tier。
  Queue 保留独立文本按钮；提交忙碌时在动作旁显示 LoaderCircle。
  主动作通过公开 Button `indicator="none"` 去掉装饰灯，保留其规范 focus-visible outline。
  桌面沿 hbar 的默认 2.25rem 点击目标，窄容器/触屏提升为 2.75rem；图标 tier 不随宽度变化。
- 状态条件与旧组件相同：无 Run 为 Send；运行中空稿仅 Stop；非空稿为 Queue + Stop；
  disabled/submitting/uploading/canSubmit、stopping 与 form.preventDefault 均保留。
  Stop 仍调用原 Run 的宿主回调，Queue 和 Enter 仍使用同一提交门禁。
  自定义 editor 完整保留原控件与 IME/newline 行为；内置 textarea 的 Enter guard 不变。
- context → attachments → editor → error → toolbar 顺序、aria-busy 与 error alert 不变。
  附件是 Host 有界、content-grown 列表：宿主草稿最多 12 个附件/传输，View 按 kind:id
  去重但不偷偷截断；回调保留原始 ID/kind，`attachmentContent=null` 仍显式隐藏 fallback。
  fallback FilePicker 继续使用公开原组件；生产页面仍使用其宿主 Add 菜单。
- 原 `.lumen-*` hooks 被明确保留以兼容宿主布局、查找与测试；新的 `.hbar-prompt-*`
  CSS 独立表达普通 flex 流、内容换行、圆形控件与 forced-colors，不读取共享私有 DOM。
  这层 View 的公开合同需要后续随共享 API 变更复核，不能声称从此没有维护成本。

## 实际验证

- 最终生产 build 成功，3396 modules；产物为
  `artifacts/composer-actions-v39/web/assets/index-CgUwcPir.js` /
  `index-DAnZG_Sy.css`。既有大 chunk 警告仍存在。
- 最终真实临时 Host **6/6，通过 25.0 秒**：中文附件上传/失败/恢复与作用域；
  中文 composer light/dark/forced-colors 边界；中文排队 → 停止 → 两条 queued Run 完成；
  Goal + Plan 首发与真实审批恢复同一个 Run；中英文首发 → 已有会话的模型/effort
  连续性和相同主动作。没有新增按钮 × 视口矩阵，沿用相关核心流程。
- 运行测试确认 Enter 与 Queue Space 各产生一个真实 queued Run，Stop 取消原审批阻塞 Run，
  目标文件没有写入，回到 Send；动作的命中区域不重叠、窄屏无横向溢出、键盘 focus 可见。
- 单元/SSR 与两个调用点回归 **11 tests / 334 assertions**：提交门禁、原 editor 回调、
  localized/long labels、附件 0/1/3/12/13、duplicate kind:id、同 ID 不同 kind、列表变化后
  旧回调仍作用于原对象、宿主附件层优先、错误/上传状态与阅读顺序。
- 主 agent 查看最终 en1440 首发、zh320 首发后、zh1440/320 Queue + Stop 与键盘 Stop focus
  截图，位于 `artifacts/composer-actions-v39/final-results/`。首轮视觉复核发现共享 solid
  样式覆盖自有背景，已修正 scoped selector 的优先级，重新构建并重跑 6 条真实流程；
  最终 E2E 也断言默认 light theme 的实心 Send / danger Stop 颜色。
- 作用域 strict TypeScript、类型感知 ESLint 零警告、内容/图标/flow guard、Prettier 和 diff
  检查通过。首轮 lint 发现测试根目录不能解析 @lumen type imports 及 finally 中的 throw；
  测试改为从实际 View 参数派生同一类型，并将有界临时目录清理检查放入独立 helper，
  未关闭规则。Bun 的既有 tsconfig override directory-mismatch 诊断仍出现，测试退出 0。

验证只使用独占 localhost preview、临时 Host 与 local-fixture；临时资源随测试关闭。
关闭阶段 Vite ECONNRESET 不代表流程失败。未运行全仓门禁或原生 build/smoke，
未安装依赖、修改真实 Provider 配置、调用付费模型、push、merge 或部署到正在运行的 desktop。
这次完成的是主动作层级子功能，不等于整体 desktop UI 迁移已经完成。

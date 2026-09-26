# 侧栏会话名单刷新

## 参考与实际入口

已查看 cc-haha 发布图 `docs/images/app/en/session-main.webp` 和 `h5-sessions.webp`：Refresh 是 Search chats 旁的次级图标，位于 Projects 上方；手机侧栏仍保留可触摸的独立入口。源码 `desktop/src/components/layout/Sidebar.tsx:1089` 绑定 `refreshSessionsNow()`，`:1680` 的 `useSessionListAutoRefresh` 用单飞、focus/visibility、前台 30 秒周期和焦点节流管理刷新。这些是参考仓库的真实截图与源码证据，不是 hbar 已具备全文搜索的证据。

hbar 在既有 Commands 行右侧增加“刷新已展开项目的会话”，保留 Commands 的真实语义；项目更多菜单另有明确项目目标的刷新。Refresh 使用 `LumenIcon` 的 `md` 级 RefreshCw，窄屏触摸区域为 `2.75rem`。加载、成功、失败、重试及容量提示位于原项目行下方。普通 flex 流布局，没有坐标定位、固定内容高度或共享 UI 私有样式覆盖。

## 事实归属与恢复

- 新 `sessionRoster.refresh`/`sessionRoster.invalidate` 是内部 Application runtime 入口，不增加 Host 写命令。目录仍是唯一会话事实源，刷新状态只保存进度、错误和容量信息。
- 请求捕获原 workspace ID/path；切到别的会话不会改成新目标。断线、目录路径变化、销毁时使原 generation 失效；失效响应不写入目录。相同项目单飞，取消 joined caller 不会取消或释放原请求。
- `directory.reconcileRosterSessions` 是观察性写入端口，不调用现有 `session.get` 的 `onSessionUnavailable` 回调。因此外部归档可以从常驻名单隐藏，但刷新不清除活动会话、不导航、不修改草稿。
- 已加载后页不能因不在新第一页而删除。原 shell 的下一页游标不重置。只有 `session.get` 明确返回 null，且缓存仍匹配读取前的 `workspaceId/seq/updatedAt` 基线时，才能移除那个旧成员；失败不是 null。
- 容量满时只更新已有事实，不为新的扫描条目驱逐已加载会话或其他项目成员。无法容纳的新 ID 数量有就近提示。普通目录查询的原缓存策略没有改变。

## 有界行为及未解决的协议差距

Host `packages/storage/src/worker.ts:423` 的 `sessionPage` 按 **ID** 排序，不是最近更新时间。只重读第一页会漏掉后页外部新建。因此每次刷新从头扫描到末尾或上限：每页 100，最多 10 页/1000 条，校验 ID 严格递增、nextCursor 推进、所属项目与重复 ID。达到扫描上限明确显示“超出范围的变化可能尚未发现”，不声称全部最新。

对扫描未覆盖的已显示旧成员，自动刷新每项目最多核对 100 个、按 ID 轮转；手动刷新最多核对 1000 个。单项目旧 ID 读取并发最多 4，项目批次并发最多 2、目标集合最多 200；单项目刷新总体截止 30 秒。隐藏文档、断线或隐藏侧栏不启动自动刷新，focus/visibility 使用每项目 5 秒节流，前台周期为 30 秒。

UI Client transport 没有端到端 AbortSignal；超时/失效停止等待并丢弃迟到结果，不等于已经中止 Host 的底层读取。大名单仍缺可恢复的目录增量事件/变更游标契约。有界扫描不是可靠全局增量同步；缓存或扫描上限外的最新会话不保证立即发现，本单元未增加消息全文搜索、删除、批量归档或排序合同。

## 验证与视觉证据

- 独立 runtime、scheduler、反馈与装配测试，加原目录/shell 回归：6 文件 **45 passed / 230 assertions**。覆盖第一页缺席保后页、强制 ID 后页新建、rename/archive、原活动与两客户端草稿、null 基线、100/1000/1001容量、游标异常、错误/超时、断线/路径改变迟到、并发/取消和观察性端口。
- 严格定向 ESLint、根 TypeScript、Prettier、content/icon/flow、production design-system boundary 均通过。隔离生产构建通过，保留既有大 bundle 提示，不改变门槛。
- `e2e/session-roster-refresh.spec.ts`：临时真实 Host，浏览器 Client 与独立 SDK Client；**2/2 passed**。验证 101 会话和后页记录、新建/重命名/归档、局部读取失败/重试、focus、隐藏不轮询/visibility恢复、前台计时、捕获 A 请求后切会话、断开浏览器 Client 后重连、外部归档原活动仍保留 header/草稿，以及中英文 1440/900/390/320 和键盘 Enter。
- 真 Host 截图：`artifacts/session-roster-refresh/roster-<en-US|zh-CN>-<1440|900|390|320>.png`；失败恢复：`error-<locale>-1440.png`。已人工查看桌面、900、中文320与自然语言错误截图，页面无横向溢出，侧栏 pane 承担名单滚动。截图使用临时 fixture 项目，不是用户工程。
- 构建为 `artifacts/session-roster-refresh/web-dist`，Playwright 输出为 `artifacts/session-roster-refresh/results`，preview/Host 分别 44869/44867，不覆盖主线产物。WebView2 原生验收由主线在稳定集成构建后统一执行；本单元未单独运行原生 smoke，不把浏览器证据当作原生结果。
- 主线原生补验已通过：`HBAR_NATIVE_VERIFY_ROSTER=1 bun scripts/verify-desktop-file-navigator.ts`，独立临时桌面 profile、本轮新构建 Host/Web resources、900×600。外部 SDK 创建的会话经刷新出现，不自动选中，原工作台文件草稿和会话输入均保留。截图：`artifacts/session-roster-refresh/native-900.png`。这是现有 debug launcher 的定向 WebView 检查，不是通用 smoke 或重新编译 exe 的声明。

本单元没有修改共享 hbar-ui。截图中的既有按钮下方线条与选中材质保持共享组件当前表现，不是刷新功能新增的 CSS。

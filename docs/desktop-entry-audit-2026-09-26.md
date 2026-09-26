# 桌面交互入口继续审查

本页是 cc-haha 参考体验迁移的剩余工作记录，不是完成声明。审查由会话、导航和设置三个独立方向进行，主线核对代码、测试与截图。已有产物与本轮新验收分开，不以旧截图证明当前完整体验。

## 已验证并提交的子集

- `7d9f0f7`：原请求的 Plan 审批、同 Run 的模式切换、反馈和刷新回看。[边界与参考](desktop-plan-exit-reference.md)。没有把完成后的旧提案动作冒充同轮审批。
- `a336682`：从持久 Goal-source Run 生成续作分隔。[边界与参考](desktop-goal-continuation-reference.md)。不是完整 Goal 设置/状态/完成事件卡。
- `e5153a1`、`157540e`、`819a912`：Files 阅读时保留可折叠导航、当前路径可见、窄容器切换、原 dirty/unknown 文档保护及原生验证。[行为与证据](desktop-file-reading-navigator.md)。
- `9ee4935`：设置原位 Token 用量，真实 Host-global summary/activity/model 读取，窗口／面板失效、缺价格和超时边界。[行为与证据](desktop-settings-usage.md)。
- `3080c71`：侧栏就近会话刷新，双 Client 更新、前台 focus/visibility/周期／重连、有界扫描和缓存容量反馈，不导航或消费草稿。[行为与证据](desktop-session-roster-refresh.md)。
- `7c6e6e9`、`3e2d02b`、`bea70a7`：Goal 历史公开有界查询、同 watcher 的窗口恢复、header 当前摘要与事件时历史卡；中英文真实 Host、Goal-only 分页、消息窗口失败恢复和独立原生 1440／900×600 已验证。[最新交付与验收边界](desktop-goal-lifecycle.md)。
- 本轮稳定工作树全量 Bun 测试 **1648/1648、0 fail、12353 assertions**；该稳定版本的根严格 lint/typecheck、生产构建通过。首轮曾有三项失败，已通过具体断言修正／稳定版本重跑闭环，不把首轮描述为绿。日志：`artifacts/desktop-followup-tests.log`。
- 后续复查曾因新的并行未提交变更短暂失败：通知组件增加必填 copy 字段，fixture 尚缺 `all/none/saving/saveFailed/saveUnavailable`。原任务随后补齐 fixture，根 `typecheck` 重跑恢复通过。本轮 Files／设置用量／侧栏没有修改这些并行文件，全部保留；全量1648结果对应上述稳定版本，不自动覆盖随后其他任务仍在变化的通知功能。
- 新 Files 真 Host E2E 2/2，已有 Files 回归 8/8；设置用量与 provider landing 4/4；增强双 Client 侧栏 2/2；最新模型／permission／Plan／Goal 续作回归 8/8，结果位于 `artifacts/desktop-followups/entry-results`，复核了新截图。
- 本轮原生 Files（1440、900×600）、设置原位空用量与侧栏草稿保护（900×600）均用独立临时 profile 验证通过，使用现有 debug launcher 加本轮新构建 Host/Web resources。上轮原生 Plan 定向通过仍是独立旧证据。没有重新编译桌面 exe 的声明；上轮 exe 被用户进程占用、通用 smoke 在导航材质检查处失败，仍不能把这两项标绿。本轮构建仍有既有大 bundle warning。

## 迁移所依据的表达与交互准则

- 一级导航只承担项目、会话和稳定全局分类；上下文工具留在会话／文件／设置的当前区域，不因为点击次级按钮抢走主导航。
- 次级控制靠近它作用的对象。文件导航开关在 Files 工具栏，名单刷新靠近项目入口，用量时间窗口在用量页；异步结果回到原对象附近。
- 摘要、阅读内容、详细控制有明确层次。宽屏利用并排空间，窄容器切换视图；内容按 flex 流自然换行和滚动，不把截图坐标或固定内容高度当布局。
- 列表选择、模式切换、返回路径和可折叠状态必须可感知。当前文件有实际选中背景，打开导航聚焦筛选，切文件不隐式保存／丢弃内容。
- 不复制没有事实支持的指标或能力。Global usage 说明作用域，缺费用与截断明确提示；Commands 仍称 Commands，不冒充 Search chats；扫描上限不能宣称全量增量同步。

## 仍需实施与复核

| 单元                                 | 参考视觉/源码                                                                            | 当前差距和验收                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 完整 Goal 时间线                     | 原 `MessageList` GoalEventCard 与原 `ActiveSession` 整页已实际挂载；顶部条 24 组证据     | 本单元已完成 header 摘要、事件时卡、有锚点逆向读取、消息／Goal 分页与恢复；7 项真实 Host 浏览器测试及原生子集通过。窄屏保留控制是有意适配，不复制原 mobile 隐藏。继续纳入最终逐入口矩阵，不冒充全部桌面已完成。[交付](desktop-goal-lifecycle.md) |
| Files 阅读导航器                     | cc `docs/images/app/en/workspace-diff.webp`；`WorkspacePanel.tsx` 的 Show/Hide Navigator | 本轮已完成并验证；继续在最终逐入口矩阵中复核整体表达，不把此局部验收替代全部桌面体验。                                                                                                                                                           |
| 侧栏会话刷新                         | cc `session-main.webp` 的 Search 旁 Refresh；`Sidebar.tsx` 的 focus/visibility 刷新      | 本轮有界刷新已完成。超出1000扫描／缓存的变化仍缺 Host 名单增量事件与可恢复变更游标，明确反馈容量，不声称全局可靠增量。                                                                                                                           |
| 设置原位用量                         | cc `settings-usage.webp` 的用量分类                                                      | 本轮已完成真实只读分类，不跳 Status。未复制连续天数、头像、最长任务等没有公共事实的参考统计。                                                                                                                                                    |
| 模型、permission、Goal/Plan 入门路径 | cc `model-picker.webp`、`permission-modes.webp`，现有真实 Host 对比产物                  | 上轮双语真 Host 8/8与本轮完整 Goal 历史／顶部摘要均有证据；全部入口矩阵仍未完成，不能因局部通过宣布达到完整预期。                                                                                                                                |
| 原生通用视觉门禁                     | 当前 desktop-smoke 的选中导航标记断言                                                    | 本轮看到 shadow=none、width=null。须查相关视觉改动历史与实际当前渲染，再定位产品或测试问题；不能删除断言假装通过                                                                                                                                 |

设置/导航审查还发现语言选择、插件安装管理和批量归档等候选，但应按真实现有契约独立闭环，不扩大按钮名称。`session.list.title` 是精确标题筛选，不能当全局全文搜索。

Browser、真实终端、定时任务、市场/MCP/模板、图片材料预览及历史 rewind 不是换入口即可迁移的功能：需要相应产品/安全/持久化契约。当前 `browser.*` 是自动化，不是原生内嵌 Browser；内部 wakeup 不是 schedule CRUD；Fork 不是回滚磁盘。不得用占位 UI 声称等价。

完整 Goal 生命周期本单元已经闭环。下一步回到全桌面逐入口矩阵及语言／插件／归档候选，按真实契约选择独立子功能，再复核通用原生导航视觉门禁。每个单元继续按参考流式布局、宿主文案/数据、就近目标反馈和独立验证／提交交付；不能只验收这些局部改进而把总 Goal 标 complete。

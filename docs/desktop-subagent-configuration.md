# Desktop 子 agent 配置与折叠导航

## 使用入口

1. 打开主会话，通过会话工具进入「子 agent」。
2. 展开「子 Agent 自动选型与模型权重」策略编辑区，添加简单、中等或复杂任务的候选模型、思考等级和优先权重，保存策略。
3. 点击「创建子 agent」。默认继承主 agent 的模型、思考等级、审批模式和沙箱配置；也可手动覆盖，或选择难度档位，使用已保存的候选策略。
4. 已派发的子 agent 详情提供「配置子 agent」入口，打开该子会话的 Session 设置。修改保存后只影响该子 agent 的后续 Run，不修改父会话，也不改变正在执行的 Run。
5. 侧栏固定使用三级层级：项目是一级栏目，父 session 是二级栏目，subagent session 是三级栏目。工程视图直接按「项目 > 父 session > subagent session」展开；按时间视图的日期仅是排序标题，日期下仍先按项目聚合，再显示父 session 和 subagent。父 session 右侧显示直接子 agent 数量，使用左侧箭头展开或收起；子会话保留原有打开、重命名、归档和批量管理入口。

文案以当前 Host 的中英文内容契约为准。可用模型和思考等级来自 Host 模型目录，不内嵌产品型号或演示候选列表。

## 配置与自动派发规则

- 「继承」是派发时的独立配置快照，不是派发后继续跟随父会话设置。可信主 Run 派发时，优先继承该 Run 已确认的执行配置，避免父会话设置在执行中变化造成权限漂移。
- 明确指定的思考等级必须被目标模型支持；错误配置在创建子会话前被拒绝，不会静默改为 `none`。
- 手动切换模型但未指定思考等级时，优先保留父会话等级；若目标模型不支持该等级，采用目标模型声明的有效默认等级。显式等级不执行此回退。
- 候选策略按 `simple`、`medium`、`complex` 分档，每行包含模型、思考等级和整数权重（1–1000）。最多 32 行；同一难度档位不能重复同一个模型。
- 主 agent 的工具调用声明任务难度，Host 在对应档位中选取最高权重候选；同权重按模型 ID 稳定排序。未声明难度默认为中等。此权重表示优先级，不是随机抽样比例、模型参数规模或价格。
- 档位没有候选时继承父配置；最高权重候选失效或等级不兼容时拒绝派发，不偷偷改用其他候选。实际选择、难度、权重和来源层记录在不可变的 `dispatchConfiguration` 中。
- 手动派发可覆盖审批模式和沙箱 profile。模型自动调用的 Agent 工具没有权限放宽参数，仍继承主 Run 已批准的权限。
- 子 agent 的 `configuration` 是其当前独立设置；`dispatchConfiguration` 保留原始派发证据。子会话后续改动不会覆盖原始快照，重复确认同一次创建也不会重置后续设置。
- 策略保存使用分层 Settings、revision 比较和幂等确认。冲突保留当前草稿；未确认结果锁定编辑并以原请求和原 key 重试。策略草稿及该未确认请求驻留当前 Runtime，重启后重新读取 Host 已确认策略，不承诺跨重启恢复未保存的策略草稿。Agent 创建本身复用既有持久恢复日志。

## 导航事实与排序

子 agent 身份来自持久的 `agent.created` 父链接事实；普通 `session.forked` 分支仍是独立会话，不用标题或任意 `parentId` 猜测 Agent 身份。

侧栏根会话在数据库分页前排除实际子 agent，避免大量较新子会话挤掉较旧的父会话。子列表通过公开命令按需查询，不读取全量会话图或插件私有历史。

展开后的顺序为：最新已持久化 Assistant 消息时间降序、会话创建时间降序、稳定 Session ID 顺序。没有回复的子 agent 放在有回复的子 agent 后面。重命名不改变该响应时间；流式未提交片段不逐片重排。Run 状态的持久失效提示会刷新已展开分组，真实 Host 连续回复的浏览器测试验证了自动重排。

打开子会话时，查询并验证父链，自动展开路径。即使父会话不在当前根分页、当前子会话不在第一批 50 个子行，仍通过精确的根事实和 `includeSessionId` 显示选中的路径。跨工作树父链可查询；归档、丢失父会话、循环或无效链接不伪造父节点。

目录事实保留在同一个 canonical Session cache；树 ViewModel 只保存 ID、排序时间、执行摘要和分页状态。树最多保留 32 个分组、256 个子行，每组最多加载 128 行，同时最多 4 个子列表读取。收起会取消读取、释放后代分组行和保留额度；断连、重连、超时和错误有就近反馈。深层结构保留真实语义嵌套，但从第 4 层开始停止增加视觉缩进，避免窄侧栏被缩进占满。目录父链查询上限为 32 个 Session。

## 实现入口

- [Agent 公共契约](../packages/contracts/src/commands/agents.ts)、[目录公共契约](../packages/contracts/src/state/sidebar-directory.ts)
- [Host 配置快照与候选策略](../packages/kernel/src/agent-session-configuration.ts)
- [Agent 执行实现](../plugins/agent/src/index.ts)、[主 Run 的派发工具](../plugins/agent/src/agent-tool.ts)
- [策略编辑 ViewModel](../packages/app-runtime/src/agent-policy-editor.ts)、[策略编辑组件](../packages/app-react/src/agent-policy-editor.tsx)
- [Agent 目录查询](../packages/storage/src/session-agent-directory.ts)、[树 ViewModel](../packages/app-runtime/src/session-agent-tree.ts)
- [嵌套会话组件](../packages/app-react/src/session-agent-branch.tsx)、[宿主中英文文案](../apps/web/src/session-agent-tree-copy.ts)

## 验证与交付边界

功能实现分项提交：`2c622535`（继承与独立设置）、`67ee889d`（难度权重策略）、`6ff23cee`（配置 UI）、`830cb492`（根与子目录查询）、`63d2ae67`（树状态和取消）、`56fab49e`（嵌套导航与响应排序）、本次提交（项目 > 父 session > subagent 的显式层级与时间视图项目聚合）。

实际通过的验证：

- 14 个相关 Bun 测试文件，75 项测试、615 条断言通过。包括权限继承、显式覆盖、策略容量/冲突/未确认重试、子设置与父设置隔离、根分页、响应排序、跨工作树父链、循环、32 层边界、128/129 子行边界、256 行/32 分组容量、收起取消、重连恢复和深层组件渲染。
- 11 项真实临时 Host + 浏览器回归通过，覆盖中英文的子会话进入/返回、失败重试、模型选择、触屏模型浮层、派发策略、派发后独立保存、工程/时间视图的折叠树和真实新回复自动重排。最后一次 UI 构建后，树形导航中英文两项再次通过。
- `bun run build` 通过。构建仍提示既有大 chunk 警告。
- 本功能 TypeScript/TSX 文件的严格 lint，以及内容契约、图标尺度和新树样式的 flow-layout guards 通过。
- `bun run typecheck` 实际执行但未通过：CLI 插件类型、旧 store/UI-plugin API、Storage `updateSession` 的既有重复签名和旧测试类型等基线错误仍存在。以 `artifacts/subagent-tree-backend-typecheck.log` 为 UI 前基线，对最终诊断去除行号后比较，没有新增诊断。不可表述为全仓类型门禁通过。
- 本文档格式与相对文件链接检查通过。全仓 `check:docs` 仍因 142 处既有跨仓链接或缺失的旧验收产物链接未通过，不把单文档验证表述为全仓文档门禁通过。

验证命令：

```powershell
bun test ./tests/session-agent-branch.test.tsx ./tests/session-agent-tree-runtime.test.ts ./tests/agent-configuration.test.ts ./tests/agent-parent-tool.test.ts ./tests/agent-workspace-runtime.test.ts ./tests/agent-workspace-react.test.tsx ./tests/agent-policy-editor.test.tsx ./tests/session-agent-directory.test.ts ./tests/sidebar-directory.test.ts ./tests/session-settings-model-sync.test.ts ./tests/app-react.test.tsx ./tests/workspace-activity-runtime.test.ts ./tests/runtime-sidebar-activity.test.ts ./tests/session-roster-runtime.test.ts --timeout 20000
bun run build
bunx playwright test e2e/session-agent-tree.spec.ts e2e/agent-policy-configuration.spec.ts e2e/agent-model-selection.spec.ts e2e/agent-child-return.spec.ts
bun run typecheck
```

本次没有调用付费 Provider、修改用户日常会话数据、安装或重启日常 hbar，也没有重新生成 Windows 安装包。已有 reasoning-effort 修复安装包不包含本次新功能。最新 Web 成品位于 `dist/web`；本地测试记录和中文侧栏截图位于已忽略的 `artifacts/subagent-configuration*` 目录。

技能影响：配置与树组件采用宿主内容契约、Lumen 语义图标等级、ReactBits Application UI 的分层导航与表单语义，以及 flow-based 布局；触屏工具菜单和模型选择复用共享顶层浮层。树导航参考为用户截图和 app-sidebar-5 索引；公开预览不可读取，未声称完成该预览的逐像素比对。

提交时保留用户原有的 `apps/web/src/App.tsx` 暂存修改和 `apps/web/src/ChatSessionChrome.tsx` 未暂存修改，没有夹带或还原。

# 工具执行反馈

工具行必须区分等待、实际执行和终态。普通工具没有真实工作量分母时，只显示活动动画和计时，不用时间推算百分比。

## Host 契约

- `tool.execution` 是 Host 生成的耐久事件。`startedAt` 来自执行入口的日志时间，`elapsedMs` 使用单调时钟，不包含审批等待；结果中的 `execution` 保存最终耗时。
- 工具可以通过 SDK 的 `await context.reportProgress?.({ completed, total })` 上报真实工作量。总量须大于零且固定，完成量不得倒退或超出总量。每个调用最多一个在途日志写入，250ms 内合并突发上报，最终结果保留最新值；结束后的回调失效。
- `tool.sequence_progress` 来自通过范围和容量校验的序列，不直接相信模型输入的 calls 数组。批次最多八项；`settled` 包括失败、拒绝和取消，不等于成功。未派发项为 `skipped`，异常退出前没有确定结果的在途项为 `unknown`。
- 快照携带最多 1000 条按 Run／调用／事件种类去重的最新工具事件，用于重连。最终时间和批次计数也保存在结果中，因此旧页与会话分叉不依赖最近事件窗口。无时间证据的旧记录不补造耗时。

## 已验证后端

新增契约、限流、单调计时和真实 Host 集成测试 4 项通过；原有工具结果、Workflow 序列、Storage 回归 64 项通过。精确作用域的类型感知 ESLint 通过。全仓类型检查仍有 CLI 插件描述、Browser/Git 测试桩、旧 stores 导入及 Storage 既有 updateSession 重载等问题，未标记全仓通过。

上述后端提交时，UI 接入与浏览器验收仍待实施；不涉及安装包或原生验收。

补充回归：突发上报中的最后一项必须在 250ms 合并窗口后自动写出，即使工具随后长时间没有新的上报；关闭时清除该单一定时器并等待在途写入。新增尾随发布测试后，后端当前 5 项／27 个断言通过。执行事件身份在入口捕获，不能被可变插件上下文改变。

## 界面与恢复

- 普通工具行显示最终耗时，执行中显示“已执行”计时。计时只消费 Host 事实；没有执行记录的待执行调用没有运行动画。真实工作量可用时显示百分比，否则使用活动蓝点动画。
- `workflow_execute` 等 SDK 批次在折叠详情外显示已结束／进行中／待执行／跳过／结果未知计数，以及已处理比例。相邻独立工具调用的汇总行也显示数量进度；终态比例不把未执行项算成成功。
- 结果状态与时间上下排列并右对齐，名称／文件在左侧既有可滚动文本轨道中；计数区采用 flex 自然换行，320 宽度不产生整页横向溢出。
- 一次共享视觉时钟供全部活动计时使用，500ms 更新；窗口隐藏或全部订阅结束时停止定时器。断线后不无限增长，显示“最后记录”。Host/client 时钟锚点防止远端时钟偏差被误算为执行耗时。
- 完成结果、分页历史、刷新与分叉消费持久化元数据；没有证据的历史记录不补造时间。活动思考仍保留原有提示，不因工具专用投影而被关闭。
- 文案由 Web 宿主的类型化中英文适配器提供，组件不嵌入业务可见文案。视觉语义对应 [Agent Activity 1](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1)、[Agent Activity 3](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-3) 与 [Tool Calls 2](https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2)，并保持项目 Lumen 组件和主题契约。

## 验证与限制（2026-10-06）

- 后端新测试 5 项通过；既有 outcome／sequence／storage 回归 64 项通过。
- 界面既有消息与时间线测试 33 项、新投影／本地化测试 6 项、新增 Runtime 快照／增量测试 1 项通过。作用域严格类型检查与类型感知 ESLint 通过，flow／content／icon guards 通过。
- 受控生产组件浏览器 4 项通过：中文／英文 × 1440／320（中文深色、英文浅色），检查实时增长、终态冻结、断线冻结、真实比例、待执行数量、跳过、无进度动画与 reduced-motion 静态提示，并人工检查截图。
- 真实本地 Host 浏览器 2 项通过：内置文件读取刷新后保留耗时；新执行进度 → 三条顺序调用计数 → 刷新恢复最终耗时／计数／原输出复制。使用独立临时数据和本地 fixture，无付费模型；临时 Host 正常退出、目录清理已验证。
- 第一轮受控浏览器 4 项因测试读取已经折叠的列表而超时，补上展开操作后全通过；未把该失败归因为软件计时故障。
- 中途重建因共享工作区另一组未提交的 Runtime 改动新增 `@hbar/contracts/commands/surfaces` 导入但没有包导出而失败。该导出由共享工作区的后续改动补齐后，当前源码生产 Web 构建、全部 40 项界面测试、作用域严格类型检查和真实 Host 两项浏览器验收均重新通过；没有覆盖其他任务改动。全仓类型检查仍有既有问题，不能称全仓门禁全部通过。构建保留既有大 chunk 提示，不影响本次构建成功。
- 本次没有生成 EXE、安装包或执行原生桌面验收。

最终全仓 `typecheck` 返回非零，记录 96 条错误（CLI 插件描述、旧 stores 导入、旧生命周期测试文案类型、Storage updateSession 重载等）；新增计时／进度模块与本轮新浏览器用例未出现在该错误清单中。本轮作用域类型检查通过不能替代全仓通过。

最终截图与测试产物位于忽略目录 `artifacts/ui-repair/tool-feedback-e2e-final-theme/`、`artifacts/ui-repair/tool-feedback-chain-final/`；构建记录为 `artifacts/ui-repair/tool-feedback-build-final.log`，全仓类型记录为 `artifacts/ui-repair/tool-feedback-typecheck-full.log`。中途失败证据另存，不覆盖。

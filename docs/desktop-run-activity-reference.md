# 对话尾部的运行摘要

参照 cc-haha 的 `docs/images/app/zh-CN/session-main.webp`：当前运行是对话尾部的短状态行，过程和任务按需展开，不让完成历史反复占据正文。hbar 保留实际状态、耗时、停止、失败重试和 `update_plan` 进度，将模型/时间详情与旧运行收进就近披露。

时间线最多保留 80 次运行；界面初始呈现当前运行以及收起的详情，展开后每页 20 条其他运行，通过明确按钮继续加载。重复 ID 去重，0/1/20/21/22/80/81 输入边界有测试。当前失败原因和恢复动作不藏入历史；取消中/未知取消禁用重复按钮。待审批和问答不放进此披露，仍属于各自工具交互。

排查发现原先直接取 `activeRuns[0]` 会在按创建时间倒序的列表中取到更晚入队的任务。现在摘要和 composer Stop 共用明确选择：优先 running/waiting_approval，其次 queued；命令仍绑定捕获的 operationId。

验收：14 个组件/集成渲染测试、105 次断言；双语言真实生产 Host E2E 共 2 passed（14.4s）。每条先完成 22 次运行，验证默认折叠、键盘展开、20→21 明细增长、失败重试确实新增 Run，以及执行中+排队同时存在时取消原执行 Run。1440/900/390/320 截图已人工查看，当前状态在视口内、内容无水平溢出。root typecheck、scoped strict lint、production build、content/icon/flow guards 通过。

截图目录：`artifacts/desktop-experience/browser-results/session-run-activity-*`。不把此验证等同于原生桌面综合 smoke。

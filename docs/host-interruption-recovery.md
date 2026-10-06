# Host 运行超时与中断恢复

## 活动任务的超时

Host 默认在同一 Run 连续 **20 分钟没有进展**时中止任务，记录
`RUN_TIMEOUT` / `timeout`。这不是整个任务的累计运行上限。模型正文或
thinking 新增内容、已提交的消息、已结算的工具结果（包括序列中的子工具）
以及已受理的下一轮模型请求都会更新活动时间。

重复推送相同文本、空流更新、前端轮询和连接心跳不更新活动时间。等待模型、
工具或用户响应超过无进展期限仍会超时；工具自己的执行超时、64-step 上限、
Goal/Session token budget 和用户取消仍由原有边界管理。

嵌入式调用可通过 `KernelOptions.runIdleTimeoutMs` 提供正整数毫秒值，最大为
`2_147_483_647`。不传时为 `1_200_000`。非法值在打开存储或启动任务前失败。
每个 Run 只有一个活动计时器；结束、取消和 Host 关闭会释放计时器。

真正的无进展超时继续保留为不可自动重试的错误。检查已提交的工具结果后再显式
续跑，不自动重复未知结果的写入。

## 模型连接与流响应

Pi 适配边界将 SDK 的 `Connection error.` 标记为
`PROVIDER_CONNECTION_FAILED`，将残缺 JSON 或缺失 Responses 终态事件标记为
`PROVIDER_STREAM_INTERRUPTED`。这些明确属于模型传输的错误沿原有 Goal 续跑
流程退避重试，默认最多两次重试，持续失败则停止为 `retry_exhausted`。

恢复请求使用已提交的会话与工具结果。不执行失败流里的部分工具调用，也不
重新执行已结算的调用。Host hook、存储和工具异常即使含有相似文字，也不会
因此被赋予这些传输错误码。用户取消、真正的空闲超时及结果未知的写入保留
原来的停止语义。普通对话没有活动 Goal 时仍返回明确失败，不创建隐式目标。

## 桌面源码重载

`desktop:dev` 的 Bun `--watch` 会在已导入的后端源码变化时重启 Host。
仍在执行的任务会在启动恢复中记录为 `HOST_INTERRUPTED`，不能以连接恢复代替
任务成功。后端修改应在独立工作树中验证，集成到运行中的源码目录前确认任务已
结束。详情见 [桌面源码开发](desktop-live-development.md)。

## 验证

`tests/run-idle-timeout.test.ts` 通过确定性时钟验证超过原 20 分钟时长、真正空闲
到期、单计时器与释放，并使用真实 Kernel / Storage 验证正文、thinking 和工具
结算更新期限，以及相同流更新不能保活。`tests/goal-replacement.test.ts` 覆盖没有
`replacement` 元数据的 Goal 与缺失 Run 上下文、重启恢复和目标替换。

`tests/provider-stream-recovery.test.ts` 通过真实 Pi / 本地 HTTP Responses 流
验证残缺 JSON、缺失终态、连接失败、重试次数上限和部分工具不执行，并核对
已保存的写入在下一次请求中保留且只执行一次。

这些测试使用临时数据与本地 fixture，不依赖真实模型或用户会话。

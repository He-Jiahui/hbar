# 会话虚拟列表：可取消的目标定位

2026-09-26。为 Desktop 的会话内查找增加共享的单次 message 定位契约；此组件不包含查找、Host 状态或正文索引。原会话视口来自共享提交 `4f4f0214d9`；本次保留超过 40 行的测量式虚拟化、四行 overscan、最多 128 个会话阅读位置和宿主提供的文案/消息。

## 公开边界

`LumenConversation` 新增三个可选 props，未传时保持常规会话行为：

- `scrollTarget`：具名 `requestId`、`scrollKey`、真实 `messageId`，可选 `start/center/end` 对齐。request 是一次明确导航意图；内容更新与对象重建复用同一标识，不触发重复跳转。
- `onScrollTargetResult`：成功返回冻结的目标身份、当前 viewport 和已挂载、可测量的原 message row；失败返回 `unavailable`。取消不发布旧成功或替代相邻行。
- `followLatest`：默认 true；false 时即使几何位置在最底部，增长的正文仍保留阅读锚点。

目标必须属于当前 scrollKey。查找结果序号、工具/生命周期事件序号都不是消息下标。共享层只定位行，宿主在返回的行内核对正文并高亮具体文字。文本范围改变、查询计数与历史范围仍由宿主负责。

## 有界调度与兼容修正

新定位不调用安装版 TanStack 的 `scrollToIndex` 私有多秒对齐循环，因为它没有对应的公共取消口。改用公共 `getOffsetForIndex` 查询与本组件拥有的滚动写入，最多 250ms、一个待处理请求。实际行几何稳定三个帧间检查后才返回 ready。新来源、新请求、null、卸载或用户 wheel/touch/pointer/滚动键会释放并取消旧任务；缺失行和超时只报告一次不可用。

真实浏览器曾复现 `measureElement` 在 React commit 阶段触发 `flushSync` 警告，以及 ResizeObserver 循环。无新 props 的旧行为对照也能触发后者。通过安装版已有的 `useFlushSync: false` 与 `useAnimationFrameWithResizeObserver: true` 避免同步重入；未改变依赖版本或使用私有字段。

延迟测量还暴露出旧底部定位只写一次 scrollHeight 的边界：后续行测量会留下未滚到末尾的距离。读取锚点和跟随末尾现在共用有界 250ms 校正窗口；observer 仅排动画帧、不在回调内同步修改布局。用户输入立即取消，显式“查看最新消息”也取消旧锚点校正。关闭自动跟随的阅读位置不会被重新解释成“追随末尾”。

## 验证与限制

以下为已安装工具的补充验证，不能冒充成功运行了共享仓库的正式 pnpm 门禁：

- 新 viewport 单元测试 17 项；连同 composer 与 gallery 共 50/50 通过。覆盖延迟测量、重复意图、错源、A→B→A、删除/缺失目标、有界超时、释放、用户取消、默认跟随末尾和显式 Latest。
- 根 SSR 兼容测试 5/5、23 assertions，包含 0/1/40/41 行和重复 ID。
- 共享包严格 TypeScript、五个变更文件的共享及根 ESLint、Prettier、diff 检查通过。
- 真实 Edge StrictMode 组件 fixture 在 1440×900、900×600、320×900 验证 200→220 条消息，初始仅挂载 13/9/9 行；离屏 message-150 真实挂载，8 次流式变化不重新定位，prepend 保持锚点，A→B→A 仅新目标发布，用户滚轮后不延迟拉回。
- 另一路完全不传新 props，验证首次末尾、流式增长、prepend、切到新来源及返回旧阅读锚点。最终锚点偏移与原值一致。两路浏览器的 page errors、console errors 均为空；定位探针也单独捕获并断言 window.error 为空。

详细事实与中间红证据保留在 [组件报告](../artifacts/conversation-viewport/report.md)、[定位事实](../artifacts/conversation-viewport/observations.json) 和 [原行为回归](../artifacts/conversation-viewport/legacy-final-facts.json)。这些是组件证据，不是完整 Host/Tauri 截图；实际产品接线另见[会话内查找](desktop-session-find.md)。

共享工程要求 pnpm 12.3.4，当前安装为 11.19.0，正式 typecheck/unit/proptypes/docs 命令在 engine 校验被阻断；未升级工具链，未生成或声称 API 文档检查成功。250ms 是失败可报告的尝试上限，不保证任意设备与任意复杂 row 都能在此时间内挂载。

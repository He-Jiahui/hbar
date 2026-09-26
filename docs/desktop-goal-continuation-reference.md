# Goal 续作时间线边界

参考 `cc-haha/desktop/src/components/chat/MessageList.tsx` 的自动续作分隔。直接渲染原 `MessageList` 的隔离截图：`artifacts/goal-continuation/reference-en-US-1440.png`、`reference-zh-CN-320.png`。这不是完整应用/真实服务证据。

hbar 仅依据持久 `Run.input.source === 'goal'` 生成一 Run 一条分隔，位于该 Run 的消息或流前。空用户信封不再被画成空用户气泡，但其序号可定位续作边界。无输出、失败、取消或中断的续作仍有真实 Run 状态，不冒充正在运行。

分隔是只读 `separator`，左右细线、语义 `sm` Target 图标与宿主中英文文案，不提供复制、Fork 或额外运行按钮。普通用户输入同样文字不会变成续作。清除当前 Goal 不会抹去历史边界。没有从当前 `goal.get` 推测过去的目标、原因、预算或续作次数。

`projectSessionTimelineSequence` 为纯投影，沿用既有有界消息/Run/流；不维护第二份历史。消息分页范围之外的历史与完整 Goal 设置/完成卡仍是后续独立工作，不是本次分隔已经实现的能力。

验证：`tests/goal-continuation-presentation.test.tsx` 覆盖消息/流/无输出锚点、重复与跨会话身份、空态、实际状态和长文案；`e2e/goal-continuation.spec.ts` 用临时真实 Host 验证自动续作、空信封、清 Goal、刷新、切会话及中英文 1440/900/390/320。真实 Host 图保存在 `artifacts/goal-continuation/host-<locale>-<width>.png`，独立 Playwright 输出为 `artifacts/goal-continuation/results`。

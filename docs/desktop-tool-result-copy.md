# 工具输出就近复制

本单元迁移 cc-haha 的“输出标题旁 Copy → Copied”入口，不把复制整个回复、重试工具或发送消息混为同一动作。参考依据是已提交的[原组件对照审计](desktop-next-conversation-entry-audit.md)：实际挂载 cc `ToolCallBlock`／`CopyButton`，中英文 1440／320 和真实剪贴板均已观察。这里记录实现与本单元验证；审计中的旧 hbar 截图仍是历史差距，不是当前画面。

## 入口与范围

- 展开工具详情后，“输出”标题右侧是独立的“复制输出”。标题、按钮与反馈保持普通 flex 流；窄屏或长译文可换行，图标使用共享 `sm` 等级。
- 复制来源只有已经加载的原 `tool_result.text`。输入参数、thinking、其他调用和助手正文不会混入。底部“复制回复”的 authored-text 策略保持不变。
- 既有消息投影继续负责 Session／Run／callId／tool name 配对；本单元不创建第二份消息集合。跨消息结果、分页 orphan 与带决定的工具行均通过原 `ToolRow` 渲染。
- 空串或界内纯空白没有假复制入口；错误工具的真实输出同样可复制。外部归档后的保留历史仍允许本地复制，不套新执行准备门禁，也不改变草稿、模型、Goal、Plan、Run 或文件。
- 只有剪贴板写入确认后才显示“已复制”，约 1.5 秒恢复。等待时禁用重复点击且使用 Lumen 正式 loading 接口表达 busy；失败／不可用在同处显示本地化说明并允许人工重试。

宿主文案由 `apps/web/src/shell-copy.ts` 的 required typed `toolResultCopy` 提供；组件包不依赖 Web locale 或共享业务 store。局部按钮状态不是 Host 执行事实。

## 原文、容量与异步归属

显示详情原有的 12,000 字符预览与复制来源相互独立。未展开长内容仍复制完整**已加载**原文，不含省略号，不伪称已获取未加载的历史。

本地单次复制预算为 **1,000,000 个 UTF-16 code units**，不是 Host 消息载荷上限、字节数或用户感知字符数。通过字符串 length 先判断，超界显示说明、禁用按钮、零剪贴板写入；不静默截断，也不为判断预算创建 UTF-8 副本。超界纯空白同样先受容量约束。原文的首尾空白、CRLF 和错误文本不变。

helper 在等待前捕获 `{sessionId, messageId, callId, toolName, text}`，只返回捕获身份与枚举结果，不泄漏异常或缓存正文。组件以四个身份字段重建局部 action；同目标 source text 变化在 layout commit 时失效旧 generation，包含 A → B → A。折叠、卸载和消息切换清理旧计时器，晚回执不能把新目标标为已复制。

**边界：已提交给操作系统的剪贴板写入不可撤销。** 本单元保证反馈归属，不宣称取消了旧平台 I/O，也不创建全局剪贴板互斥锁。不同输出上的人工复制仍是各自独立动作。

## 历史与验证记录

历史核对：`c49412b` 建立正文复制和工具展示，`092e408` 接入工具旁决定，`9c6336f`／`ff5607c` 增加 Fork seam。没有证据表明最近某次提交删除了工具输出复制；这是已有参考迁移缺口。基线为 `c6c2e52`，保留其他任务未提交文件。

新入口的生产基线红测已保留：独立旧 bundle `index-DlFZXpLl.js` 的实际临时 Host 会话能展开正确输出，但输出区复制按钮数量为 0，期望为 1。没有回退当前工作树。证据在 [旧生产画面](../artifacts/tool-result-copy/evidence/baseline/output-local-en-US-1440.png) 和 `artifacts/tool-result-copy/baseline-output-results`；最初 Bun 可执行文件探测错误是测试启动问题，不计为产品红测。

已完成的定向验证：

- helper／原回复复制／消息呈现：`bun test tests/tool-result-copy.test.ts tests/message-copy.test.ts tests/session-message.test.tsx --timeout 20000`，**37 pass / 0 fail / 205 assertions**。最初新增 SSR 断言误认 Lumen 内部 CSS 类名，已移除这条与行为无关的依赖并重跑；不把首次失败记成通过。
- 变更源码 strict scoped ESLint、Prettier，以及 content／icon／flow 三项 guard 通过。独立审查发现仅传 `aria-busy` 会被 LumenButton 的内部 loading 值覆盖；已改用公开 loading prop，最终 DOM 验证继续覆盖。
- 新 Web 生产构建 **3050 modules / 902ms**，`index-BUjyaW7Q.js`／`index-B9uV8cI_.css`；新 Host/Web 资源打包通过。保留既有大 bundle 提示，不声称重编了桌面 exe。
- 原消息阅读回归 `e2e/session-message-appearance.spec.ts` **1/1（12.7 秒）**，实际临时 Host 的 local-fixture Run，覆盖 light／dark × 1440／900／390／320，键盘展开、真实正文复制、主题切换、窄屏与总页溢出检查。[中文浅色桌面](../artifacts/tool-result-copy/message-regression-results/session-message-appearance-ac512-es-retain-keyboard-feedback/message-expanded-light-1440.png)、[中文深色 320](../artifacts/tool-result-copy/message-regression-results/session-message-appearance-ac512-es-retain-keyboard-feedback/message-expanded-dark-320.png)。这里不是新 Copy 的全部验收。

新入口另分三层验证，避免把受控注入当作真实 Host 或平台事实：

| 层级                  | 观察范围与结果                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实际 Host 生产 UI     | 测试专用持久 transcript，不执行所显示的工具；中英1440/320，5工具含同 callId 不同 name、跨 Run、跨 Session、错误与空结果。20,189 单元原输出仍是12k预览，真实系统 clipboard 得到完整内容；正文复制排除 tool/thinking；实际外部归档后仍可复制。  |
| 受控浏览器组件        | 注入延迟／拒绝剪贴板以验证 pending、重复事件、失败重试、不可用、source text 与目标的 A/B/A、卸载、定时复位、1m及超界、长中英文案1440/320。此层没有 Host，不把注入结果当真实系统剪贴板。                                                       |
| 真实 Tauri / WebView2 | 中英各一个真正 `local-fixture update_plan` Run，900×600和1440×960四个正常场景；中文归档后两尺寸继续可复制。真实权限授权后直接读写 navigator.clipboard，未替换对象。未发送稿逐字保留，复制前后 messages/Runs 相同，页面无横溢、pageerror为空。 |

浏览器维护入口是 `e2e/tool-result-copy.spec.ts` 与 `e2e/tool-result-copy-lifecycle.spec.ts`，数据／Host／组件夹具也在受维护 tests/e2e 路径，fresh checkout 不依赖 ignored 源文件。生成的页面、构建、截图和观察 JSON 才放 artifacts。最后 **4/4通过，30.6秒**（真实Host2/2、受控组件2/2），结果目录为 `artifacts/tool-result-copy/final-complete-results`；所有页面在导航前安装错误监听，errors为空。先前两处测试定位错误分别是寻找尚未展开的section、假设正文Copy成功后还保留原label；修正定位后重跑，不将它们当产品失败。最终五个维护测试路径的严格lint、根typecheck与格式检查再次通过。

视觉证据：[中文320输出复制](../artifacts/tool-result-copy/evidence/final/output-read_file-zh-CN-320.png)、[英文1440长结果](../artifacts/tool-result-copy/evidence/final/output-execute_command-en-US-1440.png)、[中文320归档整页](../artifacts/tool-result-copy/evidence/final/archived-page-zh-CN-320.png)、[中文320长按钮](../artifacts/tool-result-copy/evidence/lifecycle/long-idle-zh-CN-320.png)、[英文320失败与重试](../artifacts/tool-result-copy/evidence/lifecycle/long-failure-en-US-320.png)、[中文320超限说明](../artifacts/tool-result-copy/evidence/lifecycle/capacity-zh-CN-320.png)。主线已人工复核这些代表画面及原生画面。

原生通过证据：[完整验证](../artifacts/tool-result-copy/native/hbar-native-session-tool-copy-WNce1a/verification.json)、[清理结果](../artifacts/tool-result-copy/native/hbar-native-session-tool-copy-WNce1a/cleanup.json)、[中文900复制成功](../artifacts/tool-result-copy/native/hbar-native-session-tool-copy-WNce1a/output-copy-zh-CN-900.png)、[中文900归档后复制](../artifacts/tool-result-copy/native/hbar-native-session-tool-copy-WNce1a/archived-output-copy-zh-CN-900.png)、[英文1440](../artifacts/tool-result-copy/native/hbar-native-session-tool-copy-WNce1a/output-copy-en-US-1440.png)。这是真实已存在的 debug launcher 加新 Host/Web 资源，不是 exe 重编或通用 desktop smoke 全绿。fixture 助手合法回复 `### Tool completed\n\nPlan updated` 引用了结果；正文复制应保留这一原文，而不是删除相同字串。

原生前两轮因 runner 误找单工具活动摘要、误找不存在的 `role=status` 而失败，已修正定位后第三轮通过；失败与清理 JSON 均保留，没有为测试修改产品。本次精确捕获的 desktop 36852 / supervisor 42404 / Host 11780 已退出，独有临时 profile/workspace 已清理，9443 释放；仅清理本次可重建 fixture，证据仍在 artifacts，未触碰用户实例或受阻旧进程。

最终根串行门禁 `bun run check` **exit0**：原生工具构建、根 strict ESLint、根 typecheck 均通过，完整 Bun **1931 pass / 0 fail / 14343 assertions，345文件，248.52秒**；日志 [final-check.log](../artifacts/tool-result-copy/final-check.log)。这是本单元当前工作树的实际检查结果；上一归档单元的外部通知控件失败另存历史，不沿用为本轮结果。没有修改／夹带该并行功能来让门禁通过。

## 尚未迁移的部分

本次不包括输入 JSON／命令行专用复制、完整终端视觉表面、图片材料预览、消息选区来源引用或历史磁盘 rewind。这些入口继续按[全桌面审查矩阵](desktop-entry-audit-2026-09-26.md)逐项处理；其中部分需要独立安全、资源和持久化合同，不以静态按钮冒充能力。

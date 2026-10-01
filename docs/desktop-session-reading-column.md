# 会话正文与输入区共享阅读宽度

活跃会话的消息正文与底部输入区使用同一个 Hbar 工作区宽度上限。桌面上限为 `58.25rem` 外框；在 16px 根 rem、两侧各 `1rem` 内缩时，可读内宽为约 900px。窄屏仍使用流式 `min(100%, cap)`，并在活动会话局部将消息列与输入区的水平 gutter 统一为 `0.75rem`。该规则只作用于活动会话，不改变未开始会话的 hero、Lumen 子模块、全局主题或提示输入表面。

这次修正的是消息列和输入面板的可读边界错位，不是整页截图像素对齐或完整 CC 样式 parity。正文里的消息气泡、代码块、工具结果仍保留各自层级和内部 padding；验收只比较消息列的可用内边界与 composer 外表面边界。

验证入口为 `e2e/session-reading-column-width.spec.ts`：中英文、1440×900、900×900、390×844、320×844 与短屏 320×560；真实临时 Host 与本地 `local-fixture` 提供的 `/demo` 正文/代码和 `/tool update_plan` 历史。默认 M 字号下检查工具/Goal/模型/发送/项目上下文可达、键盘输入及未发送草稿保留。L 字号未在此切片验证。该夹具不调用付费 Provider，也不通过 composer 发送第三个 Run；它不验证原生窗口布局。

## 长消息换行回归

`e341c475` 引入 Time 侧栏时，让项目名称标签复用了活动会话根容器的 `.hbar-app-react-session-workspace` 类名。侧栏所需的 `white-space: nowrap`、省略号和 `flex` 因此也作用于整个会话；`7bb0c015` 保留了这个选择器。仅检查页面 `scrollWidth` 无法发现阅读区内部裁切：在 320px 本地 Guide 流程中，消息段落可用宽度约 224px，但文本内部宽度达到约 4524px。

修复将侧栏元数据独立命名为 `.hbar-app-react-session-workspace-label`，同步原有侧栏断言。不修改 Lumen 子模块、正文内容、消息宽度或语义，不增加隐藏溢出、固定高度和坐标布局；侧栏项目名仍单行省略，聊天正文按既有 `overflow-wrap: anywhere` 自然换行。CC `e28d0a65` 的 `desktop/src/components/chat/UserMessage.tsx` 将右侧用户气泡约束在父容器内，并显式使用 `whitespace-pre-wrap` 和 `overflowWrap: anywhere`，作为阅读流参考；本修复不宣称迁移其字面文本/Markdown 语义差异。

新增回归位于 `e2e/queued-run-guide.spec.ts` 的连续引导流程，检查 canonical 用户消息及段落、气泡、阅读区和父容器的实际内部宽度，确认长消息多行生长，且剩余队列、草稿和同 Run 后续推理保持正确。`e2e/sidebar-organization.spec.ts` 的现有组织流程同时检查改名后的项目标签仍为单行省略。证据输出在 `artifacts/message-flow-v20/`；不重复完整语言 × 尺寸矩阵，也不覆盖原生窗口、L 字号或付费 Provider。

本切片验证：原组件隔离预览 `reference/fixture.tsx` 直接导入未修改的 CC `UserMessage`，使用原 Tailwind/theme，注入同一份合成长文本；不启动参考应用、Session、Host 或真实 profile，捕捉 320/1440 两张截图。`reference/report.json` 记录 320px 时气泡 `clientWidth = scrollWidth = 243`、高度约 568px，1440px 时宽度 640px、高度约 215px，两者均为 `pre-wrap`/`anywhere`，无页面错误或外部请求。hbar 的旧构建先复现内部裁切失败；最终生产 Web 构建的 Guide 连续流程通过（6.3s），Time 侧栏既有连续流程另行通过（8.3s），6 个侧栏纯函数/文案测试、修改范围的严格 TypeScript 与零警告 ESLint、内容/图标/流式布局 guard、格式及 diff 检查通过。第一次组合跑的侧栏夹具误用了旧 `dist/web`，该失败不用于验收；显式指定相同新构建后通过。临时 Host 与 49169/49170 服务均已关闭。未运行全仓检查或原生桌面启动。

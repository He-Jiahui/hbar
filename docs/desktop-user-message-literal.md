# 用户提示词原文阅读

CC `e28d0a65` 的 `desktop/src/components/chat/UserMessage.tsx` 明确将操作者提示词作为字面文本，使用 `whitespace-pre-wrap`/`overflowWrap: anywhere` 保留输入中的符号、换行和空格；只有 HTTP(S) 地址分段成链接。助手与有归属标识的 teammate 消息另用 Markdown。hbar 此前通过同一个 `HbarMessageBlocks` 默认 Markdown 路径显示用户文本，导致 `#`、`**`、反引号、列表、实体文本及路径在发送后被解释，与输入表面不一致。`ec6556c0` 的会话查找同样为所有角色解析 Markdown，后续 `88f387f9` 的代码阅读继续使用该默认路径；这些是现有行为依据，并非断言最近提交引入了整个差异。

会话组合层现在显式为 `role=user` 选择 `literal` 文本格式。`MessageLiteralText` 使用普通段落和 `pre-wrap`，内容来自 canonical block，不解析 Markdown 或 HTML，不增加固定高度、隐藏溢出、代码折叠或内置样例。独立纯模型识别有效 HTTP(S) 链接，保留其余原文，包括中文标点后的文本；地址包含可见完整来源，外链使用 `noopener noreferrer`。非法协议、无法解析的端口与部分 authority 不被改写为另一条链接。尾随括号扫描为线性处理，并有 180k 尾部样例验证。hbar 暂无 CC workbench browser 的统一链接路由，因此这里保留原有外部链接行为；不宣称 localhost 点击会打开内置预览。

助手、Plan、工具和其他非用户消息继续沿原 Markdown/专用渲染路径。图片与文件仍使用既有 block 顺序、资源所有权和画廊。hbar 的 child objective/Goal 初始信封目前也以 `role=user` 存储，按同一 user-role 原文规则显示；没有用已分页 Run 列表推测消息作者，没有迁移 CC 的 teammate 归属或左对齐语义。新增格式属性默认为 Markdown，保持其他组件调用的原契约；会话组合根明确选择角色格式。

会话内 Find 同步使用字面文本的 UTF-16 映射：用户输入中的 `**needle**` 现在按完整符号搜索，助手的可读 Markdown 索引仍去掉语法标记。原有消息/片段 ID、分页预算、缓存、DOM 校验与跨 Session 隔离保留。复制直接取 canonical text；选中引用取浏览器可见原文，因此用户引用保留符号，助手引用保持可读富文本。旧富文本 Find 场景改为另一个真实本地 Run 的助手回复，并继续验证表格水平滚动、代码尾部、高亮、草稿和外围滚动；旧 `Ctrl+K` 命令目录夹具更新为当前 `Ctrl+Shift+P`。

## 实际验证

参考隔离 fixture 直接导入未修改的 CC UserMessage、原 Tailwind/theme，合成输入包含中文、Markdown 符号、代码围栏、Windows 路径、空白和带中文标点的 URL。截图 `artifacts/message-literal-v21/cc-original-literal-320.png` 与 `reference-report.json` 记录：没有标题/粗体/代码/列表元素，原始全文一致，243px 气泡内宽没有横向溢出，链接目标为 `https://example.invalid/docs`，无页面错误。没有启动 CC 应用、Host、profile 或远程 Provider；浏览器只允许 fixture localhost。

hbar 使用真实临时 Host 和本地 `local-fixture`，生产构建 `index-B1JO8fwK.js`/`index-D-gDr7-e.css`。用户发送→原文显示→复制→窄屏 Find→返回草稿通过（5.5s）；跨段用户/助手引用及接受 Run 通过（8.0s）；Guide 同 Run/剩余队列/草稿连续流程通过（5.2s）；调整后的 Find 工具/模态入口、流式事实、literal 查询及助手表格/代码阅读流程通过（18.0s）。代表性检查代替语言 × 尺寸矩阵。全部页面错误为空，夹具结束时 Vite 因主动关闭 Host 打印的 `ECONNRESET` 是停止阶段诊断，不作为页面错误。

15 个纯模型/原文 SSR/复制/引用测试通过，69 assertions；修改范围的严格 TypeScript、零警告 ESLint、Prettier、内容/图标/流式布局 guard 与 diff 检查通过。旧 `session-find-text.test.tsx` 的原 Lumen SSR 套件仍在加载阶段受只读子模块缺少 `prop-types` 阻断；新增角色投影测试放到可运行的纯模型文件，不改依赖或掩盖该失败。早期 Find 失败分别是过期快捷键、窄屏长查询跨行可见断言，修正测试与实际语义后通过；不计入成功结果。49169/49170 服务和测试 Host 均已停止。未进行全仓检查、原生窗口启动、安装、主工作区修改或推送。

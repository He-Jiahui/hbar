# Desktop 命令结果阅读迁移

2026-10-02。范围是已有命令工具的展开阅读：审批 → 同一 Run 结果 → 完整 Copy →
原始参数 → 回到原输入区。没有新增工具执行、重跑、交互终端或文件写入入口。

## 参考与表达关系

参考仍固定在只读 CC-haha `e28d0a65`。主 agent 亲看原组件实渲的
`artifacts/tool-presentation/reference/evidence/en-US-1440-bash-command-expanded.png`；
只读参考 agent 又核对 `evidence-final/en-US-1440-bash-command-expanded.png` 与
`desktop/src/components/chat/ToolCallBlock.tsx`。两图为原 CC 组件和合成数据，
不冒充真实 CC Host／Run。

CC 将命令与输出放在同一终端样式卡中，成功输出先读 12 行，错误输出完整滚动，
Copy 位于结果标题旁；额外参数可以继续检查。旧 hbar 的
`artifacts/desktop-next-conversation-entry/hbar-tool-output-en-US-1440.png`
是历史基线：命令混在带转义的 Input JSON 里，Input／Output 分成两个独立框。
旧图不代表本次修改前完全没有本地化、状态或 Copy；这些能力已有独立提交。

本次迁移的是阅读层次，不复制装饰性终端按钮：一张卡按正常 flex flow 显示
**命令 → 输出／错误输出 → 原始参数**。沿用 hbar 的 Lumen 主题和字体，长命令、
翻译和参数自然换行；输出拥有自己的有界滚动区，不用固定卡片高度裁切内容。
主 agent 已查看最终受控英文展开图、中文窄屏错误图、真实 Host 窄屏图及原生图。

## 真实数据与连续性

- 只有 Host 已捕获、通过严格校验的 `kind: command`／`commandField` 才采用新卡。
  不按 `shell`／`Bash` 名称猜测，也不读取 getter 或调用对象 coercion。
- compact 行仍用原有有界摘要；展开命令来自精确原字段。原始 args 的完整 JSON
  在原始参数入口中保留，含 timeout、额外键和原换行。没有删除或改写 Host 输入。
- pending 只显示请求命令，没有输出或执行成功；结果和 Copy 仍绑定原
  Session／message／call／tool 身份。pending → settled 不替换命令卡、原始参数
  disclosure 或用户焦点。折叠、展开、Copy 都不创建新的 Run。
  这里保持的是当前 runtime 内的草稿往返；整页 reload 后自动恢复草稿仍是既有
  persistence 契约边界，本次没有新增自动保存或恢复策略。
- canonical succeeded 和兼容旧普通结果预览首 12 行；额外 12,000 UTF-16 单元
  是视觉容量，避开 surrogate pair 与 CRLF 边界。跨字符容量不能准确报告剩余行数
  时使用普通“展开完整内容”，不编造行数。
- failed、legacy-error、denied、cancelled、interrupted、unknown 保留完整已加载
  诊断，不再经过第二次 12,000 字符内容截断。只有失败／旧错误使用错误输出标题；
  非成功状态继续由原行的 canonical outcome 表达，不把取消或未知误称执行失败。
- 输出只有一份原始文本流，隐藏尾部仍保留完整源。Copy 始终使用原始
  `tool_result.text`，不会复制摘要、12 行窗口、空状态标签或重建的换行。
  已有 Copy 的一百万 UTF-16 单元上限、迟到结果隔离与失败重试保持不变。
- 无 metadata、缺少有效 command、orphan result 和其他工具继续原有通用详情，
  不为它们伪造命令语义。原始参数入口内容按既有 disclosure 隐藏，不宣称懒解析。

与 CC 的有意差异：CC 会清洗 ANSI／OSC、处理 CR 覆盖并 Copy 清洗后的文本；
hbar 当前直接阅读和复制已持久化原文，不做终端字节仿真。将来若加入清洗，只能
做独立 display projection，不能修改 Copy 源或冒充 PTY。Host／工具可能已按其
独立预算明确截断，UI 的“完整”指完整已加载结果，不能恢复 Host 未保存的输出。

## 实际验证与原生同步

- 默认严格 typecheck、全仓 lint、最终 owned 路径格式／lint、`git diff --check`
  和 content／icon／flow guards 通过。首次 lint 的测试清理 `no-unsafe-finally`
  问题已移入独立 owned-path helper，未放宽规则。
- 定向 Bun **82 tests／811 assertions**，六个具体文件，覆盖 0／1／12／13 行、
  CRLF／CR／Unicode／字符容量、双语全部 canonical outcomes、pending／empty／
  generic fallback，以及原 presentation、Copy 和 native-fixture 边界回归。
  记录 `artifacts/desktop-experience/command-reading-final-unit-confirmed.log`。
  非致命 Bun directory-mismatch 诊断保留，exit 0。
- 五条最终核心浏览器路径通过：受控真实 React 的 pending → success → error、
  原始参数、原文 Copy 和焦点；原有七类工具的一条完整英文组件路径；实际持久化
  `read_file` 和取消的 `shell` 两条 producer 回归；真实 Host 的中文审批 → 25 行
  命令输出 → OS clipboard 逐字回读 → 原始参数 → 返回原草稿。
  OS 回读比较允许系统 CRLF 换行归一化；受控 Copy port 另逐字断言原始 CRLF 源。
  记录 `command-reading-final-e2e.log` 的两个通过用例、
  `command-reading-producer-final.log` 的两个通过用例和
  `command-reading-host-confirmed.log` 的一个通过用例。
  中间错误的 Send selector／缺失 producer 资产环境不计入通过数，也没有重跑整套矩阵。
- 真实命令只在脚本创建的临时项目中输出 25 行文本，不读写用户项目、不访问网络、
  不调用付费模型。其他 producer shell 回归仍只取消，不批准执行。

最终 Web `index-3U9wzhcb.js`／`index-D-2KaXZy.css` 与 standalone index 一致；
VS 技能环境下离线 Host 资源和 locked／offline Tauri debug 构建通过。用户授权的
独立临时 `run-20261002-29` 原生 smoke **exit 0**：owned stdout-only 命令通过原
工具审批、原 Run 完成，新卡的命令／输出／原始参数、12 行展开、Copy 反馈和原草稿
返回均通过。原模型／high、Goal + Plan、Files／Skills／Provider 和窗口／Host
生命周期断言保留。原生只证明 Copy 反馈，完整 payload 由 Web OS clipboard 回读证明。

原生画面和日志归档于
`artifacts/desktop-native-acceptance/run-20261002-29`；其中最小窗口图展示输出／
原始参数与草稿共存，不声称整张长卡必须同时塞进视口。owned Host、桌面进程及
临时 profile／项目由原脚本精确清理。没有安装、重启用户现用桌面、push 或 deploy。

本单元没有运行完整 `check`／全部 E2E，不宣称全部工具输出、高亮、ANSI 终端或
完整 CC 功能迁移。生产大 chunk 和 Cargo 配置弃用／linker 警告仍保留。
整体交互入口与 Host／原生能力边界见[当前地图](desktop-interaction-map-current.md)。

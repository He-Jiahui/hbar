# Files 的 Markdown 阅读体验

2026-10-02。承接用户要求的 CC desktop 交互迁移；只补已有文本文件契约上的阅读表达，
不新增网页预览、Markdown 图片资源服务或文件系统权限。

## 参考与迁移关系

只读参考为 `D:/Git/cc-haha @ e28d0a65`。`WorkspacePanel.tsx` 的
`isMarkdownPreview`／`MarkdownSurface` 默认使用原 `MarkdownRenderer`：文件身份和
工具栏留在正文上方，标题、段落、列表、表格、代码块进入正常文档流，所属 pane 滚动。
主 agent 亲看原组件实渲：

`artifacts/desktop-experience/file-markdown-reference/evidence-final/cc-markdown-en-US-1440.png`

配套 JSON 记录 22 个标题、1 个列表、1 个表格、正文 block flow、父区 overflow auto，
pageerror 为零。画面导入真实 CC ActiveSession／WorkspacePanel／MarkdownRenderer 与
stores，但读取来自隔离 loopback fixture，不是 CC Host／Run／原生验收。
发布的 `workspace-preview.webp` 是 Browser 画面，没有当成 Markdown 依据。
窄屏参考 harness 未成功展开正文，不声称拿到了窄屏 CC Markdown 图。

e28 WorkspacePanel 是只读预览，没有 Source／Edit／Save。hbar 保留自己已实现的
编辑、dirty、CAS 保存与 unknown 对账，只迁移“先读文档，按需查看源码”的关系；
不能把后续 CC 提交的编辑器能力倒投到 e28 参考上。

## 当前行为与边界

- `.md`／`.markdown` 默认 Preview 显示格式化文档；`.mdx` 不执行。Source 回到原
  行号、选段和批注阅读器，Edit 仍使用原受控编辑器。
- 三种模式复用同一 preview UUID、Host 文档、baseline 与 draft；预览显示当前稿，
  模式切换不保存。阅读位置按 preview 与模式分别保留。
- 行列引用进入 Source；用户明确处于 Edit 时不夺走编辑器。普通源码文件不增加
  Source 入口，其 Preview 选中态仍正确。
- 相对文件链接经显式点击走原 `fileWorkspace.openEntry`，保留原 Session／target，
  再由 Host 校验范围。返回原文件不会自动保存未提交稿。
- 文档只使用 GFM 与 sanitizer，不复用聊天文件引用变换。真实 Host 红测证实后者
  会移除 `other.txt` 的原 href，使链接变成普通文字；现已分离渲染策略。
- 格式预览上限为 **128 KiB UTF-8**；超过后显示宿主本地化提示与完整源码，不截断。
  这是明确容量边界，不是吞吐基准；Host 原文本读取上限仍独立约束。
- raw HTML 跳过，script／iframe 不执行；图片显示本地化未加载说明，不自动请求。
  路径拒绝绝对地址、协议、越界 `..` 与非法编码；HTTP(S)／mailto 仅保留显式 anchor。
  未验收原生外部浏览器唤起、图片加载、页内锚点或网页网络隔离。
- 正文为正常 block flow，阅读 pane 为 flex 与 overflow auto；代码块自己滚动，表格
  和段落自然换行。无截图坐标、固定正文高度或新图标等级；可见文案由类型化中英
  bundle 提供，不在 React 中硬编码。

## 实际验证

原生产资源 `index-wuYBKNVU.js` 的新 E2E 红测只能看到源码，找不到格式阅读标题。
中间链接缺失、启动自动展开与过时 Expand 操作竞争，以及旧断言把行号控件算入源码
的失败保留在 artifacts。未 force click、伪造成功响应或移除状态保护；旧源码回归改为
显式 Source，并逐个比较真实 `[data-source-code]` 行，保留完整正文与空行断言。

- 定向 Bun：10 文件、54 tests／348 assertions，零失败；覆盖容量／sanitizer／相对
  链接、模式／UUID／draft、行定位、preview 生命周期、unknown 保存与原生夹具边界。
  Bun directory-mismatch 诊断保留，exit 0。
- 最终生产 Host E2E：英文 1440 与中文 320 两条完整阅读路径、原消息文件定位共
  3/3 通过；阅读 → Source → Edit → Preview → 显式 Save → 本地链接 → 返回文件
  → 返回聊天草稿。保存未知与迟到读取／失败重试另为 2/2 通过。
  不累加中间重跑，也不是完整 `test:e2e`。
- 默认严格 typecheck、全仓 lint、最终 scoped 类型感知 lint、变更格式、content／
  icon／flow guards 与 diff 检查按实际终端结果记录；没有关闭或放宽规则。
- Web build 为 3550 modules，最终 `index-Cv-xYv4-.js`／`index-BIS9l6L3.css`；大
  chunk 警告保留。主 agent 亲看中英文档图，内容变化后没有页面横向溢出。

最终 Web 图：`artifacts/desktop-experience/file-markdown-reading/final-results-05`；
独立生命周期回归：同目录的 `continuity-results-02`。使用独立工程和真实 Host，没有
真实供应商请求。未触发图片请求或嵌入脚本，pageerror 为零。

## 原生与交付

用户已允许临时原生验收。MSVC 环境下的 Host 资源和 locked／offline Tauri debug
构建已同步最终资源，使用独立 profile、独立工程和 mock 模型，不安装或重启现用
软件。最终 `artifacts/desktop-native-acceptance/run-20261002-23/native-smoke.log` 终端
exit 0；实际窗口完成 Markdown 阅读 → Source → Preview → 本地链接 → 原文档返回。
主 agent 亲看该运行的最终文档图。已有模型／high、Goal Plan／原 Run 审批、聊天搜索、
Files 搜索、Skills、Provider scoped draft 与默认／最小窗口、退出／Host 生命周期
步骤保留并通过；不是原生 Markdown 编辑故障注入。Web 的编辑／保存由真实 Host E2E
另行验证，不能把不同验证层混为一项。

临时 profile、项目及 owned 进程由原验收脚本精确清理，ignored 截图与日志保留。
最终源码提交只包含这个完整子功能，构建产物未入 Git，也未 push／安装／发布。

本子功能不代表整个 CC 体验迁移完成。Browser 的可信本地站点与任意不可信网页仍需
独立范围决策，见[Browser 边界](desktop-browser-preview-boundary.md)。PTY／Team／
MCP／插件安装等没有因阅读 UI 而被假装可用；以[当前地图](desktop-interaction-map-current.md)为准。

## 文档代码块入口补充（2026-10-02）

`6ce5527f` 已形成文档阅读闭环，但其代码块仍是普通 pre，没有 CC 文档图中的语言／
行数与 Copy。主 agent 再次亲看上方原 WorkspacePanel 图，以及原 CodeViewer 的
`artifacts/code-block-copy/reference/evidence-reference-final/reference-en-US-1440-long-expanded.png`；
它们支持普通流 header、右侧 Copy、超过 20 行的展开／收起和代码自身滚动。
原 renderer／CodeViewer 对应关系见[原代码阅读记录](desktop-code-block-copy.md)。

现为 Files 文档接入相同的本地化入口：语言和总行数在左、Copy 与反馈在右，长代码
底部展开／收起，键盘切换后保留原按钮焦点。折叠不限制复制内容；AST 提供完整代码，
不含围栏、相邻正文或其他块，也不执行代码。空／纯空白代码没有无意义 Copy。
复用消息已有的 1,000,000 UTF-16 单元复制预算、失败／不可用／重试与 1.5 秒反馈。
Markdown 整文格式容量仍为 128 KiB UTF-8，因此文件路径不放宽复制预算或读取权限。

`CodeTextCopyAction` 和纯 `copyCodeText` 承接本地复制策略；消息 wrapper 保留原
Session／message／segment／occurrence 身份。Files 使用真实 preview UUID、相对 path、
AST occurrence 和 runtime owner，不捏造消息 ID。源码变化、owner 切换、卸载及 A→B→A
会使旧局部反馈失效；已经发出的系统剪贴板写入不能撤销，不声称能取消 OS 写入。
共用 AST parser 的消息旧入口保留转导出；Find 的注册、原文投影与 DOM chrome 排除
不变。文件视图离开后展开状态不作持久化保证。

本次实际验证：

- 定向 7 个 Bun 文件 51 tests／344 assertions 全通过；Find／整消息 Copy 另 4 个文件
  89／621 全通过。没有累加重复运行。严格 typecheck、owned 类型感知 lint、变更格式、
  content／icon／flow guards 通过；本次没有再跑全仓 lint 或完整 check。
- 新 Files 受控生命周期两条与既有消息／Plan 八条共 10/10 通过；使用 injected
  clipboard 明确验证重复块独立、A→B→A 迟到结果、失败重试和 owner 变更／不可用。
  首次测试误用“等待 copying”的 helper 检查同步 unavailable，失败保留；改为点击
  后断言真实 unavailable，未修改产品或放宽断言。
- 中英文两条真实 Host 路径另 2/2 通过：真实剪贴板回读完整 25 行、键盘展开／收起、
  真实滚动后末行 Range 位于代码 pane 内，并继续完成源码／编辑／保存／链接／返回。
  最终图在 `artifacts/desktop-experience/file-markdown-code/host-final-results`。
  Find chrome 浏览器回归另 2/2，不冒充完整 Find 矩阵。
- 最终 Web 3552 modules，`index-D2DgJJXI.js`／`index-DPbBTXP0.css`；构建大 chunk
  警告与 Bun directory-mismatch 保留。Host 和 locked／offline debug Tauri 离线同步。
- 新临时原生 `run-20261002-24` 全流程终端 exit 0，实际代码 Copy 收到已确认反馈；
  主 agent 亲看 `file-code-copy-default-window.png`。原有模型／high、Goal Plan、审批、
  Files／Skills／Provider 和生命周期步骤保留通过。这是原生一次真实写入反馈，
  payload 逐字回读由 Web Host E2E 证明，不混同不同层的验证。

临时 profile、工程和拥有的进程按原脚本清理；CC 与共享 Lumen 没有被修改，也没有
安装／重启用户软件、真实供应商请求或 push。Browser 范围选择仍未得到回复。

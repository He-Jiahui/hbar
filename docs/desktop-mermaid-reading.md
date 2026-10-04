# Desktop Mermaid 阅读入口

2026-10-02。基线 hbar `4c08db0d`，只读参考 CC-haha
`e28d0a653481ef41b7a329411eeb2f0fd5656731`。本单元迁移图示阅读关系，
不新增 Browser、外部图片、执行工具或安装能力。

## 实际参考与设计关系

`desktop/src/components/markdown/MarkdownRenderer.tsx` 的显式 Mermaid fence、
无语言／plain fence 语法检测，接入原 `chat/MermaidRenderer.tsx`。
流式内容显示生成中，完成态先展示图示，不要求用户先切模式。

参考 agent 在已有 loopback fixture 中运行真实 WorkspacePanel／MarkdownRenderer／
MermaidRenderer 与 CC 样式，注入一条三节点合成文档。没有 CC Host、Run、Provider、
写 API 或远程资源；捕获进程 exit 0、pageerror 为 0，结束后释放 45091。
主 agent 实际查看以下两图，未把源码检查冒充视觉依据：

- `artifacts/desktop-experience/mermaid-reference/cc-mermaid-inline-en-US-1440.png`
- `artifacts/desktop-experience/mermaid-reference/cc-mermaid-preview-en-US-1440.png`

观察到的结构是正常流中的图示卡片：标题在左，Preview／Copy 在右；图面有独立
滚动边界，点击也打开预览。预览覆盖正文，顶部放缩小／比例复位／Fit／放大及
Copy，底部说明拖动、滚轮与 Ctrl／Command 缩放。CC 此版本没有 Diagram／Source
标签，Copy 的对象是原 Mermaid 代码，不是 SVG。

## hbar 完整路径

消息、具有 code context 的 Plan 文档和 Files Markdown 共用 `MarkdownDiagram`：
默认图示 → 原位 Copy → Preview 或点击图面 → Fit／缩放／平移 → Esc／关闭 →
原入口焦点。Files 的 Preview／Source／Edit、preview UUID、baseline、dirty draft、
CAS Save、链接和返回会话没有换成另一份文档事实。

- 卡片标题、动作和状态使用 Host 提供的中英 `HbarDiagramLabels`。工具图标使用
  共享 sm／md 层级；普通内容为 flex flow，不按截图坐标定位。
- 缩放范围 5–300%，初始 Fit 不放大短图；普通内容按图的自然尺寸显示，在窄 pane
  缩小适应宽度。预览图面按实测 SVG viewBox 的尺寸缩放，内部滚动，工具区不参与
  图面平移；没有用固定内容高度强行排齐卡片。
- hbar 增加明确的“图示源码”入口，避免与 Files 整个文档的“源码”混淆。错误、
  超限、受限语法时原始内容仍可完整选择或 Copy；busy／解析失败可以就近手动重试。
- 流式消息先显示生成状态，完成后绘图；普通消息的 streaming 直接随 code context
  传入，不依赖恰好存在文件导航能力。
- 会话 Find 仍索引原 Markdown AST。图示和操作栏按真实 DOM 注册为 renderer chrome，
  原代码只存在于一份可切换的源码 pane；显式 Find 导航同步显示该 pane，普通高亮
  不自动切模式，不把图中标签重复计入。
- Copy 复用现有原来源身份、pending、防重复、失败／恢复和 late-result fence。
  图示 owner／代码／主题变化会取消旧结果；关闭后的焦点回填也检查原阅读 lifetime。
- inline 和 modal 同时存在时，预览 SVG 的所有生成 ID、CSS／marker 与 aria 引用独立
  命名，避免重复 ID 或跨图箭头引用。

## 静态渲染边界

使用已有 Mermaid 11.17.2 和 DOMPurify 3.4.15；只在 app-react manifest／lock 声明
直接依赖，离线安装报告无下载、无版本升级。Mermaid 为本地动态导入，没有 CDN、
远程字体或注册外部 icon／diagram loader。

当前静态子集为 graph／flowchart、sequence、class、state、ER、journey、gantt、pie、
gitGraph。其他已识别 Mermaid 语法明确显示受限状态并保留源码，不假称完整 Mermaid
语法对齐。绘制前拒绝 frontmatter／配置指令、作者 CSS／URL、HTML／实体编码、图片／
图标／math 与 click／href／link；strict、htmlLabels false、不调用 bindFunctions。
Gantt todayMarker 的 protocol-relative CSS URL 也在进入测量 DOM 前被拒绝。

原代码绘制容量 16,384 UTF-16 单元、100 edges，输出 SVG 最多 1,048,576 UTF-16 单元；Copy 保留原有
更大的完整源码容量，不截断来制造绘制成功。串行队列为一个物理 render + 最多八个
pending，pending 可取消；已开始的 Mermaid 没有硬中断 API，取消只废弃返回与反馈，
不会提前释放物理槽。UI 的 12 秒等待上限不是主线程计算的硬抢占或沙箱隔离保证。

Mermaid 临时测量 DOM 必须参与 SVG 布局才能得到文字尺寸；专用 inert／透明测量
overlay 在 finally 移除。flow guard 仅对新 stylesheet 中这一精确容器开例外，self-test
确认例外不能用于图面、后代或其他文件。最终 SVG 再经过 SVG profile 清理，不保留
链接、image、use、foreignObject、脚本或动画；图面只提供阅读动作。

## 验证与证据

本单元按完整路径验收，不增加按钮乘视口矩阵。中间失败产物保留，未计入最终通过数。

- 默认严格 typecheck、全仓 `bun run lint`、owned 文件格式、content／icon／flow guards、
  flow guard self-test 与技能 validator 均通过。
- 定向 Bun 覆盖 source gate、边界、取消／队列、zoom、实际消息／历史 Plan／Files
  入口与双语 streaming；同时保留代码 Copy、Markdown、Find projection 与整条消息
  Copy 回归。最终 **69 tests／751 assertions** 通过，记录在
  `artifacts/desktop-experience/markdown-diagram/final-unit.log`。
- `e2e/markdown-diagram.spec.ts` 两条代表路径实际绘图、OS clipboard 回读原代码、
  键盘打开／返回、zoom／Fit／pointer pan、Find 原始范围、streaming、失效／超限／
  受限、快速更换 owner、中文长标签与 320 pane；无 pageerror／外部请求／测量残留。
  加上既有 Copy 生命周期十条为 12/12；SVG 命名修正后新两条另通过，不重复加总。
- `e2e/file-markdown-reading.spec.ts` 真实临时 Host 中英两条 2/2：实际读取磁盘文档、
  绘图、源码 Copy 回读、预览／焦点返回，再继续原 Source／Edit／Save、链接、dirty
  文档往返和原会话草稿；没有创建用户 Run。关闭 owned Host 时 Vite ECONNRESET
  诊断保留，流程内 pageerror 检查通过。
- 用户允许的临时 Tauri 验收使用独立 profile／项目和 local-fixture，`run-20261002-25`
  smoke exit 0，真实中文窗口中 Copy、Preview、125% 与 Esc／源码返回均通过。
  这是 SVG ID 与焦点 lifetime 收尾前的资产；最终资产的执行另记，不混用证据。

最终生产 Web 为 `index-DA53z1En.js`／`index-Dd-QrWYe.css`，离线 Host 资源与 locked
offline debug Tauri 均构建通过；standalone index 的资产名与 Web 一致。独立
`run-20261002-26` 维护的 native smoke **exit 0**，在真实中文窗口中绘图、Copy 反馈、
Preview、125%、Esc 焦点返回与图示源码切换均通过；旧模型／high、Goal Plan、同 Run
审批、文件／技能／设置草稿和窗口／Host 生命周期断言未移除。主 agent 实际查看
`file-mermaid-preview-default-window.png`；原生 Copy 这里只验证反馈，完整 payload
由 Web OS clipboard 回读证明，不假称原生也读取了剪贴板。

相同最终生产资产的真实 Host 中英两条另为 2/2，主 agent 查看中文窄图。临时
profile／项目和 owned 进程按原脚本精确清理；参考与 hbar 受控 preview 的监听均已
结束，没有安装、重启现用软件、远程 push 或商业模型请求。

生产构建仍有大 chunk 警告。没有完整 check／全部 E2E、安装包、付费模型流量、
所有 Mermaid diagram family 或不可信内容 CPU 沙箱验收。Skills 等没有 code context
的旧 Markdown 调用保持原安全静态渲染，本单元不为它们伪造 Session／Copy 身份。

整体迁移 Goal 保持 active；其他能力边界见[当前交互地图](desktop-interaction-map-current.md)。

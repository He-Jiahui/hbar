# Desktop 代码语法阅读迁移

2026-10-02。范围是消息、当前／历史 Plan 与 Files Markdown 中已有的代码块阅读，
不新增编辑器、Run、工具栏入口或文件写入能力。参考 CC-haha 的 `e28d0a65`，保持
既有语言／行数、原位 Copy、20 行折叠与代码自身滚动区。

## 参考与取舍

主 agent 亲看原 CC `MarkdownRenderer`／`CodeViewer` 实渲的初始和长代码展开画面：
`artifacts/code-block-copy/reference/evidence-reference-final/reference-en-US-1440-initial.png`
与 `reference-en-US-1440-long-expanded.png`。两个只读 agent 分别核对参考语法呈现和
hbar 的 DOM／Find 接缝，没有修改参考仓库、启动 CC Host 或商业 Provider。

CC 以暖色关键词、绿色字符串、蓝色函数、偏青数字与柔和注释帮助扫描；默认不显示
行号。它使用 Prism 起步、Shiki 异步接管。hbar 迁移语义层次，不复制临时重叠的两套
DOM，也不宣称逐像素一致：字体沿用当前宿主，注释颜色稍加深以提升浅色阅读清晰度。

新增直接依赖 Shiki **4.1.0**，与参考 lock 的解析版本相同，而非升级到最新版本。
`bun install --offline --ignore-scripts` 从本地缓存安装 16 个包；lock 只增加依赖，
没有升级既有版本。使用公开 core／langs／JavaScript engine 入口，不导入 CC 的代码、
私有源码或 react-shiki wrapper。官方提供的 [token API](https://shiki.style/guide/install)
允许组件自行呈现；[JavaScript engine](https://shiki.style/guide/regex-engines) 与参考
最终 engine 一致，本单元不新增 WASM 加载或远程语法下载。

## 单一源码与阅读连续性

- 复用真实 Markdown AST 的 `domText`，整块 token 化后再按既有 `previewEnd` 切分。
  多行注释跨第 20 行仍属于同一语法状态；隐藏尾部不是独立重新解析的一段。
- 以 token UTF-16 offset 校验原文，每个原换行／空行来自原始 gap；不 trim、不用
  `join('\n')` 重建，不改变 CRLF、lone CR、tab、Unicode 或末尾空白。任何不一致
  都整块退回原文。React 只渲染文本和受控语义 role，不注入库生成的 HTML／style。
- Message、Plan 与 Files 共用 `MarkdownCodeContent`。Copy 仍使用原 `code.text`
  与原 occurrence／owner／source 身份，最大完整源码容量仍为一百万 UTF-16 单元。
- Find 原始索引不变。代码 DOM 只有一份全文，header／footer 仍按真实注册排除。
  已激活的 Range 在 token spans 插入后由既有 MutationObserver 自动重新映射；
  显式 Find 才展开隐藏尾部，不为一次高亮 repaint 再次抢滚动。
- owner、原文、语言和 streaming 同时在 render 与异步完成处检查。流式生成期间
  原文即时可读，完成后再加颜色；这是减少解析抖动的有意差异，不假称 CC 流式
  高亮完全相同。语言、源码或 owner 更换不会显示旧块的 token 范围。
- 配色由最近的宿主 `data-lumen-mode` 提供语义变量，支持嵌套浅／深阅读预览。
  实际构建发现 `light-dark()` 的转换变量继承页面色系，改用宿主主题变量后，
  浅色／深色关键词的实算颜色均通过，不要求修改 shared Lumen。

## 容量和 fallback

高亮输入最多 65,536 UTF-16 单元、512 行、单行 4,096 单元、8,192 tokens；语言名
最多 64 单元。只从固定本地 bundled registry 查 ID／alias，不把未知 fence 标签当
import 路径或用户 grammar。TS／Python／JSON／SQL／Rust 的代表片段已实际验证，
不把 bundled registry 的存在冒充所有语言语法均已验收。

最多四个 active 请求、32 个 pending。pending Abort 立即移除，active grammar load
保留物理槽直到真正结束；late result 被废弃。语法／chunk 失败、未知语言、容量超限
或取消时无额外 loading 工具栏，完整 plaintext 始终保留；不通过截断伪造高亮成功。
没有修改 Markdown、文件、Run 或 Copy 的更大独立容量契约。

Shiki 的 500ms 逐行限制是 advisory，不是 CPU 抢占或线程隔离。冷启动实测 10ms
会使首次 grammar 编译后的下一行错误延续注释，故保留库默认值并测试完整片段。
这是有界的本地视觉增强，不宣称不可信语法 CPU 沙箱。

## 验证

- 默认严格 typecheck、全仓 `bun run lint` 和最终 owned 路径 lint 通过；格式与
  `git diff --check`、content／icon／flow guards 通过。
- 定向 Bun **78 tests／835 assertions**：实际 grammar、完整源码、注释跨折叠、
  offset mismatch、字符／行／token 边界、pending 容量／Abort，加上 Copy、
  Markdown 与 Find 原有回归。记录 `artifacts/desktop-experience/code-highlight/final-unit.log`。
  Bun 的非致命 directory-mismatch 诊断保留，exit 0。
- 最终核心 E2E **13/13**：实际 renderer 流式原文→Find 隐藏尾部→插入 token→
  自动重映射同一个 active Range→完整 Copy，以及原有双语 Plan／复制生命周期。
  真实 Host 中英两条继续 OS clipboard 逐字回读、自然窄 pane 滚动、Source／Edit／
  Save、本地链接、dirty 返回与原会话草稿；没有创建用户 Run。
  记录 `artifacts/desktop-experience/code-highlight/final-e2e.log`，中间失败不计入通过数。

最终 Web `index-BfK6ZbHM.js`／`index-DpWWaq_h.css` 与 standalone index 一致；Host
离线资源及 locked／offline Tauri debug 构建通过。用户授权的独立临时
`run-20261002-28` 原生 smoke **exit 0**：真实中文文件代码块的 `export` 和 `true`
语义角色与 Copy 反馈均通过；已有模型／high、Goal + Plan、同 Run
审批、文件／技能／Provider、草稿往返和窗口／Host 生命周期断言保留。原生 Copy
这里只确认反馈，完整 payload 由 Web OS clipboard 回读证明。旧 run 27 是主题配色
收尾前资产，不冒充最终版本。主 agent 亲看最终原生代码图和中文窄文件阅读图。

完整 `check`／全部 E2E、所有 grammar、付费模型、安装包与 Source 编辑器／Git diff
高亮迁移不在本单元。生产构建仍有大 chunk 警告。没有 code context 的旧安全 Markdown
调用保持原样，不伪造 Session 或 Copy 身份。整体范围和能力边界见
[当前交互地图](desktop-interaction-map-current.md)。

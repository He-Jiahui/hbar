# React Bits Pro / lumen-app-ui 视觉审计

这套审计以 React Bits Pro 的公开 App UI 变体页为真实参考，把每个源变体与
`lumen-app-ui` 的隔离预览按相同的内容、视口、主题和交互逐项配对。原始图片、差异图
和 JSON 报告只写入被 Git 忽略的 `artifacts/`，不把第三方页面或测试数据提交到仓库。

## 覆盖矩阵

- 发现：38 个分类、300 个变体，并与 `packages/hbar-app-ui/src/specs.ts` 的本地注册表逐 ID 校验。
- 静态截图：1440×900、1024×768、390×844、320×720 四个视口；dark/light 两个主题。
- 完整预览根：源截图、结构快照和动作发现均取 iframe 的 `#preview-root`；本地取整个隔离画布。必须包括源变体的标题、状态、工具栏、筛选、内容与页脚，绝不能从内部 pane 猜测组件根节点。页面外的文档导航不属于组件。
- 画布校准：记录原版 iframe 实际内容宽高和舞台 padding，并以相同可用空间渲染本地隔离预览；外窗宽度不能直接当成组件可用宽度。
- 主题校验：不仅检查文档外层 `html` 的 dark/light 状态，还要在每次原版交互截图前后确认真实预览 iframe 的 `html.dark` 与目标主题一致；外层切换后 iframe 未同步的案例必须重采，不能把暗色原版图当浅色证据。
- 本地资源就绪：等待页面 load、实际样式表与字体加载完成后才采集。样式资源失败必须失败/重试，不能把已经出现文字的无样式页面当成已就绪；断点复用还要检查动作前后画布几何，避免语义状态相同掩盖丢失样式。
- 语义快照：组件根节点尺寸、水平溢出、前五层 DOM 结构、控件的实际矩形与 name/role/disabled/expanded/pressed/selected/state。动作差分取控件自身矩形，不依赖它恰好落在 DOM 树的前五层。
- 交互截图：每个动作在新浏览器上下文中分别打开源 iframe 与本地预览，对每个真实可见控件逐一覆盖 hover、focus、click、文本填充、Enter/Space press 及适用的 select/toggle/expand/menu/tab/drag/upload/download；同构控件也分别保留 before/after，不以代表案例代替。只读的 `progressbar`、`status`、`banner` 等 ARIA 角色参与语义树比较，但不冒充可操作控件。CSS 隐藏控件不计入当前视口的结构数量或动作清单。
- 状态路径：先核对初始可见控件，再实际触发会显露新控件的状态，给新状态单独命名并重做逐控件 before/after。当前明确覆盖日志运行中 Stop、离开底部的 Jump，以及失败重试排队后的 Cancel retry；后续变体若发现新状态路径，须在审计程序中补充场景与完整性门禁，不能只凭初始 DOM 宣称所有反馈已覆盖。每个新场景同样跑四视口、两主题，取消/撤销还须核对是否返回原态。
- 反馈比较：对静态图和交互图计算尺寸差、归一化 MAE/RMSE、变化像素比例，并比较源/本地交互前后反馈幅度。
- 验收门禁：八组静态快照、全部真实可见动作及其成对截图必须齐全；可见控件的形态与状态、根尺寸、截断/水平溢出、页面错误、动作状态与截图反馈逐项通过。机器门禁通过后仍是 `needs-review`；逐一人工并排核对八组图、查看每类动作的反馈及自动逐案报告，再对单个变体显式签核，才可成为 `passed`。绝不能把一个变体的通过推断成分类或全部 300 个通过。

Agent Approval 1 还显式覆盖 `inline-request-open`：真实点击 Show request 后，逐一回放 Hide request、Reject、Delete 12 projects 的指针与键盘动作，以及可聚焦请求代码块的 hover、focus、左右方向键和 Home/End 滚动，核对卡片替换、后续消息和非视觉播报。展开/收起/Escape 与两种初始状态下的决策均须保留独立证据；不能用关闭态的按钮测试替代打开态。
该场景准备时先让触发器的原生滚动稳定，再展开。动作内部的自动滚动/聚焦完成后再发送点击或按键，每次动作后还需确认滚动偏移连续四帧不再变化；操作前截图仍在这些动作之前采集，保留完整滚动反馈。不能把键盘平滑滚动的中间帧或隐式 scroll/click 的事件竞争当作稳定反馈。

Agent Approval 2 的 `diff-request-open` 独立覆盖 Hide diff、Reject、Always allow、Approve 和可聚焦差异代码区。原版 Show diff 追加代码而不隐藏摘要；三种决策分别改变状态、替换操作区并提供不同播报，不能合并为统一的 disabled 按钮状态。完整矩阵为每组 22 个初始动作与 29 个展开态动作，共 408 个案例；两个审批变体均等待原生滚动稳定。新增此场景的交互协议版本为 23，旧版本结果必须重新验证，不自动继承签核。

## 命令

```powershell
# 故障注入验证本地资源门禁；测试 fixture 不替代真实原版截图
bun scripts/verify-reactbits-audit-readiness.ts

# 只发现并校验 React Bits Pro 的 38/300 清单
bun run app-ui:reactbits:discover -- --output artifacts/reactbits-pro-visual-audit/all

# 选定变体做四视口×双主题静态截图
bun run app-ui:reactbits:capture -- `
  --variants hbar-app-ui-card-11 `
  --output artifacts/reactbits-pro-visual-audit/card-11 `
  --workers 2

# 同一变体做所有视口/主题的真实交互 before/after 截图
bun run app-ui:reactbits:interactions -- `
  --variants hbar-app-ui-card-11 `
  --output artifacts/reactbits-pro-visual-audit/card-11

# 生成 structure-report.json、visual-report.json 和交互差异图
bun run app-ui:reactbits:compare -- --output artifacts/reactbits-pro-visual-audit/card-11

# 人工逐一核对后，为单个机器通过的变体签核；--note 写明实际查看的边界与反馈
bun scripts/reactbits-pro-audit.ts review `
  --variants hbar-app-ui-card-11 `
  --output artifacts/reactbits-pro-visual-audit/card-11 `
  --note "逐一核对八组静态图、窄宽度溢出和所有动作反馈报告"

# 对全部 300 个变体生成机器证据；--strict 会等待每个变体的人工签核才最终通过
bun run app-ui:reactbits:audit -- --output artifacts/reactbits-pro-visual-audit/all --workers 2 --strict
```

`--variants` 接受本地 ID（例如 `hbar-app-ui-card-11`）或源 ID（例如 `card-11`），
`--categories` 可以只跑一个分类；`HBAR_APP_UI_REFERENCE_URL`、
`HBAR_APP_UI_PREVIEW_URL` 和 `HBAR_APP_UI_CHROME_PATH` 可用于切换参考地址、本地预览地址
和 Windows Chrome 路径。
大量冷上下文回放优先验证已构建预览：先运行 `bun run app-ui:build`，再启动
`bunx vite preview --config apps/hbar-app-ui-preview/vite.config.ts --host 127.0.0.1 --port 5181`，
将 `HBAR_APP_UI_PREVIEW_URL` 设为该地址；切换后仍须重新采集和核对静态画面，不假定开发/生产 CSS 完全相同。
若自动测试 Chrome 的文档传输持续停在空白 loading，而同页的普通浏览器/HTTP 请求正常，
可在独立诊断确认后显式设置 `HBAR_APP_UI_CHROME_HTTP1=1`，关闭测试浏览器的 HTTP/2 与 QUIC。
它只切换传输协议，不替代真实 iframe、不开启离线模拟，也不跳过主题、内容或交互就绪检查。
单变体调试可用 `--source-inventory <已捕获清单路径>` 避免每次重新访问 38 个类别页；
此模式仍实时捕获变体 iframe，完整 `audit` 不复用旧清单。`--local-only` 的缓存还必须包含
iframe 实际画布宽高、舞台 padding 和当前完整根节点采集协议版本；旧的内部 pane 裁剪缓存会被拒绝，不能据此宣称几何或交互验收通过。
捕获、交互和比较必须使用同一输出目录、同一 `--variants` / 视口 / 主题集合与源清单；
`--cases` 仅用于精确调试，结果标记为 `selected-cases`，不能产生完整交互通过结果。
`review` 每次只签一个明确 ID，不接受批量自动签核；必须先完成完整矩阵并运行 `compare`。
签核存于被 Git 忽略的 `manual-review.json`，绑定本地实现、源目录、八组原始截图内容、
所有动作结果与逐案视觉反馈。原图或反馈变化会使签核失效并回到 `needs-review`；
代码或源目录变化还会使机器证据过期，必须重新采集与回放，状态为 `needs-fix`；
`--strict` 在人工签核缺失时也会失败，不把机器绿灯当作完成。
交互回放按源目录、画布、本地变体及实现哈希、本地预览地址和浏览器传输参数校验断点：相同运行可续跑，修改组件、宿主 fixture
或预览实现后必须选新输出目录重新捕获。`--workers` 是有界并发选项；在单变体内也可并行不同动作，
但每个动作仍有独立上下文；多变体运行时并发预算在变体之间分配，不把所有动作默认为串行。

## 结果阅读

### 每个变体的人工结构与状态核对

机器比较之前，先在真实 iframe 里记录以下内容；不要根据单张静态图推断后续状态：

1. **文本与层级**：确认段落、标题、具名区域、连续文本、状态点与时间的归属。区别正常换行与原版明确的单行省略，检查它们是否改变动作后的内容高度与滚动位置。
2. **内部断点**：使用 iframe 的实际可用宽度核对 padding、按钮分组、换行和字体度量；断点有歧义时，在断点两侧读取计算样式，不把文档外窗尺寸当成组件宽度。
3. **滚动归属**：分别确认外层画布、组件内容 pane 和内部代码/列表的滚动边界。操作前后记录哪个容器移动、哪些内容保持可见，以及缩短内容后浏览器如何夹紧滚动位置。
4. **覆盖层**：检查真正的浮层和滚动边缘渐隐，包括透明度、指针穿透、显隐触发条件。只有实际证实的覆盖关系才可采用定位，不能把正文改成坐标布局。
5. **第二状态**：展开后重新发现控件，不能只核对按钮。可聚焦代码块、取消入口和新出现的菜单都需要独立案例；原版在 scroll、resize、内容变更时的反馈也必须实际触发后确认。
6. **决策结果**：在展开前后分别执行确认、拒绝、取消/恢复，核对整块内容的替换、后续消息、非视觉播报、Tab 顺序和 hover/focus 对比度。

Agent Approval 1 的具体检查发现了 640px 内部 padding 断点、可聚焦请求块、结果摘要省略及滚动边缘覆盖层。
这些是该变体的观察结果，不是可套用到其余 299 个变体的默认规则。其完整矩阵包含每组 17 个初始动作和 24 个展开态动作，即四视口×双主题共 328 个案例；调试子集通过仍不构成签核。

### 证据文件

- `source-inventory.json`：真实页面清单和本地注册表的映射证据。
- `capture-manifest.json`：每个 `source`/`local` 截图和快照的 1:1 记录。
- `structure-report.json`：根节点尺寸差、树节点/标签序列、控件数量、文本容量和溢出结果。
- `visual-report.json`：静态配对、交互配对、差异图片路径，以及每种交互源/本地反馈幅度。
- `interactions/<variant>/<theme>/<viewport>/<case>/{source,local}/`：可人工打开的真实 before/after 截图和快照。
- `evidence.html`：按变体、主题、视口、案例展开的成对截图页；静态两图与每个动作的四张 before/after 分开呈现，点击查看原分辨率。缺图明确显示 Missing capture，不把图集当作通过签核。
- `manual-review.json`：逐变体人工签核的说明、时间、覆盖数量和证据指纹；不能替代原始截图。
- `review-ledger.json`：每个已审变体的八组静态和交互覆盖、缺项、失败原因与最终状态；未跑或只跑部分案例为 `needs-fix`，机器完整但未签核为 `needs-review`。

源颜色和本地颜色不强制像素一致；本项目保留 Lumen monochrome/glass token。门禁关注的是
DOM/ARIA 语义、内容容量、流式布局、响应式边界和交互反馈是否与源变体同构。发现差异后，
先用报告中的实际源结构更新宿主内容契约，再修改 Lumen 组件，最后重跑同一个变体的完整矩阵。
遇到参考页自行计时/滚动时，只能在经真实前后截图证实的具体变体内分离自主变化与控件反馈；
不得全局降低视觉阈值或忽略状态跃迁。每个结构修正和经完整反馈复核的子功能分别验证、检查暂存差异、
独立提交；保留原始差异图和未通过记录直至该变体重新通过。

例如 Agent Activity 5 的日志会自动追加至 26 行：静态比较先等待原版与本地都完成并滚到底；
运行中的 Stop 必须在新上下文中记录原版实际停于第 24 或 25 行，再让本地停于同一行数；冻结浏览器计时后分别截图并执行真实指针、
Enter、Space、hover、focus；滚离底部后出现的 Jump to latest 则是另一组独立控件案例。
点击前须确认 Stop 仍可见，原版指针点击还须记录受信任的原生事件。定时新增日志或加载时刻造成的
差异不能冒充交互反馈；较矮 iframe 对超高内容的裁切也须映射到本地隔离画布，不能让本地画布自行滚动、
把整张图的位移冒充 Jump 反馈。此类变体状态需要分别核对所有视口和主题，而非只测最终静态状态。
运行态末行必须包含完整消息，动作前后行数与末行内容保持稳定；原版半提交或回滚的日志不能被当作
Stop 的反馈。断点续跑只复用源／本地状态一致且图片、快照齐全的通过案例，失败案例必须重采。

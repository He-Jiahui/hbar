# 2026-09-19：组件现状审计、Prompt 与表单控件修复

上级：[UI 总计划](index.md)。对应 R0.1、R1.2a、R1.3。此记录区分已验证修复和待实施的整页重设计。

## 1. 环境与证据范围

- 初始代码 HEAD：`de1cb95`；组件库已有大量用户未提交修改，已保留。
- 本轮代码修复：`8408735`，仅包含 Composer.css、独立生产组件预览、fixture、视觉脚本与生产 E2E 截图断言。
- 本轮浏览器：本地 Chrome headless 组件审核、Playwright Web E2E；没有使用真实付费模型。
- 独立输入组件：中英文×浅深色×1440/1024/390/320，共 16 个常规组合；另有附件、长输入、错误、运行和禁用 5 个场景。
- 修复前后各 21 张截图和几何报告，另有真实 Host fixture 生产会话截图。本轮没有执行新的 Tauri 实窗审核，也没有采集 cc-haha 当前运行版本。

此前已看的 cc-haha 产品图来自其仓库 `docs/images/app/zh-CN`，相关图片提交 `107bfc86`（2026-07-31）。这些参考用于确定空间和层级，不冒充本轮实时浏览器截图。

## 2. 已复现问题与根因

**症状：** 独立生产入口的深色 Prompt 出现白色原生 textarea；文字使用默认 monospace；添加附件按钮约 30×23 CSS px，发送约 32×25。其他模型按钮已有组件样式，造成同一工具行风格和尺寸不一致。

**证据：** `before/report.json` 记录 textarea 背景 `rgb(255, 255, 255)`、边框 `1px`、字体 `monospace`。截图直接展示白色输入区及灰色原生按钮。

**历史：** `4c0465f` 引入受控 Composer 的布局样式，但没有提供完整控件外观；旧工作台仍可能提供补充规则。`6ec3b46` 替换旧外壳后，这种样式依赖暴露。已证实的是组件独立样式不完整；历史正常截图不足，不能把全部 UI 问题都归因于单个提交。

## 3. 修复与二次看图

- 输入框显式使用主题文字、透明背景、继承字体和无内层原生边框；保留清晰键盘焦点。
- 输入、按钮和附件采用 scoped box-sizing；长输入有最大高度和内部滚动。
- 发送、停止、附件、移除按钮使用一致最小 `2.25rem` 点击区域；发送强调色与停止危险色分开。
- 工具行按正常 flex 流换行；长模型标签可换行，附件名称省略并保留完整 title；移除按钮不被挤走。
- 错误在输入附近显示，主题/禁用状态保持可读。

第一轮截图中发送/停止仍丢失强调背景。人工检查后发现共同 `:is(...)` 选择器含 `.attachment-chip button`，导致 specificity 高于独立 tone 规则。已改用低优先级共同规则，并补“主操作背景不能透明”的回归断言。此问题说明几何和行为通过仍不足以完成视觉验收。

## 4. 本地截图入口

图片属于忽略的 artifacts，当前工作区可打开；全新 clone 需要运行脚本生成 after。before 需保留证据或在隔离历史版本重建。

快速查看：[窄屏修复前后对照](../../artifacts/ui-redesign/prompt/comparison.png)、[21 场景截图索引图](../../artifacts/ui-redesign/prompt/after-contact-sheet.png)。索引图用于整体浏览，细节判断仍查看原始截图。

| 证据       | 修复前                                                                             | 修复后                                                                           |
| ---------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 浅色桌面   | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-light-1440.png)           | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-light-1440.png)           |
| 深色窄屏   | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-dark-320.png)             | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-dark-320.png)             |
| 附件长名称 | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-dark-320-attachments.png) | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-dark-320-attachments.png) |
| 运行/停止  | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-dark-320-running.png)     | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-dark-320-running.png)     |

[生产会话完整截图](../../artifacts/ui-redesign/prompt/production-session.png)证明修复已进入真实生产组合，同时仍显示旧外壳、竖排工具按钮和大块 Usage；不能将这张图描述为重设计完成。

## 5. 验证结果

| 检查                                       | 实际结果                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `bun scripts/verify-hbar-app-ui-prompt.ts` | 21 场景通过；0 pageerror；溢出、点击区域、输入外观、焦点、IME、发送、停止、附件移除通过 |
| before/after 人工看图                      | 检查浅色桌面、深色窄屏、中英文长标签、附件、错误、运行状态；修正第一轮 tone 问题        |
| flow/content/icon guards                   | 通过本次修改样式与新增预览入口检查                                                      |
| `bun run check`，Node heap 8 GiB           | 通过 lint、typecheck、366 tests、2853 assertions                                        |
| `bun run build`                            | 通过，2387 modules                                                                      |
| `bun run test:e2e`                         | 5 tests 通过；新增生产截图断言后重跑 connected 场景通过                                 |
| Prettier / git diff checks                 | 本次明确文件通过                                                                        |
| Tauri 实窗、cc-haha 实时截图               | 本轮未执行，不计为通过                                                                  |

## 6. 仍待修复的问题账本

| ID    | 证据/发现                                        | 影响                                        | 归属任务       |
| ----- | ------------------------------------------------ | ------------------------------------------- | -------------- |
| UI-01 | 当前生产截图竖排五个大工具按钮                   | 抢占横向空间，导航层级不清                  | R2.3/R4.1      |
| UI-02 | Usage 大标题、大卡片和空白图表区域               | 输入区/统计挤压消息                         | R1.5/R3.4      |
| UI-03 | 窄屏外壳把侧栏和底部按钮叠在内容上方             | 首屏有效信息少                              | R2.6           |
| UI-04 | 单 focusedPanelId 决定整个主页面                 | 工具替换聊天，返回上下文不完整              | R2.1/R2.2      |
| UI-05 | 通用 Schema 设置页面仍使用旧 renderer 和页面结构 | ProviderEditor 已迁移，其余表单视觉仍不统一 | R5.1/R5.3      |
| UI-06 | 文件行灰色原生按钮及重复标题                     | 与组件库其他控件不一致                      | R1.5/R4.2      |
| UI-07 | 命令目录占整页并突出 raw JSON                    | 任务上下文中断，结果难扫描                  | R5.8           |
| UI-08 | Web 入口与 document.css 固定 dark                | 主题能力与组件预览不一致                    | R1.1           |
| UI-09 | 多个 Shell/目录变体/受控组件并存                 | 易再次选错实现或叠加壳                      | R0.2/R2.3/R6.2 |

UI-01–09 是待办，不因 Prompt 的修复或全库检查通过而关闭。后续每个修复增加自己的证据与 commit，避免把“已规划”写成“已实现”。

## 7. R1.3 表单控件视觉与交互验证

`hbar-app-ui` 生产入口已公开受控的 Field、Input、Textarea、Select、CheckBox、ComboBox 和 MultiSelect。字段文案、说明、错误、空态、加载态、选项和移除标签均由宿主提供；Field 通过 context 把说明/错误 ID 和 `aria-invalid` 关联到实际控件。ComboBox 支持宿主控制的查询、展开、动态结果、加载态和分页动作；MultiSelect 保留重复去重后的选择与已失效 ID，允许增删多个思考等级。

独立浏览器入口覆盖中英文、浅深色、1280/390 宽度，以及错误、长文本、禁用、加载和展开列表，共 13 张截图。几何报告中的桌面控件宽度为 319/654 CSS px，窄屏为 332 CSS px；输入和选择控件高度为 37.59–38 CSS px，所有控件均在面板和视口内，无横向溢出，0 pageerror。

第一轮实际交互发现复选框的透明原生输入只有 1px，装饰图标截获点击。最终改为完整 18px 原生 checkbox 直接参与 flex 流，不再叠放透明输入与装饰层；重新执行 13 个截图场景后，复选框点击、ComboBox 键盘检索/选择/关闭、MultiSelect 增删、焦点可见性和禁用状态全部通过。

人工查看了[深色桌面](../../artifacts/ui-redesign/form-controls/zh-CN-dark-1280.png)、[浅色窄屏](../../artifacts/ui-redesign/form-controls/en-US-light-390.png)、[展开列表](../../artifacts/ui-redesign/form-controls/zh-CN-dark-1280-open.png)、错误、长文本和加载截图。字段层级、双列到单列的流式换行、错误就近呈现、多选标签容量和弹层边界符合当前目标。此处只关闭通用控件任务；ProviderDialog、Schema renderer 和设置页面组合仍属于 R5.1–R5.3。

## 8. R5.2 ProviderEditor 结构化页面

本切片将原来的扁平 Schema 表单替换为命令驱动的结构化 ProviderEditor。参考证据包括 cc-haha 的[侧栏布局](../../../cc-haha/img_preview/layout_adj.png)、[模型选择层级](../../../cc-haha/img_preview/models.png)及其设置页与供应商编辑器；复刻目标是紧凑设置页的信息层级、模型选择与详情的父子关系，不复制其具体业务字段或坐标。

修复前的[生产截图](../../artifacts/web-b3/provider-dialog.png)中，供应商配置是单列长表单：模型只有一个扁平 ID，能力和价格与供应商连接字段混排，页面外层还有大圆角卡，无法表达“一个供应商包含多个模型”。新的页面将内容分为连接、凭据、模型列表和所选模型详情；新增供应商先搜索 PI 预设，编辑时可以从相同协议和地址的目录继续增加模型。供应商和模型可分别隐藏，模型可设为默认并维护多选思考等级。所有写操作仍通过 `providerEditor.*` 命令，API Key 不进入只读状态投影。

第一轮截图发现两个实际布局问题：390 宽度时 flex 主区被压缩后允许正文越过固定 footer 绘制；1024 宽度的模型区位于内部滚动区域，首屏截图没有覆盖。修复后由主区独占滚动、header/footer 保持在各自流中，并增加滚动后的模型区截图和主区/footer 几何断言。另一项看图修正是隐藏初始空表单的全量红色校验，只在相关草稿路径被编辑后就近显示错误。

| 场景       | 截图与人工观察                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新增空态   | [1440](../../artifacts/ui-redesign/provider-editor/after/add-desktop-1440.png)：必填标记可见，初始未触碰字段不显示错误，模型空态与自定义入口明确                                                                                     |
| 预设展开   | [1440](../../artifacts/ui-redesign/provider-editor/after/add-preset-open-1440.png)：精确的 OpenAI 结果置顶，长地址截断，弹层未被相邻区域裁切                                                                                         |
| 多模型编辑 | [1440](../../artifacts/ui-redesign/provider-editor/after/desktop-1440.png)：GPT-4 与 GPT-5.4 同时可见；默认模型、价格、能力和多个思考等级可扫描                                                                                      |
| 中等宽度   | [顶部](../../artifacts/ui-redesign/provider-editor/after/tablet-1024.png)、[模型区](../../artifacts/ui-redesign/provider-editor/after/tablet-1024-models.png)：连接/凭据/模型按单列流排列，footer 不覆盖滚动内容                     |
| 窄屏       | [顶部](../../artifacts/ui-redesign/provider-editor/after/mobile-390.png)、[模型区](../../artifacts/ui-redesign/provider-editor/after/mobile-390-models.png)：操作保持可达且无横向溢出；外层侧栏仍占据首屏 40dvh，继续归属 UI-03/R2.6 |
| 删除确认   | [1440](../../artifacts/ui-redesign/provider-editor/after/delete-confirm-1440.png)：使用原生 modal 顶层、明确目标和危险动作；Escape 关闭后焦点恢复到触发按钮                                                                          |

验证结果：17 个定向 Bun 测试与 153 个断言通过；全仓 TypeScript 类型检查通过；本切片 ESLint、flow/content/icon guards、Prettier 与 `git diff --check` 通过；Web production build 通过（2390 modules）；真实 Host 的 connected Playwright 场景通过。E2E 实际执行预设搜索、OpenAI 选择、从目录加入 GPT-5.4、设为默认、保存凭据、三视口滚动和删除确认焦点恢复。截图已逐张人工查看。本切片没有执行 Tauri 实窗，因此不把桌面平台视觉矩阵记为完成。

## 9. R1/R2 AppShell 与工程会话侧栏

本切片用 `hbar-app-ui/workbench` 的公开壳层契约重建应用骨架。AppShell 现在明确拥有 sidebar、header、main、tool 和 overlay 插槽；AppSidebar 只负责品牌区、主操作、独立滚动的工程会话树和底部状态区。`app-react` 读取 `presentation.sidebarOpen`，所有展开/收起、打开命令、状态、设置、扩展和选择会话仍通过公开命令完成。树本身的工程折叠属于局部 UI 状态。

视觉层级参考了 cc-haha 的[侧栏布局](../../../cc-haha/img_preview/layout_adj.png)和 JetBrains 工作台的边界关系。当前实现按本项目计划保留顶部“新建会话”和命令入口，将工程与会话树作为唯一伸缩滚动区，把只读服务状态和管理入口固定在底部。扩展管理暂时保留为较低优先级入口，待设置页面增加正式的扩展分组后迁入设置。

第一轮真实截图验证了旧 UI-03 的根因：旧 CSS 在窄屏把侧栏设为 `40dvh` 并与正文上下堆叠。新壳层在小于 64rem 时把侧栏作为真实抽屉覆盖层，默认显示完整正文；选择会话或导航到页面后自动收起。1024 宽度仍使用桌面侧栏，390 宽度使用 17rem 抽屉和右侧关闭区域。流式布局守卫原来只识别 modal/menu；本切片让守卫按技能文档同时识别 sidebar/tool drawer，并补了自测。

| 场景           | 截图与人工观察                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 离线桌面       | [中文 1440](../../artifacts/ui-redesign/shell/sidebar-zh-CN-1440.png)：主操作、工程树、服务状态和管理入口分区清楚；主页面不再继承壳层大 padding                                                                                     |
| 离线窄屏       | [正文 390](../../artifacts/ui-redesign/shell/content-en-US-390.png)、[抽屉 390](../../artifacts/ui-redesign/shell/drawer-en-US-390.png)：正文首屏完整；抽屉覆盖而不挤压正文，背景点击区可关闭                                       |
| 真实 Host 桌面 | [1440](../../artifacts/ui-redesign/shell/connected-sidebar-1440.png)：工作区、会话、更新时间、选中态和连接状态来自 Host 数据                                                                                                        |
| 真实 Host 中宽 | [1024](../../artifacts/ui-redesign/shell/connected-sidebar-1024.png)：侧栏与主页面保持边界，无横向页面溢出；同时暴露会话工具栏文字竖排，继续归属 UI-01                                                                              |
| 真实 Host 窄屏 | [正文 390](../../artifacts/ui-redesign/shell/connected-content-390.png)、[抽屉 390](../../artifacts/ui-redesign/shell/connected-drawer-390.png)：切换到窄屏自动收起，抽屉中的活动会话和底部入口可达；聊天头部裁切继续归属会话页重构 |

验证结果：全仓 ESLint（Node heap 8 GiB）、TypeScript、375 个 Bun 测试（2931 个断言）、flow/content/icon guards、Prettier 和 Web production build 通过；离线四组合 E2E 与真实 Host connected E2E 共 5 项通过。截图逐张人工查看。UI-03 在 Web 壳层关闭；UI-01、UI-02、UI-04 和各业务页面视觉问题没有因壳层修复而关闭。

## 10. R2 主页面、工具与模态出口

Web 组合根不再用 `focusedPanelId` 串行决定全部可见内容。`presentation.page` 只选择 session/settings/status 主页面，`toolInstanceId` 选择 files/monitoring/agents/goals 工具，`modalInstanceId` 选择 commands/settings-editor。AppShell 的 tool 和 overlay 插槽进入实际组合；工具组件读取明确 instanceId，因此打开命令模态不会让工具误读焦点目标。该切片当时仍以兼容模态呈现扩展管理；第 19 节已用设置内分组取代这一过渡状态。

命令目录和供应商编辑器使用 `hbar-app-ui` 原生 `<dialog>` 顶层。组件新增 chromeless 模式，让内部页面保留自己唯一的一套标题和动作，同时由原生 dialog 提供 inert 背景、焦点圈定、Escape 和关闭后焦点恢复。真实交互发现内层删除确认的 `cancel` 会冒泡并关闭外层供应商编辑器；NativeDialog 现已在处理 cancel 后停止传播，重新执行 Escape 后只关闭确认层并把焦点还给“删除供应商”。

| 场景          | 截图与人工观察                                                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 命令模态      | [1440](../../artifacts/web-b4/command-palette.png)、[390](../../artifacts/ui-redesign/outlets/command-en-US-390.png)：底层会话保留且 inert，目录和参数区在自身范围滚动；窄屏保持单列                                                                                                          |
| 供应商模态    | [1440](../../artifacts/ui-redesign/provider-editor/after/desktop-1440.png)、[390](../../artifacts/ui-redesign/provider-editor/after/mobile-390.png)：设置页保留在底层，编辑器标题/操作不重复，内层删除确认可独立关闭                                                                          |
| 扩展兼容模态  | [1440](../../artifacts/web-b5/extensions.png)：会话留在底层；插件列表拥有独立滚动范围，待 R5 迁入设置分类                                                                                                                                                                                     |
| 工具并排/抽屉 | [1440](../../artifacts/web-b5/file-manager.png)、[1024](../../artifacts/ui-redesign/outlets/files-1024.png)、[390](../../artifacts/ui-redesign/outlets/files-390.png)：聊天实例持续存在，宽屏并排、中宽右侧抽屉、手机全宽单面板；文件工具内部仍同时挤入列表与编辑器，继续归属 R4 文件工具重构 |

E2E 明确断言工具打开时会话标题仍存在、status 主页面替换会话、命令/供应商/扩展具有 dialog 语义、供应商底层设置页仍存在、关闭后返回原上下文。UI-04 在 Web 组合根关闭；兼容 `focusedPanelId` 只为尚未迁入设置的扩展入口保留，不能新增依赖。

验证结果：全仓 ESLint（Node heap 8 GiB）、TypeScript、376 个 Bun 测试（2938 个断言）、flow/content/icon guards、Prettier 和 Web production build 通过；5 项 Playwright 场景通过。真实 Host E2E 覆盖四类工具切换、三个管理页分区、命令模态、扩展兼容模态、供应商模态和嵌套删除确认的 Escape/焦点恢复。

## 11. R3 会话页、时间线与紧凑用量

会话页现在只保留一个 PageHeader：标题使用 Session 名称，上下文显示工作区，右侧五个图标动作分别通过 `app.openPanel` 或 `app.openSettings` 命令打开文件、监控、子 Agent、目标与计划和 Session 设置。打开中的工具有选中反馈，再次点击同一动作通过 `app.closePanel` 关闭。旧的竖排文字工具栏已经删除；组件为每个图标保留宿主提供的 tooltip 和可访问名称。

`hbar-app-ui` 的 Conversation 新增可组合 header 和 afterMessages 插槽。生产页面隐藏组件的重复标题，但保留 section 的可访问名称；Message、Activity、Approval 和 Questionnaire 进入同一个独立滚动时间线。消息正文与输入区都使用 52rem 上限的阅读列，用户消息使用较窄的弱背景块，助手消息保持全文宽度。原来头像文本和作者文本重复显示成 “You You” 的问题通过 Conversation 自身样式修复。

CompactUsage 新增真正的 `inline` 密度：Session 只显示总 token、剩余预算、预计金额和 token 速率，不再渲染大标题、sparkline、进度条和四项统计卡，也不再由 app-react 的后代选择器隐藏组件内部元素。输入/输出 token 的详细拆分继续位于 Monitoring。运行活动从 composer 上方移入时间线后，composer 只承载提示词输入和最多两行的用量摘要。

| 场景             | 截图与人工观察                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 真实 Host 空会话 | [1440](../../artifacts/ui-redesign/session/after/desktop-1440-empty.png)：单一标题栏、五个横向图标、空态、输入和两行用量没有重复壳层  |
| 真实 Host 有消息 | [1440](../../artifacts/ui-redesign/session/after/desktop-1440.png)：用户/助手消息、Agent activity 和输入区共用阅读列；活动属于时间线  |
| 中等宽度         | [1024](../../artifacts/ui-redesign/session/after/tablet-1024.png)：标题与工具保持一行，旧竖排栏消失，消息与输入未被侧栏挤坏           |
| 窄屏             | [390](../../artifacts/ui-redesign/session/after/mobile-390.png)：应用栏、页面标题、五个图标、消息、活动、输入和两行用量均在视口内     |
| 工具并排         | [1440](../../artifacts/web-b5/file-manager.png)：文件图标选中且 Session 保持可见；同时再次确认 File Manager 内部两列挤压问题属于 R4.2 |

Playwright 除业务闭环外还量化断言：1440、1024、390 三个宽度下五个页面动作必须位于同一水平行且 `writing-mode` 为 horizontal，PageHeader 不得横向溢出，Conversation 时间线与 composer 左右边界误差不超过 1 CSS px，inline Usage 高度不超过 48 CSS px。三档截图均逐张查看；没有用测试通过替代人工看图。

本切片关闭 UI-01 和 UI-02。R3.2 的 Plan 归属、R3.5 的长历史滚动锚点/流式快速切换/断线恢复仍未完成。文件工具在 24rem 抽屉中把列表和编辑器并排导致文件名逐字断行，是当前最明显的生产视觉缺陷，继续归属 R4.2。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；379 个 Bun 测试、2960 个断言通过；Web production build 与 Usage 独立预览验证通过；flow/content/icon guards、Prettier 和 `git diff --check` 通过；Playwright 离线中英文桌面/窄屏与真实 Host connected 场景共 5 项通过。真实场景执行了文件、监控、子 Agent、目标与计划、Session 设置、发送、审批、取消和各页面返回路径。

## 12. R4.2 文件工具列表与详情

真实截图确认旧文件工具的故障不是单个文字换行问题：24rem 抽屉内同时放置最小 14rem 的目录列和编辑器，剩余详情宽度接近一个字符；工具自身又按内容宽度收缩，没有填满 AppShell 的 drawer。旧页面还同时显示外层 “File manager”、组件内 “File manager”和空详情，形成重复标题与无效区域。

文件工具现在使用明确的 `browser/document` 子视图。`fileWorkspace.openEntry` 打开目录时进入 browser、打开文本时进入 document；新增 `fileWorkspace.showBrowser` 只切回列表并保留当前文档草稿。文件读取使用 generation，返回列表后到达的旧读取结果不能重新打开详情。所有切换继续经过命令注册与只读状态投影，React 没有直接改运行时状态。

WorkspaceFiles 的 embedded 形态移除重复标题与路径，文件行使用组件自己的紧凑按钮、语义图标、hover/focus 和省略规则。FileDocument 显示 basename、完整路径 tooltip、返回、刷新、编辑状态和 footer；工具内容明确占满 drawer。未保存时刷新被禁用。保存冲突继续显示编辑器并保留草稿，用户选择“重新加载源文件”后还需在原生 dialog 中确认“丢弃并重新加载”；确认动作捕获原文件路径。非 UTF-8、过大和已删除文件使用宿主本地化原因，不伪装成可编辑文本。

| 场景     | 截图与人工观察                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面列表 | [1440](../../artifacts/ui-redesign/file-tool/after/list-1440.png)：目录与文件使用完整 24rem 工具列，页面标题不重复                                                               |
| 桌面详情 | [1440](../../artifacts/ui-redesign/file-tool/after/document-1440.png)：返回、basename、编辑器和保存状态在同一单面板层级                                                          |
| 中等宽度 | [列表](../../artifacts/ui-redesign/outlets/files-1024.png)、[详情](../../artifacts/ui-redesign/file-tool/after/document-1024.png)：右侧 drawer 被内容完整填充，聊天保留在背景    |
| 窄屏     | [列表](../../artifacts/ui-redesign/outlets/files-390.png)、[详情](../../artifacts/ui-redesign/file-tool/after/document-390.png)：工具占满 390px 单面板，列表和编辑器不会同时出现 |

Playwright 在三档宽度分别断言工具 workspace 与 AppShell drawer 的四条边误差不超过 1 CSS px、没有内部横向溢出，并逐次检查 `data-view` 只能为 browser 或 document。真实 Host 流程打开、编辑、保存、返回列表后再次在 1024/390 打开相同文件；运行时测试验证保存期间的新编辑不会被旧回执覆盖、冲突保留草稿、返回列表不清除草稿。R4.2 关闭；二进制/过大文件由现有 Host 读取错误进入明确不可编辑状态，当前没有虚构二进制预览器。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；379 个 Bun 测试、2968 个断言通过；Web production build、File Manager 独立预览的滚动/窄屏/本地化验证、flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过并重新生成、逐张查看以上真实 Host 截图。本节结果取代第 10、11 节中“文件工具内部仍待 R4.2 修复”的旧状态记录。

## 13. R4.3 当前会话 Monitoring

旧 Monitoring 使用通用 MetricStrip 大卡片一次展开 6 项摘要、2 项延迟和 6 项执行指标；24rem 工具中的 unavailable 说明被放大并折成多行，标题和文字关闭按钮也占用大量首屏。数据虽然来自可靠的 Usage 投影，信息层级却让所有数字同时抢占注意力。

`hbar-app-ui/workbench` 现在提供宿主数据驱动的 CompactMetrics 与 BarSeries。前者用普通 flex 流显示标签、值和可选 detail，不包含页面业务文案；后者根据有限数值自行归一化，忽略非有限值并呈现宿主标签。Session Monitoring 默认只展开总 token、费用、速率、运行/尝试、缓存以及 token 时间线；延迟、执行统计和模型用量使用原生 `details` 按需展开。空报告与单项 unavailable 分为长空态和短值，不再把说明句塞入每个指标。

页面标题、说明和图标关闭动作缩成工具头，内容明确占满 drawer。Usage gap 继续以就近状态条显示。组件只读取 `controls.usage`，没有按 Session 推算无法证实的 CPU，也没有创建第二份统计状态。

| 场景       | 截图与人工观察                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面默认态 | [1440](../../artifacts/ui-redesign/monitoring/after/desktop-1440.png)：摘要和 token 时间线位于首屏，三组次级详情保持收起              |
| 桌面展开态 | [1440](../../artifacts/ui-redesign/monitoring/after/desktop-1440-expanded.png)：执行统计在原位置展开，页面继续由一个工具滚动区承载    |
| 中等宽度   | [1024](../../artifacts/ui-redesign/monitoring/after/tablet-1024.png)：24rem drawer 被内容填满，指标保持双列紧凑排列                   |
| 窄屏默认态 | [390](../../artifacts/ui-redesign/monitoring/after/mobile-390.png)：全宽工具没有横向溢出，标题、摘要、时间线和折叠入口均可见          |
| 窄屏展开态 | [390](../../artifacts/ui-redesign/monitoring/after/mobile-390-expanded.png)：执行统计在单列阅读顺序中展开，值与标签没有被压成逐字换行 |

Playwright 在 1440、1024 和 390 三档宽度断言 Monitoring 工作区与 AppShell drawer 四条边对齐且无横向溢出，并读取每个时间桶的真实几何。当前 Host fixture 返回大量零值桶和最后一个非零桶，所以视觉上只有最右侧细柱；实测每桶宽度仍至少 1 CSS px，非零柱高度至少 8 CSS px。这是实际数据分布，不是用假数据填充的图形，也不是 CSS 收缩故障。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；380 个 Bun 测试、2980 个断言通过；Web production build 通过（2395 modules）；flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过。真实场景在三档宽度检查工具边界、溢出与时间桶几何，重新生成并人工查看默认态和展开态截图。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在后续集中验收中补齐。

## 14. R4.4 子 Agent 列表、创建与详情

旧页面在 24rem 工具列中永久并排创建表单和 Agent 列表，两侧还分别设置最小宽度。真实截图中列表只剩几个字符宽，任务目标、模型和操作被逐字竖排；大标题、说明、刷新和关闭文字按钮又挤占首屏。这个故障与 R4.2 文件工具相同，根因是把桌面双栏结构直接塞入狭窄工具区，而不是缺少单个换行样式。

Agent 工具现在由 `agentWorkspace.showList`、`agentWorkspace.showCreate` 和 `agentWorkspace.showAgent` 持有 `list/create/detail` 子视图及明确的 `selectedAgentId`。默认只显示可扫描列表；创建表单和单个 Agent 详情各自独占工具宽度。创建成功后使用 Host 返回的 `agentId` 进入详情，返回列表保留已创建实体；刷新详情时若目标已不存在，则回到列表。React 只读取 Zustand 投影并执行命令，没有用局部 state 复制业务视图或草稿。

创建页复用 `hbar-app-ui/forms` 的 Field、Input、Textarea 和 Select，模型默认值继续来自当前会话配置；任务、标题、模型、Token 预算、思考等级与审批模式仍由原有命令草稿持有。页面明确说明任务与预算属于当前会话下的新子会话。详情复用 CompactMetrics 显示父会话、模型、预算和创建时间；取消绑定当前 `agentId`，打开会话先成功执行 `app.setSession` 再关闭原工具，导航失败时不会先丢失当前上下文。

| 场景       | 截图与人工观察                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面空列表 | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-empty.png)：单一列表视图、紧凑图标动作与居中空态，旧创建栏不再常驻                          |
| 桌面创建   | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-create.png)：表单独占工具宽度，目标、模型和预算没有被第二列挤压                             |
| 桌面详情   | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-detail.png)：创建回执、状态、任务、归属指标、打开会话和取消作用于同一明确 Agent             |
| 桌面列表   | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-list.png)：返回后任务、状态、模型、预算与时间可在一行组内快速扫描                           |
| 中等宽度   | [1024](../../artifacts/ui-redesign/agents/after/tablet-1024-list.png)：右侧 drawer 被完整填充，列表不会与创建表单重新并排                                |
| 窄屏列表   | [390](../../artifacts/ui-redesign/agents/after/mobile-390-list.png)：全宽工具保留三项图标动作与完整任务摘要，没有横向页面溢出                            |
| 窄屏详情   | [390](../../artifacts/ui-redesign/agents/after/mobile-390-detail.png)：父会话使用可读的“当前会话”，本地化创建时间不再拆出孤立的 AM，两个目标动作保持可达 |
| 窄屏创建   | [390](../../artifacts/ui-redesign/agents/after/mobile-390-create.png)：六个字段和提交动作按单列自然滚动，844px 高度下完整表单可达                        |

Playwright 在 list/create/detail 每次切换后检查只存在一个对应主视图，并在 1440、1024 和 390 三档宽度断言 Agent 工作区与 AppShell drawer 四条边对齐且无横向溢出。真实 Host 流程创建预算为 5,000 tokens 的子 Agent，验证返回详情、返回列表、跨断点重开详情和重开创建表单。截图均来自重新构建的 production preview 并逐张人工查看；第一次视觉回归误读了旧 `dist/web`，在重建后重新执行并用新截图取代，未把旧产物作为结论。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；380 个 Bun 测试、2991 个断言通过；Web production build 通过（2395 modules）；flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过。真实 Host 场景完成创建、详情、返回列表和跨三档宽度重开子视图，以上八张截图均在最终产物上重新生成并人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在后续集中验收中补齐。

## 15. R4.5 Goal 摘要、编辑与 PlanEditor

旧 Goal/Plan 页面和旧 Agent 工具具有相同结构故障：24rem 工具列中永久并排最小 18rem 的 Goal 表单与 PlanEditor。真实截图里计划区只剩约一个单词宽，说明、步骤、状态和按钮逐字折行；三个大指标卡又占满 Goal 表单下方。页面无论用户是查看状态、编辑目标还是维护计划，都同时展开两套高密度编辑器。

运行时现在通过 `goalPlanWorkspace.showOverview`、`showGoalEditor` 和 `showPlanEditor` 持有 `overview/goal/plan` 子视图。overview 只展示 Host 返回的目标、预算使用、耗时、计划说明和步骤状态；Goal 与 Plan 编辑器按需独占工具宽度。返回 overview 保留未保存草稿，重新进入相应编辑器可以继续；切换会话仍按 panel instance 和 sessionId 隔离。所有字段、步骤移动/删除、保存、清除与未知结果核对继续经过既有命令，不在 React 内复制业务状态。

Goal 编辑复用 `hbar-app-ui/forms` 的 Field、Input、Textarea 和 Select；摘要复用 CompactMetrics 与 Status；Plan 编辑继续复用完整的 `HbarAppUiPlanEditor`，保留最多 100 步、稳定 stepId、状态编辑和 pane-scroll 契约。overview 的计划列表只读权威 `entry.plan`，不会把未保存草稿伪装成已提交计划。保存反馈留在所属编辑器，返回摘要后仍可确认；清除成功后分别显示目标/计划已清除，错误和未知状态继续就近呈现并允许刷新核对。

| 场景       | 截图与人工观察                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面空摘要 | [1440](../../artifacts/ui-redesign/goals/after/desktop-1440-empty.png)：无目标与无计划分别给出一个入口，不再常驻两套空编辑器                                         |
| 桌面 Goal  | [1440](../../artifacts/ui-redesign/goals/after/desktop-1440-goal.png)：目标、预算、状态和保存反馈独占完整工具宽度                                                    |
| 桌面 Plan  | [1440](../../artifacts/ui-redesign/goals/after/desktop-1440-plan.png)：计划说明、步骤字段、移动/删除、添加和保存保持在正常横向流中                                   |
| 桌面摘要   | [1440](../../artifacts/ui-redesign/goals/after/desktop-1440-overview.png)：目标指标使用紧凑两列，计划说明与步骤按阅读顺序排列，编辑与清除动作就近                    |
| 中等宽度   | [1024](../../artifacts/ui-redesign/goals/after/tablet-1024-overview.png)：24rem drawer 被完整填充，摘要没有恢复旧双栏                                                |
| 窄屏摘要   | [390](../../artifacts/ui-redesign/goals/after/mobile-390-overview.png)：目标、四项指标、计划步骤和两组动作在一个滚动流中完整可见                                     |
| 窄屏 Goal  | [390](../../artifacts/ui-redesign/goals/after/mobile-390-goal.png)：统一字段控件使用全宽单列，状态与保存反馈不会越界                                                 |
| 窄屏 Plan  | [390](../../artifacts/ui-redesign/goals/after/mobile-390-plan.png)：PlanEditor 的步骤标题/状态、三个行操作、添加行和保存动作均保留且可达，没有用隐藏功能换取截图整齐 |

Playwright 在 overview/goal/plan 每次切换后检查只存在一个对应主视图，并在 1440、1024 和 390 三档宽度断言 Goal/Plan 工作区与 AppShell drawer 四条边对齐且无横向溢出。真实 Host 流程创建 16,000 tokens 目标，保存一条带说明的计划，跨断点重开两类编辑器，最后清除计划和目标并验证反馈。八张截图均来自 production preview 并逐张人工查看。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；380 个 Bun 测试、2999 个断言通过；Web production build 通过（2395 modules）；flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过。真实 Host 场景完成空摘要、目标保存、计划保存、三档宽度重开编辑器、返回摘要以及清除目标/计划，以上八张截图均在最终 production preview 上重新生成并人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在后续集中验收中补齐。

## 16. R5.1 Schema ComponentRegistry 与 hbar-app-ui 适配

审计发现原 ComponentRegistry 虽然公开了 `multiple` 描述字段，注册实现却主动拒绝 `multiple: true`；`schema-core` 只接受标量 JSON Schema，`settingsForm.setField` 也只接受标量。设置页同时仍使用 `schema-react` 的原生 input/select renderer，因此 R1.3 已交付的 `hbar-app-ui` 受控表单能力没有进入生产 Schema 流程。

本切片将数据契约和视觉适配继续分层。`schema-core` 现在支持 `type: array`、标量 items、`uniqueItems: true`、0–256 的数量边界、数组默认值和结构化 dirty 比较；ComponentRegistry 按元素类型和单值/多值共同校验组件能力。`schema-react` 保留依赖中立的标准 renderer，并新增真正的 MultiSelect 注册。`app-react` 的 `createHbarSchemaComponents` 负责把 TextField、NumberField、SecretField、CheckBox、ComboBox、MultiSelect、FilePicker 和 DirectoryPicker 映射到 `hbar-app-ui/forms`，设置工作区只消费这一公开注册表。设置描述、客户端命令和运行时提交均可传递最多 256 个保留 string/number/boolean 类型的选项；secret renderer 从不把既有状态值写入 HTML。

真实 Host 的[关闭态](../../artifacts/ui-redesign/settings-schema/desktop-1440.png)和[展开态](../../artifacts/ui-redesign/settings-schema/desktop-1440-open.png)显示，生产设置页已经使用统一 ComboBox：输入、边框、焦点环、弹层、选中标记与 ProviderEditor 相同，弹层没有被设置内容区裁切。底层 MultiSelect 复用 R1.3 已人工复核的[展开截图](../../artifacts/ui-redesign/form-controls/zh-CN-dark-1280-open.png)，新增 Schema adapter 的静态渲染测试进一步确认多选标签和宿主提供的移除文案进入生产组件。截图也再次确认设置页自身仍有大标题、顶部作用域按钮、稀疏内容和过宽字段等结构问题；这些视觉问题明确保留给 R5.2，不能因控件适配完成而关闭 UI-05 的页面部分。

验证结果：Schema core、React registry、hbar adapter、设置描述和设置运行时定向测试通过；真实多选值经过 `settingsForm.setField` 与 `settingsForm.submit` 后原样持久化。全仓 TypeScript、定向 ESLint、Prettier、Web production build（2397 modules）与 5 项 Playwright 场景通过；connected E2E 实际打开 Model ComboBox、检查非空 option 列表并生成上述截图。完整 Bun 与全仓 ESLint 在提交前再次执行。本切片没有执行 Tauri 实窗。

## 17. R5.2 设置页分类、作用域与保存流

R5.1 的生产截图仍保留旧设置结构：约 110px 高的大标题区同时放置三枚作用域按钮，左侧分类栏和右侧表单之间缺乏稳定阅读宽度，保存动作位于滚动内容末尾。内容较少时页面显得空散；内容增长时保存动作会随表单离开视口。390 宽度则把作用域、分类和表单依次平铺，当前修改目标不够清楚。

新页面复用 `hbar-app-ui` PageHeader，并为管理页增加通用 leading slot。页头只显示“Settings”、返回会话命令、当前作用域目标和一个作用域选择器。全局、工作区、会话选项都携带可读目标名称；切换仍执行 `app.openSettings`，每个 scope 的分类和普通草稿继续由运行时独立保存。桌面分类栏拥有自己的滚动区；小于 48rem 时改为单个分类 Select。Schema 表单从 grid 改为 flex 流，宽屏使用标签/控件双列，空间不足时自然变成上下顺序。表单内容是唯一伸缩滚动区，dirty 数量、刷新、保存或未知结果核对位于滚动区外的固定 footer；恢复继承仍提交 unset，不把上层当前值写成本层覆盖。

| 场景          | 截图与人工观察                                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面模型设置  | [1440](../../artifacts/ui-redesign/settings/after/desktop-1440-model.png)：页头高度降至普通工作台行，作用域和目标合并为一个选择器；分类、字段和固定保存条形成三层清晰结构                                                                                |
| 桌面动态选项  | [1440 展开](../../artifacts/ui-redesign/settings/after/desktop-1440-model-open.png)：Model 弹层位于控件下方且未被内容滚动区裁切，选中值和焦点环清楚                                                                                                      |
| 中等宽度      | [1024](../../artifacts/ui-redesign/settings/after/tablet-1024-model.png)：应用侧栏和设置分类栏同时存在时，字段自动转为上下顺序，没有压缩成窄列                                                                                                           |
| 窄屏          | [390](../../artifacts/ui-redesign/settings/after/mobile-390-model.png)、[320](../../artifacts/ui-redesign/settings/after/mobile-320-model.png)：应用侧栏收起，分类改为单个选择器；页头、作用域、两个字段、继承动作和固定 footer 全部在视口内，无横向溢出 |
| Provider 分组 | [1440](../../artifacts/ui-redesign/settings/after/desktop-1440-providers.png)：新设置骨架保留当前分组和作用域，但 Provider 行仍是旧 SchemaList 灰条，明确留给 R5.3                                                                                       |

Playwright 在 1440、1024、390 和 320 四档宽度读取真实几何：设置根没有内部横向溢出，footer 下边界与页面下边界误差不超过 1 CSS px；前两档显示分类 sidebar，390/320 显示分类 select。第一轮 320 截图发现单行页头将作用域截成 “Session · N” 且隐藏目标上下文；最终在 480px 以下把页头改为两行，让全宽作用域选择器完整显示 “Session · New session”。真实 Host 流程从全局切到会话，打开动态 Model 列表，恢复继承并保存，再返回全局 Provider 分组、打开/保存 ProviderDialog，最后通过 `app.back` 返回原会话。以上截图均来自重新构建的 production preview 并逐张人工查看。

验证结果：定向 React、Schema 与 PageHeader 测试、全仓 TypeScript、Web production build（2397 modules）和 5 项 Playwright 场景通过；flow/content/icon guards、完整 Bun 与全仓 ESLint 在提交前再次执行。本切片没有执行 Tauri 实窗；Provider 列表视觉和扩展分组分别归属 R5.3、R5.4。

## 18. R5.3 Provider 列表与 NativeDialog

R5.2 完成后，Provider 分组仍由旧 `SchemaList` 把每个实体渲染成整行灰色按钮，协议、默认模型、模型数量、可见性和凭据状态没有稳定层级；删除动作也与编辑处在同一优先级。页面结构已经紧凑，但列表本身仍像一个临时表单控件，无法承担管理页面的扫描和危险操作。

`hbar-app-ui/workbench` 现在提供受控 `HbarAppUiSettingsList`。组件只接收宿主提供的标题、元数据、状态和动作文案，不嵌入 Provider 示例或业务文案。Provider 分组把运行时事实映射为名称、协议、默认模型、模型数量、隐藏状态和凭据状态；整行主操作继续执行编辑命令，删除进入省略号二级菜单。删除确认使用原生 NativeDialog，明确显示目标和后果；Escape 只关闭顶层确认，随后可关闭菜单并把焦点恢复到原操作按钮。列表状态不包含 API Key，ProviderEditor 仍由结构化命令草稿处理敏感输入和保存。

| 场景           | 截图与人工观察                                                                                                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面列表       | [1440](../../artifacts/ui-redesign/settings/after/desktop-1440-providers.png)：两条 Provider 按统一阅读顺序显示事实和凭据状态，主操作与二级操作不再混在灰色整行按钮中                                                                                                                                                   |
| 操作菜单       | [1440](../../artifacts/ui-redesign/settings/after/desktop-1440-provider-menu.png)：菜单锚定对应行的省略号按钮，危险动作独立着色且不改变底层选择                                                                                                                                                                         |
| 删除确认       | [1440](../../artifacts/ui-redesign/settings/after/desktop-1440-provider-delete.png)：原生模态使背景 inert，标题、后果、取消和删除动作都指向明确 Provider                                                                                                                                                                |
| 中等宽度       | [1024](../../artifacts/ui-redesign/settings/after/tablet-1024-providers.png)：应用侧栏、设置分类栏和列表仍保持正常流，元数据及状态没有越出内容区                                                                                                                                                                        |
| 窄屏           | [390](../../artifacts/ui-redesign/settings/after/mobile-390-providers.png)：分类改为选择器，列表头动作和每行事实自然换行，状态移到独立行且无水平溢出                                                                                                                                                                    |
| ProviderEditor | [1440](../../artifacts/ui-redesign/provider-editor/after/desktop-1440.png)、[1024](../../artifacts/ui-redesign/provider-editor/after/tablet-1024.png)、[390](../../artifacts/ui-redesign/provider-editor/after/mobile-390.png)：从新列表进入后继续复用已验证的连接、凭据、多模型和固定操作区，返回仍落在 Providers 分组 |

Playwright 在真实 Host 流程中先展开现有 Provider 的二级菜单，打开删除确认并验证两层 Escape 与焦点恢复，再通过新增入口完成预设选择、模型编辑和保存。返回列表后在 1440、1024 和 390 三档宽度检查 Browser provider 可编辑、页面没有水平溢出，并重新生成以上截图。截图已逐张人工查看；旧灰色整行按钮、直接暴露的删除动作和窄屏状态挤压均已消失。

验证结果：flow/content/icon guards、全仓 ESLint、TypeScript、386 个 Bun 测试（3039 个断言）、Web production build（2399 modules）和全部 5 项 Playwright 场景通过。真实 Host 场景完成列表菜单、确认弹窗、ProviderEditor 返回和三档响应式验证；以上截图来自最终 production preview 并逐张人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在 R6.4 补齐。

## 19. R5.4 扩展与技能归入设置

旧实现把扩展管理作为侧栏底部的第三个全局入口，并在会话上方打开独立模态。模态内部再次渲染 `h1`、全局关闭按钮、指标卡和卡片网格，内容自己滚动；结果是应用外壳、模态和扩展页面同时提供导航与关闭语义。旧截图 [extensions modal](../../artifacts/web-b5/extensions.png) 现在只作为迁移前证据。

设置描述新增 `extensions` 管理分组。兼容命令 `app.openPanel('extensions')` 不再创建扩展 panel，而是打开全局 `settings` page 并请求 `section: extensions`；当同一设置实例已经存在时，runtime 仍会处理新的 section 并切换分组。ExtensionWorkspace 接收明确的设置页面 instanceId，所有刷新、启停和未知结果核对继续写入原有只读投影。侧栏删除独立扩展按钮，只保留状态中心与设置；诊断和相关命令仍打开统一命令目录。

嵌入内容去掉重复 `h1`、全局关闭按钮、MetricStrip 和内部滚动容器。分组头只说明 Host 全局作用域并提供刷新与系统诊断入口；插件按普通 flex 列表显示名称、启用状态、ID、版本、来源、能力、命令数、面板数和现有操作。必需插件只显示必需状态，可选插件保留启用/禁用；技能分区显示稳定 ID、路径、作用域和发现状态，真实 Host 没有技能时显示明确空态。

| 场景     | 截图与人工观察                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面顶部 | [1440](../../artifacts/ui-redesign/extensions/after/desktop-1440.png)：设置页是唯一页面壳，分类、Host 全局说明、诊断入口和插件事实按一个阅读流排列；侧栏底部不再有扩展按钮 |
| 桌面底部 | [1440](../../artifacts/ui-redesign/extensions/after/desktop-1440-skills.png)：可选插件的禁用操作与必需插件状态都可见；Skills 分区显示真实 0 项空态                         |
| 中等宽度 | [1024](../../artifacts/ui-redesign/extensions/after/tablet-1024.png)：应用侧栏与设置分类栏共存时，标题说明先占完整行，操作移到下一行，插件事实自然换行                     |
| 窄屏顶部 | [390](../../artifacts/ui-redesign/extensions/after/mobile-390.png)：分类改为选择器，两个管理动作全宽排列，插件事实按单列阅读且没有水平溢出                                 |
| 窄屏底部 | [390](../../artifacts/ui-redesign/extensions/after/mobile-390-skills.png)：可选插件的相关命令与禁用动作并排保持可达，Skills 空态未被固定 footer 或内部滚动裁切             |

第一次真实截图在 1024px 发现标题说明被两个操作按钮压成逐词换行，因此分组头改为可换行 flex；第二次截图又发现桌面标题的 `flex-basis: 22rem` 在手机纵向布局中变成 22rem 高度，把按钮推到页面中部，最终在窄屏断点恢复内容高度。两项都在重新构建 production preview 后重跑并逐张复核，未用仅通过类型或几何断言替代看图。

验证结果：flow/content guards、全仓 ESLint、TypeScript、386 个 Bun 测试（3052 个断言）、Web production build（2399 modules）和全部 5 项 Playwright 场景通过。定向 React 测试还以非空技能数据验证路径与全局作用域文案；真实 Host 流程验证设置内导航、诊断命令模态、返回原分组、1440/1024/390 响应式布局、底部 Skills 空态及无水平溢出。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在 R6.4 补齐。

## 20. R5.5 Performance 页面重排

旧状态中心使用独立大标题、文字刷新/关闭按钮、原生 select 和多组 `MetricStrip` 大卡片。本轮初始真实截图中进程、计算、运行时和 I/O 共铺开 21 个等权卡片，CPU 趋势被推到首屏底部且图形不可见；窄屏大标题与两个文字动作又占据多行。数据查询本身已经具备范围、时间窗、单位、gap 和 unavailable 原因，因此本切片只重排呈现与复用组件，没有复制统计状态或推算缺失指标。

状态中心现在复用统一 PageHeader：返回和刷新使用语义图标按钮，分区导航与筛选保持在标题下方的普通流中，Performance 的两个筛选改用 `hbar-app-ui` 受控 Select。CPU、内存、线程/队列使用 CompactMetrics；CPU 趋势复用 BarSeries。BarSeries 新增可选固定 maximum，CPU 明确按 0–100% 绘制，避免单个 32% 样本被按当前最大值归一化成满高。Host 进程事实和磁盘/网络事实改为原位 `details`，折叠只属于 UI 局部状态；展开内容仍显示 Host 返回的 PID、平台、架构、运行时间、处理器数、读写与上下行单位。

| 场景         | 截图与人工观察                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面默认态   | [1440](../../artifacts/ui-redesign/performance/after/desktop-1440.png)：标题、分区和筛选缩成工作台行；计算/内存、运行时和两条 CPU 趋势均进入首屏，unavailable 原因就近显示               |
| 桌面进程明细 | [1440](../../artifacts/ui-redesign/performance/after/desktop-1440-process.png)：展开 Host process 后以紧凑事实行显示 PID、平台、架构、运行时间与逻辑处理器，不重新引入卡片墙             |
| 中等宽度     | [1024](../../artifacts/ui-redesign/performance/after/tablet-1024.png)：应用侧栏存在时指标自然换行，两条趋势按可用宽度纵向排列，没有压缩成窄图                                            |
| 窄屏摘要     | [390](../../artifacts/ui-redesign/performance/after/mobile-390.png)：标题、三分区、两个筛选和紧凑指标完整可达，无水平页面溢出                                                            |
| 窄屏趋势     | [390](../../artifacts/ui-redesign/performance/after/mobile-390-chart.png)：System/Host CPU 图按单列排列，32–57% 系统值保持对应比例，约 1% Host 值仍以低柱显示，进程与 I/O 明细保留在图后 |

第一轮截图发现复用 BarSeries 的默认行为会按当前序列最大值归一化；这适合 token 等相对序列，却会误画百分比。组件增加可选固定上限并补静态渲染断言后，真实图中的系统 CPU 柱约占报告百分比高度，Host CPU 低值保持接近基线。Playwright 同时读取实际柱高，确保至少一个真实样本可见；1440、1024 和 390 均检查无水平溢出并逐张人工复核。

验证结果：flow/content/icon guards、全仓 ESLint、TypeScript、386 个 Bun 测试（3058 个断言）、Web production build（2399 modules）和全部 5 项 Playwright 场景通过。Performance runtime、React 与共享 CompactMetrics/BarSeries 定向测试覆盖固定百分比上限、过滤与 unavailable；真实 Host 场景验证四张页面截图、手机趋势截图、柱高可见性和三档无水平溢出。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在 R6.4 补齐。

## 21. R5.6 全局 Usage 页面

旧 Usage 把范围、时间、聚合、供应商、模型和两个导出按钮全部铺在同一筛选行，并用六组 MetricStrip 卡片依次展示总览、token 拆分、速率、延迟和执行统计。真实桌面初始截图中信息虽齐全，但所有数字获得相同视觉权重；390px 时首屏先堆叠六个筛选/导出控件，再用双列大卡片重复占用高度，用户需要滚动很远才能看到时间线、模型和执行口径。

Usage 现在保留范围与时间窗作为常用筛选；聚合、供应商和模型进入原位“更多筛选” disclosure，打开后继续执行同一 `statusWorkspace.setUsageQuery`。JSON 与 CSV 合并到一个锚定导出菜单，导出中、失败、截断和成功状态仍由原 `usageExport` 投影持有。会话范围的后代开关复用受控 CheckBox；所有 select 使用 `hbar-app-ui/forms`，页面没有第二份查询 state。

总览合并总 token、输入、输出、缓存读写、billable、Run、attempt、预计费用与缓存命中率，以 CompactMetrics 显示实际可用性和估算标记。速率和四类延迟继续使用账本报告，不产生缺少分母或事件的伪值；时间线复用 BarSeries，模型列表保留供应商/模型、token 与费用文本。执行统计改为按需展开，工具成功/失败/未知、请求/工具并发、总 Run 时间与 p50/p95 仍来自同一 execution 报告。

| 场景           | 截图与人工观察                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 桌面默认态     | [1440](../../artifacts/ui-redesign/usage/after/desktop-1440.png)：常用筛选、总览、速率、延迟、token 时间线、模型与折叠执行统计全部进入首屏，旧卡片墙消失           |
| 桌面更多筛选   | [1440](../../artifacts/ui-redesign/usage/after/desktop-1440-filters.png)：Export 保持常用操作位置，聚合、供应商和模型在下一行使用统一受控 Select                   |
| 桌面导出       | [1440](../../artifacts/ui-redesign/usage/after/desktop-1440-export.png)：JSON/CSV 位于锚定菜单，不再长期占据两个同级按钮                                           |
| 桌面执行明细   | [1440](../../artifacts/ui-redesign/usage/after/desktop-1440-details.png)：展开后以紧凑事实行呈现工具结果、并发与耗时，不改变查询范围                               |
| 中等宽度       | [1024](../../artifacts/ui-redesign/usage/after/tablet-1024.png)：两项常用筛选和管理入口保持一行；延迟字段获得更宽 basis，p50/p95 不再被大卡片挤压                  |
| 窄屏默认态     | [390](../../artifacts/ui-redesign/usage/after/mobile-390.png)：范围、时间、更多筛选与导出按可用宽度换行；总览和速率使用紧凑双列，无水平溢出                        |
| 窄屏更多筛选   | [390](../../artifacts/ui-redesign/usage/after/mobile-390-filters.png)：Export 保留在常用操作区，高级字段按单列排列，标签和当前值完整可读                           |
| 窄屏趋势与模型 | [390](../../artifacts/ui-redesign/usage/after/mobile-390-chart.png)：时间线、模型 token/费用和执行 disclosure 连续排列，模型标题不再因桌面 flex basis 产生大块空白 |

第一次看图发现展开高级筛选会把 Export 推到字段之后，第二次发现模型标题的桌面 `flex-basis` 在手机纵向流中变成固定高度。最终用 flex order 保留常用操作顺序，并在手机断点恢复模型标题的内容高度；桌面、1024 和 390 截图重新生成后逐张复核。Playwright 还在产生一次真实工具调用后展开执行统计，检查成功数、请求并发和总 Run 时间，避免只验证零值 fixture。

验证结果：Usage runtime、React、导出边界与真实工具账本定向测试通过；flow/content/icon guards、全仓 ESLint、TypeScript、386 个 Bun 测试（3063 个断言）、Web production build（2399 modules）和全部 5 项 Playwright 场景通过。真实 Host 场景完成常用与高级筛选、锚定导出菜单、1440/1024/390 三档布局、时间线与模型区域滚动，以及产生一次真实工具调用后的执行统计核对；以上截图来自最终 production preview 并逐张人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在 R6.4 补齐。

## 22. R5.7 Git 页面重排

旧 Git 页把仓库 ID、HEAD、扫描数、索引模式、分支、上游、工作树、来源统计和文件变化拆成四组同权 MetricStrip 大卡片；两张自定义图表固定占据 10rem 高度。真实 Host 只有一条提交时，首屏仍留下大片空图区域，提交详情和统计口径被推到视口下方。仓库、时间窗和三个来源复选框又全部挤在同一行，并继续使用浏览器原生控件。

Git 页现在把仓库和时间窗保留为常用筛选，提交来源进入“更多筛选”；Select 与 CheckBox 全部来自 `hbar-app-ui/forms`。首层只显示分支、上游、工作树、ahead/behind 和变更路径；提交来源、文件和增删行合并为 Activity summary。仓库 ID、HEAD、扫描数、索引模式、历史/时间口径、时区、重命名和二进制事实进入按需展开的技术详情，长临时仓库路径不再占据首屏最高层级。

提交数、变更文件数与增删行使用同一个 `hbar-app-ui` BarSeries。组件新增受控 selectedId、宿主标签和选择回调；Git 页面点击任一时间桶执行 `statusWorkspace.selectGitBucket`，三个趋势同步标记选中桶，并只过滤下方最近提交。再次点击或“显示全部提交”清除选择；仓库、时间窗或来源变化会由运行时清除旧桶，UI 没有第二份业务状态。提交行先显示 SHA、标题、来源和提交时间，作者与 session/run/operation 仍可原位展开。

| 场景         | 截图与人工观察                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面默认态   | [1440](../../artifacts/ui-redesign/git/after/desktop-1440.png)：分支/工作树、活动摘要、三条趋势、最近提交和折叠详情全部进入首屏；旧四组大卡片消失                       |
| 桌面更多筛选 | [1440](../../artifacts/ui-redesign/git/after/desktop-1440-filters.png)：来源复选框在独立一行展开，三种来源都有文本标签，仓库和时间窗保持常用位置                        |
| 桌面时间桶   | [1440](../../artifacts/ui-redesign/git/after/desktop-1440-selected.png)：三个图表同步显示选择轮廓，提交区明确显示桶时间、结果数量和恢复全部提交动作                     |
| 桌面技术详情 | [1440](../../artifacts/ui-redesign/git/after/desktop-1440-details.png)：临时仓库长路径、HEAD、索引和统计口径以紧凑事实行展示，不重新引入卡片墙                          |
| 中等宽度     | [1024](../../artifacts/ui-redesign/git/after/tablet-1024.png)：应用侧栏保留时摘要自然换行，三张图按可用宽度换为两列加一列，内容不横向溢出                               |
| 窄屏默认态   | [390](../../artifacts/ui-redesign/git/after/mobile-390.png)：仓库与时间窗保持完整值，分支/工作树和 Activity summary 使用双列事实行，标题和值没有逐字断裂                |
| 窄屏趋势     | [390](../../artifacts/ui-redesign/git/after/mobile-390-charts.png)：三条趋势按单列排列，每张图保留足够可点击高度；真实 fixture 仅最后一个时间桶非零，不用假数据填满图表 |
| 窄屏更多筛选 | [390](../../artifacts/ui-redesign/git/after/mobile-390-filters.png)：三种来源按两行自然换行，筛选展开后趋势仍连续且无水平溢出                                           |

第一轮真实页面截图发现桌面 Time window 标签被控件宽度压成两行；最终给常用 Git 标签保留单行，并重新 production build 后生成全部截图。技术详情第一版又让仓库路径与所有事实等宽，最终为首项提供更宽 flex basis，把路径从四行缩短到两行。Playwright 实际点击最后一个非零提交桶、断言三个图表的受控选择状态和一条提交结果，再恢复全部提交。非 Git 工作区使用独立 React/Host 投影测试验证明确空态；空历史继续由 `head: null` 与零统计区分，读取失败使用原错误边界。

验证结果：Git runtime、React、非仓库空态与共享 BarSeries 定向测试通过；flow/content/icon guards、全仓 ESLint、TypeScript、387 个 Bun 测试（3077 个断言）、Web production build（2399 modules）和全部 5 项 Playwright 场景通过。真实 Host 场景完成来源筛选、三条趋势、命令化时间桶选择与恢复、提交行、仓库技术详情以及 1440/1024/390 三档无水平溢出验证；以上截图来自最终 production preview 并逐张人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在 R6.4 补齐。

## 23. R5.8 命令对话框三步流

旧命令对话框把搜索目录、参数表单和原始 JSON 结果同时塞进左右两栏：未选择命令时右侧仍占空间，选择后目录与表单争夺宽度，执行回执直接以大段技术文本覆盖主要阅读区。弹窗本身没有稳定的返回层级，参数页和结果页关闭后也难以判断会回到目录还是退出整个流程。它虽然复用了命令 descriptor，却在视觉和交互上仍像调试器，而不是工作台的主要操作入口。

现在命令目录使用 runtime 的 `search`、`parameters`、`result` 三步投影，每一步只呈现当前任务。搜索页保留单个查询框、分类列表、键盘提示与条目总数；点击或 Enter 执行 `commandPalette.openCommand`。参数页使用统一 PageHeader 和 `hbar-app-ui/forms` 的 Field/Input/Select/Textarea/CheckBox，根据 descriptor 显示命令、执行位置、作用域、默认值、必填和验证错误；重置与执行位于正常流的底部操作区。结果页先给出可读成功或失败摘要，命令事实保持紧凑，原始 JSON 进入默认折叠的 Technical details。

返回与关闭也成为明确的命令层级。页头返回按钮和 NativeDialog 的 Escape 都按结果→参数→搜索→关闭移动；从结果返回参数时保留已提交的非敏感值，敏感值仍按运行时规则清除。导航类命令成功后关闭目录，让新页面成为焦点。每次打开会清空旧查询；每次查询变化会选择第一个结果并把虚拟列表复位到顶部，避免旧的滚动偏移把首项裁成一条灰边或隐藏分类标题。

| 场景         | 截图与人工观察                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面搜索     | [1440](../../artifacts/ui-redesign/commands/after/desktop-1440-search.png)：空查询从第一个分类和第一条选中命令开始，130 条命令在单一滚动区中呈现；非选中行没有继承全局按钮底色，底部键盘提示紧凑可读 |
| 桌面参数     | [1440](../../artifacts/ui-redesign/commands/after/desktop-1440-parameters.png)：会话目标、Token 上限和可选版本按字段顺序排列，验证、重置和执行就近，参数页不再保留目录空栏                           |
| 桌面结果     | [1440](../../artifacts/ui-redesign/commands/after/desktop-1440-result.png)：成功状态和自然语言摘要先出现，技术回执默认折叠，返回参数与关闭目录是两个明确动作                                         |
| 桌面技术回执 | [1440](../../artifacts/ui-redesign/commands/after/desktop-1440-details.png)：原始 JSON 在有界滚动区中展开，弹窗增高但不越过视口，底部操作仍可达                                                      |
| 中等宽度搜索 | [1024](../../artifacts/ui-redesign/commands/after/tablet-1024-search.png)：筛选后的分类、命令标题和说明保留完整横向层级，目录与应用侧栏没有发生水平溢出                                              |
| 窄屏搜索     | [390](../../artifacts/ui-redesign/commands/after/mobile-390-search.png)：弹窗占用可用高度，标题操作、查询、分类结果和两行紧凑键盘提示均可达，条目数量靠右形成独立尾行                                |
| 窄屏参数     | [390](../../artifacts/ui-redesign/commands/after/mobile-390-parameters.png)：命令与作用域事实自然换行，三个字段保持单列；必填错误就近显示，底部两个动作不被表单滚动遮挡                              |

第一轮真实截图发现三个代码检查无法证明的问题：重新打开目录会保留扩展页留下的 `system.` 查询；普通命令行继承了应用全局按钮的灰色背景；参数和结果沿用搜索页固定高度，产生大片空白。修正后第二轮又发现虚拟列表仍保留旧选中项的滚动偏移，首项只露出一条灰边且分类标题消失。最终运行时让查询变化重置选择，共享 CommandList 让按钮样式自包含并在查询变化时复位虚拟滚动，弹窗按三种状态使用不同桌面高度；所有 production 截图重新生成并逐张人工复核。

验证结果：命令目录 runtime 与 React 定向测试通过；flow/content/icon guards、全仓 ESLint、TypeScript、387 个 Bun 测试（3086 个断言）、Web production build（2399 modules）和全部 5 项 Playwright 场景通过。真实 Host 场景实际搜索 `session.setBudget`、填写并执行 Token 上限、查看折叠与展开回执、按两次 Escape 返回搜索，在 1440/1024/390 三档检查无水平溢出；E2E 还断言空查询首个分类可见，防止虚拟滚动回归。以上截图来自最终 production preview 并逐张人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在 R6.4 补齐。

## 24. R6.2 生产样式入口清理

页面迁移完成后，Web React 树已经只使用新 AppShell，但 app-react 与 Web 仍从 `hbar-app-ui` 根入口读取按钮、图标、对话框和若干受控组件。根入口同时公开旧 `HbarAppUiWorkbenchShell`；Bun 构建输入审计证实旧壳层模块仍被加载，其 CSS 会与新 AppShell 一起进入生产样式图。它没有形成第二个可见 React 导航，却仍可能通过通用选择器影响按钮、列表和壳层，这也是命令目录普通行曾继承错误按钮背景的同类风险。

组件库增加 primitives、icon、conversation、prompt-composer、workspace-files 和 plan-editor 等窄生产入口；已有 forms、workbench、app-dialog、command-menu、ai-usage、run-activity、approval-request 和 questionnaire 继续复用。Web 与 app-react 的生产源不再导入 `hbar-app-ui` 根入口。根入口、WorkbenchShell、catalog 和 preview 均未删除，因为组件预览与兼容测试仍有明确调用者；Web 边界测试改为断言旧 WorkbenchShell 不进入生产构建输入。

Production build 从 2400 个模块、224.24 kB CSS 变为 2390 个模块、214.06 kB CSS。清理后重新执行真实 Host E2E，并人工复核[会话](../../artifacts/ui-redesign/session/after/desktop-1440.png)、[设置](../../artifacts/ui-redesign/settings/after/desktop-1440-providers.png)、[文件工具](../../artifacts/ui-redesign/file-tool/after/list-1440.png)、[命令目录](../../artifacts/ui-redesign/commands/after/desktop-1440-search.png)和[窄屏 Performance](../../artifacts/ui-redesign/performance/after/mobile-390.png)。页面层级、选中/禁用状态、工具分栏、模态遮罩、表单和滚动没有因旧 CSS 移除而退化。

验证结果：ESLint、TypeScript、22 个受影响测试（236 个断言）、Web production build（2390 modules）和全部 5 项 Playwright 场景通过。截图来自清理后的最终 production preview 并逐张人工查看；Tauri 实窗仍归 R6.4。

## 25. R2.5 直接新建会话与可读命令目标

侧栏“新建会话”原先只把命令目录筛选到 Host `session.create`，用户仍需再次点击结果，并面对 `workspaceId` 等内部字段。现在入口在显示弹窗前完成 `commandPalette.refresh`、精确查询和 `openCommand`，直接落到客户端组合命令 `app.createSession` 的参数页；“打开工程”同样直接进入 `workspace.open` 参数页。组合命令在运行时先确认工程，再用内部幂等键执行 Host `session.create`，合并返回会话并更新导航。不确定结果保留原键，重试不会重复创建。

命令表单从目录只读投影生成已加载目标。工程选择显示“名称 · 路径”，会话选择显示“标题 · 所属工程”；用户主动选择“输入其他标识符”后才出现自由输入框。所有变化继续经过 `commandPalette.setParameter`，React 没有直接写导航或目录。首次 production 截图发现弹窗挂载刷新与入口刷新竞争，页面错误显示 `RESULT_UNKNOWN`；调整为先准备表单再开弹窗，并让 StrictMode 初始化忽略已被替代的刷新结果后，错误消失。交互复核又发现切到自定义 ID 后，父级清空值会立即把控件切回已知目标；最终由字段实例持有显示模式，并在表单 reset revision 时重建，切换、填写、恢复均通过浏览器操作。

| 场景       | 截图与人工观察                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面默认   | [1440](../../artifacts/ui-redesign/session-create/after/desktop-1440.png)：当前工程已选中，名称位于长路径之前；标题保持可选；没有搜索中间页或错误横幅                  |
| 桌面高级值 | [1440](../../artifacts/ui-redesign/session-create/after/desktop-1440-custom-id.png)：选择“其他标识符”后在同一字段内展开第二行输入，必填提示仍与整个字段关联            |
| 窄屏       | [390](../../artifacts/ui-redesign/session-create/after/mobile-390.png)：页头、命令事实、两个字段和底部操作在单列正常流中完整可达，无水平溢出                           |
| 执行完成   | [1440](../../artifacts/ui-redesign/session-create/after/executed-1440.png)：真实 Host 创建 `Visual QA session`，命令弹窗关闭，主标题和侧栏选中行同步更新，原会话仍保留 |

验证结果：运行时测试覆盖 Host 端口、目录合并、导航和 `RESULT_UNKNOWN` 后复用幂等键；React 测试覆盖可读工程/会话选项和本地化文案；真实 Host Playwright 覆盖默认目标、自定义目标、390 宽度和实际创建。全仓以提高 Node heap 的相同 ESLint 配置通过，TypeScript 通过，391 个 Bun 测试（3112 个断言）通过，Web production build 为 2390 modules / 214.26 kB CSS，Playwright 5 项场景通过。截图均在最终 production preview 中重新生成并逐张人工查看；Tauri 实窗仍归 R6.4。

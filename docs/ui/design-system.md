# hbar 统一设计系统、Lumen 视觉语言与全局外观设置

> 状态：Lumen 规范已确立，运行时迁移待按实施切片完成。本文是仓库级设计系统与 Lumen 视觉语言的唯一规范来源；按钮、图标按钮、标签、文字和表单控件收敛到 `hbar-app-ui`，Web/Tauri 通过既有命令和偏好投影应用全局外观。实施不得另建平行组件库、平行主题状态、平行 Lumen 规范或绕过命令的 DOM 写入入口。

## 1. 目标与已确认结论

目标是形成一套类似 Material UI 的、由 token 驱动的 hbar 设计系统：业务页面只选择语义，不再决定按钮、标签和输入框的字号、高度、圆角、边框、hover、focus、disabled 等视觉细节。

本轮沿用并扩展现有实现，结论如下：

- `hbar-app-ui` 已有 `HbarAppUiButton`、`HbarAppUiIconButton`、`HbarAppUiField`、`HbarAppUiInput`、`HbarAppUiTextarea`、`HbarAppUiSelect`、`HbarAppUiCheckBox`、`HbarAppUiComboBox` 和 `HbarAppUiMultiSelect`，无需创建第二套基础控件。
- `tokens.css` 已经承担图标、间距、控件高度和少量字号变量，可以扩展为唯一基础 token 层。
- `HbarAppUiButton` 已有五种 tone 和三档尺寸，但尺寸名称仍是 `compact/default/focal`；表单控件还没有统一的 `size/variant` 公共契约；复合组件内部仍有较多原生控件和局部样式。
- `theme.css` 同时保留旧按钮规则、catalog 样式和大量一次性字号。公共组件自己的 CSS 与旧全局选择器可能同时命中，尚未形成清楚的样式所有权。
- 核心生产路径的初步扫描覆盖 40 个 TSX 和 28 个 CSS 文件，发现 76 个原生 `button/label/input/select/textarea` 标记、53 个 `font-size` 声明和 139 个高度相关声明。这些数字是迁移基线，不表示所有原生元素都必须机械替换；复合组件内部可以保留原生语义元素，但视觉规则必须来自公共原语。
- `@hbar/app-runtime` 已有正式的 `preferences.set`、`preferences.unset` 命令、revision 冲突检查、Zustand 只读投影和持久化端口。Web 主题已经通过这条链路保存，因此外观设置可以直接扩展该机制，不新增外观专用存储或隐藏写状态入口。
- `hbar-app-ui` 已有生产窄入口和 catalog 入口的边界。设计系统应从生产公共原语开始，随后让 catalog 组件族迁移到同一套原语和 token；catalog 不再维护另一套按钮、标签和表单皮肤。

最终不引入 `@mui/*` 运行时依赖。“类似 Material UI”指统一主题、有限语义属性、完整状态规则、可组合组件和可验证的默认值，而不是复制 MUI 的 DOM、命名或样式引擎。

## 2. 设计系统分层

设计系统固定为五层单向依赖：

| 层级       | 所有者                              | 职责                                                                               | 禁止事项                                  |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| 基础 token | `hbar-app-ui/tokens.css`            | 原始字号、行高、控件高度、内边距、圆角、边框、焦点环、动效和图标档位               | 业务含义、页面选择器、主题状态            |
| 语义主题   | `hbar-app-ui` theme/appearance 模块 | 把 S/M/L 和 light/dark 映射为当前语义变量                                          | 读取 Zustand、localStorage 或 Host        |
| 公共组件   | `hbar-app-ui` primitives/forms      | Button、IconButton、Text、Label、Field、Input、Textarea、Select 等结构、状态和样式 | 业务命令、页面状态、硬编码可见文案        |
| 页面组合   | `@hbar/app-react`                   | 使用公共组件组织页面，绑定只读投影和命令 action                                    | 重写公共控件字号、高度、圆角、hover/focus |
| 应用装配   | Web/Tauri 组合根                    | 从偏好投影解析外观，给根节点设置受控属性；提供本地化设置文案                       | 直接修改业务状态、保存任意 CSS 字符串     |

全局外观以 CSS 自定义属性为渲染协议，以类型化枚举为持久化协议。CSS 可以声明和覆盖变量，但用户设置只选择受支持的档位，不接受任意 CSS、任意数字或任意 class 名。

## 3. Lumen 无界视觉语言

本章定义 Lumen 的规范性视觉关系，不锁定某个截图的像素、百分比或动画毫秒值。后续实现以语义 token 和有限联合类型选择终态；截图与 computed style 用于验证关系，不反向产生一次性数值。暗色与亮色主题共享相同的结构、交互和状态语义：暗色以灯带及白光扩散表达前景，亮色以墨条及墨色扩散表达前景；基础 surface 保持透明或半透明，由宿主背景承担画布色。

如本文其他章节或旧计划仍出现“普通面板普遍使用高对比完整边框”“用装饰性分隔线组织所有区域”或“灯带按文本/实例宽度任意伸缩”等描述，以本章为准。功能性表格线、滚动条、焦点环、代码边界和真实拖拽边界不属于被替换的装饰边界。

### 3.1 无界结构原则

- 普通容器、页面分区和静态大面板默认不画完整高对比边框。优先通过共同起始线和结束线、文本层级、`gap`、`margin`、`padding`、留白与滚动归属建立结构。
- 普通内容保持语义顺序和自然 flex 流。不得用截图坐标、固定内容高度或绝对定位排列文字、字段、按钮、面板和卡片；覆盖定位只用于已经证实的 dialog、popover、menu、drawer 等真实覆盖关系，覆盖层内部仍使用正常流。
- 静态大结构的必要边界保持低对比；只有边界本身可拖拽伸缩、区域可独立滚动、元素可聚焦，或边界确实承担数据分隔时才增强。小结构默认无边界，或仅用低透明度背景/边界表达从属层级。
- 无界不等于移除功能边界。表格行列、代码区域、滚动条、键盘焦点环、选择范围和拖拽把手继续清晰可辨；这些边界的存在必须能解释到具体功能。
- 标题、正文、元数据和操作组保持有意义的阅读顺序。长中英文文案通过换行和父级流布局解决，不通过新增坐标或缩小图标补偿。

### 3.2 灯带交互语义

- 发光灯带是交互能力、当前状态或连续进度的语义标记，不是装饰边框。线芯以水平或垂直直线为主，不能沿圆角弯折，也不能连成完整圆角描边。
- 灯带方位由组件角色与布局固定：动作默认使用稳定的一条边，导航/侧栏使用与内容侧一致的边，字段、drop zone 或拖拽范围只在其功能确需时使用成对边界。同一角色不得因文案长度或临时截图在实例间随意换边。
- 灯带长度只来自有限、可复用的语义档位。现有 `LumenIndicator.length` 保留 `standard | action | area`；`progress` 是由 Progress/Slider 根据受控值管理的组件语义，不在本阶段虚构为已存在的 `LumenIndicator` 枚举值。后续若需要新的公共长度值，必须先扩展语义联合类型、组件契约和验证矩阵，禁止业务页面传任意 CSS 长度。
- 相邻同类控件共享对齐基线、控件尺寸和灯带长度节奏。灯带可以随状态在语义档位之间过渡，但不能让短标签、长标签或容器剩余宽度决定一排互不一致的终态长度。
- idle 保持低亮度线芯；hover、focus-visible、selected、running、dragging 可以增强亮度、光晕或语义长度。pressed 只加强即时反馈，不改变布局。disabled、不可交互和接近零进度采用低透明度、无光晕的反向语言，但正文、状态文本和焦点可达性仍须清楚。
- 接近完成的进度允许接近满长并增强光感；接近零时保留可辨识起点，不通过突然出现、消失或跳到最终值制造反馈。failed、paused、warning 等状态必须同时有文本、图标、ARIA 或形态差异，不能依赖颜色单独传达。

### 3.3 组件语义基准

| 组件/边界                         | 规范终态                                                                                                      | 必须避免                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `LumenButton` / `LumenIconButton` | 本体保持轻量表面；由固定方位的 action 灯带承担主要交互提示；loading 保留名称并阻止重复提交                    | 让文字宽度决定灯带长度；disabled 仍持续发光；完整发光圆角描边        |
| `LumenSlider` / range             | 轨道明确可拖动范围；完成区、thumb 与光晕随受控值连续变化；dragging 时增强当前交互边界                         | thumb 或轨道跳到目标；拖动结束闪回旧值；用任意实例长度替代归一化进度 |
| Switch / toggle                   | off 使用低亮度线/点，on 使用增强灯点或短灯带；focus 和 disabled 仍可辨                                        | 高对比传统填充轨道成为唯一状态；快速切换时闪烁或重建节点             |
| Progress                          | 长度与亮度共同表达接近完成度；complete、failed、paused 同时提供非颜色状态                                     | 接近零时完全丢失语义；完成瞬间从中间长度单帧跳满                     |
| `LumenSurface`                    | 普通 surface 使用低对比或透明/半透明承载；`interactive` 只在 hover、focus-within、selected 等状态增强局部灯带 | 静态大面板常驻高亮边框；给每个小结构套发光卡片                       |
| 拖拽分栏、抽屉和伸缩边界          | 仅真实可拖动时显示可发现的灯带/把手，hover、focus、dragging 连续增强                                          | 静态分隔线冒充把手；不可拖动边界持续高亮                             |
| 表格、代码区、滚动条、焦点环      | 作为功能性边界保留，强度服从可读性、滚动和键盘操作                                                            | 为追求无界而删除行列关系、滚动反馈或焦点可见性                       |

### 3.4 弹窗与大层次

- 弹窗是 Lumen 大层次感的主要用例。使用玻璃/磨砂材质、backdrop blur、独立外边界和受控外发光，将前景与下层页面分离；正文与控件本身保持锐利。
- 外边界只描述弹窗层级，不延伸为弹窗内部的多层装饰卡片。header、body、footer 使用自然 flex 流和语义分区；可滚动 body 与常驻标题/操作的归属清楚。
- opening、closing、遮罩、背景模糊和外发光连续变化。打开后焦点进入正确位置并被圈定；Escape 关闭当前层；关闭后恢复原触发点。内容滚动、长表单和窄屏下 footer 操作始终可达。
- popover、menu、drawer 只有在同样承担覆盖层级时复用这套材质关系；静态页面面板不能因为“需要层次”直接套用弹窗强边界。

### 3.5 Motion continuity

所有可见状态变化必须连续。灯带 `opacity`、语义长度、厚度、光晕强度，thumb 位置、轨道进度，overlay 的模糊/透明度与必要的颜色变化，由统一的语义 transition token 驱动；本阶段规定行为，不规定具体毫秒值或曲线数值。

- 状态转换从当前呈现值过渡到目标值，支持中途反向和新的目标打断；不能先重置到 idle、零长度或错误中间值再开始下一段。
- hover → focus、focus → blur、selected → idle、running → failed、dragging → released、快速 tab 切换、连续提交和快速重复 toggle 均不得出现空帧、闪烁、先消失后重现、长度突变或亮度跳闪。
- 不以条件卸载、变更 key、重建 DOM，或离散的 `display`/`visibility` 切换作为唯一视觉反馈。确需退出 DOM 或变为不可交互时，先完成必要的透明度/尺寸退出，再改变生命周期或命中行为。
- 持续呼吸/循环脉冲与进入、退出的状态过渡分层，避免多个动画同时改写同一属性而产生跳变。动画结束后必须稳定在语义终态，不能依赖最后一帧偶然停留。
- `prefers-reduced-motion: reduce` 与宿主 motion-off 关闭持续呼吸、循环脉冲和非必要空间运动，同时保留可读的状态差异。需要即时响应时使用稳定终态或不闪烁的短暂非空间变化；不能把减弱动效简单实现为明显的单帧闪变。
- 每个新增动画在实现说明或测试中记录触发状态、变化属性、可打断行为、减少动效行为和稳定终态。验证必须采样起始、中间、结束和快速反向，而不只断言存在 `transition` 声明或最终截图正确。

### 3.6 主题、内容、图标与布局契约

- dark/light 共享同一套结构、长度档位和状态强弱关系；前景（灯条/墨条及扩散）、宿主背景、反差色与语义 tone 是主题角色，不在组件变体中写死。当前文档阶段不增加颜色 API；后续自定义主题必须经过类型化 appearance 契约和真实对比度复核。
- 可见文案、ARIA 名称、状态格式和列表内容继续由宿主以类型化 `copy`/`labels`/数据契约提供；Lumen 原语不嵌入默认英文演示文本。语言切换不改变状态 ID，也不产生新的灯带尺寸档位。
- 图标继续使用 `xs | sm | md | lg | xl` 五档语义 scale。图标绘制框与按钮命中区分离；不得为了对齐灯带、压住长文案或匹配截图新增一次性图标尺寸。
- 布局以父级 flex、语义顺序、对齐、间距和响应式换行为准；灯带是附着在控件边缘的装饰/状态层，不参与普通内容定位。覆盖层内部同样遵守正常流。

### 3.7 本规范阶段的接口与交付边界

本阶段只建立文档规范与验收契约，不修改 React、CSS、组件 API、业务页面或现有主题终态，也不宣称当前运行时已经通过第 3 章的视觉矩阵。

- `LumenIndicator` 继续使用现有 `edge`、`state`、`tone`、`length` 语义；`LumenButton`、`LumenSurface`、`LumenDialog`、`LumenSlider` 和表单控件保留当前调用方式。
- 宿主的 copy、locale、列表数据和业务状态契约不变。本章只规定后续实现必须保持的所有权和视觉关系。
- 后续若 motion token、dragging、progress length 或主题色角色需要新增公开状态，必须先扩展语义联合类型、组件契约和对应验收，再由组件样式消费；禁止业务页面自行传入任意 CSS 数值。
- 实施按第 9 节的独立切片提交。每个切片完成前必须执行 [`visual-validation.md`](visual-validation.md#3-lumen-视觉与连续动画验收矩阵) 的适用矩阵，未覆盖项明确保留为未完成。

## 4. 公共 API 收敛

### 4.1 共享语义类型

公共类型只保留稳定、可理解的语义：

```ts
export type HbarAppUiSize = 's' | 'm' | 'l'
export type HbarAppUiTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'
export type HbarAppUiButtonVariant = 'solid' | 'outline' | 'ghost'
export type HbarAppUiFieldVariant = 'outline' | 'plain'
export type HbarAppUiTextVariant = 'body' | 'label' | 'supporting' | 'code'
```

这些类型在一个公开模块中定义，所有组件复用。组件只接收与自身有关的子集，不为了 API 对称给每个组件添加无意义属性。

- Button：`size`、`tone`、`variant`。
- IconButton：与 Button 相同，并强制 `label`；图标绘制尺寸继续使用独立的 `xs/sm/md/lg/xl` 图标档位，命中区由按钮尺寸决定。
- Text：`size`、`tone`、`variant`，用于正文、标签文案、辅助文案和代码文字。
- Label：`size`、`tone`，保留原生 `htmlFor`；必填标记和错误关系由 Field 组合。
- Input、Textarea、Select：`size`、`variant`；错误状态使用 `aria-invalid`，只读和禁用使用原生属性，不再由页面传颜色 tone。
- CheckBox、ComboBox、MultiSelect：接收统一 `size`，内部按钮、输入、标签和弹层项复用公共原语或相同的内部样式基础。
- MenuItem、ListAction、Tab 等交互行使用专用组合原语，不把普通 Button 通过几十个页面 class 改造成列表行。

`compact/default/focal` 在迁移期一次性映射为 `s/m/l`，所有调用者和测试迁移后删除旧名称，不保留长期别名。`solid/outline/ghost` 取代页面自行编写“主按钮、普通按钮、文字按钮”的选择器。只有真实产品语义证明现有三种 variant 不够时才增加新值。

公共组件继续透传必要的原生可访问属性和 ref。`className` 只用于布局位置、伸缩和页面定位；业务 CSS 不允许借此覆盖公共组件的字体、控件尺寸、圆角、边框、背景、状态颜色和交互反馈。内联 `style` 不作为视觉定制 API。

### 4.2 组件状态规则

每个交互组件共享同一状态优先级和反馈规则：

1. disabled 阻止动作并保持可读对比度；不能只用很低透明度隐藏文字。
2. busy/loading 阻止重复提交，保留原标签或提供宿主传入的本地化忙碌文案；不会改变控件宽度导致布局跳动。
3. invalid 由 `aria-invalid` 和就近错误文本共同表达；不能只改边框颜色。
4. selected/pressed/current 分别使用对应 ARIA 状态，视觉样式不得依赖业务页面添加任意颜色。
5. hover 只增强已有层级；`hover:none` 下不承载唯一信息。
6. focus-visible 使用统一焦点环；鼠标点击不产生多余常驻焦点装饰。
7. readOnly 保留可选择和复制的内容，并与 disabled 有清楚区别。

所有组件在 light/dark、S/M/L、中文/英文长文案和窄屏下使用相同状态契约。

## 5. Token 与 CSS 变量协议

### 5.1 三层变量

变量分为基础刻度、当前语义别名和组件局部别名，避免页面直接引用原始数字。

**基础刻度**只定义有限档位：

```css
--hbar-app-ui-font-size-s
--hbar-app-ui-font-size-m
--hbar-app-ui-font-size-l
--hbar-app-ui-line-height-s
--hbar-app-ui-line-height-m
--hbar-app-ui-line-height-l
--hbar-app-ui-control-height-s
--hbar-app-ui-control-height-m
--hbar-app-ui-control-height-l
--hbar-app-ui-control-padding-inline-s
--hbar-app-ui-control-padding-inline-m
--hbar-app-ui-control-padding-inline-l
--hbar-app-ui-radius-s
--hbar-app-ui-radius-m
--hbar-app-ui-radius-l
```

**当前语义别名**由全局外观档位选择：

```css
--hbar-app-ui-text-body-size
--hbar-app-ui-text-label-size
--hbar-app-ui-text-supporting-size
--hbar-app-ui-control-height
--hbar-app-ui-control-padding-inline
--hbar-app-ui-component-radius
--hbar-app-ui-focus-ring-width
```

**组件局部别名**由显式 `size` 覆盖，只作用于组件自身：

```css
.hbar-app-ui-button[data-size='s'] {
  /* 覆盖本按钮的局部别名 */
}
```

组件未传 `size` 时读取当前语义别名，因此会跟随设置页的全局档位；显式传入 `size` 时只覆盖该组件。业务页面不能改变基础刻度。

### 5.2 数值治理

- 字体只保留正文、标签、辅助文字、标题和代码所需的有限语义层级；删除同一角色中的 `0.6875rem/0.75rem/0.8125rem/0.875rem` 任意选择。
- 控件高度只保留 S/M/L，按钮、输入、选择器和组合框使用同档对齐。
- 圆角只保留 S/M/L 和真实 pill/circle；普通控件不再各自写圆角。
- 图标继续使用现有五档图标 scale，不与按钮 S/M/L 合并。按钮命中区和图标绘制框保持独立。
- 页面 CSS 仍可决定 flex、gap、宽度、换行、滚动和响应式流。图表、代码编辑器、头像、真实圆形状态点等专用视觉可使用自己的语义 token。
- `theme.css` 只负责颜色主题、根字体和兼容聚合入口。Button/Form 等具体样式归所属组件 CSS；删除重复规则时按选择器实际命中和截图结果逐项迁移，不进行整文件格式化。

## 6. 全局外观设置与命令链

### 6.1 偏好键

在现有 client preferences 中增加以下受控键：

| key                      | 类型                      | 默认     | 作用                                            |
| ------------------------ | ------------------------- | -------- | ----------------------------------------------- |
| `appearance.controlSize` | `s \| m \| l`             | `m`      | Button、Input、Select、菜单项等默认高度和内边距 |
| `appearance.textSize`    | `s \| m \| l`             | `m`      | 正文、label、辅助文本的全局比例                 |
| `appearance.cornerSize`  | `s \| m \| l`             | `m`      | 普通组件的全局圆角档位                          |
| `theme`                  | `system \| light \| dark` | `system` | 复用现有主题偏好                                |

持久化值只保存枚举，不保存计算后的 rem、颜色、CSS 文本或 style 对象。读取时使用纯函数验证；未知值回退默认并允许用户重置，不把损坏偏好传播到 DOM。

### 6.2 写入和应用顺序

1. 设置页提交 `preferences.set <key> <value>`，需要时携带 `expectedRevision`；恢复默认使用 `preferences.unset`。
2. runtime 完成 CAS、持久化和 Zustand 投影更新。
3. Web/Tauri 组合根只读取 `preferences` 投影，把有效档位映射为根节点的 `data-hbar-app-ui-*` 属性或受控 CSS 变量。
4. `hbar-app-ui` 组件只消费变量，不读取 runtime、Host、localStorage 或设置表单。
5. 首屏可以像现有主题一样使用只读 bootstrap cache 防止样式闪烁；正式写入仍必须先经过命令，runtime 就绪后用权威投影校正缓存。

外观偏好属于当前设备的全局设置，不随 workspace/session 作用域改变。设置页切换到 workspace/session 时，外观分类仍明确显示为全局/设备偏好，避免让用户误以为控制尺寸会写入 Host 的工作区设置。

### 6.3 设置页面

新增“外观”分类，并把当前页头中的主题选择器移入该分类。页面使用设计系统自己的 Field、Label、Select、Button，不允许用一套未统一的控件配置统一控件。

字段包括主题、控件尺寸、文本尺寸和圆角档位。每个 S/M/L 选项使用宿主提供的中英文标签和简短说明；页面提供实时预览区，至少显示普通按钮、图标按钮、标签、输入框和选择器。选择先形成设置草稿，保存后执行命令；恢复默认执行 `preferences.unset`。保存失败、revision conflict 和持久化不可用在字段组或保存区就近显示，不能只更新 DOM 后宣称成功。

设置保存目标在提交开始时捕获具体 key/value/revision。用户随后切换分类或作用域，迟到结果不能写到其他设置目标。

## 7. `hbar-app-ui` 迁移范围

### 7.1 第一批：公共基础

- 抽出共享类型与 appearance 解析函数。
- 扩展 `tokens.css`，建立 S/M/L、文字、控件、圆角、焦点和状态 token。
- 迁移 Button/IconButton，并补 Text、Label。
- 迁移 Input/Textarea/Select/CheckBox/Field。
- 让 ComboBox/MultiSelect 的输入、开关按钮、选项和移除按钮复用基础规则。
- 保持所有可见文案由 labels/copy props 提供。

### 7.2 第二批：生产组件

按页面族逐项替换原生视觉实现：

1. AppShell、PageHeader、ToolPane、Sidebar、ActionMenu。
2. Conversation、Message、PromptComposer、Run Activity、Approval、Questionnaire。
3. CommandList、参数表单和结果页。
4. Settings、Provider、Extension 和所有 schema field adapter。
5. File、Monitoring、Agent、Goal/Plan、Status。

原生 `button/input/select/label` 可以作为公共组件内部的语义节点存在；`@hbar/app-react` 业务页面不再直接写可见控件，除非公共组件无法表达已证实的语义。发现缺口时先扩展通用组件，再迁移页面。

### 7.3 第三批：catalog 组件族

`hbar-app-ui` catalog 的 Editor、Navbar、File Manager、Tool Calls、Agent Activity、Agent Approval、Agent Plan、Settings Form、Notifications、Wizard、Feedback、Support、Billing、Integrations 等组件族逐族迁移。每族要求：

- 删除自己的基础按钮/标签/输入皮肤，组合共享原语或内部共享基类。
- 只保留该组件族独有的布局与数据可视化样式。
- 示例内容继续由 catalog fixture 提供，组件实现不嵌入英文演示文案。
- 单族完成视觉矩阵、交互检查和 guards 后独立提交，不进行一次性全库替换。

catalog 变体数量不构成新增 size/variant 的理由。只有生产语义或多个组件族重复出现的角色才能扩展公共 API。

## 8. CSS 与调用端门禁

新增静态检查，作用于生产入口和已迁移的 catalog 组件族：

- 禁止业务 CSS 对公共控件 class 设置 `font-size`、`font-family`、`line-height`、控件高度、圆角、边框、背景及 hover/focus/disabled 样式。
- 禁止新增未在 token 文件声明的一次性字号、控件高度和普通圆角。
- 禁止业务 TSX 新增带可见样式职责的原生按钮、输入和选择器；允许公共组件内部、文件输入等原生能力边界，并用有原因的 allowlist 记录。
- 禁止任意数字形式的组件 `size` prop；图标继续由 icon-scale guard 检查。
- 禁止组件实现硬编码可见文案；继续运行 content-contract guard。
- flow-layout guard 继续拒绝普通内容的坐标定位、固定内容高度和非间距 px。

门禁先以报告模式建立基线，再按迁移批次缩小 allowlist；最终生产路径必须归零。历史 catalog 只在所属组件族开始迁移后进入强制范围，避免用海量无关修复掩盖当前子功能。

## 9. 实施子计划与提交边界

| 子任务                       | 内容                                                                | 主要验证                                                          | 独立提交结果                  |
| ---------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| DS0 现状基线                 | 固化公开导出、调用者、原生控件和 CSS 一次性值报告；增加只读审计脚本 | 脚本自测、现有构建不受影响                                        | 可重复的 migration report     |
| DS1 token 与 appearance 契约 | S/M/L token、类型、校验、默认值和根属性映射；不改业务页面           | 单元测试、TypeScript、三档计算样式 fixture                        | 唯一 token/appearance 基础    |
| DS2 Button 与 Typography     | Button/IconButton API 迁移；新增 Text/Label；删除重复按钮规则       | 全状态键盘测试、light/dark × S/M/L 截图、icon/content/flow guards | 基础操作和文字组件统一        |
| DS3 表单组件                 | Input/Textarea/Select/Field/CheckBox/ComboBox/MultiSelect 迁移      | label/description/error ARIA、键盘、长文案、弹层、三档几何        | 完整表单原语统一              |
| DS4 外观设置                 | 外观分类、偏好解析、命令保存/重置、bootstrap 和根变量应用           | 真实 `preferences.set/unset`、revision 失败、刷新恢复、Web/Tauri  | 设置可控制全局默认档位        |
| DS5 生产页面迁移             | 依次迁移外壳、会话、命令、设置、工具、状态                          | 每页 Web/Tauri 交互、computed style、无溢出截图                   | 生产页面不再自定义基础控件    |
| DS6 catalog 组件族迁移       | 按组件族移除重复 primitives 和一次性基础样式                        | 各族 verify 脚本、catalog 截图与原图检查                          | 整个 hbar-app-ui 服从同一系统 |
| DS7 清理与强制门禁           | 删除 legacy 名称、旧 theme 重复规则和临时 allowlist；文档公开 API   | 全仓 lint/typecheck/test/build、生产交互、视觉矩阵                | 单一设计系统完成              |

每个 DS 子任务内仍按可独立验收的组件族切 commit。例如 DS5 的外壳与会话不能和 Status 的大批 CSS 混为一个提交。触及当前已有脏文件时先记录基线，只暂存本任务 hunk；`theme.css` 不做顺手格式化。

## 10. 真实视觉与交互验收

### 10.1 组件矩阵

为真实组件建立可交互矩阵，不用静态仿制 DOM：

- Button：S/M/L × solid/outline/ghost × 五种 tone；normal、hover、focus-visible、pressed、disabled、busy。
- IconButton：S/M/L 命中区与五档图标绘制框分别量测；检查 aria-label、tooltip 和长本地化标签。
- Text/Label：正文、label、supporting、code；中文、英文、长路径、错误和禁用颜色。
- Input/Select/Textarea：S/M/L；empty、filled、placeholder、focus、invalid、readOnly、disabled。
- ComboBox/MultiSelect：关闭、展开、空、loading、error、分页、键盘选择、长选项、多个 tag。

每个状态保存截图和 computed style JSON，至少记录字体族、字号、行高、控件高度、padding、radius、border、背景、前景、outline 和实际 bounding box。自动断言只判断 token 和几何契约，最终仍查看原分辨率截图。

### 10.2 生产页面矩阵

复用完整生产 Web/Host 和 Tauri harness，至少检查：

- `1440×960`、`1024×768`、`900×600` 的 Web 与真实 Tauri 允许尺寸。
- Web 的 `390×844`、`320×720`。
- zh-CN light、en-US dark，并交叉检查另外两种 locale/theme 组合。
- S/M/L 三档分别在设置页保存、立即生效、刷新恢复和重置。
- 设置页、空会话、长会话、命令面板、Provider、文件工具、Monitoring、Agent、Goal/Plan、状态中心。
- 侧栏出现时仍推动主区；文字放大后不遮挡、不产生横向溢出，按钮和输入在同档下对齐。
- `hover:none`、touch、reduced-motion、DPR 1/1.25、Tab/Shift+Tab/Enter/Space/Escape 和 focus trap。

共享页面继续与 cc-haha contact sheet 对照信息层级、密度、就近反馈和响应式转换；不为追逐单张截图给组件增加一次性像素值。

### 10.3 写操作事实

外观保存必须同时断言：

- 设置控件显示新值。
- `preferences` 投影包含目标 key、value 和新 revision。
- 持久化 envelope 包含相同事实。
- 根节点属性和 computed CSS 变量与该值一致。
- 实际 Button/Input/Text 几何按预期变化。
- 刷新后仍一致；unset 后恢复默认。

只看到选择器变化、toast 或 CSS 变量变化不算完成。失败和 revision conflict 不得留下“看起来已经保存”的状态。

## 11. 完成标准

- 生产 UI 的可见 Button、IconButton、Label、Input、Textarea、Select、CheckBox、ComboBox、MultiSelect 均由 `hbar-app-ui` 公共设计系统提供。
- 公共尺寸只使用 S/M/L；按钮 variant 只使用 solid/outline/ghost；tone 集合不在页面自行扩张。
- 全局默认从设置页通过 `preferences.set/unset` 修改，Web/Tauri 一致并可刷新恢复；显式组件 size 只覆盖自身。
- 业务页面不再定义公共控件的字体、高度、圆角、边框、背景、hover、focus 和 disabled 视觉。
- `theme.css` 不再重复 Button/Form 基础规则；每个组件样式有唯一所有者。
- 生产门禁中的未登记原生可见控件、一次性基础值和越权覆盖为零；catalog 按已迁移组件族逐步归零，DS7 后全部强制。
- 所有新增文案由宿主类型化提供；图标尺寸、流式布局、严格类型和 lint guards 通过。
- Web 与 Tauri 的真实设置写入、页面交互、视觉矩阵和人工原图复核通过，报告准确记录测试数、截图数、失败修复和保留差异。

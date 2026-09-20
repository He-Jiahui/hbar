# hbar 统一设计系统与全局外观设置计划

> 状态：待实施。本文把按钮、图标按钮、标签、文字和表单控件收敛为 `hbar-app-ui` 的公共设计系统，并规定 Web/Tauri 如何通过既有命令和偏好投影覆盖全局样式。实施不得另建平行组件库、平行主题状态或绕过命令的 DOM 写入入口。

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

## 3. 公共 API 收敛

### 3.1 共享语义类型

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

### 3.2 组件状态规则

每个交互组件共享同一状态优先级和反馈规则：

1. disabled 阻止动作并保持可读对比度；不能只用很低透明度隐藏文字。
2. busy/loading 阻止重复提交，保留原标签或提供宿主传入的本地化忙碌文案；不会改变控件宽度导致布局跳动。
3. invalid 由 `aria-invalid` 和就近错误文本共同表达；不能只改边框颜色。
4. selected/pressed/current 分别使用对应 ARIA 状态，视觉样式不得依赖业务页面添加任意颜色。
5. hover 只增强已有层级；`hover:none` 下不承载唯一信息。
6. focus-visible 使用统一焦点环；鼠标点击不产生多余常驻焦点装饰。
7. readOnly 保留可选择和复制的内容，并与 disabled 有清楚区别。

所有组件在 light/dark、S/M/L、中文/英文长文案和窄屏下使用相同状态契约。

## 4. Token 与 CSS 变量协议

### 4.1 三层变量

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

### 4.2 数值治理

- 字体只保留正文、标签、辅助文字、标题和代码所需的有限语义层级；删除同一角色中的 `0.6875rem/0.75rem/0.8125rem/0.875rem` 任意选择。
- 控件高度只保留 S/M/L，按钮、输入、选择器和组合框使用同档对齐。
- 圆角只保留 S/M/L 和真实 pill/circle；普通控件不再各自写圆角。
- 图标继续使用现有五档图标 scale，不与按钮 S/M/L 合并。按钮命中区和图标绘制框保持独立。
- 页面 CSS 仍可决定 flex、gap、宽度、换行、滚动和响应式流。图表、代码编辑器、头像、真实圆形状态点等专用视觉可使用自己的语义 token。
- `theme.css` 只负责颜色主题、根字体和兼容聚合入口。Button/Form 等具体样式归所属组件 CSS；删除重复规则时按选择器实际命中和截图结果逐项迁移，不进行整文件格式化。

## 5. 全局外观设置与命令链

### 5.1 偏好键

在现有 client preferences 中增加以下受控键：

| key                      | 类型                      | 默认     | 作用                                            |
| ------------------------ | ------------------------- | -------- | ----------------------------------------------- |
| `appearance.controlSize` | `s \| m \| l`             | `m`      | Button、Input、Select、菜单项等默认高度和内边距 |
| `appearance.textSize`    | `s \| m \| l`             | `m`      | 正文、label、辅助文本的全局比例                 |
| `appearance.cornerSize`  | `s \| m \| l`             | `m`      | 普通组件的全局圆角档位                          |
| `theme`                  | `system \| light \| dark` | `system` | 复用现有主题偏好                                |

持久化值只保存枚举，不保存计算后的 rem、颜色、CSS 文本或 style 对象。读取时使用纯函数验证；未知值回退默认并允许用户重置，不把损坏偏好传播到 DOM。

### 5.2 写入和应用顺序

1. 设置页提交 `preferences.set <key> <value>`，需要时携带 `expectedRevision`；恢复默认使用 `preferences.unset`。
2. runtime 完成 CAS、持久化和 Zustand 投影更新。
3. Web/Tauri 组合根只读取 `preferences` 投影，把有效档位映射为根节点的 `data-hbar-app-ui-*` 属性或受控 CSS 变量。
4. `hbar-app-ui` 组件只消费变量，不读取 runtime、Host、localStorage 或设置表单。
5. 首屏可以像现有主题一样使用只读 bootstrap cache 防止样式闪烁；正式写入仍必须先经过命令，runtime 就绪后用权威投影校正缓存。

外观偏好属于当前设备的全局设置，不随 workspace/session 作用域改变。设置页切换到 workspace/session 时，外观分类仍明确显示为全局/设备偏好，避免让用户误以为控制尺寸会写入 Host 的工作区设置。

### 5.3 设置页面

新增“外观”分类，并把当前页头中的主题选择器移入该分类。页面使用设计系统自己的 Field、Label、Select、Button，不允许用一套未统一的控件配置统一控件。

字段包括主题、控件尺寸、文本尺寸和圆角档位。每个 S/M/L 选项使用宿主提供的中英文标签和简短说明；页面提供实时预览区，至少显示普通按钮、图标按钮、标签、输入框和选择器。选择先形成设置草稿，保存后执行命令；恢复默认执行 `preferences.unset`。保存失败、revision conflict 和持久化不可用在字段组或保存区就近显示，不能只更新 DOM 后宣称成功。

设置保存目标在提交开始时捕获具体 key/value/revision。用户随后切换分类或作用域，迟到结果不能写到其他设置目标。

## 6. `hbar-app-ui` 迁移范围

### 6.1 第一批：公共基础

- 抽出共享类型与 appearance 解析函数。
- 扩展 `tokens.css`，建立 S/M/L、文字、控件、圆角、焦点和状态 token。
- 迁移 Button/IconButton，并补 Text、Label。
- 迁移 Input/Textarea/Select/CheckBox/Field。
- 让 ComboBox/MultiSelect 的输入、开关按钮、选项和移除按钮复用基础规则。
- 保持所有可见文案由 labels/copy props 提供。

### 6.2 第二批：生产组件

按页面族逐项替换原生视觉实现：

1. AppShell、PageHeader、ToolPane、Sidebar、ActionMenu。
2. Conversation、Message、PromptComposer、Run Activity、Approval、Questionnaire。
3. CommandList、参数表单和结果页。
4. Settings、Provider、Extension 和所有 schema field adapter。
5. File、Monitoring、Agent、Goal/Plan、Status。

原生 `button/input/select/label` 可以作为公共组件内部的语义节点存在；`@hbar/app-react` 业务页面不再直接写可见控件，除非公共组件无法表达已证实的语义。发现缺口时先扩展通用组件，再迁移页面。

### 6.3 第三批：catalog 组件族

`hbar-app-ui` catalog 的 Editor、Navbar、File Manager、Tool Calls、Agent Activity、Agent Approval、Agent Plan、Settings Form、Notifications、Wizard、Feedback、Support、Billing、Integrations 等组件族逐族迁移。每族要求：

- 删除自己的基础按钮/标签/输入皮肤，组合共享原语或内部共享基类。
- 只保留该组件族独有的布局与数据可视化样式。
- 示例内容继续由 catalog fixture 提供，组件实现不嵌入英文演示文案。
- 单族完成视觉矩阵、交互检查和 guards 后独立提交，不进行一次性全库替换。

catalog 变体数量不构成新增 size/variant 的理由。只有生产语义或多个组件族重复出现的角色才能扩展公共 API。

## 7. CSS 与调用端门禁

新增静态检查，作用于生产入口和已迁移的 catalog 组件族：

- 禁止业务 CSS 对公共控件 class 设置 `font-size`、`font-family`、`line-height`、控件高度、圆角、边框、背景及 hover/focus/disabled 样式。
- 禁止新增未在 token 文件声明的一次性字号、控件高度和普通圆角。
- 禁止业务 TSX 新增带可见样式职责的原生按钮、输入和选择器；允许公共组件内部、文件输入等原生能力边界，并用有原因的 allowlist 记录。
- 禁止任意数字形式的组件 `size` prop；图标继续由 icon-scale guard 检查。
- 禁止组件实现硬编码可见文案；继续运行 content-contract guard。
- flow-layout guard 继续拒绝普通内容的坐标定位、固定内容高度和非间距 px。

门禁先以报告模式建立基线，再按迁移批次缩小 allowlist；最终生产路径必须归零。历史 catalog 只在所属组件族开始迁移后进入强制范围，避免用海量无关修复掩盖当前子功能。

## 8. 实施子计划与提交边界

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

## 9. 真实视觉与交互验收

### 9.1 组件矩阵

为真实组件建立可交互矩阵，不用静态仿制 DOM：

- Button：S/M/L × solid/outline/ghost × 五种 tone；normal、hover、focus-visible、pressed、disabled、busy。
- IconButton：S/M/L 命中区与五档图标绘制框分别量测；检查 aria-label、tooltip 和长本地化标签。
- Text/Label：正文、label、supporting、code；中文、英文、长路径、错误和禁用颜色。
- Input/Select/Textarea：S/M/L；empty、filled、placeholder、focus、invalid、readOnly、disabled。
- ComboBox/MultiSelect：关闭、展开、空、loading、error、分页、键盘选择、长选项、多个 tag。

每个状态保存截图和 computed style JSON，至少记录字体族、字号、行高、控件高度、padding、radius、border、背景、前景、outline 和实际 bounding box。自动断言只判断 token 和几何契约，最终仍查看原分辨率截图。

### 9.2 生产页面矩阵

复用完整生产 Web/Host 和 Tauri harness，至少检查：

- `1440×960`、`1024×768`、`900×600` 的 Web 与真实 Tauri 允许尺寸。
- Web 的 `390×844`、`320×720`。
- zh-CN light、en-US dark，并交叉检查另外两种 locale/theme 组合。
- S/M/L 三档分别在设置页保存、立即生效、刷新恢复和重置。
- 设置页、空会话、长会话、命令面板、Provider、文件工具、Monitoring、Agent、Goal/Plan、状态中心。
- 侧栏出现时仍推动主区；文字放大后不遮挡、不产生横向溢出，按钮和输入在同档下对齐。
- `hover:none`、touch、reduced-motion、DPR 1/1.25、Tab/Shift+Tab/Enter/Space/Escape 和 focus trap。

共享页面继续与 cc-haha contact sheet 对照信息层级、密度、就近反馈和响应式转换；不为追逐单张截图给组件增加一次性像素值。

### 9.3 写操作事实

外观保存必须同时断言：

- 设置控件显示新值。
- `preferences` 投影包含目标 key、value 和新 revision。
- 持久化 envelope 包含相同事实。
- 根节点属性和 computed CSS 变量与该值一致。
- 实际 Button/Input/Text 几何按预期变化。
- 刷新后仍一致；unset 后恢复默认。

只看到选择器变化、toast 或 CSS 变量变化不算完成。失败和 revision conflict 不得留下“看起来已经保存”的状态。

## 10. 完成标准

- 生产 UI 的可见 Button、IconButton、Label、Input、Textarea、Select、CheckBox、ComboBox、MultiSelect 均由 `hbar-app-ui` 公共设计系统提供。
- 公共尺寸只使用 S/M/L；按钮 variant 只使用 solid/outline/ghost；tone 集合不在页面自行扩张。
- 全局默认从设置页通过 `preferences.set/unset` 修改，Web/Tauri 一致并可刷新恢复；显式组件 size 只覆盖自身。
- 业务页面不再定义公共控件的字体、高度、圆角、边框、背景、hover、focus 和 disabled 视觉。
- `theme.css` 不再重复 Button/Form 基础规则；每个组件样式有唯一所有者。
- 生产门禁中的未登记原生可见控件、一次性基础值和越权覆盖为零；catalog 按已迁移组件族逐步归零，DS7 后全部强制。
- 所有新增文案由宿主类型化提供；图标尺寸、流式布局、严格类型和 lint guards 通过。
- Web 与 Tauri 的真实设置写入、页面交互、视觉矩阵和人工原图复核通过，报告准确记录测试数、截图数、失败修复和保留差异。

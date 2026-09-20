# UI 总体架构与状态设计

上级：[UI 总计划](index.md)。执行顺序与完成状态见[任务清单](execution-plan.md)。本文同时记录已经落地的核心架构和仍待完成的布局/恢复边界；最终证据见[验证矩阵](final-validation-matrix.md)。

## 1. 固定产品结构

采用一个应用外壳、一个主页面、一个会话工具区和一个应用模态出口。没有顶部多会话标签、任意停靠或第二套页面路由。

```text
Web / Tauri Composition Root
├─ Host Client、平台能力、i18n、布局描述、注册表
├─ AppRuntime（Zustand + commands + 只读 projections）
└─ AppReact ViewModels
   └─ hbar-app-ui AppShell
      ├─ AppSidebar：工程 → 会话 / 全局入口
      ├─ PageHeader：目标、状态、所属页面操作
      ├─ MainPage：session | settings | status
      │  └─ SessionPage：Timeline + PromptComposer + UsageSummary
      ├─ SessionToolOutlet：files | monitoring | agents | goals
      └─ ModalOutlet：commands | provider-editor | command-form
```

扩展/技能管理是 Settings 的分组。会话设置打开同一个 Settings 页面。欢迎/无会话是 SessionPage 的空状态，不建立一个与会话竞争的 Dashboard 首页。

## 2. 单向依赖与职责

| 层                                     | 允许持有                                             | 对上接口                                | 禁止                                     |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| commands / schema-core / settings-core | 命令描述、校验、表单状态转换、分层解析               | 现有公开框架契约                        | 引入 React 或 hbar 页面知识              |
| app-runtime                            | 实体索引、业务草稿、表单、导航、请求状态、展示上下文 | `commands.execute`、只读 reader / query | DOM、ReactNode、浏览器元素引用           |
| app-react                              | selector、格式化映射、命令绑定、组件适配             | 每个页面的窄 ViewModel / props          | HTTP/WS、Host 私有实现、直接写共享 store |
| hbar-app-ui                            | 控件、语义布局、视觉 token、局部交互                 | 类型化 content / labels / callback      | 会话 API、业务结算、内置 demo 数据       |
| apps/web 与 Tauri 适配                 | 注册业务模块、连接、平台文件选择/窗口、语言资源      | 注入 ports 和 registry                  | 变成所有页面共同导入的全局服务对象       |

UI callback 表达意图；app-react 将意图转换为 command。打开页面、面板和弹窗必须走命令。悬停、输入法组合、选区、局部折叠和图表光标由组件管理。输入文字作为业务草稿时仍走现有 draft/form 命令。

## 3. 展示状态模型

现有 `PanelSurface` 继续持有 instanceId、target、binding；app-runtime 已实现统一 presentation slice。当前契约的核心形态如下，实际类型引用现有 ID / scope 定义：

```ts
type MainPage = { kind: 'session' } | { kind: 'settings'; instanceId: string } | { kind: 'status'; instanceId: string }

interface PresentationState {
  readonly page: MainPage
  readonly toolInstanceId: string | null
  readonly modalInstanceId: string | null
  readonly returnContext: SessionViewContext | null
  readonly sidebarOpen: boolean
}
```

`SessionViewContext` 当前只保存 workspaceId、sessionId 和 toolInstanceId。页面 scope、section 和表单目标继续存放在对应 `PanelSurface.params` 与模块投影中；消息、草稿、表单与请求不复制进 presentation。滚动锚点和通用触发焦点恢复尚未进入该 slice，仍分别属于 R3.5 与组件/NativeDialog 的局部行为；DOM ref 不进入持久化状态。

现有 surfaces 是实例和目标的事实源；presentation 是落点和活动关系的事实源。`focusedPanelId` 在迁移期只作为兼容派生值，不能再独立决定整个主页面。移除 `App.tsx` 中由一个 focusedPanelId 决定所有页面的串行分支。

### 转换规则

| 事件/命令                                      | 状态变化                                                      | 保留内容                       |
| ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| `app.setSession` 成功                          | 进入 session 页、更新选择；关闭过期导航浮层                   | 每会话草稿、滚动锚点、业务运行 |
| `app.setSession` 失败/被后续请求替代           | 原页面与选择保持有效，入口反馈错误                            | 原上下文                       |
| `app.openPanel(files/monitoring/agents/goals)` | 设置唯一 toolInstanceId；重复打开聚焦原实例                   | 聊天与输入区                   |
| 切换工具                                       | 旧工具退出可见区；草稿保留在所属 runtime 模块                 | 旧工具的未保存输入             |
| `app.openSettings` / `app.openStatus`          | 首次离开 session 时捕获 returnContext；管理页之间切换不覆盖它 | 原会话与工具                   |
| `app.openSettingsEditor`                       | 创建/聚焦 provider-editor 模态，父设置页保持                  | 原分类、作用域、表单           |
| `app.closePanel`                               | 仅清除对应活动区域；模态关闭恢复触发点                        | 其他区域与实体                 |
| 新增 `app.back`                                | 先处理模态内部返回，再关闭工具单页，最后退出管理页            | 已有草稿；无会话则回到空会话页 |
| 新增 `app.setSidebarVisible`                   | 仅改变侧栏/抽屉可见性                                         | 主页面、工具、会话选择         |

`app.back` 与 `app.setSidebarVisible` 已注册为公开应用命令、进入分类文案并保持 CLI 可调用。现有业务命令参数、幂等、回执语义不因布局改变。

`followActive` 工具跟随会话切换，读取结果必须校验 generation 和 target；`pinned` 工具继续显示固定目标，在标题显示目标名称。写操作捕获执行时目标，后到回执归原目标。会话被删除/归档时转为明确空态，不静默选择另一个工程。

## 4. 注册表与布局职责

页面注册描述表达 `id / outlet / supportedScopes / labelKey / icon / requiredCapability / componentType`。outlet 由注册定义，不由任意命令字符串决定。描述仅含可序列化值；React component 与 command callback 在组合根白名单注册。

默认布局已经升级为 version 2，表达稳定 `moduleId`、outlet、区域、顺序、尺寸、可见性与响应式配置。`projects / workspace / session-tool` 分别固定到 sidebar/page/tool，由同一描述向 `HbarAppUiAppShell` 提供 sidebar 与 tool 的受控尺寸；组件仍以正常 flex 流和既有 drawer/page 断点呈现。仓库虽有 `flexlayout-react` 依赖，生产外壳没有引入它：当前产品没有标签、拖拽停靠或自由分区需求，加载其交互模型会重新制造用户要求删除的导航复杂度。若以后确有多标签停靠需求，应新增明确任务和布局模块版本，不能让依赖存在本身决定 UI。

布局负责几何和偏好；presentation 负责当前目标与页面。默认文件中的 visible 是初始值，恢复后由活动展示状态派生实际可见性，不能产生两套互相覆盖的面板开关。

旧 sidebar v1 数据只迁移有效宽度与隐藏型初始偏好。`visible: false` 可在恢复后首次关闭侧栏；`visible: true` 不会覆盖窄屏自动关闭或用户后续显隐命令。未知模块、重复/缺失 ID、损坏 JSON、越界尺寸回退默认；原存储不被删除，便于诊断。持久化白名单排除模态、连接、运行中状态、请求回执和敏感表单数据。普通草稿继续由已有机制管理。

## 5. 组件与样式组合

生产入口只导入 `hbar-app-ui` 及其受控子入口。`catalog`、变体 `spec` 和 fixtures 只存在于预览/测试。同一个生产组件必须同时能在独立预览和实际页面中正确显示。

优先扩展现有 AppShell、Conversation、PromptComposer、NativeDialog、CommandList、WorkspaceFiles；先修组件责任范围内的样式，再接入页面。禁止通过 app-react 中几十个 descendant override 临时修饰库内结构。

新基础契约仅在缺少复用能力时增加：PageHeader、ToolPane 的受控 action slots、Field / Input / Select / Textarea、紧凑 Usage 模式。完整盘点见[组件整治](component-remediation.md)。旧 props 优先通过可选扩展兼容；迁移最后再删除确实没有调用者的接口。

## 6. 异步与生命周期

隐藏会话不停止 Run，页面卸载不销毁业务草稿。可见性只影响订阅、昂贵渲染和非必要采样；停止运行必须执行明确的业务命令。

管理页草稿按 formId 和 scope 隔离；切换作用域保留普通字段草稿，凭证字段按现有敏感状态策略重置。关闭会造成未保存凭证丢失时，在原弹窗提供明确选择；结果未知时提供 reconcile，不显示成功。

长历史、工程会话树、文件和日志使用分页/虚拟化。selector 保持细粒度，流式字符更新不得重绘侧栏、设置分组和所有工具。每个订阅、Observer 和平台监听均有释放路径。

## 7. 架构验收

- UI 中没有跨层写 store、直接 Client 请求或复制服务端实体。
- 两个会话快速切换、旧响应后到、固定目标工具和管理页返回均有行为测试。
- 同一时刻最多一个主页面、一个活动会话工具和一个应用模态；菜单/tooltip 是所属控件的局部浮层。
- 关闭/返回/快捷键不误发业务操作，关闭页面不取消运行。
- 独立组件预览、完整页面 fixture、真实 Host Web 与 Tauri 使用同一生产组件契约。

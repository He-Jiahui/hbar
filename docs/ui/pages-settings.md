# 页面设计：Schema 设置与供应商编辑

上级：[UI 总计划](index.md)。任务范围 R5.1–R5.4，组件前置项属于 R1。

## 1. 页面结构

```text
返回会话    设置                 作用域：[全局 / 工程 / 会话]  目标名称
──────────────────────────────────────────────────────────────────────
Schema 分类栏                    当前分类标题
模型与行为                       设置组
会话默认值                         字段标签              控件
供应商                             来源/帮助              校验
外观                             …
扩展                             独立内容滚动区
…                                未保存数量              保存
```

分类来自描述和注册的管理分组，未知或不可用分组有明确状态。实际首版只显示有真实 Schema/功能的分组；“外观”等新增项随对应能力交付，不为了设计图硬塞空内容。

页面复用统一 PageHeader 和设置布局 primitives。`HbarSettingsWorkspace` 保留数据与 command 绑定，去掉大外层卡片、重复描述和并排作用域大按钮。作用域控件同时显示目标名称，不能只写“Session”让用户猜修改谁。

分类栏独立滚动，表单内容独立滚动，保存条在滚动内容外。<48rem 分类改为选择入口并保留当前分类；字段从标签/控件双列变为上下顺序，不把所有 label 固定为窄列。

## 2. Schema 与视觉组件适配

继续使用 HbarSchemaForm、ComponentRegistry、FormState 和 Settings resolution。增加 app-react 的 `createHbarSchemaComponents` 装配，把标准 Schema 类型映射到 hbar-app-ui 的受控字段；设置页、Provider 编辑和命令参数表单共用。

| Schema 能力         | hbar-app-ui 目标呈现                | 约束                                                                   |
| ------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| string / TextField  | Field + Input                       | 标签、帮助、错误、readOnly/disabled 与原生关联                         |
| integer / number    | Field + 数值输入                    | 保留用户 raw draft；提交校验上下限、步长和单位，不提前覆盖非法中间输入 |
| secret              | 密码控件、已配置状态、显式替换/移除 | 凭证不进入普通 reader、日志、截图 fixture 或页面恢复数据               |
| boolean             | Switch/CheckBox                     | 语义值由 Schema 决定，不能用按钮颜色代替状态                           |
| enum / 动态 options | Select / 可搜索 ComboBox            | options 稳定 ID、loading、empty、unavailable、error、selected-invalid  |
| multiple            | MultiSelect                         | 数组值和选项报告真正支持时注册；不把现有单选 ComboBox 标记为多选       |
| file / directory    | 路径控件＋选择按钮                  | 显示 Host/本机环境，统一 ResourcePickerPort                            |
| List                | 稳定条目 ID 的行列表＋新增/编辑入口 | 不按数组下标绑定编辑、删除、重排                                       |
| 子页面 editor       | 注册的 ProviderDialog 等            | Schema 声明 editor 类型，宿主白名单解析；不执行描述中的任意代码        |

现有 SettingsField 主要服务目录中的设置变体，不直接当作完整 Schema renderer。抽出其行布局和视觉能力，补齐 public props 后复用；不能把全局设置数据硬塞进 demo 的 Workspace/Profile 内容类型。

多选属于 R5.1 的交付要求：为 single/multiple 分别注册匹配契约的 renderer，复用 schema-core 的数组值校验和类型报告；若现有公开契约缺少所需数组能力，先补齐并验证该窄契约，再开放 UI，不能用“暂不注册”代替实现。

## 3. 多层 override 的显示与提交

全局→工程→会话优先级由 settings-core 解析。字段显示有效值、来源层和本层覆盖状态；默认只展示紧凑来源标记，详细信息按需展开。

- 继承字段可编辑，首次修改建立本层 override。
- “恢复继承”执行 unset 意图，不等价于写入上层当前值或 default。
- 值为 null 与键不存在分别呈现和提交，遵守现有 Schema 定义。
- 保存只提交本层 dirty/unset，不把整张有效值表写回覆盖上层。
- 切换 scope 保留各自普通草稿和分类；正在提交/未知结果的表单保持绑定原 scope。
- 显示字段的生效模式：即时、新 Run、生效需重启等均来自 metadata；不能把持久化成功写成运行态已经应用。
- 版本冲突/应用失败原位反馈；未知结果调用 reconcile，不自动重复保存。

## 4. 供应商列表和对话框

供应商分组显示名称、协议/模型摘要、凭证配置状态。行点击编辑，更多菜单放删除等次要操作；顶部仅一个添加入口。行中不显示原始密钥或密集拼接全部字段。

点击添加/编辑继续执行 `app.openSettingsEditor`，落点改为 NativeDialog。父设置页保留原分组、滚动与 scope；对话框标题显示添加/编辑和供应商名称。

表单分为基础连接、模型能力、价格/预算相关高级字段。普通内容流不固定高度；长内容在 body 滚动，footer 保持取消/保存。删除移到明确的危险操作区，避免与保存同等强调。保存中禁重复；保存成功更新列表并关闭；失败保留字段并定位首个错误；未知回执留在对话框核对。

普通编辑草稿可保留；凭证按安全策略释放。关闭时若会丢失未保存凭证，在当前对话框内提供继续编辑/放弃的明确选择，不悄悄丢弃，不自动保存。

## 5. 动态内容回调

沿用 Schema metadata 中的命令/回调声明、SchemaPath 与类型报告。例如 provider/model 变化后请求 thinkingLevels：renderer 只接收 options 报告，app-react/runtime 负责通过注册端口调用。

请求捕获 formId、字段 path、依赖值 revision 和 scope；新模型取代旧模型时取消旧请求或丢弃旧报告。旧选中值不再合法时显示 selected-invalid，由用户选择新值；不能默默替换为列表第一项。

动态内容是只读查询；改变字段与提交通过 form command。列表项删除后迟到回调不能写入相同数组下标的新条目。异步列表无内容、无能力、失败分别显示，表单其他字段保持可用。

## 6. 扩展与技能

将现有 HbarExtensionWorkspace 改为设置内的嵌入内容：插件与技能两个分区，显示安装/启用状态、来源、版本及已有可执行操作。当前只通过 command 可执行的操作继续跳转对应参数流程，不伪造管理表单。

扩展页不再有独立全局关闭按钮和重复 h1。命令 `app.openPanel('extensions')` 在兼容期解析到 settings/extensions，旧快捷入口仍有效。未实际支持的安装/权限修改不新增无行为按钮。

## 7. 验收

全局、工程、会话三层各自修改/保存/恢复继承；same-value override/null/unset；动态选项快速切换；失效选项；长 provider 列表；嵌套 SchemaPath；文件/目录环境区别；密码不泄露；保存失败/冲突/未知；关闭和返回焦点；320 宽度长标签和表单 footer 可见。对比参考的设置截图，但不能用相似外壳掩盖字段契约缺失。

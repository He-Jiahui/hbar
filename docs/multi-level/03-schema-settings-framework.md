# P3：Schema 描述、动态表单与分层设置框架

状态：第一阶段框架已完成；A4 已交付无 UI schema-core，A8 已交付 settings-core 分层解析，A9 已交付动态 callback query bridge，A10 已交付 Host 设置 repository、版本向量 CAS、幂等原子 apply、迁移注册、类型化 commands 与 CLI。P3.5/B3 已交付独立 `@hbar/schema-react` 的标量 ComponentRegistry、EditorRegistry 与受控 renderer 基础，以及 Host `settings.describe` 和真实模型/思考等级 callback；分层设置工作台和 List/ProviderDialog 仍在实施。上级：[总计划](command-first-architecture-plan.md)。依赖：[命令契约](01-command-framework.md)、[runtime 表单宿主](02-state-runtime-cli.md)。无 UI 框架与 React 适配保持独立 package。

## 1. 为什么分成两个 package

| 包                    | 独立行为                                                                 | 使用者                                       |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `@hbar/schema-core`   | 描述编译、数据验证、稳定路径、FormState 转换、动态内容依赖、组件需求描述 | 命令参数表单、设置表单、CLI 提示、定制编辑器 |
| `@hbar/settings-core` | 有序层级、继承、覆盖、来源、版本、ChangeSet、持久化端口与迁移            | Host 设置服务、CLI 查询、客户端设置预览      |

命令参数表单不需要全局/工作区/会话覆盖；分层设置又不能依赖打开某个 React 表单。两个包共用数据约束，保存方式由 hbar command adapter 绑定。框架中不写 `if (provider === 'openai')` 或“预算到零停止”等业务规则。

hbar 注册全局/工作区/会话的层级顺序、允许覆盖的字段、Schema、callback 和应用服务。settings-core 使用传入的 layer graph/ordered chain，不硬编码 Session 数据库。其纯解析部分可在无网络测试中运行，权威提交仍在 Host。

## 2. 描述结构与可执行代码分离

| 描述层            | 负责内容                                                                       | 示例                                                        |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Data Schema       | 类型、默认值、nullable、范围、枚举、字段/集合结构、唯一键                      | integer min/max、array items、object properties             |
| Presentation      | label/help 的 i18n key、group、order、component、element、编辑模式             | List、ComboBox、FilePicker、DirectoryPicker、ProviderDialog |
| Behavior metadata | get_content、dependsOn、resultSchema、validation callback、submit command/映射 | `settings.getThinkingLevels`                                |
| Settings policy   | owner、允许层级、merge、敏感性、生效时机、持久化范围                           | Host 层级覆盖、device profile、nextRun                      |

描述文件使用版本化、可序列化 JSON 结构。框架先确定支持的类型/校验子集，显式拒绝不支持的关键字、冲突默认值和非法引用。命令参数 schema 与表单数据 schema 来自同源定义；数据约束不会因为换 renderer 而变化。

不接受函数、任意 JS 条件、import 路径或运行时脚本。条件展示/启用使用有界声明式判别表达式或具名只读 callback，验证依赖无环。隐藏字段仍遵守数据校验与权限，隐藏不等于丢弃或获授权。

## 3. 供应商 List 与定制子页面

下面是目标描述示意；`$ref` 只指向已经注册且版本兼容的 Schema ID，不远程下载。

```json
{
  "schemaVersion": 1,
  "id": "hbar.providers",
  "type": "array",
  "keyField": "providerId",
  "items": { "$ref": "hbar.provider@1" },
  "component": "List",
  "element": "ProviderDialog",
  "label": "i18n:settings.providers",
  "metadata": {
    "editorCommand": "app.openSettingsEditor",
    "merge": "keyed"
  }
}
```

List 负责条目与稳定 providerId，element 表示条目的编辑呈现方式。`ProviderDialog` 通过 editor registry 注册为受控子页面，获得 scope、formId、entryId、只读字段报告和命令回调。它可以组织 tabs、嵌套表单或模型列表，但不能直接读取全局 store、发 RPC 或保存数据库。

打开/关闭该子页面分别经应用命令。`app.openSettingsEditor` 用 Schema 编译结果验证 element、目标 path、条目 ID 与权限。CLI 直接按同一数据路径编辑，即使没有 ProviderDialog renderer 也能完成配置。

## 4. 动态 ComboBox 的声明

保留用户提出的 `get_content` 具名 callback。`label` 为规范拼写；`multiple: true` 在持久数据上表示数组，不同时声明为 string。若实际业务是从多个等级中选择一个，则用 nullable string 并令 multiple 为 false。下面明确演示多选字段机制，不声明某个真实模型当前支持哪些等级。

```json
{
  "name": "thinkingLevels",
  "label": "i18n:settings.thinkingLevels",
  "type": "array",
  "items": { "type": "string" },
  "nullable": true,
  "multiple": true,
  "component": "ComboBox",
  "default": null,
  "metadata": {
    "get_content": "settings.getThinkingLevels",
    "dependsOn": ["provider.id", "provider.model"],
    "resultSchema": "settings.optionList.string@1",
    "applyMode": "nextRun"
  }
}
```

可接受的 authoring 简写必须在编译时归一成唯一数据类型；首版规范采用上述数组表达，不维护有歧义的两套类型语义。List 条目内的依赖路径相对当前 provider 条目解析，不能意外查询另一供应商。

## 5. callback 注册、调用与结果报告

```ts
// 目标 API 示意：以显式注册保留 input/output、作用域和 disposer。
const settings = registry.namespace('settings')
const dispose = settings.registerQuery('getThinkingLevels', {
  definition: thinkingLevelQueryDefinition,
  execute: ({ data, path }, context) => modelCapabilities.getAvailableThinkingLevels(data, path, context.signal),
})
```

这对应“先注册 settings 命名空间，再注册 settings.getThinkingLevels”的调用方式。采用 registerQuery 而非任意属性赋值，是为了在注册时验证契约、冲突、生命周期和执行域；需要属性式语法糖时也必须落到同一注册入口。

`SchemaCallbackPort` 是 schema-core 的端口，runtime/Host adapter 将 callback ID 映射到 commands 的 query；schema-core 本身不依赖 commands。动态 callback 共用名称、鉴权、输入输出、超时和错误机制，禁止另建一个绕过命令目录的 callback bus。

输入包含 schemaId/version、scope、formId/revision、SchemaPath、依赖值和可选分页/搜索参数。`data: SettingsForm` 是按依赖和权限裁剪的只读有效值加合法草稿，不把完整全局配置、凭据或其他会话数据发给 callback。Host 重新解析 scope/path 并校验草稿，不能信任客户端自报的有效值。

SchemaPath 使用字段段和稳定条目 ID 的结构化 segment；文本路径仅为 CLI 编解码。数组重排不能让 callback 指向另一条目。特殊字符、点号、斜线、重复 key 和已删除条目均要验证；UI 不自行拼可歧义的点分字符串。

动态内容结果是按 kind 判别的类型化报告：

```ts
// option value 的 T 由字段 items/type 推导，不能变成任意对象。
type OptionContentReport<T> =
  | { kind: 'options'; status: 'unavailable'; reasonCode: string }
  | {
      kind: 'options'
      status: 'ready'
      options: readonly {
        value: T
        label: LocalizedText
        disabled: boolean
        reason?: LocalizedText
      }[]
      dependencyFingerprint: string
      capabilityRevision: string
      nextCursor?: string
    }
```

`LocalizedText` 区分宿主可解析的 typed i18n key 与供应商返回的实际名称；稳定 ID 不当显示文字兜底。查询抛错映射为统一 CommandError；loading/error/retry 是 form state。成功空 options、能力 unavailable 与请求失败不能合并。

其他 callback 可返回 validation report、字段只读/可见性报告或受注册 schema 校验的定制内容报告；每个 kind 有明确接收者和大小限制。不能返回任意 JSX、HTML、执行函数或自由格式“控制 UI 的脚本”。读取 callback 无业务写权限，点击动态按钮执行独立 command。

## 6. 动态依赖与表单状态机

1. 编译 dependsOn 为 DAG，循环、缺失字段和不兼容 resultSchema 阻止注册。
2. `form.setField` 只改本地草稿 revision，重算本地验证并失效受影响内容，按声明的触发方式发起有界查询。
3. 请求携带 scope、Schema/capability version、依赖指纹、form revision 和 generation。依赖改变、切换 scope、关闭实例时取消旧请求；无法取消的旧结果也必须丢弃。
4. 缓存键含身份/权限、Host、作用域、Schema/callback 版本、依赖值、搜索词和页游标。缓存有 TTL、容量上限及失效策略，不跨不同凭据/供应商泄漏候选项。
5. 选项改变不自动覆盖用户输入。已选值不再合法时标记错误，提供显式重置或重新选择；不静默替换为第一项。
6. 保存前 Host 再查所需能力或验证对应 capabilityRevision，避免绕过 UI 或提交过期选项。

FormState 至少包含数据 baseline、draft/dirty paths、字段错误、内容状态、baseline revisions、submit 状态与回执。`setField/addItem/removeItem/moveItem/reset/validate` 是纯状态转换，由 runtime 的本地命令 handler 驱动。数值输入的临时字符串与已校验 number 分开，空输入、负号中间态、null 不被强制转换成 0。

表单与命令参数共享数据约束；设置保存通过 `settings.apply`，普通命令表单映射到其 command input。提交捕获 formRevision；成功只确认提交的字段版本，期间新编辑仍保留为 dirty。

## 7. 全局 → 工作区 → 会话覆盖语义

```text
Schema default → global override → workspace override → session override
```

| 情况             | 固定行为                                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| 本层没有记录     | 继承上层；不是把 effective 值复制到本层                                         |
| 本层显式 null    | 仅 nullable 字段可用，是实际值，不表示继承                                      |
| `settings.unset` | 删除本层覆盖，恢复继承                                                          |
| 对象             | 按声明字段组合，拒绝未知/禁止字段                                               |
| 普通数组         | 默认整体替换；空数组是显式空值                                                  |
| keyed List       | 显式 keyField；按 ID 覆盖字段，删除继承项用本层 tombstone，恢复时删除 tombstone |
| List 排序        | 数据值与独立的 ID 顺序声明分开；缺失新 ID 按 Schema 规定追加，不能按下标合并    |
| 恢复默认         | 将 Schema 默认写成本层覆盖，或明确执行范围受限的 reset；与 unset 分开           |
| 不允许的覆盖层   | Host 拒绝，UI 显示字段归属/只读原因                                             |

每字段返回 `localPresence/localValue/effectiveValue/sourceLayer/sourceRevision/inherited/validation/applyState`。含敏感字段只返回引用和是否已配置，不能读取真实秘密。UI 与 CLI 可解释“为何现在是这个值”。

三层解析按 Host/身份/workspace/session 明确边界。工作区或会话不存在/无权限不降级到全局保存。主题、语言、窗口布局归 device/client profile，不自动参与远程 Host 的三层链；在同一 UI 呈现时仍显示独立保存归属。

## 8. 保存、并发与副作用

`settings.set/unset` 是单变更语法，最终进入与 `settings.apply` 相同用例。apply 输入为 schemaVersion、作用域、set/unset/明确集合操作、受影响层级的 baseline revisions 和 idempotencyKey。

首批 Host adapter 已把 `settings.get/set/unset/apply` 注册到统一命令目录。SDK 与 CLI 只通过 `command.execute` 调用这些定义；`set/unset` 的 CLI 便捷入口可先读取版本向量，也允许自动化显式传入 `--baseline-json`。需要可靠重试时保存首次使用的版本向量，并以相同输入和幂等键重试；`apply` 接受包含 scope、ChangeSet 与完整版本向量的输入 JSON，因此能够原子提交多字段。按路径查询只裁剪返回报告，不改变同一 scope 的版本向量。

流程：读取层级快照 → 合并变更集 → 解析候选 effective → Schema/跨字段/领域验证 → compare-and-commit → 记录事件/回执 → 安排生效。保存的是本层 patch，不是整个 effective 对象，否则会冻结继承。

版本向量覆盖目标层和参与解析的上层；父层变化使候选失效时返回冲突/重校验报告，不能只检查 Session 一层。变更集在同一持久化 owner 内原子提交，provider/model 不更新一半。跨 Host 设置与 device profile 不假装有分布式事务：拆成显式保存组，各自报告结果并保留失败草稿。

跨字段业务校验由 `SettingsDomainValidator` 注册。耗时远程验证在短事务外执行，提交时核对版本/能力 revision；不可保证原子验证的能力变化在生效时再次检查并呈现错误。

每字段声明 `immediate | nextRequest | nextRun | restart`。已持久化与已生效分开；需要外部重配的任务使用可恢复 operation/意图，失败显示 applyFailed，不能回报“全部成功”。Run 记录所用设置版本；权限撤销等安全策略即时生效，不因 nextRun 延迟。

活动预算是领域账本，不作为任意 settings.set 路径写入。预算编辑器提交 `session.setBudget`；新 Session 默认预算可以是设置，由创建用例读取。模型的 Session 命令与对应设置字段最终调用同一模型配置用例，不保留互相冲突的两份值。

A11c 已落实模型配置的共享事实：`session.setModel` / `session.setThinkingLevel` 与通用 `settings.apply` 共用同一 SettingsService、层级、版本向量、事务和回执表。Host 注入模型候选验证器，因此通用设置入口也不能写入不存在的 Model 或不受支持的思考等级；切换模型所需的兼容等级修正和模型值在一个 ChangeSet 内提交。CLI/TUI 读取 `session.getModel`，仅在本次 Run 显式参数缺省时采用持久有效值。

## 9. 路径、凭据、迁移与组件扩展

- FilePicker/DirectoryPicker 声明位置为 client-local、Host 或 workspace；远程 Host 路径通过其查询能力选择。浏览器文件上传得到 artifact 引用，不能将客户端路径写成 Host 路径。
- 密钥经 CredentialPort 专用 command 写入，普通设置存 secretRef；日志、补全、历史、快照、callback 数据均不包含明文。
- Schema version 迁移由字段所有者注册，验证旧数据、目标结果和回滚/备份策略。未知字段/插件未加载的值保留为不可用数据，不静默删除或当作合法已生效。
- ComponentRegistry 在 app-react 注册“支持的数据类型、multiple、编辑模式、内容报告 kind”和 renderer。EditorRegistry 注册 ProviderDialog 等子编辑器；组件不兼容在编译/装配时失败，保留通用只读诊断。
- 每种定制 component 都有 CLI 数据表达/查询路径；不允许必须点击某个自定义按钮才能构造合法持久值。

## 10. 独立交付与验收

| 切片 | 产出                               | 独立验收                                                   |
| ---- | ---------------------------------- | ---------------------------------------------------------- |
| P3.1 | schema-core + 命令参数表单         | 类型/范围/default/null、路径与稳定 ID、非 React 状态机     |
| P3.2 | settings-core + 三层解析           | 继承、unset、null、数组替换、keyed 删除/排序、来源报告     |
| P3.3 | callback bridge + 动态内容         | Provider/Model 变化、旧响应、循环依赖、返回类型、失败/空值 |
| P3.4 | Host apply/CAS/迁移 + CLI          | 原子多字段、上层并发、权限、幂等、保存与生效失败           |
| P3.5 | 随 P5 接 component/editor registry | List/ProviderDialog/ComboBox、长文案、CLI 与 UI 等价       |

必须以行为测试覆盖跨 scope 草稿、提交期间继续输入、插件卸载、路径环境、敏感值排除和容量边界。第一阶段 P3.1–P3.4 无 GUI 可验收；P3.5 属于第二阶段。

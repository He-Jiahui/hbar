# @hbar/schema-react

`@hbar/schema-react` 是 `@hbar/schema-core` 的受控 React 渲染适配层。它提供有生命周期的 ComponentRegistry、EditorRegistry、标准字段适配器和 `HbarSchemaForm`；不包含 hbar 设置字段、Client、Host、Storage、Zustand 或保存逻辑。

一个组件注册同时声明版本、支持的数据类型、动态内容种类、交互模式和 renderer，并向 schema-core 暴露只读的兼容性注册表。应用把 `HbarSchemaForm` 的 intent 转换为本地表单 command；renderer 不能取得可写 store 或传输对象。所有可见文案和动态内容的本地化函数由宿主提供。

调用方可以用有序 `fieldNames` 投影单个可见分组，并在通用控件旁渲染宿主提供的字段上下文与操作。插槽本身不修改表单状态；其事件处理仍须派发 application command。

宿主通过 `SchemaFormPresentation` 注入 `Form`、`Field`、`Feedback` 和 `Reset` 展示插槽。`Field` 接收具名标签、帮助、上下文、布局与原始字段；控件和反馈保留在同一字段中。Desktop 注入 `lumenSchemaFormPresentation`，直接使用 Lumen 表单、内容和按钮组件。Schema 包不依赖 Lumen。

注入展示时，每个表单用 React `useId` 生成独立控件 ID；注册 renderer 必须把 `id`、`aria-describedby` 和 `aria-labelledby` 转发给实际控件。标签与帮助、字段错误及内容错误保持关联，原始 `field.name` 继续作为所有 intent 的目标。通用默认展示保留旧控件 ID，帮助说明现在也参与可访问描述。`data-schema-form`、`data-field` 和字段上的 `data-control-id` 标记展示及控件关联边界，供宿主从所属字段恢复焦点与进行集成验证；恢复逻辑不重算全局 ID。

表单遵守 schema-core 既有的 1–64 字段上限；`fieldNames` 可以投影空集合，重复名字去重，失效名字忽略，顺序沿用编译后的 schema。字段数量有界、内容自然增长，滚动由外层设置面板负责。没有可编辑字段时不生成假字段。

EditorRegistry 用于 `ProviderDialog` 一类高度定制的子编辑器。它只管理描述、renderer 与卸载生命周期；打开、关闭、保存和查询仍由应用 command/runtime 负责。

`HbarSchemaList` 受控渲染 schema-core 的 keyed List，只发出 add/open/remove/move/reset intent。条目内容、标签和操作文案由宿主提供；保存命令与定制 editor 仍由应用组合根绑定。

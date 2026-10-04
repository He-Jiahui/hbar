# @hbar/schema-react

`@hbar/schema-react` 是 `@hbar/schema-core` 的受控 React 渲染适配层。它提供有生命周期的 ComponentRegistry、EditorRegistry、标准字段适配器和 `HbarSchemaForm`；不包含 hbar 设置字段、Client、Host、Storage、Zustand 或保存逻辑。

一个组件注册同时声明版本、支持的数据类型、动态内容种类、交互模式和 renderer，并向 schema-core 暴露只读的兼容性注册表。应用把 `HbarSchemaForm` 的 intent 转换为本地表单 command；renderer 不能取得可写 store 或传输对象。所有可见文案和动态内容的本地化函数由宿主提供。

调用方可以用有序 `fieldNames` 投影单个可见分组，并在通用控件旁渲染宿主提供的字段上下文与操作。插槽本身不修改表单状态；其事件处理仍须派发 application command。

EditorRegistry 用于 `ProviderDialog` 一类高度定制的子编辑器。它只管理描述、renderer 与卸载生命周期；打开、关闭、保存和查询仍由应用 command/runtime 负责。

`HbarSchemaList` 受控渲染 schema-core 的 keyed List，只发出 add/open/remove/move/reset intent。条目内容、标签和操作文案由宿主提供；保存命令与定制 editor 仍由应用组合根绑定。

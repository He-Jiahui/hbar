# @hbar/schema-core

描述文件、组件能力与表单状态的无 UI 核心。包不依赖 React、Host、命令、数据库或 hbar 领域数据。标量表单接收严格 object JSON Schema，支持原始类型、null、必填、默认值、enum、长度与数值范围；未知关键字和未声明类型明确拒绝。动态内容与稳定 keyed List 按 [P3](../../docs/multi-level/03-schema-settings-framework.md) 的独立契约扩展。

`compileForm(schema, description, components)` 将数据约束与宿主的 i18n label key、组件名、只读目标组合，注册表只存组件支持的字段类型，不装入 renderer 或业务逻辑。`createForm` 产生不可变 baseline/draft；`setField` 保留无法立即转换的数字输入原文并报告字段问题，`beginSubmit` 捕获原目标和输入，`settleSubmit` 仅确认已发送的快照。提交期间的新编辑继续留在 draft；失败或未知结果保留草稿。未知结果应由应用 adapter 查询权威回执，再传入核对结果；核心包不自行重发写请求。

结构化 `SchemaPath` 使用 `field` 与稳定 `item.id` 段。`encodePath/decodePath` 提供无歧义的文本编码，数组重排不会将路径改绑到另一个条目。

`compileKeyedList` 与对应纯状态转换为 List/定制 editor 提供稳定条目 ID、显式排序、删除和重置语义。描述只引用已注册的 item Schema ID 与 component/element ID；框架不导入具体 Provider 或保存命令。

动态内容不在 renderer 中调用业务函数。描述通过 `callbackId/version/dependsOn/valueType` 声明 query，组合根注册同名 callback：

```ts
import { createSchemaCallbackRegistry } from '@hbar/schema-core'

const callbacks = createSchemaCallbackRegistry()
const unregister = callbacks.registerQuery('settings.getThinkingLevels', {
  version: 1,
  valueType: 'string',
  async execute(request) {
    const model = request.dependencies['provider.model']
    if (typeof model !== 'string') return { kind: 'options', status: 'unavailable', reasonCode: 'missing_model' }
    return loadThinkingLevelReport(model, request.dependencyFingerprint)
  },
})
```

Host bridge 只传描述中声明的依赖、搜索和 cursor。resolver 按 Host/身份/作用域/Schema/依赖指纹隔离缓存，取消旧 generation，校验返回类型、重复值、容量和 capability revision。callback 是只读 query，不得修改设置或其他业务状态。

完整表单、稳定 List 和动态内容示例见 `tests/schema-core.test.ts`、`tests/schema-content.test.ts` 与 `packages/kernel/src/index.ts` 的内建模型/思考等级 callback。预算、Provider 和保存规则属于 hbar contracts/runtime/Host，不进入此包。

# @hbar/settings-core

`@hbar/settings-core` 是无 UI、无 Host 和无数据库的分层设置解析库。调用方传入有序 layer chain，因此库不硬编码“全局→工作区→会话”实体；hbar Host 用这三层组合它，其他应用可使用不同层级。

```ts
import { resolveSettings } from '@hbar/settings-core'

const definitions = [
  {
    path: [{ kind: 'field', name: 'provider.model' }],
    allowedLayers: ['global', 'workspace', 'session'],
    schema: { kind: 'string' },
    defaultValue: 'openai/gpt-default',
    applyMode: 'nextRun',
  },
] as const

const resolution = resolveSettings(definitions, [
  { id: 'global', kind: 'global', revision: 3, values: { 'provider.model': 'openai/gpt-global' } },
  { id: 'workspace:demo', kind: 'workspace', revision: 7, values: {} },
  { id: 'session:review', kind: 'session', revision: 2, values: { 'provider.model': 'openai/gpt-session' } },
])
```

普通字段和数组使用 replace，object 可逐字段合并，keyed collection 使用稳定 key、tombstone 和独立 order。不存在表示继承，显式 `null` 只在 schema 允许时是真实值，空数组也不等于 unset。`SettingReport` 包含本层 presence/value、effective value、整体与逐叶来源 revision、inherited 和 apply state。

`applySettingsChanges` 在候选 layer 上验证有界 ChangeSet 和 allowedLayers；持久化、版本向量 CAS、actor/idempotency 回执和 secret storage 由应用组合根实现。敏感 definition 的公开值只允许 `{ secretRef: string }`，不存储凭据明文。`createSettingsMigrationRegistry` 要求每个版本有唯一、连续、有界的前向迁移。

行为例子见 `tests/settings-core.test.ts`；hbar 的原子存储与三层作用域组合见 `packages/kernel/src/settings-service.ts` 和 `tests/settings-service.test.ts`。

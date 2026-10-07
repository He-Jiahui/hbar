import { createHbarSchemaComponents } from '@hbar/app-react'
import { compileForm, createForm, type FormDescription } from '@hbar/schema-core'
import type { HbarSchemaFormLabels } from '@hbar/schema-react'

export interface SchemaPresentationCopy {
  readonly label: (name: string) => string
  readonly help: string
  readonly context: string
  readonly action: string
  readonly reset: string
  readonly loading: string
  readonly empty: string
  readonly unavailable: string
  readonly error: string
  readonly invalid: string
  readonly pick: string
  readonly open: string
  readonly remove: string
  readonly missing: string
  readonly value: string
}

export function schemaPresentationFixture(count: number, copy: SchemaPresentationCopy) {
  const components = createHbarSchemaComponents()
  const names = Array.from({ length: count }, (_, index) => `field_${index}`)
  const fields: FormDescription['fields'] = Object.fromEntries(
    names.map((name, index) => [
      name,
      { labelKey: `i18n:${name}`, component: index === 1 ? 'NumberField' : 'TextField' },
    ]),
  )
  const schema = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(names.map((name, index) => [name, { type: index === 1 ? 'integer' : 'string' }])),
      required: names,
    },
    { id: 'schema.presentation.fixture', version: 1, fields },
    components.schema,
  )
  const state = createForm(schema, Object.fromEntries(names.map((name, index) => [name, index === 1 ? 8 : copy.value])))
  const labels: HbarSchemaFormLabels = {
    resolve: (key) => copy.label(key.replace('i18n:', '')),
    help: () => copy.help,
    reset: copy.reset,
    loading: copy.loading,
    empty: copy.empty,
    unavailable: () => copy.unavailable,
    contentError: () => copy.error,
    selectedInvalid: () => copy.invalid,
    issue: () => copy.error,
    option: (_field, value) => String(value),
    contentText: (text) => (text.kind === 'literal' ? text.text : copy.label(text.key)),
    pickResource: () => copy.pick,
    openOptions: (label) => `${copy.open} ${label}`,
    removeOption: (label) => `${copy.remove} ${label}`,
    componentUnavailable: () => copy.missing,
  }
  return { components, schema, state, labels }
}

export const schemaPresentationCopies: Readonly<Record<'en-US' | 'zh-CN', SchemaPresentationCopy>> = {
  'en-US': {
    label: (name) => `${name}: ${'Complete original field caption '.repeat(18)}`,
    help: 'The full field description belongs to this control and wraps naturally. '.repeat(5),
    context: 'Source and revision belong to this original field. '.repeat(4),
    action: 'Inspect original field',
    reset: 'Use saved value',
    loading: 'Loading original choices',
    empty: 'No choices',
    unavailable: 'Original field content is unavailable',
    error: 'Preserve this original invalid draft and its error. '.repeat(5),
    invalid: 'Unavailable original selection',
    pick: 'Choose original resource',
    open: 'Open choices for',
    remove: 'Remove original selection',
    missing: 'Original component is unavailable',
    value: 'Original saved draft',
  },
  'zh-CN': {
    label: (name) => `${name}：${'完整原始字段标签'.repeat(18)}`,
    help: '完整说明属于此字段，并保持自然换行。'.repeat(8),
    context: '来源与版本属于原始字段。'.repeat(6),
    action: '查看原始字段',
    reset: '恢复保存值',
    loading: '正在读取原始选项',
    empty: '没有选项',
    unavailable: '原始字段内容暂不可用',
    error: '保留原始无效草稿，并在本字段显示错误。'.repeat(8),
    invalid: '原始选择暂不可用',
    pick: '选择原始资源',
    open: '打开选项',
    remove: '移除原始选择',
    missing: '原始组件暂不可用',
    value: '原始已保存草稿',
  },
}

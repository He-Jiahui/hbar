import { useMemo } from 'react'
import type { JsonSchemaDescriptor, ResolvedSetting, SettingDescriptor, SettingsSnapshot } from '@hbar/contracts'
import './descriptor-settings.css'

type DescriptorSettingsFormProps = {
  descriptors: readonly SettingDescriptor[]
  snapshot: SettingsSnapshot | null
  saving?: boolean
  onSet(id: string, value: unknown): void
  onReset(id: string): void
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function displayValue(schema: JsonSchemaDescriptor, value: unknown): unknown {
  if (value !== undefined) return value
  return schema.default
}

function scalarInputType(schema: JsonSchemaDescriptor) {
  if (schema.type === 'number' || schema.type === 'integer') return 'number'
  if (schema.format === 'password') return 'password'
  return 'text'
}

function schemaLabel(schema: JsonSchemaDescriptor, fallback: string) {
  return schema.title?.trim() || fallback
}

function SettingValueEditor({
  schema,
  value,
  onChange,
  path,
}: {
  schema: JsonSchemaDescriptor
  value: unknown
  onChange(value: unknown): void
  path: string
}) {
  if (schema.oneOf?.length) {
    const selected = schema.oneOf.find((candidate) => {
      if (candidate.type === 'string') return typeof value === 'string'
      if (candidate.type === 'number' || candidate.type === 'integer') return typeof value === 'number'
      if (candidate.type === 'boolean') return typeof value === 'boolean'
      if (candidate.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
      if (candidate.type === 'array') return Array.isArray(value)
      return true
    }) ?? schema.oneOf[0]
    return <SettingValueEditor schema={selected!} value={value} onChange={onChange} path={path} />
  }
  if (schema.enum?.length) {
    return (
      <select aria-label={path} value={String(value ?? '')} onChange={(event) => {
        const candidate = schema.enum?.find((option) => String(option) === event.target.value)
        onChange(candidate)
      }}>
        {schema.enum.map((option) => <option value={String(option)} key={String(option)}>{String(option)}</option>)}
      </select>
    )
  }
  if (schema.type === 'boolean') {
    return <input aria-label={path} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
  }
  if (schema.type === 'object') {
    const record = objectValue(value)
    return (
      <div className="descriptor-setting-object">
        {Object.entries(schema.properties ?? {}).map(([key, child]) => {
          const childValue = displayValue(child, record[key])
          return (
            <label key={key} className="descriptor-setting-field">
              <span>{schemaLabel(child, key)}{schema.required?.includes(key) ? ' *' : ''}</span>
              {child.description && <small>{child.description}</small>}
              <SettingValueEditor schema={child} value={childValue} path={`${path}.${key}`} onChange={(next) => onChange({ ...record, [key]: next })} />
            </label>
          )
        })}
      </div>
    )
  }
  if (schema.type === 'array' && schema.items) {
    const items: unknown[] = Array.isArray(value) ? value : []
    return (
      <div className="descriptor-setting-array">
        {items.map((item, index) => (
          <div className="descriptor-setting-array-row" key={`${path}-${index}`}>
            <SettingValueEditor schema={schema.items!} value={item} path={`${path}[${index}]`} onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))} />
            <button type="button" className="text-command" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>删除</button>
          </div>
        ))}
        <button type="button" className="button" disabled={schema.maxItems !== undefined && items.length >= schema.maxItems} onClick={() => onChange([...items, displayValue(schema.items!, undefined) ?? ''])}>添加一项</button>
      </div>
    )
  }
  const raw = value ?? ''
  return (
    <input
      aria-label={path}
      type={scalarInputType(schema)}
      value={String(raw)}
      min={schema.minimum}
      max={schema.maximum}
      minLength={schema.minLength}
      maxLength={schema.maxLength}
      placeholder={schema.format === 'path' ? '输入路径' : undefined}
      onChange={(event) => {
        if (schema.type === 'number' || schema.type === 'integer') {
          const next = event.target.value === '' ? undefined : Number(event.target.value)
          onChange(next)
        } else onChange(event.target.value)
      }}
    />
  )
}

function inheritedLabel(setting: ResolvedSetting | undefined, scope: SettingsSnapshot['scope']) {
  if (!setting || !setting.overridden) return null
  const source = setting.source === 'default' ? '默认' : setting.source === 'global' ? '全局' : setting.source === 'project' ? '项目' : '会话'
  return <span className="descriptor-setting-inherited">当前值继承自{source}设置（{scope}作用域未覆盖）</span>
}

export default function DescriptorSettingsForm({ descriptors, snapshot, saving = false, onSet, onReset }: DescriptorSettingsFormProps) {
  const ordered = useMemo(() => [...descriptors].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)), [descriptors])
  if (!ordered.length) return null
  return (
    <section className="descriptor-settings-form" aria-label="描述驱动设置">
      {ordered.map((setting) => {
        const resolved = snapshot?.values[setting.id]
        const value = displayValue(setting.schema, resolved?.effectiveValue ?? setting.default)
        const editable = Boolean(resolved?.editable ?? setting.scopes.includes(snapshot?.scope ?? 'global'))
        return (
          <div className="descriptor-setting-row" key={setting.id}>
            <div className="descriptor-setting-heading">
              <div>
                <strong>{setting.title}</strong>
                <small>{setting.description || setting.id}</small>
              </div>
              {inheritedLabel(resolved, snapshot?.scope ?? 'global')}
            </div>
            <div className="descriptor-setting-control">
              <SettingValueEditor schema={setting.schema} value={value} path={setting.id} onChange={(next) => onSet(setting.id, next)} />
              {resolved?.overridden && editable && <button type="button" className="text-command" disabled={saving} onClick={() => onReset(setting.id)}>恢复继承</button>}
            </div>
            {!editable && <small className="descriptor-setting-readonly">此选项不能在当前作用域修改。</small>}
          </div>
        )
      })}
    </section>
  )
}

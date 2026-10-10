import { useMemo } from 'react'
import { LumenButton, LumenCheckBoxControl, LumenInput, LumenSelect, LumenTextarea } from '@lumen/app-ui'
import type { JsonSchemaDescriptor, ResolvedSetting, SettingDescriptor, SettingsSnapshot } from '@hbar/contracts'
import './descriptor-settings.css'
import { useLocale, type LocaleMessageKey } from './locale'
import { referenceAttributes } from './react-bits'

type Translate = (key: LocaleMessageKey) => string

type DescriptorSettingsFormProps = {
  descriptors: readonly SettingDescriptor[]
  snapshot: SettingsSnapshot | null
  context?: { hasWorkspace: boolean; hasSession: boolean; pluginEnabled?: boolean }
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

function localizedDescriptor(setting: SettingDescriptor, t: Translate) {
  const copy: Record<string, [LocaleMessageKey, LocaleMessageKey]> = {
    'appearance.theme': ['settingThemeTitle', 'settingThemeDescription'],
    'appearance.profile': ['settingProfileTitle', 'settingProfileDescription'],
    'session.defaultBudgetTokens': ['settingDefaultBudgetTitle', 'settingDefaultBudgetDescription'],
    'notifications.taskCompleted': ['settingTaskCompletedTitle', 'settingTaskCompletedDescription'],
    'notifications.userInteraction': ['settingUserInteractionTitle', 'settingUserInteractionDescription'],
    'notifications.retryFailed': ['settingRetryFailedTitle', 'settingRetryFailedDescription'],
    'permission.mode': ['settingPermissionTitle', 'settingPermissionDescription'],
  }
  const keys = copy[setting.id]
  return keys ? { title: t(keys[0]), description: t(keys[1]) } : { title: setting.title, description: setting.description }
}

function SettingValueEditor({
  schema,
  value,
  onChange,
  path,
  t,
}: {
  schema: JsonSchemaDescriptor
  value: unknown
  onChange(value: unknown): void
  path: string
  t: Translate
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
    return <SettingValueEditor schema={selected!} value={value} onChange={onChange} path={path} t={t} />
  }
  if (schema.enum?.length) {
    return (
      <LumenSelect aria-label={path} value={String(value ?? '')} onChange={(event) => {
        const candidate = schema.enum?.find((option) => String(option) === event.target.value)
        onChange(candidate)
      }}>
        {schema.enum.map((option) => <option value={String(option)} key={String(option)}>{String(option)}</option>)}
      </LumenSelect>
    )
  }
  if (schema.type === 'boolean') {
    return <LumenCheckBoxControl aria-label={path} checked={value === true} onChange={(event) => onChange(event.target.checked)} />
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
              <SettingValueEditor schema={child} value={childValue} path={`${path}.${key}`} t={t} onChange={(next) => onChange({ ...record, [key]: next })} />
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
            <SettingValueEditor schema={schema.items!} value={item} path={`${path}[${index}]`} t={t} onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))} />
            <LumenButton type="button" variant="text" indicator="none" className="text-command" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>{t('delete')}</LumenButton>
          </div>
        ))}
        <LumenButton type="button" variant="outlined" indicator="none" className="button" disabled={schema.maxItems !== undefined && items.length >= schema.maxItems} onClick={() => onChange([...items, displayValue(schema.items!, undefined) ?? ''])}>{t('addItem')}</LumenButton>
      </div>
    )
  }
  const raw = value ?? ''
  if (schema.format === 'textarea') {
    return (
      <textarea
        aria-label={path}
        value={String(raw)}
        minLength={schema.minLength}
        maxLength={schema.maxLength}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <input
      aria-label={path}
      type={scalarInputType(schema)}
      value={String(raw)}
      min={schema.minimum}
      max={schema.maximum}
      minLength={schema.minLength}
      maxLength={schema.maxLength}
      placeholder={schema.format === 'path' ? t('inputPath') : undefined}
      onChange={(event) => {
        if (schema.type === 'number' || schema.type === 'integer') {
          const next = event.target.value === '' ? undefined : Number(event.target.value)
          onChange(next)
        } else onChange(event.target.value)
      }}
    />
  )
}

function inheritedLabel(setting: ResolvedSetting | undefined, scope: SettingsSnapshot['scope'], t: Translate) {
  if (!setting || !setting.overridden) return null
  const source = setting.source === 'default' ? t('defaultSettings') : setting.source === 'global' ? t('globalSettings') : setting.source === 'project' ? t('projectSettings') : t('session')
  const localScope = scope === 'global' ? t('globalSettings') : scope === 'project' ? t('projectSettings') : t('session')
  return <span className="descriptor-setting-inherited">{t('inheritedSetting')}{source}{t('scopeLabelOpen')}{localScope}{t('scopeNotOverridden')}</span>
}

export default function DescriptorSettingsForm({ descriptors, snapshot, context = { hasWorkspace: false, hasSession: false }, saving = false, onSet, onReset }: DescriptorSettingsFormProps) {
  const { t } = useLocale()
  const ordered = useMemo(() => descriptors
    .filter((setting) => {
      if (!setting.visibility) return true
      const actual = setting.visibility.fact === 'hasWorkspace'
        ? context.hasWorkspace
        : setting.visibility.fact === 'hasSession'
          ? context.hasSession
          : context.pluginEnabled ?? false
      return setting.visibility.equals === undefined ? actual : actual === setting.visibility.equals
    })
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)), [context.hasSession, context.hasWorkspace, context.pluginEnabled, descriptors])
  if (!ordered.length) return null
  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/settings-form', 'settings')}
      className="descriptor-settings-form"
      aria-label={t('descriptorSettings')}
    >
      {ordered.map((setting) => {
        const descriptorCopy = localizedDescriptor(setting, t)
        const resolved = snapshot?.values[setting.id]
        const value = displayValue(setting.schema, resolved?.effectiveValue ?? setting.default)
        const editable = Boolean(resolved?.editable ?? setting.scopes.includes(snapshot?.scope ?? 'global'))
        return (
          <div className="descriptor-setting-row" key={setting.id}>
            <div className="descriptor-setting-heading">
              <div>
                <strong>{descriptorCopy.title}</strong>
                <small>{descriptorCopy.description || setting.id}</small>
              </div>
              {inheritedLabel(resolved, snapshot?.scope ?? 'global', t)}
            </div>
            <div className="descriptor-setting-control">
              <SettingValueEditor schema={setting.schema} value={value} path={setting.id} t={t} onChange={(next) => onSet(setting.id, next)} />
              {resolved?.overridden && editable && <button type="button" className="text-command" disabled={saving} onClick={() => onReset(setting.id)}>{t('restoreInheritance')}</button>}
            </div>
            {!editable && <small className="descriptor-setting-readonly">{t('settingReadonly')}</small>}
          </div>
        )
      })}
    </section>
  )
}

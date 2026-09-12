import { useState } from 'react'
import { ChevronRight, Puzzle, Save, Trash2 } from 'lucide-react'
import type { PluginInfo } from '@hbar/contracts'
import { client, refreshCatalog, report } from './stores'
import SpotlightCard from './react-bits/SpotlightCard'

type ConfigSchema = {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, ConfigSchema>
  required?: string[]
  enum?: unknown[]
  default?: unknown
  items?: ConfigSchema
}

function configSchema(value: Record<string, unknown> | undefined): ConfigSchema | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ConfigSchema
}

function ConfigFields({
  schema,
  value,
  onChange,
}: {
  schema: ConfigSchema
  value: Record<string, unknown>
  onChange(next: Record<string, unknown>): void
}) {
  const properties = Object.entries(schema.properties ?? {})
  if (!properties.length) return <p className="plugin-config-empty">此插件没有可视化配置项。</p>
  return (
    <div className="plugin-config-fields">
      {properties.map(([key, field]) => {
        const current = value[key] ?? field.default ?? ''
        const label = field.title || key
        const required = schema.required?.includes(key)
        if (field.type === 'object' && field.properties) {
          const nested = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
          return (
            <fieldset key={key} className="plugin-config-nested">
              <legend>{label}{required ? ' *' : ''}</legend>
              {field.description && <small>{field.description}</small>}
              <ConfigFields
                schema={field}
                value={nested as Record<string, unknown>}
                onChange={(next) => onChange({ ...value, [key]: next })}
              />
            </fieldset>
          )
        }
        if (field.type === 'array' && field.items) {
          const items: unknown[] = Array.isArray(current) ? (current as unknown[]) : []
          return (
            <fieldset key={key} className="plugin-config-array">
              <legend>{label}{required ? ' *' : ''}</legend>
              {field.description && <small>{field.description}</small>}
              {items.map((item, index) => (
                <div className="plugin-config-array-row" key={`${key}-${index}`}>
                  <input
                    type={field.items?.type === 'number' || field.items?.type === 'integer' ? 'number' : 'text'}
                    value={String(item ?? '')}
                    onChange={(event) => {
                      const raw = event.target.value
                      const next = field.items?.type === 'number' || field.items?.type === 'integer' ? Number(raw) : raw
                      onChange({ ...value, [key]: items.map((entry, itemIndex) => (itemIndex === index ? next : entry)) })
                    }}
                  />
                  <button
                    type="button"
                    className="plugin-config-array-remove"
                    aria-label={`删除 ${label} 第 ${index + 1} 项`}
                    onClick={() => onChange({ ...value, [key]: items.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    删除
                  </button>
                </div>
              ))}
              <button type="button" className="button" onClick={() => onChange({ ...value, [key]: [...items, ''] })}>
                添加一项
              </button>
            </fieldset>
          )
        }
        if (field.enum?.length) {
          return (
            <label key={key}>
              {label}{required ? ' *' : ''}
              <select value={String(current)} onChange={(event) => onChange({ ...value, [key]: event.target.value })}>
                {field.enum.map((option) => <option value={String(option)} key={String(option)}>{String(option)}</option>)}
              </select>
              {field.description && <small>{field.description}</small>}
            </label>
          )
        }
        if (field.type === 'boolean') {
          return (
            <label className="checkbox" key={key}>
              <input
                type="checkbox"
                checked={current === true}
                onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
              />
              {label}{field.description ? ` · ${field.description}` : ''}
            </label>
          )
        }
        return (
          <label key={key}>
            {label}{required ? ' *' : ''}
            <input
              type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
              value={String(current)}
              onChange={(event) => {
                const raw = event.target.value
                const next = field.type === 'number' || field.type === 'integer' ? Number(raw) : raw
                onChange({ ...value, [key]: next })
              }}
            />
            {field.description && <small>{field.description}</small>}
          </label>
        )
      })}
    </div>
  )
}

export default function PluginRow({ plugin, className = '', id }: { plugin: PluginInfo; className?: string; id?: string }) {
  const [expanded, setExpanded] = useState(false)
  const schema = configSchema(plugin.configSchema)
  const settingsIcon = plugin.contributes?.settings?.icon
  const [config, setConfig] = useState<Record<string, unknown>>(plugin.config)
  const [error, setError] = useState(plugin.error ?? '')

  async function apply(enabled: boolean, configuration?: Record<string, unknown>) {
    setError('')
    try {
      const projectId = plugin.projectId
      if (configuration) await client().call('plugin.set', { id: plugin.id, enabled, config: configuration, ...(projectId ? { projectId } : {}) })
      else await client().call(enabled ? 'plugin.enable' : 'plugin.disable', { id: plugin.id, ...(projectId ? { projectId } : {}) })
      await refreshCatalog()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      report(failure)
    }
  }

  async function remove() {
    if (plugin.required || !window.confirm(`卸载插件 ${plugin.name}？`)) return
    setError('')
    try {
      await client().call('plugin.remove', { id: plugin.id, ...(plugin.projectId ? { projectId: plugin.projectId } : {}) })
      await refreshCatalog()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      report(failure)
    }
  }

  return (
    <SpotlightCard
      {...(id ? { id } : {})}
      className={`plugin-row${className ? ` ${className}` : ''}`}
      spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
    >
      <div className="plugin-heading">
        <button className="plugin-expand" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <ChevronRight size={14} className={expanded ? 'rotate' : ''} />
          <span className="plugin-icon" aria-label={settingsIcon ? `${plugin.name} 图标 ${settingsIcon}` : undefined} title={settingsIcon ? `图标：${settingsIcon}` : undefined}>
            {settingsIcon ? <span className="plugin-icon-label" aria-hidden="true">{settingsIcon}</span> : <Puzzle size={16} aria-hidden="true" />}
          </span>
          <div>
            <strong>{plugin.name}</strong>
            <span>
              {plugin.id} · {plugin.version}
            </span>
          </div>
        </button>
        <span className={`state-label ${plugin.status === 'active' ? 'success' : ''}`}>
          {plugin.required ? '必需' : plugin.status === 'active' ? '已启用' : '已停用'}
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={`启用 ${plugin.name}`}
          checked={plugin.status === 'active'}
          disabled={plugin.required}
          onChange={(event) => void apply(event.target.checked)}
        />
        <button
          type="button"
          className="plugin-remove-action"
          title={plugin.required ? '必需插件不可卸载' : `卸载 ${plugin.name}`}
          aria-label={plugin.required ? '必需插件不可卸载' : `卸载 ${plugin.name}`}
          disabled={plugin.required}
          onClick={() => void remove()}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && (
        <div className="plugin-detail">
          <p className="plugin-description">{plugin.description || '该插件没有提供描述。'}</p>
          <dl>
            <dt>安装范围</dt>
            <dd>{plugin.installScope === 'project' ? `项目 · ${plugin.projectId ?? '未知'}` : '全局'}</dd>
            <dt>提供服务</dt>
            <dd>{plugin.provides.join(', ') || '—'}</dd>
            <dt>依赖服务</dt>
            <dd>{plugin.requires.join(', ') || '—'}</dd>
            <dt>包依赖</dt>
            <dd>
              {Object.entries(plugin.dependencies ?? {})
                .map(([id, range]) => `${id}@${range}`)
                .join(', ') || '—'}
            </dd>
            <dt>宿主依赖</dt>
            <dd>
              {Object.entries(plugin.peerDependencies ?? {})
                .map(([id, range]) => `${id}@${range}`)
                .join(', ') || '—'}
            </dd>
            <dt>可选依赖</dt>
            <dd>
              {Object.entries(plugin.optionalDependencies ?? {})
                .map(([id, range]) => `${id}@${range}`)
                .join(', ') || '—'}
            </dd>
          </dl>
          {error && (
            <p className="inline-error plugin-error" role="alert">
              {error}
            </p>
          )}
          {schema ? (
            <section className="plugin-config-editor" aria-label={`${plugin.name} 可视化配置`}>
              <div className="plugin-config-heading">
                <strong>详细配置</strong>
                <span>由插件 Schema 生成</span>
              </div>
              <ConfigFields schema={schema} value={config} onChange={setConfig} />
            </section>
          ) : <p className="plugin-config-empty">此插件没有提供可视化 Schema，详细配置只能由插件声明后使用。</p>}
          {schema && <button className="button" onClick={() => void apply(true, config)}><Save size={13} />保存配置</button>}
        </div>
      )}
    </SpotlightCard>
  )
}

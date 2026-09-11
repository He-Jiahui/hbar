import { useState } from 'react'
import { ChevronRight, Save } from 'lucide-react'
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

export default function PluginRow({ plugin, className = '' }: { plugin: PluginInfo; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const schema = configSchema(plugin.configSchema)
  const [config, setConfig] = useState<Record<string, unknown>>(plugin.config)
  const [rawConfig, setRawConfig] = useState(JSON.stringify(plugin.config, null, 2))
  const [error, setError] = useState(plugin.error ?? '')

  async function apply(enabled: boolean, configuration?: Record<string, unknown>) {
    setError('')
    try {
      if (configuration) await client().call('plugin.set', { id: plugin.id, enabled, config: configuration })
      else await client().call(enabled ? 'plugin.enable' : 'plugin.disable', { id: plugin.id })
      await refreshCatalog()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      report(failure)
    }
  }

  return (
    <SpotlightCard
      className={`plugin-row${className ? ` ${className}` : ''}`}
      spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
    >
      <div className="plugin-heading">
        <button className="plugin-expand" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          <ChevronRight size={14} className={expanded ? 'rotate' : ''} />
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
      </div>
      {expanded && (
        <div className="plugin-detail">
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
          ) : (
            <label>
              配置
              <textarea
                aria-label={`${plugin.name} 配置`}
                className="config-editor"
                rows={5}
                value={rawConfig}
                onChange={(event) => setRawConfig(event.target.value)}
              />
            </label>
          )}
          <button
            className="button"
            onClick={() => {
              try {
                void apply(true, schema ? config : (JSON.parse(rawConfig) as Record<string, unknown>))
              } catch (failure) {
                report(failure)
              }
            }}
          >
            <Save size={13} />
            保存配置
          </button>
        </div>
      )}
    </SpotlightCard>
  )
}

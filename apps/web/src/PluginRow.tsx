import { useState } from 'react'
import { ChevronRight, Save } from 'lucide-react'
import type { PluginInfo } from '@hbar/contracts'
import { client, refreshCatalog, report } from './stores'
import SpotlightCard from './react-bits/SpotlightCard'

export default function PluginRow({ plugin, className = '' }: { plugin: PluginInfo; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [config, setConfig] = useState(JSON.stringify(plugin.config, null, 2))
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
          <label>
            配置
            <textarea
              aria-label={`${plugin.name} 配置`}
              className="config-editor"
              rows={5}
              value={config}
              onChange={(event) => setConfig(event.target.value)}
            />
          </label>
          <button
            className="button"
            onClick={() => {
              try {
                void apply(true, JSON.parse(config) as Record<string, unknown>)
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

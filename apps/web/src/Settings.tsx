import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Moon,
  Monitor,
  Network,
  Plus,
  RefreshCw,
  Search,
  Save,
  ShieldCheck,
  Stethoscope,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { DEFAULT_THINKING_LEVELS, providerSchema } from '@hbar/contracts'
import type { Device, ModelInfo, PluginInfo, ProviderConfig, ProviderModelConfig, ThinkingLevel } from '@hbar/contracts'
import { client, refreshCatalog, report, useCatalog, useConnection, useWorkbench } from './stores'
import { copyText } from './browser-utils'
import PermissionSelector from './PermissionSelector'
import { permissionPreset } from './permissions'
import { providerFromPreset, providerPresets } from './provider-presets'
import PathSettings from './PathSettings'
import { groupModelsByProvider, modelThinkingLabel } from './model-catalog'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import GlareButton from './react-bits/GlareButton'
import AnimatedList from './react-bits/AnimatedList'

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal rb-modal-surface"
      aria-label={title}
      onCancel={onClose}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose()
        }
      }}
    >
      <GlassSurface className="modal-glass" width="100%" height="100%" aria-hidden="true" />
      <header>
        <h2>{title}</h2>
        <button title="关闭" aria-label="关闭" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  )
}
const ALL_THINKING_LEVELS: readonly ThinkingLevel[] = [...DEFAULT_THINKING_LEVELS]

function cloneProviderModel(model: ProviderModelConfig): ProviderModelConfig {
  return {
    ...model,
    thinkingLevels: [...model.thinkingLevels],
    supportedThinkingLevels: [...model.supportedThinkingLevels],
    supportedReasoningEfforts: [...model.supportedReasoningEfforts],
  }
}

function providerEditorValue(provider: ModelInfo): ProviderConfig {
  const fallbackLevels: ThinkingLevel[] = provider.thinkingLevels?.length ? [...provider.thinkingLevels] : ['off']
  const sourceModels = provider.models?.length
    ? provider.models.map(cloneProviderModel)
    : [
        {
          id: provider.modelId || provider.model,
          name: provider.modelName || provider.model,
          contextWindow: provider.contextWindow,
          maxOutput: provider.maxOutput,
          imageInput: provider.imageInput,
          reasoning: provider.reasoning,
          inputPrice: provider.inputPrice,
          outputPrice: provider.outputPrice,
          thinkingLevels: fallbackLevels,
          supportedThinkingLevels: [...fallbackLevels],
          defaultThinkingLevel: provider.defaultThinkingLevel,
          defaultReasoningEffort: provider.defaultReasoningEffort,
          supportedReasoningEfforts: [...fallbackLevels],
        },
      ]
  const selected =
    sourceModels.find((model) => model.id === provider.modelId || model.id === provider.model) ?? sourceModels[0]!
  return {
    id: provider.providerId || provider.id.split('/')[0] || provider.id,
    name: provider.providerName || provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    model: selected.id,
    models: sourceModels,
    contextWindow: selected.contextWindow,
    maxOutput: selected.maxOutput,
    imageInput: selected.imageInput,
    reasoning: selected.reasoning,
    inputPrice: selected.inputPrice,
    outputPrice: selected.outputPrice,
    thinkingLevels: [...selected.thinkingLevels],
    supportedThinkingLevels: [...selected.supportedThinkingLevels],
    defaultThinkingLevel: selected.defaultThinkingLevel,
    defaultReasoningEffort: selected.defaultReasoningEffort,
    supportedReasoningEfforts: [...selected.supportedReasoningEfforts],
  }
}

function mirrorSelectedModel(
  value: ProviderConfig,
  models: ProviderModelConfig[],
  modelId = value.model,
): ProviderConfig {
  const selected = models.find((model) => model.id === modelId) ?? models[0]
  if (!selected) return { ...value, models }
  return {
    ...value,
    model: selected.id,
    models,
    contextWindow: selected.contextWindow,
    maxOutput: selected.maxOutput,
    imageInput: selected.imageInput,
    reasoning: selected.reasoning,
    inputPrice: selected.inputPrice,
    outputPrice: selected.outputPrice,
    thinkingLevels: [...selected.thinkingLevels],
    supportedThinkingLevels: [...selected.supportedThinkingLevels],
    defaultThinkingLevel: selected.defaultThinkingLevel,
    defaultReasoningEffort: selected.defaultReasoningEffort,
    supportedReasoningEfforts: [...selected.supportedReasoningEfforts],
  }
}

function ProviderEditor({ provider, close }: { provider?: ModelInfo; close(): void }) {
  const initialPreset = provider
    ? (providerPresets.find(
        (preset) => preset.name === (provider.providerName || provider.name) || preset.baseUrl === provider.baseUrl,
      )?.id ?? 'custom')
    : 'deepseek'
  const [presetId, setPresetId] = useState(initialPreset)
  const selectedPreset = providerPresets.find((preset) => preset.id === presetId) ?? providerPresets.at(-1)!
  const customConnection = presetId === 'custom'
  const [value, setValue] = useState<ProviderConfig>(() =>
    provider
      ? providerEditorValue(provider)
      : providerFromPreset(providerPresets.find((preset) => preset.id === 'deepseek')!),
  )
  const [apiKey, setApiKey] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const selectedModel = value.models.find((model) => model.id === value.model) ?? value.models[0]
  const field = <K extends 'id' | 'name' | 'protocol' | 'baseUrl'>(key: K, next: ProviderConfig[K]) =>
    setValue((current) => ({ ...current, [key]: next }))
  function updateModel(index: number, patch: Partial<ProviderModelConfig>) {
    setValue((current) => {
      const previous = current.models[index]
      const models = current.models.map((model, modelIndex) => (modelIndex === index ? { ...model, ...patch } : model))
      const nextId = current.model === previous?.id ? (patch.id ?? current.model) : current.model
      return mirrorSelectedModel(current, models, nextId)
    })
  }
  function selectDefaultModel(modelId: string) {
    setValue((current) => mirrorSelectedModel(current, current.models, modelId))
  }
  function addModel() {
    setValue((current) => {
      const used = new Set(current.models.map((model) => model.id))
      let id = 'new-model'
      let suffix = 2
      while (used.has(id)) id = `new-model-${suffix++}`
      const base = current.models[0]!
      const levels = [...base.thinkingLevels]
      const next: ProviderModelConfig = {
        ...base,
        id,
        name: id,
        thinkingLevels: levels,
        supportedThinkingLevels: [...levels],
        supportedReasoningEfforts: [...levels],
      }
      return mirrorSelectedModel(current, [...current.models, next], current.model)
    })
  }
  function removeModel(index: number) {
    setValue((current) => {
      if (current.models.length <= 1) return current
      const removed = current.models[index]
      const models = current.models.filter((_, modelIndex) => modelIndex !== index)
      const nextId =
        removed?.id === current.model ? (models[Math.max(0, index - 1)]?.id ?? models[0]!.id) : current.model
      return mirrorSelectedModel(current, models, nextId)
    })
  }
  function toggleThinking(level: ThinkingLevel, enabled: boolean) {
    if (!selectedModel) return
    const next = enabled
      ? [...new Set([...selectedModel.thinkingLevels, level])]
      : selectedModel.thinkingLevels.filter((item) => item !== level)
    if (!next.length) return
    const defaultLevel = next.includes(selectedModel.defaultThinkingLevel)
      ? selectedModel.defaultThinkingLevel
      : next[0]!
    updateModel(value.models.indexOf(selectedModel), {
      thinkingLevels: next,
      supportedThinkingLevels: [...next],
      supportedReasoningEfforts: [...next],
      defaultThinkingLevel: defaultLevel,
      defaultReasoningEffort: defaultLevel,
      reasoning: next.some((item) => item !== 'off'),
    })
  }
  function setDefaultThinking(level: ThinkingLevel) {
    if (!selectedModel || !selectedModel.thinkingLevels.includes(level)) return
    updateModel(value.models.indexOf(selectedModel), { defaultThinkingLevel: level, defaultReasoningEffort: level })
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await client().call('provider.save', { provider: providerSchema.parse(value), ...(apiKey ? { apiKey } : {}) })
      await refreshCatalog()
      close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={provider ? '编辑模型' : '添加模型'} onClose={close}>
      <form onSubmit={(event) => void save(event)} className="settings-form">
        {!provider && (
          <fieldset className="provider-presets">
            <legend>快速开始</legend>
            <div className="provider-preset-grid">
              {providerPresets.map((preset) => (
                <GlareButton
                  type="button"
                  key={preset.id}
                  className={`provider-preset ${preset.id === presetId ? 'selected' : ''}`}
                  glareColor="color-mix(in srgb, var(--rb-accent) 48%, transparent)"
                  onClick={() => {
                    setPresetId(preset.id)
                    setValue((current) => ({ ...providerFromPreset(preset, current.id), id: current.id }))
                  }}
                >
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </GlareButton>
              ))}
            </div>
            <p>选择预设后只需填写 API Key；模型和地址都可以继续调整。</p>
          </fieldset>
        )}
        {customConnection ? (
          <>
            <label>
              名称
              <input autoFocus value={value.name} onChange={(event) => field('name', event.target.value)} required />
            </label>
            <label>
              协议
              <select
                value={value.protocol}
                onChange={(event) => field('protocol', event.target.value as ProviderConfig['protocol'])}
              >
                <option value="openai-completions">OpenAI Chat Completions</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="anthropic-messages">Anthropic Messages</option>
                {provider?.protocol === 'mock' && <option value="mock">Local fixture</option>}
              </select>
            </label>
            <label>
              API 地址
              <input
                type="url"
                value={value.baseUrl}
                onChange={(event) => field('baseUrl', event.target.value)}
                required
              />
            </label>
          </>
        ) : (
          <SpotlightCard
            className="provider-connection-summary"
            spotlightColor="color-mix(in srgb, var(--rb-accent) 20%, transparent)"
          >
            <div>
              <strong>{selectedPreset.name}</strong>
              <span>{selectedPreset.description}</span>
            </div>
            <code>{value.baseUrl}</code>
          </SpotlightCard>
        )}
        <section className="provider-model-editor" aria-label="供应商模型">
          <header className="provider-model-editor-heading">
            <div>
              <strong>模型</strong>
              <span>{value.models.length} 个模型；每个模型可独立设置思考等级</span>
            </div>
            <button
              type="button"
              className="button icon-button"
              title="添加模型"
              aria-label="添加模型"
              onClick={addModel}
            >
              <Plus size={14} />
            </button>
          </header>
          <div className="provider-model-cards">
            {value.models.map((model, index) => (
              <fieldset
                className={`provider-model-card rb-provider-model-surface ${model.id === value.model ? 'selected' : ''}`}
                key={`${model.id}:${index}`}
              >
                <legend>{model.id === value.model ? '默认模型' : `模型 ${index + 1}`}</legend>
                <GlassSurface className="provider-model-card-glass" width="100%" height="100%" aria-hidden="true" />
                <div className="form-grid">
                  <label>
                    {index === 0 ? '模型 ID' : `模型标识 ${index + 1}`}
                    <input
                      list={`provider-models-${presetId}`}
                      aria-label={index === 0 ? '模型 ID' : `模型标识 ${index + 1}`}
                      autoFocus={!customConnection && index === 0}
                      value={model.id}
                      onChange={(event) => updateModel(index, { id: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    显示名称
                    <input
                      value={model.name}
                      onChange={(event) => updateModel(index, { name: event.target.value })}
                      required
                    />
                  </label>
                </div>
                <label className="checkbox provider-default-model">
                  <input
                    type="radio"
                    name="provider-default-model"
                    checked={model.id === value.model}
                    onChange={() => selectDefaultModel(model.id)}
                  />
                  默认模型
                </label>
                <div className="provider-thinking-editor">
                  <span>支持的思考等级</span>
                  <div className="provider-thinking-options">
                    {ALL_THINKING_LEVELS.map((level) => (
                      <label className="checkbox" key={level}>
                        <input
                          type="checkbox"
                          checked={model.thinkingLevels.includes(level)}
                          onChange={(event) => {
                            if (model.id === selectedModel?.id) toggleThinking(level, event.target.checked)
                            else {
                              const next = event.target.checked
                                ? [...new Set([...model.thinkingLevels, level])]
                                : model.thinkingLevels.filter((item) => item !== level)
                              if (next.length) {
                                const defaultLevel = next.includes(model.defaultThinkingLevel)
                                  ? model.defaultThinkingLevel
                                  : next[0]!
                                updateModel(index, {
                                  thinkingLevels: next,
                                  supportedThinkingLevels: [...next],
                                  supportedReasoningEfforts: [...next],
                                  defaultThinkingLevel: defaultLevel,
                                  defaultReasoningEffort: defaultLevel,
                                  reasoning: next.some((item) => item !== 'off'),
                                })
                              }
                            }
                          }}
                        />
                        {modelThinkingLabel(level)}
                      </label>
                    ))}
                  </div>
                  <label>
                    默认思考等级
                    <select
                      value={model.defaultThinkingLevel}
                      onChange={(event) => {
                        const level = event.target.value as ThinkingLevel
                        if (model.id === selectedModel?.id) setDefaultThinking(level)
                        else updateModel(index, { defaultThinkingLevel: level, defaultReasoningEffort: level })
                      }}
                    >
                      {model.thinkingLevels.map((level) => (
                        <option value={level} key={level}>
                          {modelThinkingLabel(level)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {value.models.length > 1 && (
                  <button type="button" className="provider-remove-model" onClick={() => removeModel(index)}>
                    <Trash2 size={13} />
                    移除模型
                  </button>
                )}
              </fieldset>
            ))}
          </div>
          <datalist id={`provider-models-${presetId}`}>
            {selectedPreset.modelOptions.map((model) => (
              <option value={model} key={model} />
            ))}
          </datalist>
        </section>
        <label>
          API Key
          <div className="input-icon">
            <KeyRound size={14} />
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              placeholder={provider?.hasKey ? '已保存' : '未设置'}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
        </label>
        {selectedModel && (
          <details className="advanced rb-provider-advanced" open={customConnection}>
            <summary>当前模型高级设置</summary>
            <GlassSurface className="provider-advanced-glass" width="100%" height="100%" aria-hidden="true" />
            <div className="form-grid">
              <label>
                上下文窗口
                <input
                  type="number"
                  min={1024}
                  value={selectedModel.contextWindow}
                  onChange={(event) =>
                    updateModel(value.models.indexOf(selectedModel), { contextWindow: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                最大输出
                <input
                  type="number"
                  min={64}
                  value={selectedModel.maxOutput}
                  onChange={(event) =>
                    updateModel(value.models.indexOf(selectedModel), { maxOutput: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                输入 / 百万 tokens
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={selectedModel.inputPrice}
                  onChange={(event) =>
                    updateModel(value.models.indexOf(selectedModel), { inputPrice: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                输出 / 百万 tokens
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={selectedModel.outputPrice}
                  onChange={(event) =>
                    updateModel(value.models.indexOf(selectedModel), { outputPrice: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={selectedModel.imageInput}
                onChange={(event) =>
                  updateModel(value.models.indexOf(selectedModel), { imageInput: event.target.checked })
                }
              />
              图片输入
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={selectedModel.reasoning}
                onChange={(event) => {
                  const index = value.models.indexOf(selectedModel)
                  if (event.target.checked) {
                    const levels =
                      selectedModel.thinkingLevels.length > 1
                        ? selectedModel.thinkingLevels
                        : [...DEFAULT_THINKING_LEVELS]
                    updateModel(index, {
                      reasoning: true,
                      thinkingLevels: levels,
                      supportedThinkingLevels: [...levels],
                      supportedReasoningEfforts: [...levels],
                      defaultThinkingLevel: levels.includes(selectedModel.defaultThinkingLevel)
                        ? selectedModel.defaultThinkingLevel
                        : 'medium',
                      defaultReasoningEffort: levels.includes(selectedModel.defaultThinkingLevel)
                        ? selectedModel.defaultThinkingLevel
                        : 'medium',
                    })
                  } else {
                    updateModel(index, {
                      reasoning: false,
                      thinkingLevels: ['off'],
                      supportedThinkingLevels: ['off'],
                      supportedReasoningEfforts: ['off'],
                      defaultThinkingLevel: 'off',
                      defaultReasoningEffort: 'off',
                    })
                  }
                }}
              />
              推理模型
            </label>
          </details>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button type="button" className="button" onClick={close}>
            取消
          </button>
          <GlareButton className="button primary" disabled={busy}>
            <Save size={14} />
            保存
          </GlareButton>
        </footer>
      </form>
    </Modal>
  )
}
function PluginRow({ plugin, className = '' }: { plugin: PluginInfo; className?: string }) {
  const [expanded, setExpanded] = useState(false),
    [config, setConfig] = useState(JSON.stringify(plugin.config, null, 2)),
    [error, setError] = useState(plugin.error ?? '')
  async function apply(enabled: boolean, configuration?: Record<string, unknown>) {
    setError('')
    try {
      if (configuration) await client().call('plugin.set', { id: plugin.id, enabled, config: configuration })
      else await client().call(enabled ? 'plugin.enable' : 'plugin.disable', { id: plugin.id })
      await refreshCatalog()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      report(error)
    }
  }
  return (
    <SpotlightCard
      className={`plugin-row${className ? ` ${className}` : ''}`}
      spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
    >
      <div className="plugin-heading">
        <button className="plugin-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
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
              } catch (error) {
                report(error)
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
export default function Settings() {
  const [tab, setTab] = useState<'appearance' | 'models' | 'permissions' | 'paths' | 'plugins' | 'devices'>('models'),
    [editor, setEditor] = useState<ModelInfo | 'new' | null>(null)
  const [devices, setDevices] = useState<Device[]>([]),
    [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null),
    [pluginPath, setPluginPath] = useState(''),
    [pluginScope, setPluginScope] = useState<'global' | 'project'>('global'),
    [pluginReport, setPluginReport] = useState(''),
    [copied, setCopied] = useState(false),
    [modelQuery, setModelQuery] = useState(''),
    [modelFilter, setModelFilter] = useState<'all' | 'connected' | 'needs-key'>('all')
  const data = useCatalog((state) => state.data),
    host = useConnection((state) => state.host),
    approvalMode = useWorkbench((state) => state.approvalMode),
    workspaceId = useWorkbench((state) => state.workspaceId),
    theme = useWorkbench((state) => state.theme)
  const models = data?.models ?? []
  const filteredModels = models.filter((model) => {
    const query = modelQuery.trim().toLocaleLowerCase()
    const matchesQuery =
      !query ||
      [model.providerName, model.providerId, model.name, model.modelName, model.model, model.protocol, model.baseUrl]
        .filter((part): part is string => Boolean(part))
        .some((part) => part.toLocaleLowerCase().includes(query))
    const connected = model.protocol === 'mock' || model.hasKey
    const matchesFilter = modelFilter === 'all' || (modelFilter === 'connected' ? connected : !connected)
    return matchesQuery && matchesFilter
  })
  const modelGroups = groupModelsByProvider(filteredModels)
  useEffect(() => {
    if (tab === 'devices') void client().call('device.list', {}).then(setDevices).catch(report)
  }, [tab])
  return (
    <div className="settings-panel">
      <div className="page-heading">
        <h1>设置</h1>
        <button title="刷新设置" aria-label="刷新设置" onClick={() => void refreshCatalog().catch(report)}>
          <RefreshCw size={15} />
        </button>
      </div>
      <nav className="settings-tabs rb-settings-tabs" aria-label="设置分组">
        <GlassSurface className="settings-tabs-glass" width="100%" height="100%" aria-hidden="true" />
        <button className={tab === 'appearance' ? 'selected' : ''} onClick={() => setTab('appearance')}>
          外观
        </button>
        <button className={tab === 'models' ? 'selected' : ''} onClick={() => setTab('models')}>
          模型
        </button>
        <button className={tab === 'permissions' ? 'selected' : ''} onClick={() => setTab('permissions')}>
          权限
        </button>
        <button className={tab === 'paths' ? 'selected' : ''} onClick={() => setTab('paths')}>
          存储
        </button>
        <button className={tab === 'plugins' ? 'selected' : ''} onClick={() => setTab('plugins')}>
          插件
        </button>
        <button className={tab === 'devices' ? 'selected' : ''} onClick={() => setTab('devices')}>
          设备与连接
        </button>
      </nav>
      {tab === 'appearance' && (
        <section className="settings-section appearance-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div>
              <h2>界面主题</h2>
              <p className="section-description">选择此设备使用的工作台配色。</p>
            </div>
          </div>
          <div className="theme-options rb-theme-options" role="group" aria-label="界面主题">
            <GlassSurface className="theme-options-glass" width="100%" height="100%" aria-hidden="true" />
            {(
              [
                ['dark', '深色', Moon],
                ['light', '浅色', Sun],
                ['white', '纯白', Monitor],
              ] as const
            ).map(([value, label, Icon]) => (
              <GlareButton
                type="button"
                key={value}
                className={theme === value ? 'selected' : ''}
                aria-pressed={theme === value}
                glareColor="color-mix(in srgb, var(--rb-accent) 42%, transparent)"
                onClick={() => useWorkbench.setState({ theme: value })}
              >
                <Icon size={17} />
                <span>{label}</span>
              </GlareButton>
            ))}
          </div>
        </section>
      )}
      {tab === 'permissions' && (
        <section className="settings-section permissions-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div>
              <h2>工具权限</h2>
              <p className="section-description">控制 hbar 是否需要在写入文件或运行命令前暂停。</p>
            </div>
            <PermissionSelector compact={false} placement="below" />
          </div>
          <div className="permission-settings-list">
            <SpotlightCard
              className="permission-setting-row"
              spotlightColor="color-mix(in srgb, var(--hbar-ok) 18%, transparent)"
            >
              <div className="permission-setting-icon permission-tone-balanced">
                <ShieldCheck size={16} />
              </div>
              <div>
                <strong>当前默认模式</strong>
                <span>{permissionPreset(approvalMode).description}</span>
              </div>
              <span className={`state-label permission-state-${permissionPreset(approvalMode).tone}`}>
                {permissionPreset(approvalMode).label}
              </span>
            </SpotlightCard>
            <SpotlightCard
              className="permission-note"
              spotlightColor="color-mix(in srgb, var(--hbar-wn) 18%, transparent)"
            >
              <strong>只对之后发送的消息生效</strong>
              <span>正在运行的任务不会被中途改变。你也可以在聊天输入框旁快速切换。</span>
            </SpotlightCard>
          </div>
        </section>
      )}
      {tab === 'models' && (
        <section className="settings-section models-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div className="model-section-title">
              <h2>供应商与模型</h2>
              <span>
                {modelGroups.length} 个供应商 · {models.length} 个模型
              </span>
            </div>
            <button className="button" onClick={() => setEditor('new')}>
              <Plus size={14} />
              添加模型
            </button>
          </div>
          <div className="model-list-toolbar">
            <label className="settings-search">
              <Search size={14} />
              <input
                aria-label="搜索供应商或模型"
                placeholder="搜索供应商、模型或地址"
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
              />
            </label>
            <div className="model-filter segmented" role="group" aria-label="模型状态">
              <button
                type="button"
                className={modelFilter === 'all' ? 'selected' : ''}
                onClick={() => setModelFilter('all')}
              >
                全部
              </button>
              <button
                type="button"
                className={modelFilter === 'connected' ? 'selected' : ''}
                onClick={() => setModelFilter('connected')}
              >
                已连接
              </button>
              <button
                type="button"
                className={modelFilter === 'needs-key' ? 'selected' : ''}
                onClick={() => setModelFilter('needs-key')}
              >
                待配置
              </button>
            </div>
          </div>
          {modelGroups.length ? (
            <AnimatedList className="settings-provider-list" viewportClassName="settings-provider-viewport" showGradients={false}>
              {modelGroups.map((group) => {
                const first = group.models[0]!
                const connected = first.protocol === 'mock' || group.models.every((model) => model.hasKey)
                const providerId = first.providerId || first.id.split('/')[0] || first.id
                return (
                  <SpotlightCard className="settings-provider-group" key={group.providerId} spotlightColor="color-mix(in srgb, var(--rb-accent) 24%, transparent)" aria-label={group.providerName}>
                    <header className="settings-provider-heading">
                      <div className="settings-provider-title">
                        <span className="model-icon">
                          <Network size={17} />
                        </span>
                        <div>
                          <strong>{group.providerName}</strong>
                          <small>
                            {group.models.length} 个模型 · {first.protocol === 'mock' ? 'Local fixture' : first.baseUrl}
                          </small>
                        </div>
                      </div>
                      <div className="settings-provider-actions">
                        <span className={`model-connection ${connected ? 'connected' : 'needs-key'}`}>
                          <KeyRound size={12} />
                          {first.protocol === 'mock' ? '本地' : connected ? '已连接' : '待配置 Key'}
                        </span>
                        <button
                          title={`删除供应商 ${group.providerName}`}
                          aria-label={`删除供应商 ${group.providerName}`}
                          onClick={() => {
                            if (window.confirm(`删除供应商 ${group.providerName} 及其全部模型？`))
                              void client().call('provider.delete', { id: providerId }).then(refreshCatalog).catch(report)
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </header>
                    <div className="settings-provider-models">
                      {group.models.map((model) => (
                        <SpotlightCard
                          className="model-row"
                          key={model.id}
                          spotlightColor="color-mix(in srgb, var(--rb-accent) 20%, transparent)"
                        >
                          <button className="model-details" onClick={() => setEditor(model)}>
                            <strong>{model.modelName}</strong>
                            <span>{model.model}</span>
                            <small>
                              {model.defaultThinkingLevel === 'off'
                                ? '思考关闭'
                                : `默认思考：${modelThinkingLabel(model.defaultThinkingLevel)}`}
                            </small>
                          </button>
                          <span className="model-capability">{model.imageInput ? '图文' : '文本'}</span>
                          <span className="model-window">{Math.round(model.contextWindow / 1000)}k</span>
                          <span className="model-thinking-count">{model.thinkingLevels.length} 级</span>
                          {!(model.protocol === 'mock' || model.hasKey) && (
                            <button className="model-key-action button" onClick={() => setEditor(model)}>
                              <KeyRound size={13} />
                              配置 Key
                            </button>
                          )}
                        </SpotlightCard>
                      ))}
                    </div>
                  </SpotlightCard>
                )
              })}
            </AnimatedList>
          ) : (
            <div className="empty-list model-empty-state">
              {models.length ? (
                <>
                  <span>没有匹配的模型</span>
                  <button
                    type="button"
                    className="text-command"
                    onClick={() => {
                      setModelQuery('')
                      setModelFilter('all')
                    }}
                  >
                    清除筛选
                  </button>
                </>
              ) : (
                '尚未配置模型'
              )}
            </div>
          )}
        </section>
      )}
      {tab === 'paths' && <PathSettings />}
      {tab === 'plugins' && (
        <section className="settings-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <h2>已安装插件</h2>
            <div className="plugin-tools">
              <button
                className="button"
                onClick={() =>
                  void client()
                    .call('plugin.doctor', {})
                    .then((value) => setPluginReport(JSON.stringify(value, null, 2)))
                    .catch(report)
                }
              >
                <Stethoscope size={14} />
                检查
              </button>
              <button
                className="button"
                onClick={() =>
                  void client()
                    .call('plugin.graph', {})
                    .then((value) => setPluginReport(JSON.stringify(value, null, 2)))
                    .catch(report)
                }
              >
                <GitBranch size={14} />
                依赖图
              </button>
              <button
                className="button icon-button"
                title="查看插件锁"
                aria-label="查看插件锁"
                onClick={() =>
                  void client()
                    .call('plugin.lock', {})
                    .then((value) => setPluginReport(JSON.stringify(value, null, 2)))
                    .catch(report)
                }
              >
                <LockKeyhole size={14} />
              </button>
            </div>
          </div>
          {pluginReport && (
            <SpotlightCard className="plugin-report" spotlightColor="color-mix(in srgb, var(--rb-status) 20%, transparent)">
              <code>{pluginReport}</code>
            </SpotlightCard>
          )}
          {data?.plugins.length ? (
            <AnimatedList className="settings-plugin-list" viewportClassName="settings-plugin-viewport" showGradients={false}>
              {data.plugins.map((plugin) => <PluginRow key={plugin.id} plugin={plugin} />)}
            </AnimatedList>
          ) : null}
          <div className="install-plugin">
            <label>
              本地插件目录或归档
              <input
                value={pluginPath}
                placeholder="D:\Plugins\my-plugin"
                onChange={(event) => setPluginPath(event.target.value)}
              />
            </label>
            <label>
              安装范围
              <select
                value={pluginScope}
                onChange={(event) => setPluginScope(event.target.value as 'global' | 'project')}
              >
                <option value="global">全局</option>
                <option value="project">当前项目</option>
              </select>
            </label>
            <button
              className="button"
              disabled={!pluginPath || (pluginScope === 'project' && !workspaceId)}
              onClick={() =>
                void client()
                  .call('plugin.install', {
                    path: pluginPath,
                    ...(pluginScope === 'project' && workspaceId ? { projectId: workspaceId } : {}),
                  })
                  .then(() => {
                    setPluginPath('')
                    return refreshCatalog()
                  })
                  .catch(report)
              }
            >
              <Plus size={14} />
              加载可信插件
            </button>
          </div>
        </section>
      )}
      {tab === 'devices' && (
        <section className="settings-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <h2>宿主连接</h2>
            <span className="success">在线</span>
          </div>
          <div className="host-addresses">
            {host?.addresses.map((address) => (
              <div key={address}>
                <code>{address}</code>
                <button title="复制地址" aria-label="复制地址" onClick={() => void copyText(address).catch(report)}>
                  <Copy size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="section-toolbar">
            <h2>已配对设备</h2>
            <button
              className="button"
              onClick={() => void client().call('pairing.create', {}).then(setPairing).catch(report)}
            >
              <Plus size={14} />
              配对设备
            </button>
          </div>
          {pairing && (
            <div className="pairing-code rb-pairing-surface">
              <GlassSurface className="pairing-code-glass" width="100%" height="100%" aria-hidden="true" />
              <code>{pairing.code}</code>
              <span>有效期至 {new Date(pairing.expiresAt).toLocaleTimeString()}</span>
              <button
                title="复制配对码"
                aria-label="复制配对码"
                onClick={() =>
                  void copyText(pairing.code)
                    .then(() => setCopied(true))
                    .catch(report)
                }
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          )}
          {devices.length ? (
            <AnimatedList className="settings-device-list" viewportClassName="settings-device-viewport" showGradients={false}>
              {devices.map((device) => (
                <SpotlightCard
                  className="device-row"
                  key={device.id}
                  spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                >
                  <Monitor size={17} />
                  <div>
                    <strong>{device.name}</strong>
                    <span>{new Date(device.createdAt).toLocaleString()}</span>
                  </div>
                  <button
                    title={`撤销 ${device.name}`}
                    aria-label={`撤销 ${device.name}`}
                    onClick={() => {
                      if (window.confirm(`撤销 ${device.name} 的访问权限？`))
                        void client()
                          .call('device.revoke', { id: device.id })
                          .then(() => client().call('device.list', {}))
                          .then(setDevices)
                          .catch(report)
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </SpotlightCard>
              ))}
            </AnimatedList>
          ) : null}
        </section>
      )}
      {editor && <ProviderEditor {...(editor === 'new' ? {} : { provider: editor })} close={() => setEditor(null)} />}
    </div>
  )
}

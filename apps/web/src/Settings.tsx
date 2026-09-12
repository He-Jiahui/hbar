import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Moon,
  Monitor,
  Network,
  Plus,
  RefreshCw,
  Search,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { DEFAULT_THEME_PROFILE, DEFAULT_THINKING_LEVELS, providerSchema, themeProfileSchema } from '@hbar/contracts'
import type {
  Device,
  ModelInfo,
  ProviderConfig,
  ProviderModelConfig,
  RpcResults,
  SettingDescriptor,
  SettingsCatalog,
  SettingsSnapshot,
  ThemeProfile,
  ThinkingLevel,
} from '@hbar/contracts'
import { client, refreshCatalog, report, selectModel, useCatalog, useConnection, useWorkbench } from './stores'
import { copyText } from './browser-utils'
import PermissionSelector from './PermissionSelector'
import { permissionPreset } from './permissions'
import { providerFromPreset, providerPresets } from './provider-presets'
import PathSettings from './PathSettings'
import PluginDiagnostics from './PluginDiagnostics'
import PluginRow from './PluginRow'
import DescriptorSettingsForm from './DescriptorSettingsForm'
import { groupModelsByProvider, modelThinkingLabel } from './model-catalog'
import SettingsNavigation, { type SettingsTab } from './SettingsNavigation'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import GlareButton from './react-bits/GlareButton'
import AnimatedList from './react-bits/AnimatedList'
import { FloatingSurface } from './FloatingLayer'
import { mergeThemeContributions, useThemeSettings } from './theme-store'
import { platform } from './platform'
import { useUIPlugins } from './ui-plugins'
import { useLocale } from './locale'

type SettingsScope = 'global' | 'project' | 'session'

type SettingSearchEntry = {
  tab: SettingsTab
  tabLabel: string
  section: string
  title: string
  description: string
  keywords: readonly string[]
}

function settingMatches(entry: SettingSearchEntry, query: string) {
  const haystack = [entry.tabLabel, entry.section, entry.title, entry.description, ...entry.keywords].join(' ').toLocaleLowerCase()
  return haystack.includes(query.trim().toLocaleLowerCase())
}

function settingTab(root: string): SettingsTab {
  if (root === 'automation' || root === 'appearance' || root === 'permissions' || root === 'plugins')
    return root
  if (root === 'models') return 'models'
  if (root === 'paths') return 'paths'
  if (root === 'skills') return 'skills'
  return 'devices'
}

function catalogSearchEntry(setting: SettingDescriptor, catalog: SettingsCatalog): SettingSearchEntry {
  const root = catalog.navigation.roots.find((candidate) => candidate.id === setting.root)
  const group = root?.groups.find((candidate) => candidate.id === setting.group)
  return {
    tab: settingTab(setting.root),
    tabLabel: root?.title ?? (setting.root === 'plugins' ? '插件' : setting.root),
    section: [group?.title, setting.sectionTitle ?? setting.section].filter(Boolean).join(' / ') || root?.title || setting.root,
    title: setting.title,
    description: setting.description ?? '',
    keywords: setting.keywords,
  }
}

function pluginInstanceKey(plugin: { id: string; projectId?: string | undefined }) {
  return plugin.projectId ? `${plugin.id}@${plugin.projectId}` : plugin.id
}

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const { t } = useLocale()
  return (
    <FloatingSurface
      mode="modal"
      open
      onClose={onClose}
      className="modal rb-modal-surface"
      aria-label={title}
      role="dialog"
      aria-modal="true"
    >
      <GlassSurface className="modal-glass" width="100%" height="100%" aria-hidden="true" />
      <header>
        <h2>{title}</h2>
        <button title={t('cancel')} aria-label={t('cancel')} onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {children}
    </FloatingSurface>
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

function ProviderEditorPage({ provider, close }: { provider?: ModelInfo; close(): void }) {
  const { t } = useLocale()
  const detailPageRef = useRef<HTMLElement>(null)
  const initialPreset = provider
    ? (providerPresets.find(
        (preset) => preset.name === (provider.providerName || provider.name) || preset.baseUrl === provider.baseUrl,
      )?.id ?? 'custom')
    : 'deepseek'
  const [presetId, setPresetId] = useState(initialPreset)
  const selectedPreset = providerPresets.find((preset) => preset.id === presetId) ?? providerPresets.at(-1)!
  const customConnection = presetId === 'custom'
  const initialValue = useRef<ProviderConfig>(
    provider
      ? providerEditorValue(provider)
      : providerFromPreset(providerPresets.find((preset) => preset.id === 'deepseek')!),
  ).current
  const initialSnapshot = useRef(JSON.stringify({ value: initialValue, apiKey: '' })).current
  const [value, setValue] = useState<ProviderConfig>(initialValue)
  const [apiKey, setApiKey] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useLayoutEffect(() => {
    detailPageRef.current?.scrollTo({ top: 0, left: 0 })
  }, [])
  const selectedModel = value.models.find((model) => model.id === value.model) ?? value.models[0]
  const dirty = JSON.stringify({ value, apiKey }) !== initialSnapshot
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
  const title = provider ? t('editModel') : t('addModel')
  return (
    <section ref={detailPageRef} className="settings-detail-page rb-settings-detail-page" aria-label={title}>
      <GlassSurface className="settings-detail-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="settings-detail-header">
        <button
          type="button"
          className="settings-detail-back"
          title={t('backProvidersModels')}
          aria-label={t('backProvidersModels')}
          onClick={close}
        >
          <ArrowLeft size={15} />
          <span>{t('providersAndModels')}</span>
        </button>
        <div className="settings-detail-heading">
          <span className="settings-detail-eyebrow">{t('settingsModels')}</span>
          <h1>{title}</h1>
          <p>
            {provider
              ? `${provider.providerName || provider.name} · ${value.models.length} ${t('providerModelCount')}`
              : t('configureProvider')}
          </p>
        </div>
      </header>
      <form onSubmit={(event) => void save(event)} className="settings-form settings-detail-form">
        {!provider && (
          <fieldset className="provider-presets">
            <legend>{t('quickStart')}</legend>
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
            <p>{t('providerPresetHint')}</p>
          </fieldset>
        )}
        {customConnection ? (
          <>
            <label>
              {t('fieldName')}
              <input autoFocus value={value.name} onChange={(event) => field('name', event.target.value)} required />
            </label>
            <label>
              {t('fieldProtocol')}
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
              {t('apiAddress')}
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
        <section className="provider-model-editor" aria-label={t('providerModels')}>
          <header className="provider-model-editor-heading">
            <div>
              <strong>{t('modelsHeading')}</strong>
              <span>{value.models.length} {t('modelsThinkingHint')}</span>
            </div>
            <button
              type="button"
              className="button icon-button"
              title={t('addModel')}
              aria-label={t('addModel')}
              onClick={addModel}
            >
              <Plus size={14} />
            </button>
          </header>
          <div className="provider-model-cards">
            {value.models.map((model, index) => (
              <fieldset
                className={`provider-model-card rb-provider-model-surface ${model.id === value.model ? 'selected' : ''}`}
                key={`model-editor-${index}`}
              >
                <legend>{model.id === value.model ? t('defaultModel') : `${t('modelsHeading')} ${index + 1}`}</legend>
                <GlassSurface className="provider-model-card-glass" width="100%" height="100%" aria-hidden="true" />
                <div className="form-grid">
                  <label>
                    {index === 0 ? t('modelId') : `${t('modelIdentifier')} ${index + 1}`}
                    <input
                      list={`provider-models-${presetId}`}
                      aria-label={index === 0 ? t('modelId') : `${t('modelIdentifier')} ${index + 1}`}
                      value={model.id}
                      onChange={(event) => updateModel(index, { id: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    {t('displayName')}
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
                  {t('defaultModel')}
                </label>
                <div className="provider-thinking-editor">
                  <span>{t('supportedThinkingLevels')}</span>
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
                    {t('defaultThinkingLevel')}
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
                    {t('removeModel')}
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
              placeholder={provider?.hasKey ? t('saved') : t('notConfigured')}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
        </label>
        {selectedModel && (
          <details className="advanced rb-provider-advanced" open={customConnection}>
            <summary>{t('advancedModelSettings')}</summary>
            <GlassSurface className="provider-advanced-glass" width="100%" height="100%" aria-hidden="true" />
            <div className="form-grid">
              <label>
                {t('contextWindow')}
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
                {t('maxOutput')}
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
                {t('inputPerMillionTokens')}
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
                {t('outputPerMillionTokens')}
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
              {t('imageInputCapability')}
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
              {t('reasoningModel')}
            </label>
          </details>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer settings-detail-footer">
          <button type="button" className="button" onClick={close}>
            {t('cancel')}
          </button>
          <GlareButton className="button primary" disabled={busy || !dirty}>
            <Save size={14} />
            {t('save')}
          </GlareButton>
        </footer>
      </form>
    </section>
  )
}

function SkillsSettings() {
  const { t } = useLocale()
  const [skills, setSkills] = useState<RpcResults['system.skills.list']>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSkills(await client().call('system.skills.list', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const filtered = skills.filter((skill) => skill.id.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return (
    <section className="settings-section skills-section">
      <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
      <div className="section-toolbar">
        <div>
          <h2>{t('globalSkills')}</h2>
          <p className="section-description">{t('globalSkillsHint')}</p>
        </div>
        <button
          type="button"
          className="settings-refresh"
          title={t('refreshSkills')}
          aria-label={t('refreshSkills')}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spinning' : undefined} />
        </button>
      </div>
      <label className="settings-search skills-search">
        <Search size={14} aria-hidden="true" />
        <input
          aria-label={t('searchSkills')}
          placeholder={t('searchGlobalSkills')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {filtered.length ? (
        <AnimatedList className="skills-list" viewportClassName="skills-viewport" showGradients={false}>
          {filtered.map((skill) => (
            <SpotlightCard
              className="skill-row"
              key={skill.id}
              spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
            >
              <span className="skill-icon" aria-hidden="true"><BookOpen size={16} /></span>
              <div className="skill-copy">
                <strong>{skill.id}</strong>
                <small>{t('globalSkill')}</small>
                <code title={skill.path}>{skill.path}</code>
              </div>
              <span className="skill-scope">{t('globalSettings')}</span>
            </SpotlightCard>
          ))}
        </AnimatedList>
      ) : (
        <div className="empty-list skills-empty-state" role="status">
          <BookOpen size={20} aria-hidden="true" />
          <strong>{query ? t('noMatchingSkills') : t('noGlobalSkills')}</strong>
          <span>{query ? t('tryOtherKeywords') : t('installGlobalSkillsHint')}</span>
        </div>
      )}
    </section>
  )
}

export default function Settings() {
  const { locale, t } = useLocale()
  const [tab, setTab] = useState<SettingsTab>('models'),
    [editor, setEditor] = useState<ModelInfo | 'new' | null>(null)
  const [settingsScope, setSettingsScope] = useState<SettingsScope>(() => {
    const stored = window.localStorage.getItem('hbar.settings.scope')
    return stored === 'project' || stored === 'session' ? stored : 'global'
  })
  const [devices, setDevices] = useState<Device[]>([]),
    [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null),
    [pluginPath, setPluginPath] = useState(''),
    [pluginScope, setPluginScope] = useState<'global' | 'project'>('global'),
    [copied, setCopied] = useState(false),
    [modelQuery, setModelQuery] = useState(''),
    [settingsQuery, setSettingsQuery] = useState(''),
    [modelFilter, setModelFilter] = useState<'all' | 'connected' | 'needs-key'>('all')
  const [settingsCatalog, setSettingsCatalog] = useState<SettingsCatalog | null>(null)
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const settingsSavingRef = useRef(false)
  const [notificationPermissionHint, setNotificationPermissionHint] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null)
  const [themeUploading, setThemeUploading] = useState(false)
  const [fontFamilies, setFontFamilies] = useState<string[]>([])
  const [windowEffectStatus, setWindowEffectStatus] = useState('')
  const themeBackgroundInput = useRef<HTMLInputElement>(null)
  const themeImportInput = useRef<HTMLInputElement>(null)
  const data = useCatalog((state) => state.data),
    host = useConnection((state) => state.host),
    approvalMode = useWorkbench((state) => state.approvalMode),
    workspaceId = useWorkbench((state) => state.workspaceId),
    activeSessionId = useWorkbench((state) => state.activeSession),
    selectedModelId = useWorkbench((state) => state.modelId),
    selectedThinkingLevel = useWorkbench((state) => state.thinkingLevel)
  const themeProfile = useThemeSettings((state) => state.profile)
  const themeProfileExplicit = useThemeSettings((state) => state.profileExplicit)
  const themeSnapshot = useThemeSettings((state) => state.snapshot)
  const themeSaving = useThemeSettings((state) => state.saving)
  const themeError = useThemeSettings((state) => state.error)
  const themeConflict = useThemeSettings((state) => state.conflict)
  const themePlugins = useUIPlugins((state) => state.themes)
  const rendererSlots = useUIPlugins((state) => state.rendererSlots)
  const themeBackgroundAssets = useUIPlugins((state) => state.backgroundAssets)
  const themeConnection = useConnection((state) => state.client)
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
  const settingSearchResults = settingsQuery.trim()
    ? (settingsCatalog?.settings ?? []).map((setting) => settingsCatalog ? catalogSearchEntry(setting, settingsCatalog) : null).filter((entry): entry is SettingSearchEntry => Boolean(entry)).filter((entry) => settingMatches(entry, settingsQuery)).slice(0, 8)
    : []
  useEffect(() => {
    window.localStorage.setItem('hbar.settings.scope', settingsScope)
  }, [settingsScope])
  useEffect(() => {
    if (tab === 'devices') void client().call('device.list', {}).then(setDevices).catch(report)
  }, [tab])
  useEffect(() => {
    const connection = useConnection.getState().client
    if (!connection) return
    void connection.call('settings.catalog', {}).then(setSettingsCatalog).catch(report)
  }, [data?.plugins])
  useEffect(() => {
    const targetId = settingsScope === 'session' ? activeSessionId : settingsScope === 'project' ? workspaceId : undefined
    if (settingsScope !== 'global' && !targetId) {
      setSettingsSnapshot(null)
      return
    }
    setSettingsError('')
    void client().call('settings.snapshot', { scope: settingsScope, ...(targetId ? { targetId } : {}) }).then(setSettingsSnapshot).catch((error) => {
      setSettingsError(error instanceof Error ? error.message : String(error))
    })
  }, [activeSessionId, settingsScope, workspaceId])
  useEffect(() => {
    if (tab !== 'appearance' || fontFamilies.length) return
    let cancelled = false
    void platform().then((adapter) => adapter.listFonts()).then((families) => {
      if (!cancelled) setFontFamilies(families)
    }).catch(report)
    return () => { cancelled = true }
  }, [fontFamilies.length, tab])
  useEffect(() => {
    if (tab !== 'appearance') return
    let cancelled = false
    const effectiveTheme = mergeThemeContributions(themeProfile, themePlugins, themeProfileExplicit)
    void platform().then((adapter) => adapter.setWindowEffect(effectiveTheme)).then((result) => {
      if (!cancelled) setWindowEffectStatus(result.native ? t('nativeEffectEnabled') : result.message ?? t('cssBlurFallback'))
    }).catch((error) => {
      if (!cancelled) setWindowEffectStatus(error instanceof Error ? `${t('nativeEffectUnavailable')}：${error.message}` : `${t('nativeEffectUnavailable')}，${t('cssBlurFallback')}`)
    })
    return () => { cancelled = true }
  }, [t, tab, themePlugins, themeProfile, themeProfileExplicit])
  useEffect(() => {
    const targetId = settingsScope === 'session' ? activeSessionId : settingsScope === 'project' ? workspaceId : undefined
    useThemeSettings.getState().setScope(settingsScope, targetId ?? undefined)
    if (useConnection.getState().status !== 'connected') return
    const connection = useConnection.getState().client
    if (connection && (settingsScope === 'global' || targetId))
      void useThemeSettings.getState().load(connection, settingsScope, targetId ?? undefined)
  }, [activeSessionId, settingsScope, workspaceId])
  function updateThemeColor(key: keyof ThemeProfile['colors'], value: string) {
    useThemeSettings.getState().updateDraft((current) => ({
      ...current,
      mode: 'custom',
      colors: { ...current.colors, [key]: value },
    }))
  }
  function updateThemeTypography<K extends keyof ThemeProfile['typography']>(key: K, value: ThemeProfile['typography'][K]) {
    useThemeSettings.getState().updateDraft((current) => ({
      ...current,
      typography: { ...current.typography, [key]: value },
    }))
  }
  function updateThemeSurface<K extends keyof ThemeProfile['surface']>(key: K, value: ThemeProfile['surface'][K]) {
    useThemeSettings.getState().updateDraft((current) => ({
      ...current,
      surface: { ...current.surface, [key]: value },
    }))
  }
  async function uploadThemeBackground(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setThemeUploading(true)
    try {
      const artifact = await client().upload(file)
      useThemeSettings.getState().updateDraft((current) => ({
        ...current,
        surface: { ...current.surface, backgroundAsset: artifact.id },
      }))
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error))
    } finally {
      setThemeUploading(false)
      if (themeBackgroundInput.current) themeBackgroundInput.current.value = ''
    }
  }
  function exportThemeProfile() {
    const blob = new Blob([JSON.stringify(themeProfile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'hbar-theme.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  async function importThemeProfile(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 512_000) throw new Error(t('themeFileTooLarge'))
      const parsed = themeProfileSchema.safeParse(JSON.parse(await file.text()))
      if (!parsed.success) throw new Error(t('invalidThemeFile'))
      useThemeSettings.getState().updateDraft(() => parsed.data)
      setSettingsError('')
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : t('themeImportFailed'))
    } finally {
      if (themeImportInput.current) themeImportInput.current.value = ''
    }
  }
  async function saveSetting(id: string, value: unknown) {
    if (!settingsSnapshot || settingsSavingRef.current) return
    settingsSavingRef.current = true
    if (id.startsWith('notifications.') && value === true && typeof Notification !== 'undefined') {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
      setNotificationPermissionHint(
        permission === 'denied'
          ? t('browserNotificationsBlocked')
          : '',
      )
    } else if (id.startsWith('notifications.')) setNotificationPermissionHint('')
    setSettingsSaving(true)
    setSettingsError('')
    try {
      const next = await client().call('settings.set', {
        scope: settingsSnapshot.scope,
        ...(settingsSnapshot.targetId ? { targetId: settingsSnapshot.targetId } : {}),
        id,
        value,
        expectedRevision: settingsSnapshot.revision,
      })
      setSettingsSnapshot(next)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error))
    } finally {
      settingsSavingRef.current = false
      setSettingsSaving(false)
    }
  }
  async function resetSetting(id: string) {
    if (!settingsSnapshot || settingsSavingRef.current) return
    settingsSavingRef.current = true
    setSettingsSaving(true)
    setSettingsError('')
    try {
      const next = await client().call('settings.reset', {
        scope: settingsSnapshot.scope,
        ...(settingsSnapshot.targetId ? { targetId: settingsSnapshot.targetId } : {}),
        id,
        expectedRevision: settingsSnapshot.revision,
      })
      setSettingsSnapshot(next)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error))
    } finally {
      settingsSavingRef.current = false
      setSettingsSaving(false)
    }
  }
  if (editor) {
    return (
      <div className="settings-panel settings-editor-panel">
        <ProviderEditorPage {...(editor === 'new' ? {} : { provider: editor })} close={() => setEditor(null)} />
      </div>
    )
  }
  return (
    <div className="settings-panel">
      <div className="page-heading settings-page-heading">
        <div className="settings-heading-row">
          <div>
          <h1>{t('settingsTitle')}</h1>
            <p className="settings-scope-caption">
              {settingsScope === 'global' ? t('settingsScopeGlobalHint') : settingsScope === 'project' ? t('settingsScopeProjectHint') : t('settingsScopeSessionHint')}
            </p>
          </div>
          <button title={t('refreshSettings')} aria-label={t('refreshSettings')} onClick={() => void refreshCatalog().catch(report)}>
            <RefreshCw size={15} />
          </button>
        </div>
        <label className="settings-global-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label={t('searchAllSettings')}
            placeholder={t('searchAllSettings')}
            value={settingsQuery}
            onChange={(event) => setSettingsQuery(event.target.value)}
          />
          {settingsQuery && (
            <button type="button" aria-label={t('clearSettingsSearch')} title={t('clearSettingsSearch')} onClick={() => setSettingsQuery('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <div className="settings-scope-switcher" role="tablist" aria-label={t('settingsScope')}>
          {(
            [
              ['global', t('globalSettings')],
              ['project', t('projectSettings')],
              ['session', t('currentSession')],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              role="tab"
              aria-selected={settingsScope === value}
              disabled={value === 'project' ? !workspaceId : value === 'session' ? !activeSessionId : false}
              className={settingsScope === value ? 'selected' : ''}
              onClick={() => setSettingsScope(value)}
            >
              {label}
            </button>
          ))}
          <span className="settings-scope-target">
            {settingsScope === 'global' ? t('allProjects') : settingsScope === 'project' ? `${t('currentProject')} · ${workspaceId ?? t('unavailable')}` : `${t('currentSession')} · ${activeSessionId ?? t('unavailable')}`}
          </span>
        </div>
        {settingsQuery.trim() && (
          <div className="settings-search-results" role="listbox" aria-label={t('settingsSearchResults')}>
            {settingSearchResults.length ? (
              settingSearchResults.map((entry) => (
                <button
                  type="button"
                  role="option"
                  aria-label={`${entry.tabLabel} / ${entry.section} / ${entry.title}`}
                  key={`${entry.tab}:${entry.title}`}
                  onClick={() => {
                    setTab(entry.tab)
                    setSettingsQuery('')
                  }}
                >
                  <span>{entry.tabLabel}</span>
                  <strong>{entry.section}</strong>
                  <small>{entry.title} · {entry.description}</small>
                </button>
              ))
            ) : (
              <div className="settings-search-empty">{t('noMatchingSettings')}</div>
            )}
          </div>
        )}
      </div>
      <SettingsNavigation
        tab={tab}
        onSelect={(nextTab) => {
          setTab(nextTab)
          if (nextTab !== 'plugins') setSelectedPluginId(null)
        }}
        catalog={settingsCatalog}
        onSelectPlugin={(id) => {
          setTab('plugins')
          setSelectedPluginId(id)
          window.requestAnimationFrame(() => document.getElementById(`plugin-settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }}
      />
      {tab === 'appearance' && (
        <section className="settings-section appearance-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div>
              <h2>{t('appearanceTheme')}</h2>
              <p className="section-description">{t('appearanceThemeDescription')}</p>
            </div>
            <div className="appearance-actions">
              <button type="button" className="button" onClick={() => useThemeSettings.getState().discardDraft()} disabled={themeSaving}>{t('cancel')}</button>
              <button type="button" className="button" onClick={() => useThemeSettings.getState().updateDraft(() => DEFAULT_THEME_PROFILE)} disabled={themeSaving}>{t('resetDefault')}</button>
              <button type="button" className="button" onClick={() => themeImportInput.current?.click()} disabled={themeSaving}>{t('importTheme')}</button>
              <input ref={themeImportInput} hidden type="file" accept="application/json,.json" onChange={(event) => void importThemeProfile(event.target.files?.[0])} />
              <button type="button" className="button" onClick={exportThemeProfile} disabled={themeSaving}>{t('exportTheme')}</button>
              <button type="button" className="button" onClick={() => { const connection = useConnection.getState().client; if (connection) void useThemeSettings.getState().save(connection) }} disabled={themeSaving}>{themeSaving ? t('saving') : t('saveTheme')}</button>
            </div>
          </div>
          <DescriptorSettingsForm
            descriptors={settingsCatalog?.settings.filter((setting) => setting.root === 'appearance' && setting.id !== 'appearance.profile' && setting.id !== 'appearance.theme') ?? []}
            snapshot={settingsSnapshot}
            context={{ hasWorkspace: Boolean(workspaceId), hasSession: Boolean(activeSessionId) }}
            saving={settingsSaving}
            onSet={(id, value) => void saveSetting(id, value)}
            onReset={(id) => void resetSetting(id)}
          />
          <div className="theme-options rb-theme-options" role="group" aria-label={t('appearanceTheme')}>
            <GlassSurface className="theme-options-glass" width="100%" height="100%" aria-hidden="true" />
            {(
              [
                ['dark', t('themeDark'), Moon],
                ['light', t('themeLight'), Sun],
                ['white', t('themeWhite'), Monitor],
                ['custom', t('themeCustom'), Settings2],
              ] as const
            ).map(([value, label, Icon]) => (
              <GlareButton
                type="button"
                key={value}
                className={themeProfile.mode === value ? 'selected' : ''}
                aria-pressed={themeProfile.mode === value}
                glareColor="color-mix(in srgb, var(--rb-accent) 42%, transparent)"
                onClick={() => useThemeSettings.getState().updateDraft((current) => ({ ...current, mode: value }))}
              >
                <Icon size={17} />
                <span>{label}</span>
              </GlareButton>
            ))}
          </div>
          {settingsScope !== 'global' && themeSnapshot?.values['appearance.profile']?.source !== settingsScope && (
            <div className="settings-override-notice" role="status">
              {t('inheritedFrom')} {themeSnapshot?.values['appearance.profile']?.source === 'project' ? t('projectSettings') : themeSnapshot?.values['appearance.profile']?.source === 'global' ? t('globalSettings') : t('defaultSettings')}{locale === 'zh-CN' ? '。' : '.'}
              <button
                type="button"
                className="text-command"
                disabled={themeSaving || !useConnection.getState().client}
                onClick={() => {
                  const connection = useConnection.getState().client
                  if (connection) void useThemeSettings.getState().reset(connection)
                }}
              >
                {t('restoreInheritance')}
              </button>
            </div>
          )}
          {themeConflict && <div className="settings-override-notice" role="alert"><span>{t('themeConflictNotice')}</span><button type="button" className="text-command" onClick={() => { const connection = useConnection.getState().client; if (connection) void useThemeSettings.getState().refreshSnapshot(connection) }}>{t('loadLatestKeepDraft')}</button><button type="button" className="text-command" onClick={() => useThemeSettings.getState().discardDraft()}>{t('discardDraft')}</button></div>}
          <div className="theme-editor-grid">
            {([
              ['primary', 'colorPrimary'],
              ['secondary', 'colorSecondary'],
              ['highlight', 'colorHighlight'],
              ['background', 'colorBackground'],
              ['surface', 'colorSurface'],
              ['surfaceElevated', 'colorSurfaceElevated'],
              ['border', 'colorBorder'],
              ['borderStrong', 'colorBorderStrong'],
              ['textPrimary', 'colorText'],
              ['headingText', 'colorHeading'],
              ['focus', 'colorFocus'],
              ['success', 'colorSuccess'],
              ['warning', 'colorWarning'],
              ['error', 'colorError'],
              ['info', 'colorInfo'],
              ['codeBackground', 'colorCodeBackground'],
              ['diffAdded', 'colorDiffAdded'],
              ['diffRemoved', 'colorDiffRemoved'],
              ['diffContext', 'colorDiffContext'],
              ['diffHeader', 'colorDiffHeader'],
            ] as const).map(([key, label]) => (
              <label key={key} className="theme-color-field"><span>{t(label)}</span><input type="color" value={themeProfile.colors[key].slice(0, 7)} onChange={(event) => updateThemeColor(key, event.target.value)} /></label>
            ))}
            {([
              ['bodyTextColor', 'typographyBodyText'],
              ['headingTextColor', 'typographyHeadingText'],
              ['inlineCodeBackground', 'typographyInlineCodeBackground'],
              ['inlineCodeTextColor', 'typographyInlineCodeText'],
            ] as const).map(([key, label]) => (
              <label key={key} className="theme-color-field"><span>{t(label)}</span><input type="color" value={themeProfile.typography[key].slice(0, 7)} onChange={(event) => updateThemeTypography(key, event.target.value)} /></label>
            ))}
            <label className="theme-range-field"><span>{t('backgroundOpacity')} <output>{Math.round(themeProfile.surface.backgroundOpacity * 100)}%</output></span><input type="range" min="12" max="100" value={Math.round(themeProfile.surface.backgroundOpacity * 100)} onChange={(event) => updateThemeSurface('backgroundOpacity', Number(event.target.value) / 100)} /></label>
            <label className="theme-range-field"><span>{t('blurAmount')} <output>{themeProfile.surface.blurAmount}px</output></span><input type="range" min="0" max="64" value={themeProfile.surface.blurAmount} onChange={(event) => updateThemeSurface('blurAmount', Number(event.target.value))} /></label>
            <label className="theme-range-field"><span>{t('saturation')} <output>{themeProfile.surface.saturation}%</output></span><input type="range" min="0" max="220" value={themeProfile.surface.saturation} onChange={(event) => updateThemeSurface('saturation', Number(event.target.value))} /></label>
            <label className="theme-range-field"><span>{t('displacement')} <output>{themeProfile.surface.displacementScale}</output></span><input type="range" min="0" max="120" value={themeProfile.surface.displacementScale} onChange={(event) => updateThemeSurface('displacementScale', Number(event.target.value))} /></label>
            <label className="theme-range-field"><span>{t('aberration')} <output>{themeProfile.surface.aberrationIntensity.toFixed(1)}</output></span><input type="range" min="0" max="10" step="0.1" value={themeProfile.surface.aberrationIntensity} onChange={(event) => updateThemeSurface('aberrationIntensity', Number(event.target.value))} /></label>
            <label className="theme-range-field"><span>{t('elasticity')} <output>{themeProfile.surface.elasticity.toFixed(2)}</output></span><input type="range" min="0" max="1" step="0.05" value={themeProfile.surface.elasticity} onChange={(event) => updateThemeSurface('elasticity', Number(event.target.value))} /></label>
            <label className="theme-range-field"><span>{t('cornerRadius')} <output>{themeProfile.surface.cornerRadius}px</output></span><input type="range" min="0" max="32" value={themeProfile.surface.cornerRadius} onChange={(event) => updateThemeSurface('cornerRadius', Number(event.target.value))} /></label>
            <label className="theme-range-field"><span>{t('glowIntensity')} <output>{Math.round(themeProfile.surface.glowIntensity * 100)}%</output></span><input type="range" min="0" max="100" value={Math.round(themeProfile.surface.glowIntensity * 100)} onChange={(event) => updateThemeSurface('glowIntensity', Number(event.target.value) / 100)} /></label>
            <label className="theme-select-field"><span>{t('surfaceEffect')}</span><select value={themeProfile.surface.mode} onChange={(event) => useThemeSettings.getState().updateDraft((current) => ({ ...current, surface: { ...current.surface, mode: event.target.value as ThemeProfile['surface']['mode'] } }))}><option value="solid">{t('surfaceSolid')}</option><option value="acrylic">{t('surfaceAcrylic')}</option><option value="liquid-glass">{t('surfaceLiquidGlass')}</option></select></label>
            <label className="theme-select-field"><span>{t('bodySize')}</span><input type="number" min="10" max="24" value={themeProfile.typography.bodySize} onChange={(event) => updateThemeTypography('bodySize', Number(event.target.value))} /></label>
            <label className="theme-select-field"><span>{t('headingSize')}</span><input type="number" min="12" max="40" value={themeProfile.typography.headingSize} onChange={(event) => updateThemeTypography('headingSize', Number(event.target.value))} /></label>
            <label className="theme-select-field"><span>{t('codeSize')}</span><input type="number" min="9" max="24" value={themeProfile.typography.codeSize} onChange={(event) => updateThemeTypography('codeSize', Number(event.target.value))} /></label>
            <label className="theme-select-field"><span>{t('bodyLineHeight')}</span><input type="number" min="1" max="2.4" step="0.1" value={themeProfile.typography.bodyLineHeight} onChange={(event) => updateThemeTypography('bodyLineHeight', Number(event.target.value))} /></label>
            <label className="theme-select-field"><span>{t('bodyLanguage')}</span><select value={themeProfile.typography.locale} onChange={(event) => updateThemeTypography('locale', event.target.value)}><option value="zh-CN">中文（简体）</option><option value="zh-TW">中文（繁体）</option><option value="en-US">English</option><option value="ja-JP">日本語</option><option value="ko-KR">한국어</option></select></label>
            <label className="theme-select-field"><span>{t('bodyFont')}</span><select value={themeProfile.typography.bodyFontFamily} onChange={(event) => updateThemeTypography('bodyFontFamily', event.target.value)}>{fontFamilies.map((family) => <option key={family} value={family}>{family}</option>)}<option value={themeProfile.typography.bodyFontFamily}>{themeProfile.typography.bodyFontFamily}</option></select></label>
            <label className="theme-select-field"><span>{t('headingFont')}</span><select value={themeProfile.typography.headingFontFamily} onChange={(event) => updateThemeTypography('headingFontFamily', event.target.value)}>{fontFamilies.map((family) => <option key={family} value={family}>{family}</option>)}<option value={themeProfile.typography.headingFontFamily}>{themeProfile.typography.headingFontFamily}</option></select></label>
            <label className="theme-select-field"><span>{t('codeFont')}</span><select value={themeProfile.typography.codeFontFamily} onChange={(event) => updateThemeTypography('codeFontFamily', event.target.value)}>{fontFamilies.map((family) => <option key={family} value={family}>{family}</option>)}<option value={themeProfile.typography.codeFontFamily}>{themeProfile.typography.codeFontFamily}</option></select></label>
            <label className="theme-select-field"><span>{t('bodyWeight')}</span><input type="number" min="300" max="800" step="100" value={themeProfile.typography.bodyWeight} onChange={(event) => updateThemeTypography('bodyWeight', Number(event.target.value))} /></label>
            <label className="theme-select-field"><span>{t('headingWeight')}</span><input type="number" min="300" max="900" step="100" value={themeProfile.typography.headingWeight} onChange={(event) => updateThemeTypography('headingWeight', Number(event.target.value))} /></label>
            <label className="checkbox theme-option-checkbox"><input type="checkbox" checked={themeProfile.typography.underlineLinks} onChange={(event) => updateThemeTypography('underlineLinks', event.target.checked)} />{t('underlineLinks')}</label>
            <div className="theme-select-field theme-background-field"><span>{t('backgroundImage')}</span><div className="theme-background-actions"><button type="button" className="button" disabled={themeUploading} onClick={() => themeBackgroundInput.current?.click()}>{themeUploading ? t('uploading') : t('chooseImage')}</button><input ref={themeBackgroundInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadThemeBackground(event.target.files?.[0])} />{themeProfile.surface.backgroundAsset && <button type="button" className="text-command" onClick={() => useThemeSettings.getState().updateDraft((current) => ({ ...current, surface: { ...current.surface, backgroundAsset: null } }))}>{t('remove')}</button>}</div></div>
          </div>
          <div className="theme-preview">
            <h3>{t('themePreview')}</h3>
            <p>{t('mixedTypographyPreview')}<strong>{t('boldPreview')}</strong>，<u>{t('underlinePreview')}</u>。</p>
            <code>const theme = 'global';</code>
          </div>
          {themeBackgroundAssets.length > 0 && <div className="theme-plugin-assets" aria-label={t('pluginBackgrounds')}><span>{t('pluginBackgrounds')}</span>{themeBackgroundAssets.map((asset) => { const selected = themeProfile.surface.backgroundAsset === `plugin/${asset.owner}/${asset.path}`; return <button type="button" className={selected ? 'selected' : ''} key={asset.id} aria-pressed={selected} onClick={() => useThemeSettings.getState().updateDraft((current) => ({ ...current, surface: { ...current.surface, backgroundAsset: `plugin/${asset.owner}/${asset.path}` } }))}>{asset.title ?? asset.path}</button> })}</div>}
          {windowEffectStatus && <p className="settings-muted" role="status">{windowEffectStatus}</p>}
          {themeError && <p className="inline-error" role="alert">{themeError}</p>}
        </section>
      )}
      {tab === 'automation' && (
        <section className="settings-section automation-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div>
              <h2><Bell size={17} /> {t('automationTitle')}</h2>
              <p className="section-description">{t('automationHint')}</p>
            </div>
          </div>
          <div className="permission-settings-list">
            <DescriptorSettingsForm
              descriptors={settingsCatalog?.settings.filter((setting) => setting.root === 'automation') ?? []}
              snapshot={settingsSnapshot}
              context={{ hasWorkspace: Boolean(workspaceId), hasSession: Boolean(activeSessionId) }}
              saving={settingsSaving}
              onSet={(id, value) => void saveSetting(id, value)}
              onReset={(id) => void resetSetting(id)}
            />
            {notificationPermissionHint && <p className="settings-muted" role="status">{notificationPermissionHint}</p>}
            {settingsError && <p className="inline-error" role="alert">{settingsError}</p>}
          </div>
        </section>
      )}
      {tab === 'permissions' && (
        <section className="settings-section permissions-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div>
              <h2>{t('permissionsTitle')}</h2>
              <p className="section-description">{t('permissionsHint')}</p>
            </div>
            <PermissionSelector compact={false} placement="below" />
          </div>
          <div className="permission-settings-list">
            <DescriptorSettingsForm
              descriptors={settingsCatalog?.settings.filter((setting) => setting.root === 'permissions') ?? []}
              snapshot={settingsSnapshot}
              context={{ hasWorkspace: Boolean(workspaceId), hasSession: Boolean(activeSessionId) }}
              saving={settingsSaving}
              onSet={(id, value) => void saveSetting(id, value)}
              onReset={(id) => void resetSetting(id)}
            />
            <SpotlightCard
              className="permission-setting-row"
              spotlightColor="color-mix(in srgb, var(--hbar-ok) 18%, transparent)"
            >
              <div className="permission-setting-icon permission-tone-balanced">
                <ShieldCheck size={16} />
              </div>
              <div>
                <strong>{t('currentDefaultMode')}</strong>
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
                  <strong>{t('futureMessagesOnly')}</strong>
                  <span>{t('runningTasksHint')}</span>
            </SpotlightCard>
          </div>
        </section>
      )}
      {tab === 'models' && (
        <section className="settings-section models-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <div className="model-section-title">
            <h2>{t('providersAndModels')}</h2>
              <span>
                {modelGroups.length} {t('providerCount')} · {models.length} {t('modelCount')}
              </span>
            </div>
            <button className="button" onClick={() => setEditor('new')}>
              <Plus size={14} />
              {t('addModel')}
            </button>
          </div>
          <div className="model-list-toolbar">
            <label className="settings-search">
              <Search size={14} />
              <input
                aria-label={t('searchProvidersOrModels')}
                placeholder={t('searchProvidersModelsOrAddress')}
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
              />
            </label>
            <div className="model-filter segmented" role="group" aria-label={t('modelStatus')}>
              <button
                type="button"
                className={modelFilter === 'all' ? 'selected' : ''}
                onClick={() => setModelFilter('all')}
              >
                {t('allModels')}
              </button>
              <button
                type="button"
                className={modelFilter === 'connected' ? 'selected' : ''}
                onClick={() => setModelFilter('connected')}
              >
                {t('connectedModels')}
              </button>
              <button
                type="button"
                className={modelFilter === 'needs-key' ? 'selected' : ''}
                onClick={() => setModelFilter('needs-key')}
              >
                {t('needsConfiguration')}
              </button>
            </div>
          </div>
          {modelGroups.length ? (
            <AnimatedList
              className="settings-provider-list"
              viewportClassName="settings-provider-viewport"
              showGradients={false}
              animateItems={false}
            >
              {modelGroups.map((group) => {
                const first = group.models[0]!
                const connected = first.protocol === 'mock' || group.models.every((model) => model.hasKey)
                const providerId = first.providerId || first.id.split('/')[0] || first.id
                return (
                  <SpotlightCard
                    className="settings-provider-group"
                    key={group.providerId}
                    spotlightColor="color-mix(in srgb, var(--rb-accent) 24%, transparent)"
                    aria-label={group.providerName}
                  >
                    <header className="settings-provider-heading">
                      <div className="settings-provider-title">
                        <span className="model-icon">
                          <Network size={17} />
                        </span>
                        <div>
                          <strong>{group.providerName}</strong>
                          <small>
                            {group.models.length} {t('providerModelCount')} · {first.protocol === 'mock' ? t('localFixture') : first.baseUrl}
                          </small>
                        </div>
                      </div>
                      <div className="settings-provider-actions">
                        <span className={`model-connection ${connected ? 'connected' : 'needs-key'}`}>
                          <KeyRound size={12} />
                          {first.protocol === 'mock' ? t('localModel') : connected ? t('connected') : t('pendingKey')}
                        </span>
                        <button
                          title={`${t('deleteProvider')} ${group.providerName}`}
                          aria-label={`${t('deleteProvider')} ${group.providerName}`}
                          onClick={() => {
                            if (window.confirm(`${t('deleteProvider')} ${group.providerName} ${t('deleteProviderConfirm')}`))
                              void client()
                                .call('provider.delete', { id: providerId })
                                .then(refreshCatalog)
                                .catch(report)
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </header>
                    <div className="settings-provider-models">
                      {group.models.map((model) => (
                        <SpotlightCard
                          className={`model-row ${model.id === selectedModelId ? 'selected' : ''}`}
                          key={model.id}
                          spotlightColor="color-mix(in srgb, var(--rb-accent) 20%, transparent)"
                        >
                          <button
                            type="button"
                            className="model-details"
                            aria-label={`${t('selectModelLabel')} ${model.modelName}`}
                            onClick={() => selectModel(model.id)}
                          >
                            <strong>{model.modelName}</strong>
                            <span>{model.model}</span>
                            <small>
                              {model.defaultThinkingLevel === 'off'
                                ? t('thinkingOff')
                                : `${t('defaultThinking')}：${modelThinkingLabel(model.defaultThinkingLevel)}`}
                            </small>
                          </button>
                          <span className="model-capability">{model.imageInput ? t('imageAndText') : t('plainText')}</span>
                          <span className="model-window">{Math.round(model.contextWindow / 1000)}k</span>
                          <span className="model-thinking-count">{model.thinkingLevels.length} {t('thinkingLevelsCount')}</span>
                          <label className="model-thinking-select">
                            <span className="visually-hidden">{model.modelName} {t('thinkingLevelLabel')}</span>
                            <select
                              aria-label={`${model.modelName} ${t('thinkingLevelLabel')}`}
                              value={model.id === selectedModelId ? selectedThinkingLevel : model.defaultThinkingLevel}
                              onChange={(event) => selectModel(model.id, event.target.value as ThinkingLevel)}
                            >
                              {model.thinkingLevels.map((level) => (
                                <option value={level} key={level}>
                                  {modelThinkingLabel(level)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="model-config-action button"
                            aria-label={`${t('configure')} ${model.modelName}`}
                            title={`${t('configure')} ${model.modelName}`}
                            onClick={() => setEditor(model)}
                          >
                            <Settings2 size={13} />
                            {model.protocol === 'mock' || model.hasKey ? t('configure') : t('configureKey')}
                          </button>
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
                  <span>{t('noMatchingModels')}</span>
                  <button
                    type="button"
                    className="text-command"
                    onClick={() => {
                      setModelQuery('')
                      setModelFilter('all')
                    }}
                  >
                    {t('clearModelFilter')}
                  </button>
                </>
              ) : (
                t('noConfiguredModels')
              )}
            </div>
          )}
        </section>
      )}
      {tab === 'paths' && <PathSettings />}
      {tab === 'skills' && <SkillsSettings />}
      {tab === 'plugins' && (
        <section className="settings-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <h2>{t('plugins')}</h2>
          </div>
          <PluginDiagnostics />
          <div className="plugin-theme-summary" aria-label={t('plugins')}>
            <h3>{t('pluginThemeSummary')}</h3>
            <p>{t('pluginThemeSummaryHint')}</p>
            {themePlugins.length ? <ul>{themePlugins.map((theme) => {
              const previewUrl = theme.preview && themeConnection
                ? new URL(`/api/plugins/${encodeURIComponent(theme.owner)}/${theme.preview}`, themeConnection.baseUrl).href
                : undefined
              return <li key={theme.id} className="plugin-theme-item">
                {previewUrl ? <img src={previewUrl} alt={`${theme.title} preview`} loading="lazy" /> : <span className="plugin-theme-swatch" aria-hidden="true" />}
                <span className="plugin-theme-copy"><strong>{theme.title}</strong><span>{theme.owner} · {t('priorityLabel')} {theme.priority ?? 0}</span></span>
              </li>
            })}</ul> : <span className="settings-muted">{t('noThemePlugins')}</span>}
            <div className="plugin-renderer-summary" aria-label={t('pluginThemeSummary')}>
              {([
                ['markdown', 'rendererMarkdown'],
                ['code', 'rendererCode'],
                ['patch', 'rendererPatch'],
                ['git-diff', 'rendererGitDiff'],
              ] as const).map(([slot, label]) => {
                const candidates = rendererSlots[slot]
                const preferred = themeProfile.renderer[slot]
                const active = preferred !== 'builtin'
                  ? candidates.find((renderer) => renderer.id === preferred || renderer.id.endsWith(`:${preferred}`)) ?? candidates[0]
                  : candidates[0]
                return (
                  <div className="plugin-renderer-row" key={slot}>
                    <span>{t(label)}</span>
                    {active ? <strong>{active.id} · {t('pluginRendererActive')}</strong> : <strong>{t('builtinRenderer')}</strong>}
                    {candidates.length > 1 && <small>{t('rendererConflict')} · {candidates.length}</small>}
                  </div>
                )
              })}
            </div>
          </div>
          {data?.plugins.length ? (
            <AnimatedList
              className="settings-plugin-list"
              viewportClassName="settings-plugin-viewport"
              showGradients={false}
            >
              {data.plugins.map((plugin) => {
                const descriptors = settingsCatalog?.settings.filter((setting) => setting.owner === plugin.id) ?? []
                return (
                  <div className="plugin-setting-group" key={pluginInstanceKey(plugin)}>
                    <PluginRow plugin={plugin} id={`plugin-settings-${pluginInstanceKey(plugin)}`} className={selectedPluginId === plugin.id ? 'selected' : ''} />
                    <DescriptorSettingsForm
                      descriptors={descriptors}
                      snapshot={settingsSnapshot}
                      context={{ hasWorkspace: Boolean(workspaceId), hasSession: Boolean(activeSessionId), pluginEnabled: plugin.status === 'active' }}
                      saving={settingsSaving}
                      onSet={(id, value) => void saveSetting(id, value)}
                      onReset={(id) => void resetSetting(id)}
                    />
                  </div>
                )
              })}
            </AnimatedList>
          ) : null}
          <div className="install-plugin">
            <label>
              {t('localPluginPath')}
              <input
                value={pluginPath}
                placeholder="D:\Plugins\my-plugin"
                onChange={(event) => setPluginPath(event.target.value)}
              />
            </label>
            <label>
              {t('installScope')}
              <select
                value={pluginScope}
                onChange={(event) => setPluginScope(event.target.value as 'global' | 'project')}
              >
                <option value="global">{t('globalSettings')}</option>
                <option value="project">{t('currentProjectScope')}</option>
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
              {t('loadTrustedPlugin')}
            </button>
          </div>
        </section>
      )}
      {tab === 'devices' && (
        <section className="settings-section">
          <GlassSurface className="settings-glass-section" width="100%" height="100%" aria-hidden="true" />
          <div className="section-toolbar">
            <h2>{t('hostConnection')}</h2>
            <span className="success">{t('online')}</span>
          </div>
          <div className="host-addresses">
            {host?.addresses.map((address) => (
              <SpotlightCard
                className="host-address-row"
                key={address}
                spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
              >
                <code>{address}</code>
                <button title={t('copyAddress')} aria-label={t('copyAddress')} onClick={() => void copyText(address).catch(report)}>
                  <Copy size={14} />
                </button>
              </SpotlightCard>
            ))}
          </div>
          <div className="section-toolbar">
            <h2>{t('pairedDevices')}</h2>
            <button
              className="button"
              onClick={() => void client().call('pairing.create', {}).then(setPairing).catch(report)}
            >
              <Plus size={14} />
              {t('pairDevice')}
            </button>
          </div>
          {pairing && (
            <div className="pairing-code rb-pairing-surface">
              <GlassSurface className="pairing-code-glass" width="100%" height="100%" aria-hidden="true" />
              <code>{pairing.code}</code>
              <span>{t('expiresAt')} {new Date(pairing.expiresAt).toLocaleTimeString()}</span>
              <button
                title={t('copyPairingCode')}
                aria-label={t('copyPairingCode')}
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
            <AnimatedList
              className="settings-device-list"
              viewportClassName="settings-device-viewport"
              showGradients={false}
            >
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
                    title={`${t('revokeDevice')} ${device.name}`}
                    aria-label={`${t('revokeDevice')} ${device.name}`}
                    onClick={() => {
                      if (window.confirm(`${t('revokeDevice')} ${device.name} ${t('revokeDeviceConfirm')}`))
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
    </div>
  )
}

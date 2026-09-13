import { BrainCircuit, Check, ChevronDown, ChevronRight, Image, KeyRound, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FloatingSurface, useFloatingTrigger } from '../../FloatingLayer'
import GlassSurface from '../GlassSurface'
import SpotlightCard from '../SpotlightCard'
import { referenceAttributes } from '../production'

/**
 * UI-only model data.  The component deliberately knows nothing about the
 * catalog store or Client; a production adapter maps its contract into this
 * shape, while the reference gallery can use the same visual component with
 * its own deterministic data.
 */
export interface ReactBitsModelOption {
  readonly id: string
  readonly providerId: string
  readonly providerName: string
  readonly modelName: string
  readonly model: string
  readonly protocol: string
  readonly hasKey: boolean
  readonly imageInput: boolean
  readonly reasoning: boolean
  readonly contextWindow: number
  readonly maxOutput: number
  readonly inputPrice: number
  readonly outputPrice: number
  readonly thinkingLevels: readonly string[]
  readonly defaultThinkingLevel: string
}

export interface ReactBitsModelPickerLabels {
  readonly selectModel: string
  readonly unconfiguredModel: string
  readonly searchModels: string
  readonly searchModelsOrProviders: string
  readonly noMatchingModels: string
  readonly localModel: string
  readonly connected: string
  readonly keyNotConfigured: string
  readonly imageInput: string
  readonly imageAndText: string
  readonly reasoning: string
  readonly reasoningLabel: string
  readonly detail: string
  readonly multiStepReasoning: string
  readonly fastResponse: string
  readonly context: string
  readonly maxOutput: string
  readonly cost: string
  readonly localOrFree: string
  readonly thinkingLevel: string
  readonly thinkingHint: string
  readonly modelCount: string
}

export interface ReactBitsModelPickerProps {
  readonly models: readonly ReactBitsModelOption[]
  readonly selectedModelId: string
  readonly selectedThinking: string
  readonly labels: ReactBitsModelPickerLabels
  readonly locale?: string
  formatThinkingLevel(level: string, locale?: string): string
  onSelectModel(modelId: string): void
  onSelectThinking(modelId: string, level: string): void
  readonly disabled?: boolean
  readonly className?: string
}

interface ModelGroup {
  readonly providerId: string
  readonly providerName: string
  readonly models: readonly ReactBitsModelOption[]
}

function groupModels(models: readonly ReactBitsModelOption[]): ModelGroup[] {
  const groups = new Map<string, { providerId: string; providerName: string; models: ReactBitsModelOption[] }>()
  for (const model of models) {
    const providerId = model.providerId || model.id
    const group = groups.get(providerId)
    if (group) group.models.push(model)
    else groups.set(providerId, { providerId, providerName: model.providerName || model.modelName, models: [model] })
  }
  return [...groups.values()]
}

function matches(model: ReactBitsModelOption, query: string) {
  if (!query.trim()) return true
  const normalized = query.toLocaleLowerCase()
  return [
    model.providerName,
    model.providerId,
    model.modelName,
    model.model,
    model.protocol,
  ].some((part) => part.toLocaleLowerCase().includes(normalized))
}

function ModelCapabilities({ model, labels }: { model: ReactBitsModelOption; labels: ReactBitsModelPickerLabels }) {
  const status = model.protocol === 'mock' ? labels.localModel : model.hasKey ? labels.connected : labels.keyNotConfigured
  return (
    <span className="model-picker-meta rb-model-picker-meta">
      <span className={`model-picker-key ${model.hasKey || model.protocol === 'mock' ? 'ready' : 'missing'}`}>
        <KeyRound size={11} /> {status}
      </span>
      {model.imageInput && (
        <span title={labels.imageInput}>
          <Image size={11} /> {labels.imageAndText}
        </span>
      )}
      {model.reasoning && (
        <span title={labels.reasoning}>
          <BrainCircuit size={11} /> {labels.reasoningLabel}
        </span>
      )}
    </span>
  )
}

function formatContextWindow(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return value >= 1_000_000 ? `${Math.round(value / 1_000_000)}M tokens` : `${Math.round(value / 1_000)}K tokens`
}

function formatCost(model: ReactBitsModelOption, labels: ReactBitsModelPickerLabels) {
  if (!model.inputPrice && !model.outputPrice) return labels.localOrFree
  return `${model.inputPrice.toFixed(2)} / ${model.outputPrice.toFixed(2)} credits / 1M`
}

function ModelDetail({
  model,
  selectedLevel,
  labels,
  locale,
  formatThinkingLevel,
  onSelect,
}: {
  readonly model: ReactBitsModelOption
  readonly selectedLevel: string
  readonly labels: ReactBitsModelPickerLabels
  readonly locale?: string | undefined
  formatThinkingLevel(level: string, locale?: string): string
  onSelect(level: string): void
}) {
  const levels = model.thinkingLevels.length > 0 ? model.thinkingLevels : ['off']
  return (
    <aside
      className="model-picker-detail rb-model-picker-detail"
      aria-label={`${model.providerName} / ${model.modelName} ${labels.detail}`}
    >
      <div className="model-picker-detail-heading">
        <span className="model-picker-detail-avatar">{model.modelName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{model.modelName}</strong>
          <small>{model.providerName}</small>
        </div>
      </div>
      <p>{model.reasoning ? labels.multiStepReasoning : labels.fastResponse}</p>
      <dl className="model-picker-detail-stats">
        <div>
          <dt>{labels.context}</dt>
          <dd>{formatContextWindow(model.contextWindow)}</dd>
        </div>
        <div>
          <dt>{labels.maxOutput}</dt>
          <dd>{formatContextWindow(model.maxOutput)}</dd>
        </div>
        <div>
          <dt>{labels.cost}</dt>
          <dd>{formatCost(model, labels)}</dd>
        </div>
      </dl>
      {levels.length > 1 && (
        <div className="model-picker-reasoning" role="group" aria-label={`${model.modelName} ${labels.thinkingLevel}`}>
          <div className="model-picker-detail-label">
            <span>{labels.thinkingLevel}</span>
            <code>{formatThinkingLevel(selectedLevel, locale)}</code>
          </div>
          <div className="model-picker-reasoning-options">
            {levels
              .filter((level) => level !== 'off')
              .map((level) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={level === selectedLevel}
                  className={level === selectedLevel ? 'selected' : ''}
                  key={level}
                  onClick={() => onSelect(level)}
                >
                  {formatThinkingLevel(level, locale)}
                </button>
              ))}
          </div>
          <small>{labels.thinkingHint}</small>
        </div>
      )}
    </aside>
  )
}

/** ReactBits AI Chat 9 model picker, driven entirely by typed props. */
export default function ModelPickerSurface({
  models,
  selectedModelId,
  selectedThinking,
  labels,
  locale,
  formatThinkingLevel,
  onSelectModel,
  onSelectThinking,
  disabled = false,
  className = '',
}: ReactBitsModelPickerProps) {
  const selected = models.find((model) => model.id === selectedModelId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedModelId, setExpandedModelId] = useState(selectedModelId)
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const highlightedModelIndexRef = useRef(0)
  const closePicker = () => {
    setOpen(false)
    setQuery('')
    requestAnimationFrame(() => trigger.current?.focus())
  }
  const triggerProps = useFloatingTrigger({
    open,
    onOpen: () => {
      setExpandedModelId(selectedModelId || models[0]?.id || '')
      highlightedModelIndexRef.current = 0
      setHighlightedModelIndex(0)
      setOpen(true)
    },
    onClose: closePicker,
  })

  useEffect(() => {
    if (selectedModelId) setExpandedModelId(selectedModelId)
  }, [selectedModelId])

  const groups = groupModels(models.filter((model) => matches(model, query)))
  const modelOptions = groups.flatMap((group) => group.models)
  const detailModel = models.find((model) => model.id === expandedModelId) ?? selected ?? groups[0]?.models[0]
  const moveExpanded = (delta: -1 | 1) => {
    if (!modelOptions.length) return
    const nextIndex = (highlightedModelIndexRef.current + delta + modelOptions.length) % modelOptions.length
    highlightedModelIndexRef.current = nextIndex
    setHighlightedModelIndex(nextIndex)
    setExpandedModelId(modelOptions[nextIndex]!.id)
  }
  const chooseModel = (model: ReactBitsModelOption) => {
    onSelectModel(model.id)
    setExpandedModelId(model.id)
    const modelIndex = modelOptions.findIndex((item) => item.id === model.id)
    if (modelIndex >= 0) {
      highlightedModelIndexRef.current = modelIndex
      setHighlightedModelIndex(modelIndex)
    }
  }
  const selectedLevel = selected ? selectedThinking : 'off'

  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9', 'model-picker')}
      className={`model-picker rb-model-picker${className ? ` ${className}` : ''}`}
    >
      <button
        ref={trigger}
        type="button"
        className={`model-picker-trigger rb-model-picker-trigger ${open ? 'open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          selected
            ? `${labels.selectModel}，当前 ${selected.providerName} / ${selected.modelName}，${labels.thinkingLevel} ${formatThinkingLevel(selectedLevel, locale)}`
            : labels.selectModel
        }
        title={selected ? `${selected.providerName} · ${selected.modelName} · ${formatThinkingLevel(selectedLevel, locale)}` : labels.selectModel}
        disabled={disabled}
        {...triggerProps}
      >
        <Sparkles size={13} aria-hidden="true" />
        <span className="model-picker-selected">
          <strong>{selected?.providerName ?? labels.selectModel}</strong>
          <code>{selected ? `${selected.modelName} · ${formatThinkingLevel(selectedLevel, locale)}` : labels.unconfiguredModel}</code>
        </span>
        <ChevronDown size={13} className={open ? 'model-picker-chevron-open' : ''} />
      </button>
      <FloatingSurface
        anchorRef={trigger}
        open={open}
        onClose={closePicker}
        placement="below"
        className="model-picker-menu rb-model-picker-menu rb-menu-surface"
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9', 'model-picker')}
        role="menu"
        aria-label={labels.selectModel}
      >
        <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
        <div className="model-picker-search">
          <Search size={13} />
          <input
            autoFocus
            aria-label={labels.searchModels}
            placeholder={labels.searchModelsOrProviders}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              highlightedModelIndexRef.current = 0
              setHighlightedModelIndex(0)
              setExpandedModelId('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                moveExpanded(event.key === 'ArrowDown' ? 1 : -1)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const highlighted = modelOptions[highlightedModelIndexRef.current]
                if (highlighted) chooseModel(highlighted)
              }
            }}
          />
        </div>
        <div className="model-picker-body">
          <div className="model-picker-list">
            {groups.map((group) => (
              <section className="model-picker-provider" key={group.providerId} role="group" aria-label={group.providerName}>
                <header className="model-picker-provider-heading">
                  <span>{group.providerName}</span>
                  <small>{group.models.length} {labels.modelCount}</small>
                </header>
                {group.models.map((model) => {
                  const isSelected = model.id === selectedModelId
                  const isHighlighted = model.id === modelOptions[highlightedModelIndex]?.id
                  const level = isSelected ? selectedThinking : model.defaultThinkingLevel
                  return (
                    <SpotlightCard
                      className={`model-picker-model rb-model-picker-model ${model.id === expandedModelId ? 'expanded' : ''} ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                      key={model.id}
                      spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        aria-current={model.id === expandedModelId ? 'true' : undefined}
                        aria-label={`${model.providerName} / ${model.modelName}`}
                        className="model-picker-option"
                        onMouseEnter={() => {
                          const modelIndex = modelOptions.findIndex((item) => item.id === model.id)
                          if (modelIndex >= 0) {
                            highlightedModelIndexRef.current = modelIndex
                            setHighlightedModelIndex(modelIndex)
                          }
                        }}
                        onClick={() => chooseModel(model)}
                      >
                        <span className="model-picker-avatar">{model.modelName.slice(0, 1).toUpperCase()}</span>
                        <span className="model-picker-copy">
                          <strong>{model.modelName}</strong>
                          <code>{model.model}</code>
                          <ModelCapabilities model={model} labels={labels} />
                        </span>
                        <span className="model-picker-model-effort">{formatThinkingLevel(level, locale)}</span>
                        {model.id === expandedModelId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isSelected && <Check size={14} />}
                      </button>
                    </SpotlightCard>
                  )
                })}
              </section>
            ))}
            {!groups.length && <div className="model-picker-empty">{labels.noMatchingModels}</div>}
          </div>
          {detailModel && (
            <ModelDetail
              model={detailModel}
              selectedLevel={detailModel.id === selectedModelId ? selectedThinking : detailModel.defaultThinkingLevel}
              labels={labels}
              {...(locale === undefined ? {} : { locale })}
              formatThinkingLevel={formatThinkingLevel}
              onSelect={(level) => {
                onSelectThinking(detailModel.id, level)
                closePicker()
              }}
            />
          )}
        </div>
      </FloatingSurface>
    </div>
  )
}

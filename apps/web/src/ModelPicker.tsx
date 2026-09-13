import { BrainCircuit, Check, ChevronDown, ChevronRight, Image, KeyRound, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'
import { selectModel, selectThinkingLevel, useCatalog, useWorkbench } from './stores'
import { groupModelsByProvider, modelThinkingLabel, modelThinkingLevels } from './model-catalog'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import { referenceAttributes } from './react-bits'
import { FloatingSurface, useFloatingTrigger } from './FloatingLayer'
import { useLocale, type LocaleMessageKey } from './locale'

const EMPTY_MODELS: readonly ModelInfo[] = []

function matches(model: ModelInfo, providerName: string, query: string) {
  if (!query.trim()) return true
  const value = query.toLocaleLowerCase()
  return [
    providerName,
    model.providerId,
    model.providerName,
    model.name,
    model.modelName,
    model.model,
    model.protocol,
    model.baseUrl,
  ]
    .filter((part): part is string => Boolean(part))
    .some((part) => part.toLocaleLowerCase().includes(value))
}

function modelStatus(model: ModelInfo, t: (key: LocaleMessageKey) => string) {
  if (model.protocol === 'mock') return t('localModel')
  return model.hasKey ? t('connected') : t('keyNotConfigured')
}

function ModelCapabilities({ model, t }: { model: ModelInfo; t: (key: LocaleMessageKey) => string }) {
  return (
    <span className="model-picker-meta">
      <span className={`model-picker-key ${model.hasKey || model.protocol === 'mock' ? 'ready' : 'missing'}`}>
        <KeyRound size={11} /> {modelStatus(model, t)}
      </span>
      {model.imageInput && (
        <span title={t('imageInput')}>
          <Image size={11} /> {t('imageAndText')}
        </span>
      )}
      {model.reasoning && (
        <span title={t('reasoning')}>
          <BrainCircuit size={11} /> {t('reasoningLabel')}
        </span>
      )}
    </span>
  )
}

function formatContextWindow(value: number) {
  return value >= 1_000_000 ? `${Math.round(value / 1_000_000)}M tokens` : `${Math.round(value / 1_000)}K tokens`
}

function formatCost(model: ModelInfo, t: (key: LocaleMessageKey) => string) {
  if (!model.inputPrice && !model.outputPrice) return t('localOrFree')
  return `${model.inputPrice.toFixed(2)} / ${model.outputPrice.toFixed(2)} credits / 1M`
}

function ModelDetail({
  model,
  selectedLevel,
  onSelect,
  t,
  locale,
}: {
  model: ModelInfo
  selectedLevel: ThinkingLevel
  onSelect(level: ThinkingLevel): void
  t: (key: LocaleMessageKey) => string
  locale: string
}) {
  const levels = modelThinkingLevels(model)
  return (
    <aside className="model-picker-detail" aria-label={`${model.providerName} / ${model.modelName} ${t('detail')}`}>
      <div className="model-picker-detail-heading">
        <span className="model-picker-detail-avatar">{model.modelName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{model.modelName}</strong>
          <small>{model.providerName}</small>
        </div>
      </div>
      <p>{model.reasoning ? t('multiStepReasoning') : t('fastResponse')}</p>
      <dl className="model-picker-detail-stats">
        <div>
          <dt>{t('context')}</dt>
          <dd>{formatContextWindow(model.contextWindow)}</dd>
        </div>
        <div>
          <dt>{t('maxOutput')}</dt>
          <dd>{formatContextWindow(model.maxOutput)}</dd>
        </div>
        <div>
          <dt>{t('cost')}</dt>
          <dd>{formatCost(model, t)}</dd>
        </div>
      </dl>
      {levels.length > 1 && (
        <div className="model-picker-reasoning" role="group" aria-label={`${model.modelName} ${t('thinkingLevel')}`}>
          <div className="model-picker-detail-label">
            <span>{t('thinkingLevel')}</span>
            <code>{modelThinkingLabel(selectedLevel, locale)}</code>
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
                  {modelThinkingLabel(level, locale)}
                </button>
              ))}
          </div>
          <small>{t('thinkingHint')}</small>
        </div>
      )}
    </aside>
  )
}

export default function ModelPicker() {
  const { locale, t } = useLocale()
  const models = useCatalog((state) => state.data?.models ?? EMPTY_MODELS)
  const selectedId = useWorkbench((state) => state.modelId)
  const selectedThinking = useWorkbench((state) => state.thinkingLevel)
  const selected = models.find((model) => model.id === selectedId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedModelId, setExpandedModelId] = useState(selectedId)
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const highlightedModelIndexRef = useRef(0)
  const triggerProps = useFloatingTrigger({
    open,
    onOpen: () => {
      setExpandedModelId(selectedId || models[0]?.id || '')
      highlightedModelIndexRef.current = 0
      setHighlightedModelIndex(0)
      setOpen(true)
    },
    onClose: closePicker,
  })

  useEffect(() => {
    if (selectedId) setExpandedModelId(selectedId)
  }, [selectedId])
  const groups = groupModelsByProvider(models.filter((model) => matches(model, model.providerName, query)))
  const modelOptions = groups.flatMap((group) => group.models)
  const selectedLevel = selected ? selectedThinking : 'off'
  const detailModel = models.find((model) => model.id === expandedModelId) ?? selected ?? groups[0]?.models[0]
  function closePicker() {
    setOpen(false)
    setQuery('')
    requestAnimationFrame(() => trigger.current?.focus())
  }
  function moveExpanded(delta: -1 | 1) {
    if (!modelOptions.length) return
    const nextIndex = (highlightedModelIndexRef.current + delta + modelOptions.length) % modelOptions.length
    highlightedModelIndexRef.current = nextIndex
    setHighlightedModelIndex(nextIndex)
    setExpandedModelId(modelOptions[nextIndex]!.id)
  }
  function chooseModel(model: ModelInfo) {
    selectModel(model.id)
    setExpandedModelId(model.id)
    const modelIndex = modelOptions.findIndex((item) => item.id === model.id)
    if (modelIndex >= 0) {
      highlightedModelIndexRef.current = modelIndex
      setHighlightedModelIndex(modelIndex)
    }
  }
  function chooseThinking(model: ModelInfo, level: ThinkingLevel) {
    if (model.id === selectedId) selectThinkingLevel(level)
    else selectModel(model.id, level)
    closePicker()
  }

  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9', 'model-picker')}
      className="model-picker"
    >
      <button
        ref={trigger}
        type="button"
        className={`model-picker-trigger ${open ? 'open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          selected
            ? `${t('selectModel')}，当前 ${selected.providerName} / ${selected.modelName}，${t('thinkingLevel')} ${modelThinkingLabel(selectedLevel, locale)}`
            : t('selectModel')
        }
        title={
          selected
            ? `${selected.providerName} · ${selected.modelName} · ${modelThinkingLabel(selectedLevel, locale)}`
            : t('selectModel')
        }
        {...triggerProps}
      >
        <Sparkles size={13} aria-hidden="true" />
        <span className="model-picker-selected">
          <strong>{selected?.providerName ?? t('selectModel')}</strong>
          <code>{selected ? `${selected.modelName} · ${modelThinkingLabel(selectedLevel, locale)}` : t('unconfiguredModel')}</code>
        </span>
        <ChevronDown size={13} className={open ? 'model-picker-chevron-open' : ''} />
      </button>
      <FloatingSurface
        anchorRef={trigger}
        open={open}
        onClose={closePicker}
        placement="below"
        className="model-picker-menu rb-menu-surface"
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9', 'model-picker')}
        role="menu"
        aria-label={t('selectModel')}
      >
        <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
        <div className="model-picker-search">
          <Search size={13} />
          <input
            autoFocus
            aria-label={t('searchModels')}
            placeholder={t('searchModelsOrProviders')}
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
              <section
                className="model-picker-provider"
                key={group.providerId}
                role="group"
                aria-label={group.providerName}
              >
                <header className="model-picker-provider-heading">
                  <span>{group.providerName}</span>
                  <small>{group.models.length} {t('modelCount')}</small>
                </header>
                {group.models.map((model) => {
                  const isSelected = model.id === selectedId
                  const isHighlighted = model.id === modelOptions[highlightedModelIndex]?.id
                  const level = isSelected ? selectedThinking : model.defaultThinkingLevel
                  return (
                    <SpotlightCard
                      className={`model-picker-model ${model.id === expandedModelId ? 'expanded' : ''} ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
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
                          <ModelCapabilities model={model} t={t} />
                        </span>
                        <span className="model-picker-model-effort">{modelThinkingLabel(level, locale)}</span>
                        {model.id === expandedModelId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isSelected && <Check size={14} />}
                      </button>
                    </SpotlightCard>
                  )
                })}
              </section>
            ))}
            {!groups.length && <div className="model-picker-empty">{t('noMatchingModels')}</div>}
          </div>
          {detailModel && (
            <ModelDetail
              model={detailModel}
              selectedLevel={detailModel.id === selectedId ? selectedThinking : detailModel.defaultThinkingLevel}
              onSelect={(next) => chooseThinking(detailModel, next)}
              t={t}
              locale={locale}
            />
          )}
        </div>
      </FloatingSurface>
    </div>
  )
}

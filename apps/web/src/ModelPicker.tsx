import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Image,
  KeyRound,
  Search,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'
import { selectModel, selectThinkingLevel, useCatalog, useWorkbench } from './stores'
import { groupModelsByProvider, modelThinkingLabel, modelThinkingLevels } from './model-catalog'

const EMPTY_MODELS: readonly ModelInfo[] = []

function matches(model: ModelInfo, providerName: string, query: string) {
  if (!query.trim()) return true
  const value = query.toLocaleLowerCase()
  return [providerName, model.providerId, model.providerName, model.name, model.modelName, model.model, model.protocol, model.baseUrl]
    .filter((part): part is string => Boolean(part))
    .some((part) => part.toLocaleLowerCase().includes(value))
}

function modelStatus(model: ModelInfo) {
  if (model.protocol === 'mock') return '本地'
  return model.hasKey ? '已连接' : '未设置 Key'
}

function ModelCapabilities({ model }: { model: ModelInfo }) {
  return (
    <span className="model-picker-meta">
      <span className={`model-picker-key ${model.hasKey || model.protocol === 'mock' ? 'ready' : 'missing'}`}>
        <KeyRound size={11} />
        {modelStatus(model)}
      </span>
      {model.imageInput && (
        <span title="支持图片输入">
          <Image size={11} /> 图文
        </span>
      )}
      {model.reasoning && (
        <span title="支持推理">
          <BrainCircuit size={11} /> 推理
        </span>
      )}
    </span>
  )
}

function ThinkingOptions({
  model,
  selectedLevel,
  onSelect,
}: {
  model: ModelInfo
  selectedLevel: ThinkingLevel
  onSelect(level: ThinkingLevel): void
}) {
  const levels = modelThinkingLevels(model)
  return (
    <div className="model-picker-thinking" role="group" aria-label={`${model.modelName} 思考等级`}>
      <div className="model-picker-thinking-heading">
        <span>思考等级</span>
        <code>{modelThinkingLabel(selectedLevel)}</code>
      </div>
      <div className="model-picker-thinking-options">
        {levels.map((level) => (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={level === selectedLevel}
            className={`model-picker-thinking-option ${level === selectedLevel ? 'selected' : ''}`}
            key={level}
            onClick={() => onSelect(level)}
          >
            <span className="model-picker-thinking-dot" aria-hidden="true" />
            <span>{modelThinkingLabel(level)}</span>
            <code>{level}</code>
            {level === selectedLevel && <Check size={13} />}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ModelPicker({ onSettings }: { onSettings?: () => void }) {
  const data = useCatalog((state) => state.data)
  const models = data?.models ?? EMPTY_MODELS
  const selectedId = useWorkbench((state) => state.modelId)
  const selectedThinking = useWorkbench((state) => state.thinkingLevel)
  const selected = models.find((model) => model.id === selectedId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedModelId, setExpandedModelId] = useState(selectedId)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedId) setExpandedModelId(selectedId)
  }, [selectedId])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const filtered = models.filter((model) => matches(model, model.providerName, query))
  const groups = groupModelsByProvider(filtered)
  const selectedLevel = selected ? selectedThinking : 'off'

  function chooseModel(model: ModelInfo) {
    selectModel(model.id)
    setExpandedModelId(model.id)
  }

  function chooseThinking(model: ModelInfo, level: ThinkingLevel) {
    if (model.id === selectedId) selectThinkingLevel(level)
    else selectModel(model.id, level)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="model-picker" ref={root}>
      <button
        type="button"
        className={`model-picker-trigger ${open ? 'open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          selected
            ? `选择模型，当前 ${selected.providerName} / ${selected.modelName}，思考 ${modelThinkingLabel(selectedLevel)}`
            : '选择模型'
        }
        title={selected ? `${selected.providerName} · ${selected.modelName} · ${modelThinkingLabel(selectedLevel)}` : '选择模型'}
        onClick={() => {
          if (!models.length && onSettings) {
            onSettings()
            return
          }
          if (!open) setExpandedModelId(selectedId || models[0]?.id || '')
          setOpen((value) => !value)
        }}
      >
        <Sparkles size={13} />
        <span className="model-picker-selected">
          <strong>{selected?.providerName ?? '选择模型'}</strong>
          {selected && <code>{selected.modelName} · {modelThinkingLabel(selectedLevel)}</code>}
        </span>
        <ChevronDown size={13} className={open ? 'model-picker-chevron-open' : ''} />
      </button>
      {open && (
        <div className="model-picker-menu" role="menu" aria-label="选择模型">
          <div className="model-picker-search">
            <Search size={13} />
            <input
              autoFocus
              aria-label="搜索模型"
              placeholder="搜索模型或供应商"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="model-picker-list">
            {groups.map((group) => (
              <section className="model-picker-provider" key={group.providerId} role="group" aria-label={group.providerName}>
                <header className="model-picker-provider-heading">
                  <span>{group.providerName}</span>
                  <small>{group.models.length} 个模型</small>
                </header>
                {group.models.map((model) => {
                  const isSelected = model.id === selectedId
                  const expanded = model.id === expandedModelId
                  const level = isSelected ? selectedThinking : model.defaultThinkingLevel
                  return (
                    <div className={`model-picker-model ${isSelected ? 'selected' : ''}`} key={model.id}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        aria-label={`${model.providerName} / ${model.modelName}`}
                        className="model-picker-option"
                        onClick={() => chooseModel(model)}
                      >
                        <span className="model-picker-avatar">{model.modelName.slice(0, 1).toUpperCase()}</span>
                        <span className="model-picker-copy">
                          <strong>{model.modelName}</strong>
                          <code>{model.model}</code>
                          <ModelCapabilities model={model} />
                        </span>
                        <span className="model-picker-model-effort">{modelThinkingLabel(level)}</span>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isSelected && <Check size={14} />}
                      </button>
                      {expanded && (
                        <ThinkingOptions
                          model={model}
                          selectedLevel={level}
                          onSelect={(next) => chooseThinking(model, next)}
                        />
                      )}
                    </div>
                  )
                })}
              </section>
            ))}
            {!groups.length && <div className="model-picker-empty">没有匹配的模型</div>}
          </div>
          <button
            type="button"
            className="model-picker-settings"
            onClick={() => {
              setOpen(false)
              onSettings?.()
            }}
          >
            管理模型与供应商
          </button>
        </div>
      )}
    </div>
  )
}

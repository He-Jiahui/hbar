import { BrainCircuit, Check, ChevronDown, ChevronRight, Image, KeyRound, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'
import { selectModel, selectThinkingLevel, useCatalog, useWorkbench } from './stores'
import { groupModelsByProvider, modelThinkingLabel, modelThinkingLevels } from './model-catalog'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'

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

function modelStatus(model: ModelInfo) {
  if (model.protocol === 'mock') return '本地'
  return model.hasKey ? '已连接' : '未设置 Key'
}

function ModelCapabilities({ model }: { model: ModelInfo }) {
  return (
    <span className="model-picker-meta">
      <span className={`model-picker-key ${model.hasKey || model.protocol === 'mock' ? 'ready' : 'missing'}`}>
        <KeyRound size={11} /> {modelStatus(model)}
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

function formatContextWindow(value: number) {
  return value >= 1_000_000 ? `${Math.round(value / 1_000_000)}M tokens` : `${Math.round(value / 1_000)}K tokens`
}

function formatCost(model: ModelInfo) {
  if (!model.inputPrice && !model.outputPrice) return '本地或免费'
  return `${model.inputPrice.toFixed(2)} / ${model.outputPrice.toFixed(2)} credits / 1M`
}

function ModelDetail({
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
    <aside className="model-picker-detail" aria-label={`${model.providerName} / ${model.modelName} 详情`}>
      <div className="model-picker-detail-heading">
        <span className="model-picker-detail-avatar">{model.modelName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{model.modelName}</strong>
          <small>{model.providerName}</small>
        </div>
      </div>
      <p>{model.reasoning ? '支持多步推理，适合复杂任务与跨文件工作。' : '快速响应模型，适合日常问答与短任务。'}</p>
      <dl className="model-picker-detail-stats">
        <div>
          <dt>上下文</dt>
          <dd>{formatContextWindow(model.contextWindow)}</dd>
        </div>
        <div>
          <dt>最大输出</dt>
          <dd>{formatContextWindow(model.maxOutput)}</dd>
        </div>
        <div>
          <dt>费用</dt>
          <dd>{formatCost(model)}</dd>
        </div>
      </dl>
      {levels.length > 1 && (
        <div className="model-picker-reasoning" role="group" aria-label={`${model.modelName} 思考等级`}>
          <div className="model-picker-detail-label">
            <span>思考等级</span>
            <code>{modelThinkingLabel(selectedLevel)}</code>
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
                  {modelThinkingLabel(level)}
                </button>
              ))}
          </div>
          <small>发送前可在这里调整回答的思考深度。</small>
        </div>
      )}
    </aside>
  )
}

export default function ModelPicker() {
  const models = useCatalog((state) => state.data?.models ?? EMPTY_MODELS)
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

  const groups = groupModelsByProvider(models.filter((model) => matches(model, model.providerName, query)))
  const selectedLevel = selected ? selectedThinking : 'off'
  const detailModel = models.find((model) => model.id === expandedModelId) ?? selected ?? groups[0]?.models[0]
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
        title={
          selected
            ? `${selected.providerName} · ${selected.modelName} · ${modelThinkingLabel(selectedLevel)}`
            : '选择模型'
        }
        onClick={() => {
          if (!open) setExpandedModelId(selectedId || models[0]?.id || '')
          setOpen((value) => !value)
        }}
      >
        <Sparkles size={13} aria-hidden="true" />
        <span className="model-picker-selected">
          <strong>{selected?.providerName ?? '选择模型'}</strong>
          <code>{selected ? `${selected.modelName} · ${modelThinkingLabel(selectedLevel)}` : '未配置模型'}</code>
        </span>
        <ChevronDown size={13} className={open ? 'model-picker-chevron-open' : ''} />
      </button>
      {open && (
        <div className="model-picker-menu rb-menu-surface" role="menu" aria-label="选择模型">
          <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
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
                    <small>{group.models.length} 个模型</small>
                  </header>
                  {group.models.map((model) => {
                    const isSelected = model.id === selectedId
                    const level = isSelected ? selectedThinking : model.defaultThinkingLevel
                    return (
                      <SpotlightCard
                        className={`model-picker-model ${model.id === expandedModelId ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}
                        key={model.id}
                        spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                      >
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
                          {model.id === expandedModelId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {isSelected && <Check size={14} />}
                        </button>
                      </SpotlightCard>
                    )
                  })}
                </section>
              ))}
              {!groups.length && <div className="model-picker-empty">没有匹配的模型</div>}
            </div>
            {detailModel && (
              <ModelDetail
                model={detailModel}
                selectedLevel={detailModel.id === selectedId ? selectedThinking : detailModel.defaultThinkingLevel}
                onSelect={(next) => chooseThinking(detailModel, next)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

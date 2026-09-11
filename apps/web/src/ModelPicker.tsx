import { BrainCircuit, Check, ChevronDown, KeyRound, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'
import { selectModel, selectThinkingLevel, useCatalog, useWorkbench } from './stores'
import { modelThinkingLabel, modelThinkingLevels } from './model-catalog'

const EMPTY_MODELS: readonly ModelInfo[] = []
function modelLabel(model: ModelInfo) {
  return `${model.providerName} / ${model.modelName}`
}

export default function ModelPicker() {
  const models = useCatalog((state) => state.data?.models ?? EMPTY_MODELS)
  const selectedId = useWorkbench((state) => state.modelId)
  const selectedThinking = useWorkbench((state) => state.thinkingLevel)
  const selected = models.find((model) => model.id === selectedId)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  function chooseModel(model: ModelInfo) {
    selectModel(model.id)
  }
  function chooseThinking(level: ThinkingLevel) {
    selectThinkingLevel(level)
    setOpen(false)
  }
  return (
    <div className="model-picker" ref={root}>
      <button
        type="button"
        className={`model-picker-trigger ${open ? 'open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          selected ? `选择模型，当前 ${modelLabel(selected)}，思考 ${modelThinkingLabel(selectedThinking)}` : '选择模型'
        }
        title={selected ? `${modelLabel(selected)} · ${modelThinkingLabel(selectedThinking)}` : '选择模型'}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles size={13} aria-hidden="true" />
        <span className="model-picker-selected">
          <strong>{selected?.providerName ?? '选择模型'}</strong>
          <code>{selected ? `${selected.modelName} · ${modelThinkingLabel(selectedThinking)}` : '未配置模型'}</code>
        </span>
        <ChevronDown size={13} className={open ? 'model-picker-chevron-open' : ''} />
      </button>
      {open && (
        <div className="model-picker-menu rb-menu-surface" role="menu" aria-label="选择模型">
          <div className="model-picker-list">
            {models.map((model) => {
              const isSelected = model.id === selectedId
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`model-picker-option ${isSelected ? 'selected' : ''}`}
                  key={model.id}
                  onClick={() => chooseModel(model)}
                >
                  <span className="model-picker-avatar">{model.modelName.slice(0, 1).toUpperCase()}</span>
                  <span className="model-picker-copy">
                    <strong>{model.modelName}</strong>
                    <code>{model.providerName}</code>
                  </span>
                  <span className="model-picker-meta">
                    <KeyRound size={11} /> {model.hasKey || model.protocol === 'mock' ? '已连接' : '未设置 Key'}
                  </span>
                  {isSelected && <Check size={14} />}
                </button>
              )
            })}
            {!models.length && <div className="model-picker-empty">请在设置中添加供应商与模型</div>}
          </div>
          {selected && modelThinkingLevels(selected).length > 1 && (
            <div className="model-picker-thinking" role="group" aria-label="思考等级">
              <div className="model-picker-thinking-heading">
                <span>
                  <BrainCircuit size={13} /> 思考等级
                </span>
                <code>{modelThinkingLabel(selectedThinking)}</code>
              </div>
              <div className="model-picker-thinking-options">
                {modelThinkingLevels(selected).map((level) => (
                  <button
                    type="button"
                    key={level}
                    className={level === selectedThinking ? 'selected' : ''}
                    aria-pressed={level === selectedThinking}
                    onClick={() => chooseThinking(level)}
                  >
                    {modelThinkingLabel(level)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

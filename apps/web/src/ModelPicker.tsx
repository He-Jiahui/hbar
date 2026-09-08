import { BrainCircuit, Check, ChevronDown, Image, KeyRound, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelInfo } from '@hbar/contracts'
import { selectModel, useCatalog } from './stores'
import { useWorkbench } from './stores'

const EMPTY_MODELS: readonly ModelInfo[] = []

function matches(model: ModelInfo, query: string) {
  if (!query.trim()) return true
  const value = query.toLocaleLowerCase()
  return [model.name, model.model, model.protocol, model.baseUrl].some((part) =>
    part.toLocaleLowerCase().includes(value),
  )
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

export default function ModelPicker({ onSettings }: { onSettings?: () => void }) {
  const data = useCatalog((state) => state.data)
  const models = data?.models ?? EMPTY_MODELS
  const selectedId = useWorkbench((state) => state.modelId)
  const selected = models.find((model) => model.id === selectedId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)

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

  const filtered = models.filter((model) => matches(model, query))
  function choose(model: ModelInfo) {
    selectModel(model.id)
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
        aria-label={selected ? `选择模型，当前 ${selected.name}` : '选择模型'}
        title={selected ? `${selected.name} · ${selected.model}` : '选择模型'}
        onClick={() => {
          if (!models.length && onSettings) {
            onSettings()
            return
          }
          setOpen((value) => !value)
        }}
      >
        <Sparkles size={13} />
        <span className="model-picker-selected">
          <strong>{selected?.name ?? '选择模型'}</strong>
          {selected && <code>{selected.model}</code>}
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
            {filtered.map((model) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={model.id === selectedId}
                className={`model-picker-option ${model.id === selectedId ? 'selected' : ''}`}
                key={model.id}
                onClick={() => choose(model)}
              >
                <span className="model-picker-avatar">{model.name.slice(0, 1).toUpperCase()}</span>
                <span className="model-picker-copy">
                  <strong>{model.name}</strong>
                  <code>{model.model}</code>
                  <ModelCapabilities model={model} />
                </span>
                {model.id === selectedId && <Check size={14} />}
              </button>
            ))}
            {!filtered.length && <div className="model-picker-empty">没有匹配的模型</div>}
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

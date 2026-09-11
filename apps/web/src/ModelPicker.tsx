import { ChevronRight, Sparkles } from 'lucide-react'
import { useCatalog, useWorkbench } from './stores'
import { modelThinkingLabel } from './model-catalog'

const EMPTY_MODELS = [] as const

export default function ModelPicker({ onSettings }: { onSettings?: () => void }) {
  const data = useCatalog((state) => state.data)
  const models = data?.models ?? EMPTY_MODELS
  const selectedId = useWorkbench((state) => state.modelId)
  const selectedThinking = useWorkbench((state) => state.thinkingLevel)
  const selected = models.find((model) => model.id === selectedId)
  const label = selected
    ? `${selected.providerName} / ${selected.modelName}`
    : '选择供应商与模型'
  return (
    <button
      type="button"
      className="model-picker-trigger"
      aria-label={selected ? `选择模型，当前 ${label}，思考 ${modelThinkingLabel(selectedThinking)}` : label}
      title={selected ? `${label} · ${modelThinkingLabel(selectedThinking)}` : label}
      onClick={onSettings}
    >
      <Sparkles size={13} aria-hidden="true" />
      <span className="model-picker-selected">
        <strong>{selected?.providerName ?? '选择模型'}</strong>
        <code>{selected ? `${selected.modelName} · ${modelThinkingLabel(selectedThinking)}` : '进入设置选择'}</code>
      </span>
      <ChevronRight size={13} aria-hidden="true" />
    </button>
  )
}

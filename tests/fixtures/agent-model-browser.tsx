import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { modelCommands } from '@hbar/contracts/commands/models'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider, LumenButton } from '@lumen/app-ui'
import { AgentModelPicker } from '../../packages/app-react/src/agent-model-picker'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface AgentModelFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly failure: 'none' | 'duplicates' | 'error' | 'stale' | 'offline'
}
function models(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `original-model-${index}`,
    providerId: 'original-provider',
    providerName: 'Provider with a deliberately long bilingual name — 很长的供应商名称',
    modelId: `original-${index}`,
    modelName: `Model ${index} with a deliberately long bilingual name — 很长的模型名称`,
    contextWindow: 128000,
    maxOutput: 8192,
    imageInput: false,
    reasoning: true,
    thinkingLevels: ['low', 'high'],
    defaultThinkingLevel: 'low',
    hasKey: false,
  }))
}
interface FixtureState {
  readonly value: string
  readonly models: ReturnType<(typeof modelCommands)['model.list']['output']['parse']>
  readonly status: 'ready' | 'loading' | 'error'
  readonly error: string | null
}
declare global {
  interface Window {
    mountAgentModel(input: AgentModelFixtureInput): void
    releaseAgentModel(): void
    finishAgentModelRetry(): void
    reverseAgentModels(): void
    agentModelBoundaryAccepted(count: number): boolean
    agentModelActions: { readonly kind: 'select' | 'retry'; readonly target: string | null }[]
  }
}
window.agentModelBoundaryAccepted = (count) => modelCommands['model.list'].output.safeParse(models(count)).success
window.mountAgentModel = (input) => {
  const container = document.getElementById('agent-model-fixture')
  if (!container) throw new Error('Missing owned Agent model root')
  const parsed = modelCommands['model.list'].output.parse(models(input.count))
  const first = parsed[0]
  const store = createStore<FixtureState>(() => ({
    value: input.failure === 'stale' ? 'removed-original-model' : (first?.id ?? ''),
    models:
      input.failure === 'duplicates' && first
        ? [...parsed, { ...first, modelName: 'Rejected duplicate source' }]
        : parsed,
    status: input.failure === 'error' ? 'error' : 'ready',
    error: input.failure === 'error' ? 'DISCONNECTED' : null,
  }))
  window.agentModelActions = []
  window.finishAgentModelRetry = () => store.setState({ status: 'ready', error: null })
  window.reverseAgentModels = () => store.setState((state) => ({ models: [...state.models].reverse() }))
  const copy = getShellCopy(input.locale).agents.modelPicker
  const labels = {
    ...copy,
    title: copy.title + input.suffix,
    choose: copy.choose + input.suffix,
    retry: copy.retry + input.suffix,
    error: (code: string) => copy.error(code) + input.suffix,
  }
  const root = createRoot(container)
  function Fixture() {
    const state = useStore(store)
    return (
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
        <LumenFrame className="agent-model-fixture-pane">
          <LumenButton className="agent-model-fixture-outside">{copy.close}</LumenButton>
          <AgentModelPicker
            id="owned-agent-model"
            value={state.value}
            catalog={{ status: state.status, error: state.error, models: state.models }}
            connected={input.failure !== 'offline'}
            disabled={false}
            labels={labels}
            onSelect={(id) => {
              window.agentModelActions.push({ kind: 'select', target: id })
              store.setState({ value: id })
            }}
            onRetry={() => {
              window.agentModelActions.push({ kind: 'retry', target: state.value })
              store.setState({ status: 'loading', error: null })
            }}
          />
        </LumenFrame>
      </LumenProvider>
    )
  }
  root.render(<Fixture />)
  window.releaseAgentModel = () => root.unmount()
}

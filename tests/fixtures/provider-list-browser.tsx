import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { LumenFrame, LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import {
  ProviderListView,
  type ProviderListViewItem,
  type ProviderListViewGlobalDefault,
  type ProviderListViewDefaultAction,
} from '../../packages/app-react/src/provider-list-view'
import '@lumen/app-ui/styles.css'

export interface ProviderListFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly failure: 'none' | 'read-error' | 'failed' | 'unknown' | 'missing' | 'duplicates'
}
interface FixtureState {
  readonly items: readonly ProviderListViewItem[]
  readonly globalDefault: ProviderListViewGlobalDefault
  readonly defaultAction: ProviderListViewDefaultAction
}
function profiles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    provider: {
      id: `original-provider-${index}`,
      name: `Original provider ${index} — 原始供应商 `.repeat(3),
      protocol: 'openai-responses',
      baseUrl: 'https://example.invalid/v1',
      model: `original-model-${index}`,
      models: [
        { id: `original-model-${index}`, name: `Original primary model ${index} — 原始模型` },
        { id: `spare-${index}`, name: 'Original non-primary model' },
      ],
    },
    hasKey: index % 2 === 0,
  }))
}
declare global {
  interface Window {
    mountProviderList(input: ProviderListFixtureInput): void
    releaseProviderList(): void
    reverseProviderList(): void
    providerListBoundaryAccepted(count: number): boolean
    providerListActions: { readonly kind: string; readonly providerId: string | null }[]
  }
}
window.providerListBoundaryAccepted = (count) =>
  configurationCommands['provider.list'].output.safeParse(profiles(count)).success
window.mountProviderList = (input) => {
  const container = document.getElementById('provider-list-fixture')
  if (!container) throw new Error('Missing owned Provider list fixture root')
  const copy = getShellCopy(input.locale).providers.list
  const labels = {
    ...copy,
    title: copy.title + input.suffix,
    description: copy.description + input.suffix,
    add: copy.add + input.suffix,
    editAction: copy.editAction + input.suffix,
    setDefault: copy.setDefault + input.suffix,
    primaryModel: (value: string) => copy.primaryModel(value) + input.suffix,
    protocol: (value: string) => copy.protocol(value) + input.suffix,
  }
  const parsed = configurationCommands['provider.list'].output.parse(profiles(input.count))
  const items = parsed.map((profile, index): ProviderListViewItem => ({
    providerId: profile.provider.id,
    name: profile.provider.name,
    protocol: profile.provider.protocol,
    primaryModelName: `Original primary model ${index} — 原始模型`,
    modelCount: profile.provider.models?.length ?? 1,
    hidden: index === 2,
    hasKey: profile.hasKey,
    defaultTargetVisible: index !== 2,
  }))
  const first = items[0]
  const target = items[1] ?? first
  const idle: ProviderListViewDefaultAction = { status: 'idle', providerId: null, modelSelectionId: null, error: null }
  const store = createStore<FixtureState>(() => ({
    items:
      input.failure === 'duplicates' && first ? [...items, { ...first, name: 'Rejected duplicate source' }] : items,
    globalDefault: {
      status: input.failure === 'read-error' ? 'error' : 'ready',
      providerId: items.length > 1 ? (first?.providerId ?? null) : null,
      modelSelectionId: items.length > 1 && first ? `${first.providerId}/spare-0` : null,
      modelId: items.length > 1 ? 'spare-0' : null,
      modelName: items.length > 1 ? 'Original non-primary model' : null,
      selectable: true,
      error: input.failure === 'read-error' ? 'DISCONNECTED' : null,
    },
    defaultAction: idle,
  }))
  window.providerListActions = []
  const record = (kind: string, providerId: string | null) => window.providerListActions.push({ kind, providerId })
  function Fixture() {
    const state = useStore(store)
    return (
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
        <LumenFrame as="main" className="provider-list-fixture">
          <LumenFrame className="provider-list-fixture-pane" role="region" aria-label={labels.title}>
            <ProviderListView
              labels={labels}
              items={state.items}
              connected
              busy={false}
              globalDefault={state.globalDefault}
              defaultAction={state.defaultAction}
              reconcilingProviderId={null}
              onAdd={() => record('add', null)}
              onRefresh={() => record('refresh', null)}
              onEdit={(id) => record('edit', id)}
              onRemove={(id) => record('remove', id)}
              onSetDefault={(id) => {
                record('default', id)
                const item = state.items.find((entry) => entry.providerId === id)
                const profile = parsed.find((entry) => entry.provider.id === id)
                if (!item || !profile?.provider.model) throw new Error('Default callback changed its target')
                if (input.failure === 'failed' || input.failure === 'unknown' || input.failure === 'missing') {
                  store.setState({
                    defaultAction: {
                      status: input.failure === 'failed' ? 'failed' : 'unknown',
                      providerId: id,
                      modelSelectionId: `${id}/${profile.provider.model}`,
                      error: input.failure === 'failed' ? 'EXECUTION_FAILED' : 'RESULT_UNKNOWN',
                    },
                    ...(input.failure === 'missing'
                      ? { items: state.items.filter((entry) => entry.providerId !== id) }
                      : {}),
                  })
                } else
                  store.setState({
                    globalDefault: {
                      ...state.globalDefault,
                      providerId: id,
                      modelId: profile.provider.model,
                      modelSelectionId: `${id}/${profile.provider.model}`,
                      modelName: item.primaryModelName,
                    },
                  })
              }}
              onReconcileDefault={(id) => {
                record('reconcile', id)
                store.setState({ defaultAction: idle })
              }}
            />
          </LumenFrame>
        </LumenFrame>
      </LumenProvider>
    )
  }
  const root = createRoot(container)
  root.render(<Fixture />)
  window.reverseProviderList = () =>
    store.setState({
      items: [...items].reverse().filter((item) => items.length === 1 || item.providerId !== target?.providerId),
    })
  window.releaseProviderList = () => root.unmount()
}

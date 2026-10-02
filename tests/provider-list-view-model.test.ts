import { expect, test } from 'bun:test'
import {
  providerListRowPresentation,
  type ProviderListViewDefaultAction,
  type ProviderListViewGlobalDefault,
  type ProviderListViewItem,
} from '../packages/app-react/src/provider-list-view-model'

const currentProvider: ProviderListViewItem = {
  providerId: 'provider-current',
  name: 'Current provider',
  protocol: 'openai-responses',
  primaryModelName: 'configured-primary-model',
  modelCount: 2,
  hidden: false,
  hasKey: true,
  defaultTargetVisible: true,
}

const nextProvider: ProviderListViewItem = {
  providerId: 'provider-next',
  name: 'Next provider',
  protocol: 'anthropic-messages',
  primaryModelName: 'next-primary-model',
  modelCount: 1,
  hidden: false,
  hasKey: false,
  defaultTargetVisible: true,
}

const globalDefault: ProviderListViewGlobalDefault = {
  status: 'unavailable',
  modelSelectionId: 'provider-current/selected-nonprimary-model',
  providerId: currentProvider.providerId,
  modelId: 'selected-nonprimary-model',
  modelName: 'Selected non-primary model',
  selectable: false,
  error: null,
}

const idleAction: ProviderListViewDefaultAction = {
  status: 'idle',
  providerId: null,
  modelSelectionId: null,
  error: null,
}

function present(
  item: ProviderListViewItem,
  overrides: {
    readonly globalDefault?: ProviderListViewGlobalDefault
    readonly defaultAction?: ProviderListViewDefaultAction
    readonly connected?: boolean
    readonly busy?: boolean
    readonly reconcilingProviderId?: string | null
  } = {},
) {
  return providerListRowPresentation({
    item,
    globalDefault: overrides.globalDefault ?? globalDefault,
    defaultAction: overrides.defaultAction ?? idleAction,
    connected: overrides.connected ?? true,
    busy: overrides.busy ?? false,
    reconcilingProviderId: overrides.reconcilingProviderId ?? null,
  })
}

test('global provider badge preserves its selected non-primary model without blocking another visible primary', () => {
  const active = present(currentProvider)
  const target = present(nextProvider)

  expect(active.isGlobalDefaultProvider).toBe(true)
  expect(active.activeDefaultModelName).toBe('Selected non-primary model')
  expect(active.canSetDefault).toBe(false)
  expect(target.isGlobalDefaultProvider).toBe(false)
  expect(target.canSetDefault).toBe(true)
})

test('unknown default changes disable competing actions and reconcile only the captured provider', () => {
  const action: ProviderListViewDefaultAction = {
    status: 'unknown',
    providerId: nextProvider.providerId,
    modelSelectionId: 'provider-next/next-primary-model',
    error: 'RESULT_UNKNOWN',
  }
  const target = present(nextProvider, { defaultAction: action, busy: true })
  const other = present(currentProvider, { defaultAction: action, busy: true })

  expect(target.actionIsUnknown).toBe(true)
  expect(target.actionErrorCode).toBe('RESULT_UNKNOWN')
  expect(target.canSetDefault).toBe(false)
  expect(target.deleteDisabled).toBe(true)
  expect(other.actionIsUnknown).toBe(false)
  expect(other.canSetDefault).toBe(false)
  expect(other.deleteDisabled).toBe(true)

  const reconciling = present(nextProvider, {
    defaultAction: action,
    busy: true,
    reconcilingProviderId: nextProvider.providerId,
  })
  expect(reconciling.reconciliationPending).toBe(true)
})

test('failed default changes remain retryable and hidden primaries stay unavailable', () => {
  const action: ProviderListViewDefaultAction = {
    status: 'failed',
    providerId: nextProvider.providerId,
    modelSelectionId: 'provider-next/next-primary-model',
    error: 'MODEL_UNAVAILABLE',
  }
  const failed = present(nextProvider, { defaultAction: action })
  const hiddenPrimary = present({ ...nextProvider, defaultTargetVisible: false })

  expect(failed.actionErrorCode).toBe('MODEL_UNAVAILABLE')
  expect(failed.canSetDefault).toBe(true)
  expect(hiddenPrimary.canSetDefault).toBe(false)
})

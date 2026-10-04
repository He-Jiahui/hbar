import { createStore } from 'zustand/vanilla'
import type { LumenBillingPlanReferenceFlag } from '@lumen/app-ui'

export type BillingReferencePreviewKind =
  'statement' | 'plans' | 'invoice' | 'recovery' | 'change-plan' | 'payment-methods' | 'usage' | 'detail'
export type BillingReferencePreviewOperation = 'save-plans' | 'save-invoice' | 'primary'
export type BillingReferencePreviewPhase = 'idle' | 'pending' | 'confirmed' | 'failed' | 'cancelled'

export interface BillingReferencePreviewField {
  readonly id: string
  readonly value: string
  readonly choices?: readonly string[] | undefined
}
export interface BillingReferencePreviewSeed {
  readonly ownerId: string
  readonly kind: BillingReferencePreviewKind
  readonly targetIds: readonly string[]
  readonly initialSelectionId: string | null
  readonly initialExpandedIds: readonly string[]
  readonly flags: readonly LumenBillingPlanReferenceFlag[]
  readonly initialDirty: boolean
  readonly fields: readonly BillingReferencePreviewField[]
  readonly valueLimit: number
}
export interface BillingReferencePreviewRequest {
  readonly requestId: string
  readonly ownerId: string
  readonly operation: BillingReferencePreviewOperation
  readonly targetId: string | null
  readonly values: Readonly<Record<string, string>>
  readonly flags: readonly LumenBillingPlanReferenceFlag[]
  readonly outcome: 'preview-only'
}
export interface BillingReferencePreviewState {
  readonly seed: BillingReferencePreviewSeed
  readonly query: string
  readonly selectionId: string | null
  readonly expandedIds: readonly string[]
  readonly flags: readonly LumenBillingPlanReferenceFlag[]
  readonly baselineFlags: readonly LumenBillingPlanReferenceFlag[]
  readonly values: Readonly<Record<string, string>>
  readonly dirty: boolean
  readonly phase: BillingReferencePreviewPhase
  readonly pendingRequest: BillingReferencePreviewRequest | null
  readonly setQuery: (query: string) => void
  readonly select: (id: string) => boolean
  readonly toggleExpanded: (id: string) => boolean
  readonly setFlag: (planId: string, toggleId: string, enabled: boolean) => boolean
  readonly discard: () => boolean
  readonly setField: (id: string, value: string) => boolean
  readonly startRequest: (
    operation: BillingReferencePreviewOperation,
    targetId?: string,
  ) => BillingReferencePreviewRequest | null
  readonly completeRequest: (requestId: string, outcome: 'confirmed' | 'failed') => boolean
  readonly cancelPending: () => boolean
  readonly reconcile: (seed: BillingReferencePreviewSeed) => void
}

function flagKey(flag: Pick<LumenBillingPlanReferenceFlag, 'planId' | 'toggleId'>): string {
  return JSON.stringify([flag.planId, flag.toggleId])
}
function uniqueItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
function normalizeSeed(seed: BillingReferencePreviewSeed): BillingReferencePreviewSeed {
  const known = new Set<string>()
  return {
    ...seed,
    targetIds: [...new Set(seed.targetIds.filter((id) => id.trim().length > 0))],
    flags: seed.flags.filter((flag) => {
      const key = flagKey(flag)
      if (!flag.planId || !flag.toggleId || known.has(key)) return false
      known.add(key)
      return true
    }),
    fields: uniqueItems(seed.fields),
    valueLimit: Number.isFinite(seed.valueLimit) ? Math.max(1, Math.min(10000, Math.floor(seed.valueLimit))) : 5000,
  }
}
function initialSelection(seed: BillingReferencePreviewSeed): string | null {
  return seed.initialSelectionId && seed.targetIds.includes(seed.initialSelectionId)
    ? seed.initialSelectionId
    : (seed.targetIds[0] ?? null)
}
function validFieldValue(field: BillingReferencePreviewField, value: string): string {
  return field.choices && !field.choices.includes(value) ? (field.choices[0] ?? '') : value
}
function requestStillValid(request: BillingReferencePreviewRequest, seed: BillingReferencePreviewSeed): boolean {
  if (request.targetId && !seed.targetIds.includes(request.targetId)) return false
  const fields = new Map(seed.fields.map((field) => [field.id, field]))
  const flags = new Set(seed.flags.map(flagKey))
  return (
    Object.entries(request.values).every(([id, value]) => {
      const field = fields.get(id)
      return Boolean(field && value.length <= seed.valueLimit && (!field.choices || field.choices.includes(value)))
    }) && request.flags.every((flag) => flags.has(flagKey(flag)))
  )
}

let nextOwner = 0

/** One preview owner per Billing surface. IDs/values are domain data, never translated copy. */
export function createBillingReferencePreviewStore(input: BillingReferencePreviewSeed) {
  const seed = normalizeSeed(input)
  const owner = ++nextOwner
  let sequence = 0
  return createStore<BillingReferencePreviewState>((set, get) => ({
    seed,
    query: '',
    selectionId: initialSelection(seed),
    expandedIds: [...new Set(seed.initialExpandedIds.filter((id) => seed.targetIds.includes(id)))],
    flags: seed.flags,
    baselineFlags: seed.flags,
    values: Object.fromEntries(
      seed.fields.map((field) => [field.id, validFieldValue(field, field.value).slice(0, seed.valueLimit)]),
    ),
    dirty: seed.initialDirty,
    phase: 'idle',
    pendingRequest: null,
    setQuery: (query) => {
      if (get().query !== query) set({ query })
    },
    select: (id) => {
      const state = get()
      if (!state.seed.targetIds.includes(id) || state.pendingRequest) return false
      if (state.selectionId !== id) set({ selectionId: id })
      return true
    },
    toggleExpanded: (id) => {
      const state = get()
      if (!state.seed.targetIds.includes(id)) return false
      set({
        expandedIds: state.expandedIds.includes(id)
          ? state.expandedIds.filter((current) => current !== id)
          : [...state.expandedIds, id],
      })
      return true
    },
    setFlag: (planId, toggleId, enabled) => {
      const state = get()
      if (state.pendingRequest || !state.flags.some((flag) => flag.planId === planId && flag.toggleId === toggleId))
        return false
      const flags = state.flags.map((flag) =>
        flag.planId === planId && flag.toggleId === toggleId ? { ...flag, enabled } : flag,
      )
      set({ flags, dirty: true, phase: 'idle' })
      return true
    },
    discard: () => {
      const state = get()
      if (state.pendingRequest) return false
      set({ flags: state.baselineFlags, dirty: false, phase: 'idle' })
      return true
    },
    setField: (id, value) => {
      const state = get()
      const field = state.seed.fields.find((item) => item.id === id)
      if (
        !field ||
        state.pendingRequest ||
        value.length > state.seed.valueLimit ||
        (field.choices && !field.choices.includes(value))
      )
        return false
      if (state.values[id] !== value) set({ values: { ...state.values, [id]: value }, phase: 'idle' })
      return true
    },
    startRequest: (operation, targetId) => {
      const state = get()
      if (
        state.pendingRequest ||
        (operation === 'save-plans' && (state.seed.kind !== 'plans' || !state.dirty)) ||
        (operation === 'save-invoice' && state.seed.kind !== 'invoice') ||
        (operation === 'primary' &&
          (state.seed.kind !== 'payment-methods' ||
            !targetId ||
            !state.seed.targetIds.includes(targetId) ||
            targetId === state.selectionId))
      )
        return null
      const request: BillingReferencePreviewRequest = {
        requestId: `billing-preview:${owner}:${++sequence}`,
        ownerId: state.seed.ownerId,
        operation,
        targetId: targetId ?? null,
        values: { ...state.values },
        flags: state.flags.map((flag) => ({ ...flag })),
        outcome: 'preview-only',
      }
      set({ phase: 'pending', pendingRequest: request })
      return request
    },
    completeRequest: (requestId, outcome) => {
      const state = get()
      const request = state.pendingRequest
      if (
        !request ||
        request.requestId !== requestId ||
        request.ownerId !== state.seed.ownerId ||
        !requestStillValid(request, state.seed)
      )
        return false
      if (outcome === 'failed') {
        set({ pendingRequest: null, phase: 'failed' })
      } else {
        set({
          pendingRequest: null,
          phase: 'confirmed',
          ...(request.operation === 'save-plans' ? { dirty: false, baselineFlags: request.flags } : {}),
          ...(request.operation === 'primary' ? { selectionId: request.targetId } : {}),
        })
      }
      return true
    },
    cancelPending: () => {
      if (!get().pendingRequest) return false
      set({ pendingRequest: null, phase: 'cancelled' })
      return true
    },
    reconcile: (inputSeed) => {
      const state = get()
      if (inputSeed.ownerId !== state.seed.ownerId || inputSeed.kind !== state.seed.kind) return
      const nextSeed = normalizeSeed(inputSeed)
      if (JSON.stringify(nextSeed) === JSON.stringify(state.seed)) return
      const previous = new Map(state.flags.map((flag) => [flagKey(flag), flag]))
      const baseline = new Map(state.baselineFlags.map((flag) => [flagKey(flag), flag]))
      const flags = nextSeed.flags.map((flag) => previous.get(flagKey(flag)) ?? flag)
      const baselineFlags = nextSeed.flags.map((flag) => baseline.get(flagKey(flag)) ?? flag)
      const values = Object.fromEntries(
        nextSeed.fields.map((field) => [
          field.id,
          validFieldValue(
            field,
            Object.hasOwn(state.values, field.id) ? (state.values[field.id] ?? '') : field.value,
          ).slice(0, nextSeed.valueLimit),
        ]),
      )
      const request = state.pendingRequest
      set({
        seed: nextSeed,
        flags,
        baselineFlags,
        values,
        selectionId:
          state.selectionId && nextSeed.targetIds.includes(state.selectionId)
            ? state.selectionId
            : initialSelection(nextSeed),
        expandedIds: state.expandedIds.filter((id) => nextSeed.targetIds.includes(id)),
        ...(request && !requestStillValid(request, nextSeed)
          ? { pendingRequest: null, phase: 'cancelled' as const }
          : {}),
      })
    },
  }))
}

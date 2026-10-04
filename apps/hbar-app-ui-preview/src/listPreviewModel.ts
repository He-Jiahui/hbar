import { createStore, type StoreApi } from 'zustand/vanilla'

export interface ListPreviewSlotItemSeed {
  readonly id: string
  readonly disabled?: boolean | undefined
}

export interface ListPreviewSelectionSlotSeed {
  readonly id: string
  readonly items: readonly ListPreviewSlotItemSeed[]
  readonly initialId?: string | undefined
}

export interface ListPreviewFlagSeed {
  readonly id: string
  readonly value: boolean
}

export interface ListPreviewRequestAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface ListPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly ListPreviewSelectionSlotSeed[]
  readonly flags: readonly ListPreviewFlagSeed[]
  readonly requestActions: readonly ListPreviewRequestAction[]
  readonly orderIds?: readonly string[] | undefined
  readonly query?: string | undefined
}

export interface ListPreviewRequest extends ListPreviewRequestAction {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
}

export interface ListPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly ListPreviewSelectionSlotSeed[]
  readonly flags: readonly ListPreviewFlagSeed[]
  readonly requestActions: readonly ListPreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly lastRequest: ListPreviewRequest | undefined
  readonly query: string
  readonly orderIds: readonly string[]
  readonly select: (ownerId: string, slotId: string, itemId: string) => boolean
  readonly setFlag: (ownerId: string, flagId: string, value: boolean) => boolean
  readonly setQuery: (ownerId: string, value: string) => boolean
  readonly move: (ownerId: string, itemId: string, beforeId: string | undefined) => boolean
  readonly resetOrder: (ownerId: string) => boolean
  readonly request: (ownerId: string, action: ListPreviewRequestAction) => ListPreviewRequest | undefined
  readonly refresh: (seed: ListPreviewSeed) => boolean
}

export type ListPreviewStoreApi = StoreApi<ListPreviewModelState>

interface NormalizedListPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly ListPreviewSelectionSlotSeed[]
  readonly flags: readonly ListPreviewFlagSeed[]
  readonly requestActions: readonly ListPreviewRequestAction[]
  readonly orderIds: readonly string[]
  readonly query: string
}

function isNonblankId(value: string): boolean {
  return value.trim().length > 0
}

function uniqueById<T extends { readonly id: string }>(records: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (!isNonblankId(record.id) || seen.has(record.id)) return false
    seen.add(record.id)
    return true
  })
}

function normalizeSlots(slots: readonly ListPreviewSelectionSlotSeed[]): readonly ListPreviewSelectionSlotSeed[] {
  return uniqueById(slots).map((slot) => ({
    id: slot.id,
    items: uniqueById(slot.items).map((item) => ({
      id: item.id,
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    })),
    ...(slot.initialId === undefined ? {} : { initialId: slot.initialId }),
  }))
}

function normalizeFlags(flags: readonly ListPreviewFlagSeed[]): readonly ListPreviewFlagSeed[] {
  return uniqueById(flags).map((flag) => ({ id: flag.id, value: flag.value }))
}

function normalizeRequestActions(actions: readonly ListPreviewRequestAction[]): readonly ListPreviewRequestAction[] {
  const result: ListPreviewRequestAction[] = []
  for (const action of actions) {
    const value = action.value
    if (!isNonblankId(action.actionId) || (value !== undefined && !isNonblankId(value))) continue
    if (result.some((candidate) => candidate.actionId === action.actionId && candidate.value === value)) continue
    result.push(value === undefined ? { actionId: action.actionId } : { actionId: action.actionId, value })
  }
  return result
}

function queueItems(slots: readonly ListPreviewSelectionSlotSeed[]): readonly ListPreviewSlotItemSeed[] {
  return slots.find((slot) => slot.id === 'queue')?.items ?? []
}

function normalizeOrderIds(
  slots: readonly ListPreviewSelectionSlotSeed[],
  orderIds: readonly string[] | undefined,
): readonly string[] {
  if (orderIds === undefined) return []
  const validIds = new Set(queueItems(slots).map((item) => item.id))
  const seen = new Set<string>()
  return orderIds.filter((id) => {
    if (!isNonblankId(id) || !validIds.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function initialId(slot: ListPreviewSelectionSlotSeed): string | undefined {
  if (slot.initialId !== undefined) {
    const requested = slot.items.find((item) => item.id === slot.initialId)
    if (requested && requested.disabled !== true) return requested.id
  }
  return slot.items.find((item) => item.disabled !== true)?.id
}

function selectionsFor(slots: readonly ListPreviewSelectionSlotSeed[]): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, initialId(slot)]))
}

function flagsFor(flags: readonly ListPreviewFlagSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, flag.value]))
}

function normalizeSeed(seed: ListPreviewSeed): NormalizedListPreviewSeed {
  const slots = normalizeSlots(seed.slots)
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots,
    flags: normalizeFlags(seed.flags),
    requestActions: normalizeRequestActions(seed.requestActions),
    orderIds: normalizeOrderIds(slots, seed.orderIds),
    query: seed.query ?? '',
  }
}

function ownsState(state: Pick<ListPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return (
    isNonblankId(ownerId) && isNonblankId(state.ownerId) && isNonblankId(state.fixtureId) && ownerId === state.ownerId
  )
}

function allowsRequest(actions: readonly ListPreviewRequestAction[], action: ListPreviewRequestAction): boolean {
  const value = action.value
  return (
    isNonblankId(action.actionId) &&
    (value === undefined || isNonblankId(value)) &&
    actions.some((candidate) => candidate.actionId === action.actionId && candidate.value === value)
  )
}

function sameRequest(left: ListPreviewRequest | undefined, right: ListPreviewRequestAction): boolean {
  return left !== undefined && left.actionId === right.actionId && left.value === right.value
}

function actionFromRequest(request: ListPreviewRequest): ListPreviewRequestAction {
  return request.value === undefined
    ? { actionId: request.actionId }
    : { actionId: request.actionId, value: request.value }
}

function reconcileSelections(
  slots: readonly ListPreviewSelectionSlotSeed[],
  previous: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    slots.map((slot) => {
      const prior = previous[slot.id]
      const retained = prior !== undefined && slot.items.some((item) => item.id === prior && item.disabled !== true)
      return [slot.id, retained ? prior : initialId(slot)]
    }),
  )
}

function sameSelections(
  left: Readonly<Record<string, string | undefined>>,
  right: Readonly<Record<string, string | undefined>>,
): boolean {
  const leftIds = Object.keys(left)
  const rightIds = Object.keys(right)
  return leftIds.length === rightIds.length && leftIds.every((id) => left[id] === right[id])
}

function reconcileFlags(
  flags: readonly ListPreviewFlagSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, previous[flag.id] ?? flag.value]))
}

function reconcileOrderIds(previous: readonly string[], next: readonly string[]): readonly string[] {
  const nextIds = new Set(next)
  const retained = previous.filter((id) => nextIds.has(id))
  const previousIds = new Set(previous)
  return [...retained, ...next.filter((id) => !previousIds.has(id))]
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function requestFor(
  state: Pick<ListPreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: ListPreviewRequestAction,
): ListPreviewRequest {
  return action.value === undefined
    ? { ownerId: state.ownerId, variant: state.variant, fixtureId: state.fixtureId, actionId: action.actionId }
    : {
        ownerId: state.ownerId,
        variant: state.variant,
        fixtureId: state.fixtureId,
        actionId: action.actionId,
        value: action.value,
      }
}

function queueItem(
  slots: readonly ListPreviewSelectionSlotSeed[],
  itemId: string,
): ListPreviewSlotItemSeed | undefined {
  return queueItems(slots).find((item) => item.id === itemId)
}

/** Owns list selections, filters, ordering, toggles, and allowlisted request intent. */
export function createListPreviewStore(input: ListPreviewSeed): ListPreviewStoreApi {
  const seed = normalizeSeed(input)
  let resetOrderIds = [...seed.orderIds]

  return createStore<ListPreviewModelState>((set, get) => ({
    ...seed,
    selectedBySlot: selectionsFor(seed.slots),
    flagsById: flagsFor(seed.flags),
    lastRequest: undefined,
    select(ownerId, slotId, itemId) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(slotId) || !isNonblankId(itemId)) return false
      const slot = state.slots.find((candidate) => candidate.id === slotId)
      const item = slot?.items.find((candidate) => candidate.id === itemId)
      if (!item || item.disabled === true) return false
      if (state.selectedBySlot[slotId] === itemId) return true
      set({ selectedBySlot: { ...state.selectedBySlot, [slotId]: itemId }, lastRequest: undefined })
      return true
    },
    setFlag(ownerId, flagId, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(flagId) || !state.flags.some((flag) => flag.id === flagId))
        return false
      if (state.flagsById[flagId] === value) return true
      set({ flagsById: { ...state.flagsById, [flagId]: value }, lastRequest: undefined })
      return true
    },
    setQuery(ownerId, value) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (state.query === value) return true
      set({ query: value, lastRequest: undefined })
      return true
    },
    move(ownerId, itemId, beforeId) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(itemId)) return false
      const item = queueItem(state.slots, itemId)
      if (!item || item.disabled === true) return false
      if (beforeId !== undefined && !isNonblankId(beforeId)) return false
      if (beforeId !== undefined) {
        const target = queueItem(state.slots, beforeId)
        if (!target || target.disabled === true) return false
      }
      const sourceIndex = state.orderIds.indexOf(itemId)
      if (sourceIndex < 0) return false
      if (beforeId === itemId) return false
      const withoutSource = state.orderIds.filter((id) => id !== itemId)
      const targetIndex = beforeId === undefined ? withoutSource.length : withoutSource.indexOf(beforeId)
      if (targetIndex < 0) return false
      const orderIds = [...withoutSource.slice(0, targetIndex), itemId, ...withoutSource.slice(targetIndex)]
      if (sameIds(orderIds, state.orderIds)) return false
      set({ orderIds, lastRequest: undefined })
      return true
    },
    resetOrder(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (sameIds(state.orderIds, resetOrderIds)) return true
      set({ orderIds: [...resetOrderIds], lastRequest: undefined })
      return true
    },
    request(ownerId, action) {
      const state = get()
      if (!ownsState(state, ownerId) || !allowsRequest(state.requestActions, action)) return undefined
      if (sameRequest(state.lastRequest, action)) return undefined
      const request = requestFor(state, action)
      set({ lastRequest: request })
      return request
    },
    refresh(nextInput) {
      const state = get()
      if (
        !ownsState(state, state.ownerId) ||
        nextInput.ownerId !== state.ownerId ||
        nextInput.variant !== state.variant ||
        nextInput.fixtureId !== state.fixtureId
      )
        return false

      const next = normalizeSeed(nextInput)
      const selectedBySlot = reconcileSelections(next.slots, state.selectedBySlot)
      const orderIds = reconcileOrderIds(state.orderIds, next.orderIds)
      const flagsById = reconcileFlags(next.flags, state.flagsById)
      const requestAction = state.lastRequest ? actionFromRequest(state.lastRequest) : undefined
      const lastRequest =
        sameSelections(state.selectedBySlot, selectedBySlot) &&
        sameIds(state.orderIds, orderIds) &&
        requestAction !== undefined &&
        allowsRequest(next.requestActions, requestAction)
          ? state.lastRequest
          : undefined
      resetOrderIds = [...next.orderIds]
      set({ ...next, selectedBySlot, flagsById, orderIds, query: state.query, lastRequest })
      return true
    },
  }))
}

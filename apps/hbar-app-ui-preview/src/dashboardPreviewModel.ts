import { createStore, type StoreApi } from 'zustand/vanilla'

export interface DashboardPreviewSlotItemSeed {
  readonly id: string
  readonly disabled?: boolean | undefined
}

export interface DashboardPreviewSelectionSlotSeed {
  readonly id: string
  readonly items: readonly DashboardPreviewSlotItemSeed[]
  readonly initialId?: string | undefined
}

export interface DashboardPreviewFlagSeed {
  readonly id: string
  readonly value: boolean
}

export interface DashboardPreviewRequestAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface DashboardPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly DashboardPreviewSelectionSlotSeed[]
  readonly flags: readonly DashboardPreviewFlagSeed[]
  readonly requestActions: readonly DashboardPreviewRequestAction[]
  readonly query?: string | undefined
}

export interface DashboardPreviewRequest extends DashboardPreviewRequestAction {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
}

export interface DashboardPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly DashboardPreviewSelectionSlotSeed[]
  readonly flags: readonly DashboardPreviewFlagSeed[]
  readonly requestActions: readonly DashboardPreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly query: string
  /** Local request intent only; it does not claim that an external action succeeded. */
  readonly lastRequest: DashboardPreviewRequest | undefined
  readonly select: (ownerId: string, slotId: string, itemId: string) => boolean
  readonly setFlag: (ownerId: string, flagId: string, value: boolean) => boolean
  readonly setQuery: (ownerId: string, query: string) => boolean
  readonly request: (ownerId: string, action: DashboardPreviewRequestAction) => DashboardPreviewRequest | undefined
  readonly refresh: (seed: DashboardPreviewSeed) => boolean
}

export type DashboardPreviewStoreApi = StoreApi<DashboardPreviewModelState>

interface NormalizedDashboardPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly DashboardPreviewSelectionSlotSeed[]
  readonly flags: readonly DashboardPreviewFlagSeed[]
  readonly requestActions: readonly DashboardPreviewRequestAction[]
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

function normalizeSlots(
  slots: readonly DashboardPreviewSelectionSlotSeed[],
): readonly DashboardPreviewSelectionSlotSeed[] {
  return uniqueById(slots).map((slot) => ({
    id: slot.id,
    items: uniqueById(slot.items).map((item) => ({
      id: item.id,
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    })),
    ...(slot.initialId === undefined ? {} : { initialId: slot.initialId }),
  }))
}

function normalizeFlags(flags: readonly DashboardPreviewFlagSeed[]): readonly DashboardPreviewFlagSeed[] {
  return uniqueById(flags).map((flag) => ({ id: flag.id, value: flag.value }))
}

function requestValue(action: DashboardPreviewRequestAction): string | undefined {
  return action.value
}

function normalizeRequestActions(
  actions: readonly DashboardPreviewRequestAction[],
): readonly DashboardPreviewRequestAction[] {
  const result: DashboardPreviewRequestAction[] = []
  for (const action of actions) {
    const value = requestValue(action)
    if (!isNonblankId(action.actionId) || (value !== undefined && !isNonblankId(value))) continue
    if (result.some((candidate) => candidate.actionId === action.actionId && requestValue(candidate) === value))
      continue
    result.push(value === undefined ? { actionId: action.actionId } : { actionId: action.actionId, value })
  }
  return result
}

function initialId(slot: DashboardPreviewSelectionSlotSeed): string | undefined {
  if (slot.initialId !== undefined) {
    const requested = slot.items.find((item) => item.id === slot.initialId)
    if (requested && requested.disabled !== true) return requested.id
  }
  return slot.items.find((item) => item.disabled !== true)?.id
}

function selectionsFor(
  slots: readonly DashboardPreviewSelectionSlotSeed[],
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, initialId(slot)]))
}

function flagsFor(flags: readonly DashboardPreviewFlagSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, flag.value]))
}

function normalizeSeed(seed: DashboardPreviewSeed): NormalizedDashboardPreviewSeed {
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots: normalizeSlots(seed.slots),
    flags: normalizeFlags(seed.flags),
    requestActions: normalizeRequestActions(seed.requestActions),
    query: seed.query ?? '',
  }
}

function ownsState(state: Pick<DashboardPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return (
    isNonblankId(ownerId) && isNonblankId(state.ownerId) && isNonblankId(state.fixtureId) && ownerId === state.ownerId
  )
}

function allowsRequest(
  actions: readonly DashboardPreviewRequestAction[],
  action: DashboardPreviewRequestAction,
): boolean {
  const value = requestValue(action)
  return (
    isNonblankId(action.actionId) &&
    (value === undefined || isNonblankId(value)) &&
    actions.some((candidate) => candidate.actionId === action.actionId && requestValue(candidate) === value)
  )
}

function sameRequest(left: DashboardPreviewRequest | undefined, right: DashboardPreviewRequestAction): boolean {
  return left !== undefined && left.actionId === right.actionId && requestValue(left) === requestValue(right)
}

function actionFromRequest(request: DashboardPreviewRequest): DashboardPreviewRequestAction {
  return request.value === undefined
    ? { actionId: request.actionId }
    : { actionId: request.actionId, value: request.value }
}

function reconcileSelections(
  slots: readonly DashboardPreviewSelectionSlotSeed[],
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
  flags: readonly DashboardPreviewFlagSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, previous[flag.id] ?? flag.value]))
}

function requestFor(
  state: Pick<DashboardPreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: DashboardPreviewRequestAction,
): DashboardPreviewRequest {
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

/** Owns dashboard selection, toggle, query, and allowlisted local request state. */
export function createDashboardPreviewStore(input: DashboardPreviewSeed): DashboardPreviewStoreApi {
  const seed = normalizeSeed(input)

  return createStore<DashboardPreviewModelState>((set, get) => ({
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
    setQuery(ownerId, query) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (state.query === query) return true
      set({ query, lastRequest: undefined })
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
      const flagsById = reconcileFlags(next.flags, state.flagsById)
      const requestAction = state.lastRequest ? actionFromRequest(state.lastRequest) : undefined
      const lastRequest =
        !sameSelections(state.selectedBySlot, selectedBySlot) ||
        !requestAction ||
        !allowsRequest(next.requestActions, requestAction)
          ? undefined
          : state.lastRequest
      set({ ...next, selectedBySlot, flagsById, query: state.query, lastRequest })
      return true
    },
  }))
}

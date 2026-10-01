import { createStore, type StoreApi } from 'zustand/vanilla'

export interface AnalyticsPreviewSlotItemSeed {
  readonly id: string
  readonly disabled?: boolean | undefined
}

export interface AnalyticsPreviewSelectionSlotSeed {
  readonly id: string
  readonly items: readonly AnalyticsPreviewSlotItemSeed[]
  readonly initialId?: string | undefined
}

export interface AnalyticsPreviewFlagSeed {
  readonly id: string
  readonly value: boolean
}

export interface AnalyticsPreviewRequestAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface AnalyticsPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly AnalyticsPreviewSelectionSlotSeed[]
  readonly flags: readonly AnalyticsPreviewFlagSeed[]
  readonly requestActions: readonly AnalyticsPreviewRequestAction[]
}

export interface AnalyticsPreviewRequest extends AnalyticsPreviewRequestAction {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
}

export interface AnalyticsPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly AnalyticsPreviewSelectionSlotSeed[]
  readonly flags: readonly AnalyticsPreviewFlagSeed[]
  readonly requestActions: readonly AnalyticsPreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly flagsById: Readonly<Record<string, boolean>>
  /** Local request intent only; it does not claim that an external action succeeded. */
  readonly lastRequest: AnalyticsPreviewRequest | undefined
  readonly select: (ownerId: string, slotId: string, itemId: string) => boolean
  readonly setFlag: (ownerId: string, flagId: string, value: boolean) => boolean
  readonly request: (ownerId: string, action: AnalyticsPreviewRequestAction) => AnalyticsPreviewRequest | undefined
  readonly refresh: (seed: AnalyticsPreviewSeed) => boolean
}

export type AnalyticsPreviewStoreApi = StoreApi<AnalyticsPreviewModelState>

interface NormalizedAnalyticsPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly AnalyticsPreviewSelectionSlotSeed[]
  readonly flags: readonly AnalyticsPreviewFlagSeed[]
  readonly requestActions: readonly AnalyticsPreviewRequestAction[]
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
  slots: readonly AnalyticsPreviewSelectionSlotSeed[],
): readonly AnalyticsPreviewSelectionSlotSeed[] {
  return uniqueById(slots).map((slot) => ({
    id: slot.id,
    items: uniqueById(slot.items).map((item) => ({
      id: item.id,
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    })),
    ...(slot.initialId === undefined ? {} : { initialId: slot.initialId }),
  }))
}

function normalizeFlags(flags: readonly AnalyticsPreviewFlagSeed[]): readonly AnalyticsPreviewFlagSeed[] {
  return uniqueById(flags).map((flag) => ({ id: flag.id, value: flag.value }))
}

function normalizeRequestActions(
  actions: readonly AnalyticsPreviewRequestAction[],
): readonly AnalyticsPreviewRequestAction[] {
  const result: AnalyticsPreviewRequestAction[] = []
  for (const action of actions) {
    const value = action.value
    if (!isNonblankId(action.actionId) || (value !== undefined && !isNonblankId(value))) continue
    if (result.some((candidate) => candidate.actionId === action.actionId && candidate.value === value)) continue
    result.push(value === undefined ? { actionId: action.actionId } : { actionId: action.actionId, value })
  }
  return result
}

function initialId(slot: AnalyticsPreviewSelectionSlotSeed): string | undefined {
  if (slot.initialId !== undefined) {
    const requested = slot.items.find((item) => item.id === slot.initialId)
    if (requested && requested.disabled !== true) return requested.id
  }
  return slot.items.find((item) => item.disabled !== true)?.id
}

function selectionsFor(
  slots: readonly AnalyticsPreviewSelectionSlotSeed[],
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, initialId(slot)]))
}

function flagsFor(flags: readonly AnalyticsPreviewFlagSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, flag.value]))
}

function normalizeSeed(seed: AnalyticsPreviewSeed): NormalizedAnalyticsPreviewSeed {
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots: normalizeSlots(seed.slots),
    flags: normalizeFlags(seed.flags),
    requestActions: normalizeRequestActions(seed.requestActions),
  }
}

function ownsState(state: Pick<AnalyticsPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return (
    isNonblankId(ownerId) && isNonblankId(state.ownerId) && isNonblankId(state.fixtureId) && ownerId === state.ownerId
  )
}

function allowsRequest(
  actions: readonly AnalyticsPreviewRequestAction[],
  action: AnalyticsPreviewRequestAction,
): boolean {
  const value = action.value
  return (
    isNonblankId(action.actionId) &&
    (value === undefined || isNonblankId(value)) &&
    actions.some((candidate) => candidate.actionId === action.actionId && candidate.value === value)
  )
}

function sameRequest(left: AnalyticsPreviewRequest | undefined, right: AnalyticsPreviewRequestAction): boolean {
  return left !== undefined && left.actionId === right.actionId && left.value === right.value
}

function actionFromRequest(request: AnalyticsPreviewRequest): AnalyticsPreviewRequestAction {
  return request.value === undefined
    ? { actionId: request.actionId }
    : { actionId: request.actionId, value: request.value }
}

function reconcileSelections(
  slots: readonly AnalyticsPreviewSelectionSlotSeed[],
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
  flags: readonly AnalyticsPreviewFlagSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, previous[flag.id] ?? flag.value]))
}

function requestFor(
  state: Pick<AnalyticsPreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: AnalyticsPreviewRequestAction,
): AnalyticsPreviewRequest {
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

/** Owns analytics selections, toggles, and allowlisted local request intent. */
export function createAnalyticsPreviewStore(input: AnalyticsPreviewSeed): AnalyticsPreviewStoreApi {
  const seed = normalizeSeed(input)

  return createStore<AnalyticsPreviewModelState>((set, get) => ({
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
      set({ ...next, selectedBySlot, flagsById, lastRequest })
      return true
    },
  }))
}

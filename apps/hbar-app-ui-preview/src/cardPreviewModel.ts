import { createStore, type StoreApi } from 'zustand/vanilla'

export interface CardPreviewItemSeed {
  readonly id: string
  readonly disabled?: boolean | undefined
}

export interface CardPreviewSelectionSlotSeed {
  readonly id: string
  readonly items: readonly CardPreviewItemSeed[]
  readonly initialSelectedId?: string | undefined
}

export interface CardPreviewFlagSeed {
  readonly id: string
  readonly value: boolean
}

export interface CardPreviewStepSeed {
  readonly id: string
  readonly complete: boolean
  readonly disabled?: boolean | undefined
}

export type CardPreviewRequestAction =
  { readonly actionId: string } | { readonly actionId: string; readonly targetId: string }

export interface CardPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly CardPreviewSelectionSlotSeed[]
  readonly flags: readonly CardPreviewFlagSeed[]
  readonly steps: readonly CardPreviewStepSeed[]
  readonly requestActions: readonly CardPreviewRequestAction[]
}

export type CardPreviewRequest =
  | {
      readonly ownerId: string
      readonly variant: number
      readonly fixtureId: string
      readonly actionId: string
    }
  | {
      readonly ownerId: string
      readonly variant: number
      readonly fixtureId: string
      readonly actionId: string
      readonly targetId: string
    }

export interface CardPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly CardPreviewSelectionSlotSeed[]
  readonly flags: readonly CardPreviewFlagSeed[]
  readonly steps: readonly CardPreviewStepSeed[]
  readonly requestActions: readonly CardPreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly completedByStep: Readonly<Record<string, boolean>>
  readonly lastRequest: CardPreviewRequest | undefined
  readonly select: (ownerId: string, slotId: string, itemId: string) => boolean
  readonly setFlag: (ownerId: string, id: string, value: boolean) => boolean
  readonly setStepComplete: (ownerId: string, id: string, complete: boolean) => boolean
  readonly resetSteps: (ownerId: string) => boolean
  readonly refresh: (ownerId: string, seed: CardPreviewSeed) => boolean
  readonly request: (ownerId: string, action: CardPreviewRequestAction) => CardPreviewRequest | undefined
}

export type CardPreviewStoreApi = StoreApi<CardPreviewModelState>

interface NormalizedCardPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly CardPreviewSelectionSlotSeed[]
  readonly flags: readonly CardPreviewFlagSeed[]
  readonly steps: readonly CardPreviewStepSeed[]
  readonly requestActions: readonly CardPreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly completedByStep: Readonly<Record<string, boolean>>
}

function isNonblankId(id: string): boolean {
  return id.trim().length > 0
}

function uniqueById<T extends { readonly id: string }>(records: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (!isNonblankId(record.id) || seen.has(record.id)) return false
    seen.add(record.id)
    return true
  })
}

function normalizeRequestActions(actions: readonly CardPreviewRequestAction[]): readonly CardPreviewRequestAction[] {
  const unique: CardPreviewRequestAction[] = []
  for (const action of actions) {
    const targetId = 'targetId' in action ? action.targetId : undefined
    if (!isNonblankId(action.actionId) || (targetId !== undefined && !isNonblankId(targetId))) continue
    if (
      unique.some(
        (candidate) =>
          candidate.actionId === action.actionId &&
          ('targetId' in candidate ? candidate.targetId : undefined) === targetId,
      )
    )
      continue
    unique.push(targetId === undefined ? { actionId: action.actionId } : { actionId: action.actionId, targetId })
  }
  return unique
}

function normalizeSlots(slots: readonly CardPreviewSelectionSlotSeed[]): readonly CardPreviewSelectionSlotSeed[] {
  return uniqueById(slots).map((slot) => ({ ...slot, items: uniqueById(slot.items) }))
}

function isEnabledItem(item: CardPreviewItemSeed): boolean {
  return item.disabled !== true
}

function initialSelectedId(slot: CardPreviewSelectionSlotSeed): string | undefined {
  const requested = slot.initialSelectedId
  if (requested !== undefined) {
    const item = slot.items.find((candidate) => candidate.id === requested)
    if (item && isEnabledItem(item)) return requested
  }
  return slot.items.find(isEnabledItem)?.id
}

function mapSelections(slots: readonly CardPreviewSelectionSlotSeed[]): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, initialSelectedId(slot)]))
}

function mapFlags(flags: readonly CardPreviewFlagSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, flag.value]))
}

function mapCompletedSteps(steps: readonly CardPreviewStepSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(steps.map((step) => [step.id, step.complete]))
}

function normalizeSeed(seed: CardPreviewSeed): NormalizedCardPreviewSeed {
  const slots = normalizeSlots(seed.slots)
  const flags = uniqueById(seed.flags)
  const steps = uniqueById(seed.steps)
  const requestActions = normalizeRequestActions(seed.requestActions)
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots,
    flags,
    steps,
    requestActions,
    selectedBySlot: mapSelections(slots),
    flagsById: mapFlags(flags),
    completedByStep: mapCompletedSteps(steps),
  }
}

function ownsState(state: Pick<CardPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return (
    isNonblankId(ownerId) && isNonblankId(state.ownerId) && isNonblankId(state.fixtureId) && ownerId === state.ownerId
  )
}

function targetIdOf(action: CardPreviewRequestAction): string | undefined {
  return 'targetId' in action ? action.targetId : undefined
}

function allowsRequest(actions: readonly CardPreviewRequestAction[], action: CardPreviewRequestAction): boolean {
  const targetId = targetIdOf(action)
  if (!isNonblankId(action.actionId) || (targetId !== undefined && !isNonblankId(targetId))) return false
  return actions.some((candidate) => candidate.actionId === action.actionId && targetIdOf(candidate) === targetId)
}

function actionFromRequest(request: CardPreviewRequest): CardPreviewRequestAction {
  return 'targetId' in request
    ? { actionId: request.actionId, targetId: request.targetId }
    : { actionId: request.actionId }
}

function requestMatchesAction(request: CardPreviewRequest, action: CardPreviewRequestAction): boolean {
  return request.actionId === action.actionId && targetIdOf(actionFromRequest(request)) === targetIdOf(action)
}

function reconcileSelections(
  slots: readonly CardPreviewSelectionSlotSeed[],
  previous: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    slots.map((slot) => {
      const prior = previous[slot.id]
      const selectedId =
        prior !== undefined && slot.items.some((item) => item.id === prior && isEnabledItem(item))
          ? prior
          : initialSelectedId(slot)
      return [slot.id, selectedId]
    }),
  )
}

function reconcileFlags(
  flags: readonly CardPreviewFlagSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, previous[flag.id] ?? flag.value]))
}

function reconcileCompletedSteps(
  steps: readonly CardPreviewStepSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(steps.map((step) => [step.id, previous[step.id] ?? step.complete]))
}

function sameSelections(
  left: Readonly<Record<string, string | undefined>>,
  right: Readonly<Record<string, string | undefined>>,
): boolean {
  const leftIds = Object.keys(left)
  const rightIds = Object.keys(right)
  return leftIds.length === rightIds.length && leftIds.every((id) => left[id] === right[id])
}

function requestFor(
  state: Pick<CardPreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: CardPreviewRequestAction,
): CardPreviewRequest {
  const targetId = targetIdOf(action)
  return targetId === undefined
    ? { ownerId: state.ownerId, variant: state.variant, fixtureId: state.fixtureId, actionId: action.actionId }
    : {
        ownerId: state.ownerId,
        variant: state.variant,
        fixtureId: state.fixtureId,
        actionId: action.actionId,
        targetId,
      }
}

/** Preview-owned card selections, toggles, onboarding steps, and request intent. */
export function createCardPreviewStore(seed: CardPreviewSeed): CardPreviewStoreApi {
  const initial = normalizeSeed(seed)

  return createStore<CardPreviewModelState>((set, get) => ({
    ...initial,
    lastRequest: undefined,
    select(ownerId, slotId, itemId) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(slotId) || !isNonblankId(itemId)) return false
      const slot = state.slots.find((candidate) => candidate.id === slotId)
      const item = slot?.items.find((candidate) => candidate.id === itemId)
      if (!item || !isEnabledItem(item)) return false
      if (state.selectedBySlot[slotId] === itemId) return true
      set({ selectedBySlot: { ...state.selectedBySlot, [slotId]: itemId }, lastRequest: undefined })
      return true
    },
    setFlag(ownerId, id, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(id) || !state.flags.some((flag) => flag.id === id)) return false
      if (state.flagsById[id] === value) return true
      set({ flagsById: { ...state.flagsById, [id]: value }, lastRequest: undefined })
      return true
    },
    setStepComplete(ownerId, id, complete) {
      const state = get()
      const step = state.steps.find((candidate) => candidate.id === id)
      if (!ownsState(state, ownerId) || !isNonblankId(id) || !step || step.disabled === true) return false
      if (state.completedByStep[id] === complete) return true
      set({ completedByStep: { ...state.completedByStep, [id]: complete }, lastRequest: undefined })
      return true
    },
    resetSteps(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      const completedByStep = Object.fromEntries(
        state.steps.map((step) => [
          step.id,
          step.disabled === true ? (state.completedByStep[step.id] ?? step.complete) : false,
        ]),
      )
      const changed = state.steps.some((step) => step.disabled !== true && state.completedByStep[step.id] === true)
      if (changed) set({ completedByStep, lastRequest: undefined })
      return true
    },
    refresh(ownerId, nextSeed) {
      const state = get()
      if (
        !ownsState(state, ownerId) ||
        nextSeed.ownerId !== state.ownerId ||
        nextSeed.variant !== state.variant ||
        nextSeed.fixtureId !== state.fixtureId
      )
        return false

      const next = normalizeSeed(nextSeed)
      const selectedBySlot = reconcileSelections(next.slots, state.selectedBySlot)
      const selectionsChanged = !sameSelections(state.selectedBySlot, selectedBySlot)
      const flagsById = reconcileFlags(next.flags, state.flagsById)
      const completedByStep = reconcileCompletedSteps(next.steps, state.completedByStep)
      const lastRequest =
        !selectionsChanged &&
        state.lastRequest &&
        allowsRequest(next.requestActions, actionFromRequest(state.lastRequest))
          ? state.lastRequest
          : undefined

      set({ ...next, selectedBySlot, flagsById, completedByStep, lastRequest })
      return true
    },
    request(ownerId, action) {
      const state = get()
      if (!ownsState(state, ownerId) || !allowsRequest(state.requestActions, action)) return undefined
      if (state.lastRequest && requestMatchesAction(state.lastRequest, action)) return undefined
      const request = requestFor(state, action)
      set({ lastRequest: request })
      return request
    },
  }))
}

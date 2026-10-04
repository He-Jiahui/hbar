import { createStore, type StoreApi } from 'zustand/vanilla'

export interface MobilePreviewItemSeed {
  readonly id: string
}

export interface MobilePreviewSelectionSlotSeed {
  readonly id: string
  readonly items: readonly MobilePreviewItemSeed[]
  readonly initialSelectedId?: string | undefined
}

export interface MobilePreviewDraftSeed {
  readonly id: string
  readonly value: string
}

export interface MobilePreviewFlagSeed {
  readonly id: string
  readonly value: boolean
}

export interface MobilePreviewTaskSeed {
  readonly id: string
  readonly complete: boolean
}

export type MobilePreviewRequestAction =
  { readonly actionId: string } | { readonly actionId: string; readonly targetId: string }

export interface MobilePreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly MobilePreviewSelectionSlotSeed[]
  readonly drafts: readonly MobilePreviewDraftSeed[]
  readonly flags?: readonly MobilePreviewFlagSeed[] | undefined
  readonly tasks?: readonly MobilePreviewTaskSeed[] | undefined
  readonly requestActions: readonly MobilePreviewRequestAction[]
}

export type MobilePreviewRequest =
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
      readonly value: string
    }

export interface MobilePreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly MobilePreviewSelectionSlotSeed[]
  readonly drafts: readonly MobilePreviewDraftSeed[]
  readonly flags: readonly MobilePreviewFlagSeed[]
  readonly tasks: readonly MobilePreviewTaskSeed[]
  readonly requestActions: readonly MobilePreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly draftsById: Readonly<Record<string, string>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly taskCompleteById: Readonly<Record<string, boolean>>
  readonly lastRequest: MobilePreviewRequest | undefined
  readonly refresh: (ownerId: string, seed: MobilePreviewSeed) => boolean
  readonly select: (ownerId: string, slotId: string, itemId: string) => boolean
  readonly setDraft: (ownerId: string, id: string, value: string) => boolean
  readonly setFlag: (ownerId: string, id: string, value: boolean) => boolean
  readonly setTaskComplete: (ownerId: string, taskId: string, complete: boolean) => boolean
  readonly request: (ownerId: string, action: MobilePreviewRequestAction) => MobilePreviewRequest | undefined
}

export type MobilePreviewStoreApi = StoreApi<MobilePreviewModelState>

interface NormalizedMobilePreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly MobilePreviewSelectionSlotSeed[]
  readonly drafts: readonly MobilePreviewDraftSeed[]
  readonly flags: readonly MobilePreviewFlagSeed[]
  readonly tasks: readonly MobilePreviewTaskSeed[]
  readonly requestActions: readonly MobilePreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly draftsById: Readonly<Record<string, string>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly taskCompleteById: Readonly<Record<string, boolean>>
}

function uniqueById<T extends { readonly id: string }>(records: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (!record.id.trim() || seen.has(record.id)) return false
    seen.add(record.id)
    return true
  })
}

function normalizeRequestActions(
  actions: readonly MobilePreviewRequestAction[],
): readonly MobilePreviewRequestAction[] {
  const unique: MobilePreviewRequestAction[] = []
  for (const action of actions) {
    const targetId = 'targetId' in action ? action.targetId : undefined
    if (!action.actionId.trim() || (targetId !== undefined && !targetId.trim())) continue
    if (
      unique.some(
        (candidate) =>
          candidate.actionId === action.actionId &&
          ('targetId' in candidate ? candidate.targetId : undefined) === targetId,
      )
    ) {
      continue
    }
    unique.push(targetId === undefined ? { actionId: action.actionId } : { actionId: action.actionId, targetId })
  }
  return unique
}

function initialSelectedId(slot: MobilePreviewSelectionSlotSeed): string | undefined {
  if (slot.initialSelectedId !== undefined && slot.items.some((item) => item.id === slot.initialSelectedId)) {
    return slot.initialSelectedId
  }
  return slot.items[0]?.id
}

function mapSlots(slots: readonly MobilePreviewSelectionSlotSeed[]): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, initialSelectedId(slot)]))
}

function mapDrafts(drafts: readonly MobilePreviewDraftSeed[]): Readonly<Record<string, string>> {
  return Object.fromEntries(drafts.map((draft) => [draft.id, draft.value]))
}

function mapFlags(flags: readonly MobilePreviewFlagSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, flag.value]))
}

function mapTasks(tasks: readonly MobilePreviewTaskSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(tasks.map((task) => [task.id, task.complete]))
}

function normalizeSeed(seed: MobilePreviewSeed): NormalizedMobilePreviewSeed {
  const slots = uniqueById(seed.slots).map((slot) => ({ ...slot, items: uniqueById(slot.items) }))
  const drafts = uniqueById(seed.drafts)
  const flags = uniqueById(seed.flags ?? [])
  const tasks = uniqueById(seed.tasks ?? [])

  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots,
    drafts,
    flags,
    tasks,
    requestActions: normalizeRequestActions(seed.requestActions),
    selectedBySlot: mapSlots(slots),
    draftsById: mapDrafts(drafts),
    flagsById: mapFlags(flags),
    taskCompleteById: mapTasks(tasks),
  }
}

function ownsState(state: MobilePreviewModelState, ownerId: string): boolean {
  return ownerId.trim().length > 0 && state.ownerId.trim().length > 0 && ownerId === state.ownerId
}

function allowsRequest(actions: readonly MobilePreviewRequestAction[], action: MobilePreviewRequestAction): boolean {
  const targetId = 'targetId' in action ? action.targetId : undefined
  if (!action.actionId.trim() || (targetId !== undefined && !targetId.trim())) return false
  return actions.some(
    (candidate) =>
      candidate.actionId === action.actionId && ('targetId' in candidate ? candidate.targetId : undefined) === targetId,
  )
}

function requestMatchesAction(request: MobilePreviewRequest, action: MobilePreviewRequestAction): boolean {
  const value = 'value' in request ? request.value : undefined
  return request.actionId === action.actionId && value === ('targetId' in action ? action.targetId : undefined)
}

function reconcileSelections(
  slots: readonly MobilePreviewSelectionSlotSeed[],
  previous: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    slots.map((slot) => {
      const selectedId = previous[slot.id]
      return [
        slot.id,
        selectedId !== undefined && slot.items.some((item) => item.id === selectedId)
          ? selectedId
          : initialSelectedId(slot),
      ]
    }),
  )
}

function reconcileDrafts(
  drafts: readonly MobilePreviewDraftSeed[],
  previous: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(drafts.map((draft) => [draft.id, previous[draft.id] ?? draft.value]))
}

function reconcileFlags(
  flags: readonly MobilePreviewFlagSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, previous[flag.id] ?? flag.value]))
}

function reconcileTasks(
  tasks: readonly MobilePreviewTaskSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(tasks.map((task) => [task.id, previous[task.id] ?? task.complete]))
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
  state: Pick<MobilePreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: MobilePreviewRequestAction,
): MobilePreviewRequest {
  const targetId = 'targetId' in action ? action.targetId : undefined
  return targetId === undefined
    ? { ownerId: state.ownerId, variant: state.variant, fixtureId: state.fixtureId, actionId: action.actionId }
    : {
        ownerId: state.ownerId,
        variant: state.variant,
        fixtureId: state.fixtureId,
        actionId: action.actionId,
        value: targetId,
      }
}

/** Owns the mobile preview's selections, drafts, flags, task display state, and local request intent. */
export function createMobilePreviewStore(seed: MobilePreviewSeed): MobilePreviewStoreApi {
  const initial = normalizeSeed(seed)

  return createStore<MobilePreviewModelState>((set, get) => ({
    ...initial,
    lastRequest: undefined,
    refresh(ownerId, nextSeed) {
      const state = get()
      if (!ownsState(state, ownerId) || nextSeed.ownerId !== state.ownerId) return false
      if (nextSeed.variant !== state.variant || nextSeed.fixtureId !== state.fixtureId) return false

      const next = normalizeSeed(nextSeed)
      const selectedBySlot = reconcileSelections(next.slots, state.selectedBySlot)
      const selectionsChanged = !sameSelections(state.selectedBySlot, selectedBySlot)
      const draftsById = reconcileDrafts(next.drafts, state.draftsById)
      const flagsById = reconcileFlags(next.flags, state.flagsById)
      const taskCompleteById = reconcileTasks(next.tasks, state.taskCompleteById)
      const lastRequest =
        !selectionsChanged &&
        state.lastRequest &&
        allowsRequest(next.requestActions, {
          actionId: state.lastRequest.actionId,
          ...('value' in state.lastRequest ? { targetId: state.lastRequest.value } : {}),
        })
          ? state.lastRequest
          : undefined

      set({ ...next, selectedBySlot, draftsById, flagsById, taskCompleteById, lastRequest })
      return true
    },
    select(ownerId, slotId, itemId) {
      const state = get()
      if (!ownsState(state, ownerId) || !slotId.trim() || !itemId.trim()) return false
      const slot = state.slots.find((candidate) => candidate.id === slotId)
      if (!slot || !slot.items.some((item) => item.id === itemId)) return false
      if (state.selectedBySlot[slotId] === itemId) return true
      set({ selectedBySlot: { ...state.selectedBySlot, [slotId]: itemId }, lastRequest: undefined })
      return true
    },
    setDraft(ownerId, id, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !id.trim() || !state.drafts.some((draft) => draft.id === id)) return false
      if (state.draftsById[id] === value) return true
      set({ draftsById: { ...state.draftsById, [id]: value }, lastRequest: undefined })
      return true
    },
    setFlag(ownerId, id, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !id.trim() || !state.flags.some((flag) => flag.id === id)) return false
      if (state.flagsById[id] === value) return true
      set({ flagsById: { ...state.flagsById, [id]: value }, lastRequest: undefined })
      return true
    },
    setTaskComplete(ownerId, taskId, complete) {
      const state = get()
      if (!ownsState(state, ownerId) || !taskId.trim() || !state.tasks.some((task) => task.id === taskId)) return false
      if (state.taskCompleteById[taskId] === complete) return true
      set({ taskCompleteById: { ...state.taskCompleteById, [taskId]: complete }, lastRequest: undefined })
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

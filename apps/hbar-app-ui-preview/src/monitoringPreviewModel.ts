import { createStore, type StoreApi } from 'zustand/vanilla'

export type MonitoringChoiceField = 'range' | 'metric' | 'status' | 'state' | 'level' | 'window' | 'region'

export type MonitoringSortId = 'node' | 'cpu' | 'memory' | 'disk' | 'requests' | 'p50' | 'p90' | 'p99' | 'errors'

export interface MonitoringPreviewItemSeed {
  readonly id: string
  readonly stateId?: string | undefined
  readonly groupId?: string | undefined
  readonly expandedByDefault?: boolean | undefined
}

export interface MonitoringPreviewChoiceSeed {
  readonly field: MonitoringChoiceField
  readonly ids: readonly string[]
  readonly initialId: string
}

export interface MonitoringPreviewGroupSeed {
  readonly id: string
  readonly expandedByDefault?: boolean | undefined
}

export interface MonitoringPreviewRequestAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface MonitoringPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly items: readonly MonitoringPreviewItemSeed[]
  readonly choices: readonly MonitoringPreviewChoiceSeed[]
  readonly groups: readonly MonitoringPreviewGroupSeed[]
  readonly initialSelectedId?: string | undefined
  readonly initialSortId?: MonitoringSortId | undefined
  readonly initialDescending?: boolean | undefined
  readonly initialPaused?: boolean | undefined
  readonly initialFollow?: boolean | undefined
  readonly requestActions: readonly MonitoringPreviewRequestAction[]
}

export interface MonitoringPreviewRequest extends MonitoringPreviewRequestAction {}

export interface MonitoringPreviewLocalUpdate {
  readonly id: string
  readonly body: string
  readonly statusId: string
}

export interface MonitoringPreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly items: readonly MonitoringPreviewItemSeed[]
  readonly choices: readonly MonitoringPreviewChoiceSeed[]
  readonly groups: readonly MonitoringPreviewGroupSeed[]
  readonly requestActions: readonly MonitoringPreviewRequestAction[]
  readonly query: string
  readonly choiceIds: Readonly<Partial<Record<MonitoringChoiceField, string>>>
  readonly paused: boolean
  readonly follow: boolean
  readonly attention: boolean
  readonly selectedId: string
  readonly expandedIds: readonly string[]
  readonly expandedGroupIds: readonly string[]
  readonly sortId: MonitoringSortId
  readonly descending: boolean
  readonly mutedIds: readonly string[]
  readonly resolvedIds: readonly string[]
  readonly draft: string
  readonly localUpdates: readonly MonitoringPreviewLocalUpdate[]
  readonly cleared: boolean
  readonly lastRequest: MonitoringPreviewRequest | undefined
  readonly refresh: (seed: MonitoringPreviewSeed) => boolean
  readonly setQuery: (ownerId: string, value: string) => boolean
  readonly choose: (ownerId: string, field: MonitoringChoiceField, id: string) => boolean
  readonly select: (ownerId: string, id: string) => boolean
  readonly expand: (ownerId: string, id: string) => boolean
  readonly group: (ownerId: string, id: string) => boolean
  readonly allGroups: (ownerId: string, expanded: boolean) => boolean
  readonly sort: (ownerId: string, sortId: MonitoringSortId, descending?: boolean) => boolean
  readonly pause: (ownerId: string) => boolean
  readonly toggleFollow: (ownerId: string) => boolean
  readonly toggleAttention: (ownerId: string) => boolean
  readonly silence: (ownerId: string, id: string) => boolean
  readonly silenceFiring: (ownerId: string) => boolean
  readonly resolve: (ownerId: string, id: string) => boolean
  readonly resetAlerts: (ownerId: string) => boolean
  readonly setDraft: (ownerId: string, value: string) => boolean
  readonly post: (ownerId: string) => boolean
  readonly clear: (ownerId: string) => boolean
  readonly request: (ownerId: string, actionId: string, value?: string) => boolean
}

export type MonitoringPreviewStoreApi = StoreApi<MonitoringPreviewModelState>

export const MONITORING_LOCAL_UPDATE_STATUS_ID = 'local-preview'

const MAX_DRAFT_LENGTH = 4_000
const MAX_LOCAL_UPDATES = 80
const DEFAULT_SORT_ID: MonitoringSortId = 'node'

interface NormalizedMonitoringPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly items: readonly MonitoringPreviewItemSeed[]
  readonly choices: readonly MonitoringPreviewChoiceSeed[]
  readonly groups: readonly MonitoringPreviewGroupSeed[]
  readonly requestActions: readonly MonitoringPreviewRequestAction[]
  readonly initialSelectedId: string | undefined
  readonly initialSortId: MonitoringSortId | undefined
  readonly initialDescending: boolean
  readonly initialPaused: boolean
  readonly initialFollow: boolean
}

function isNonblank(value: string): boolean {
  return value.trim().length > 0
}

function isChoiceField(value: string): value is MonitoringChoiceField {
  return (
    value === 'range' ||
    value === 'metric' ||
    value === 'status' ||
    value === 'state' ||
    value === 'level' ||
    value === 'window' ||
    value === 'region'
  )
}

function isSortId(value: string): value is MonitoringSortId {
  return (
    value === 'node' ||
    value === 'cpu' ||
    value === 'memory' ||
    value === 'disk' ||
    value === 'requests' ||
    value === 'p50' ||
    value === 'p90' ||
    value === 'p99' ||
    value === 'errors'
  )
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!isNonblank(value) || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function normalizeItems(items: readonly MonitoringPreviewItemSeed[]): readonly MonitoringPreviewItemSeed[] {
  const seen = new Set<string>()
  const result: MonitoringPreviewItemSeed[] = []
  for (const item of items) {
    if (!isNonblank(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    const stateId = item.stateId !== undefined && isNonblank(item.stateId) ? item.stateId : undefined
    const groupId = item.groupId !== undefined && isNonblank(item.groupId) ? item.groupId : undefined
    const expandedByDefault = typeof item.expandedByDefault === 'boolean' ? item.expandedByDefault : undefined
    result.push({
      id: item.id,
      ...(stateId === undefined ? {} : { stateId }),
      ...(groupId === undefined ? {} : { groupId }),
      ...(expandedByDefault === undefined ? {} : { expandedByDefault }),
    })
  }
  return result
}

function normalizeChoices(choices: readonly MonitoringPreviewChoiceSeed[]): readonly MonitoringPreviewChoiceSeed[] {
  const seenFields = new Set<MonitoringChoiceField>()
  const result: MonitoringPreviewChoiceSeed[] = []
  for (const choice of choices) {
    if (!isChoiceField(choice.field) || seenFields.has(choice.field)) continue
    seenFields.add(choice.field)
    result.push({ field: choice.field, ids: uniqueStrings(choice.ids), initialId: choice.initialId })
  }
  return result
}

function normalizeGroups(groups: readonly MonitoringPreviewGroupSeed[]): readonly MonitoringPreviewGroupSeed[] {
  const seen = new Set<string>()
  const result: MonitoringPreviewGroupSeed[] = []
  for (const group of groups) {
    if (!isNonblank(group.id) || seen.has(group.id)) continue
    seen.add(group.id)
    const expandedByDefault = typeof group.expandedByDefault === 'boolean' ? group.expandedByDefault : undefined
    result.push({ id: group.id, ...(expandedByDefault === undefined ? {} : { expandedByDefault }) })
  }
  return result
}

function normalizeRequestActions(
  actions: readonly MonitoringPreviewRequestAction[],
): readonly MonitoringPreviewRequestAction[] {
  const result: MonitoringPreviewRequestAction[] = []
  for (const action of actions) {
    if (!isNonblank(action.actionId) || (action.value !== undefined && !isNonblank(action.value))) continue
    if (result.some((candidate) => candidate.actionId === action.actionId && candidate.value === action.value)) continue
    result.push(
      action.value === undefined ? { actionId: action.actionId } : { actionId: action.actionId, value: action.value },
    )
  }
  return result
}

function normalizeSeed(seed: MonitoringPreviewSeed): NormalizedMonitoringPreviewSeed {
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    items: normalizeItems(seed.items),
    choices: normalizeChoices(seed.choices),
    groups: normalizeGroups(seed.groups),
    requestActions: normalizeRequestActions(seed.requestActions),
    initialSelectedId: seed.initialSelectedId,
    initialSortId: seed.initialSortId,
    initialDescending: seed.initialDescending === true,
    initialPaused: seed.initialPaused === true,
    initialFollow: seed.initialFollow === true,
  }
}

function ownsState(state: Pick<MonitoringPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return isNonblank(ownerId) && isNonblank(state.ownerId) && isNonblank(state.fixtureId) && ownerId === state.ownerId
}

function itemIds(items: readonly MonitoringPreviewItemSeed[]): readonly string[] {
  return items.map((item) => item.id)
}

function groupIds(groups: readonly MonitoringPreviewGroupSeed[]): readonly string[] {
  return groups.map((group) => group.id)
}

function initialSelectedId(seed: Pick<NormalizedMonitoringPreviewSeed, 'items' | 'initialSelectedId'>): string {
  const requested = seed.initialSelectedId
  if (requested === '') return ''
  if (requested !== undefined && seed.items.some((item) => item.id === requested)) return requested
  return seed.items[0]?.id ?? ''
}

function initialChoiceIds(
  choices: readonly MonitoringPreviewChoiceSeed[],
): Readonly<Partial<Record<MonitoringChoiceField, string>>> {
  const result: Partial<Record<MonitoringChoiceField, string>> = {}
  for (const choice of choices) {
    if (choice.initialId !== '' && choice.ids.includes(choice.initialId)) result[choice.field] = choice.initialId
    else if (choice.ids[0] !== undefined) result[choice.field] = choice.ids[0]
  }
  return result
}

function initialExpandedIds(items: readonly MonitoringPreviewItemSeed[]): readonly string[] {
  return items.filter((item) => item.expandedByDefault === true).map((item) => item.id)
}

function initialExpandedGroupIds(groups: readonly MonitoringPreviewGroupSeed[]): readonly string[] {
  return groups.filter((group) => group.expandedByDefault === true).map((group) => group.id)
}

function sameRequest(left: MonitoringPreviewRequest | undefined, right: MonitoringPreviewRequestAction): boolean {
  return left?.actionId === right.actionId && left.value === right.value
}

function allowsRequest(
  actions: readonly MonitoringPreviewRequestAction[],
  action: MonitoringPreviewRequestAction,
): boolean {
  return (
    isNonblank(action.actionId) &&
    (action.value === undefined || isNonblank(action.value)) &&
    actions.some((candidate) => candidate.actionId === action.actionId && candidate.value === action.value)
  )
}

function actionFromRequest(request: MonitoringPreviewRequest): MonitoringPreviewRequestAction {
  return request.value === undefined
    ? { actionId: request.actionId }
    : { actionId: request.actionId, value: request.value }
}

function reconcileChoiceIds(
  choices: readonly MonitoringPreviewChoiceSeed[],
  previous: Readonly<Partial<Record<MonitoringChoiceField, string>>>,
): Readonly<Partial<Record<MonitoringChoiceField, string>>> {
  const result: Partial<Record<MonitoringChoiceField, string>> = {}
  for (const choice of choices) {
    const prior = previous[choice.field]
    if (prior !== undefined && choice.ids.includes(prior)) result[choice.field] = prior
    else if (choice.initialId !== '' && choice.ids.includes(choice.initialId)) result[choice.field] = choice.initialId
    else if (choice.ids[0] !== undefined) result[choice.field] = choice.ids[0]
  }
  return result
}

function sameChoiceIds(
  left: Readonly<Partial<Record<MonitoringChoiceField, string>>>,
  right: Readonly<Partial<Record<MonitoringChoiceField, string>>>,
): boolean {
  const fields: readonly MonitoringChoiceField[] = ['range', 'metric', 'status', 'state', 'level', 'window', 'region']
  return fields.every((field) => left[field] === right[field])
}

function reconcileExpandedIds(
  nextItems: readonly MonitoringPreviewItemSeed[],
  previousItems: readonly MonitoringPreviewItemSeed[],
  previousExpanded: readonly string[],
): readonly string[] {
  const previousIds = new Set(previousItems.map((item) => item.id))
  const previousExpandedSet = new Set(previousExpanded)
  return nextItems
    .filter(
      (item) => previousExpandedSet.has(item.id) || (!previousIds.has(item.id) && item.expandedByDefault === true),
    )
    .map((item) => item.id)
}

function reconcileExpandedGroupIds(
  nextGroups: readonly MonitoringPreviewGroupSeed[],
  previousGroups: readonly MonitoringPreviewGroupSeed[],
  previousExpanded: readonly string[],
): readonly string[] {
  const previousIds = new Set(previousGroups.map((group) => group.id))
  const previousExpandedSet = new Set(previousExpanded)
  return nextGroups
    .filter(
      (group) => previousExpandedSet.has(group.id) || (!previousIds.has(group.id) && group.expandedByDefault === true),
    )
    .map((group) => group.id)
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function knownDynamicId(state: Pick<MonitoringPreviewModelState, 'items' | 'groups' | 'choices'>, id: string): boolean {
  return (
    state.items.some((item) => item.id === id) ||
    state.groups.some((group) => group.id === id) ||
    state.choices.some((choice) => choice.ids.includes(id))
  )
}

function requestStillTargetsSource(
  previous: Pick<MonitoringPreviewModelState, 'items' | 'groups' | 'choices'>,
  next: Pick<MonitoringPreviewModelState, 'items' | 'groups' | 'choices'>,
  request: MonitoringPreviewRequest,
): boolean {
  if (request.value === undefined || !knownDynamicId(previous, request.value)) return true
  return knownDynamicId(next, request.value)
}

function sameTargetContext(
  previous: Pick<
    MonitoringPreviewModelState,
    'query' | 'choiceIds' | 'selectedId' | 'expandedIds' | 'expandedGroupIds'
  >,
  next: Pick<MonitoringPreviewModelState, 'query' | 'choiceIds' | 'selectedId' | 'expandedIds' | 'expandedGroupIds'>,
): boolean {
  return (
    previous.query === next.query &&
    sameChoiceIds(previous.choiceIds, next.choiceIds) &&
    previous.selectedId === next.selectedId &&
    sameIds(previous.expandedIds, next.expandedIds) &&
    sameIds(previous.expandedGroupIds, next.expandedGroupIds)
  )
}

function actionAllowedForVariant(
  state: Pick<MonitoringPreviewModelState, 'variant'>,
  action: 'alerts' | 'draft' | 'clear' | 'groups' | 'attention',
): boolean {
  if (action === 'alerts') return state.variant === 4
  if (action === 'draft') return state.variant === 3
  if (action === 'clear') return state.variant === 5
  if (action === 'groups') return state.variant === 9
  return state.variant === 9
}

/** Owns local monitoring preview state. It does not start feeds, timers, or network requests. */
export function createMonitoringPreviewStore(input: MonitoringPreviewSeed): MonitoringPreviewStoreApi {
  const seed = normalizeSeed(input)
  return createStore<MonitoringPreviewModelState>((set, get) => ({
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    items: seed.items,
    choices: seed.choices,
    groups: seed.groups,
    requestActions: seed.requestActions,
    query: '',
    choiceIds: initialChoiceIds(seed.choices),
    paused: seed.initialPaused,
    follow: seed.initialFollow,
    attention: false,
    selectedId: initialSelectedId(seed),
    expandedIds: initialExpandedIds(seed.items),
    expandedGroupIds: initialExpandedGroupIds(seed.groups),
    sortId: seed.initialSortId !== undefined && isSortId(seed.initialSortId) ? seed.initialSortId : DEFAULT_SORT_ID,
    descending: seed.initialDescending,
    mutedIds: [],
    resolvedIds: [],
    draft: '',
    localUpdates: [],
    cleared: false,
    lastRequest: undefined,
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
      const nextItemIds = itemIds(next.items)
      const choiceIds = reconcileChoiceIds(next.choices, state.choiceIds)
      const selectedId =
        state.selectedId === ''
          ? ''
          : nextItemIds.includes(state.selectedId)
            ? state.selectedId
            : initialSelectedId(next)
      const expandedIds = reconcileExpandedIds(next.items, state.items, state.expandedIds)
      const expandedGroupIds = reconcileExpandedGroupIds(next.groups, state.groups, state.expandedGroupIds)
      const mutedIds = state.mutedIds.filter((id) => nextItemIds.includes(id))
      const resolvedIds = state.resolvedIds.filter((id) => nextItemIds.includes(id))
      const nextView: Pick<
        MonitoringPreviewModelState,
        'query' | 'choiceIds' | 'selectedId' | 'expandedIds' | 'expandedGroupIds'
      > = {
        query: state.query,
        choiceIds,
        selectedId,
        expandedIds,
        expandedGroupIds,
      }
      const nextRequest = state.lastRequest ? actionFromRequest(state.lastRequest) : undefined
      const preserveRequest =
        state.lastRequest !== undefined &&
        sameTargetContext(state, nextView) &&
        nextRequest !== undefined &&
        allowsRequest(next.requestActions, nextRequest) &&
        requestStillTargetsSource(
          state,
          { ...state, items: next.items, groups: next.groups, choices: next.choices },
          state.lastRequest,
        )

      set({
        ownerId: next.ownerId,
        variant: next.variant,
        fixtureId: next.fixtureId,
        items: next.items,
        choices: next.choices,
        groups: next.groups,
        requestActions: next.requestActions,
        choiceIds,
        selectedId,
        expandedIds,
        expandedGroupIds,
        mutedIds,
        resolvedIds,
        lastRequest: preserveRequest ? state.lastRequest : undefined,
      })
      return true
    },
    setQuery(ownerId, value) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (state.query !== value) set({ query: value, lastRequest: undefined })
      return true
    },
    choose(ownerId, field, id) {
      const state = get()
      if (!ownsState(state, ownerId) || !isChoiceField(field) || !isNonblank(id)) return false
      const choice = state.choices.find((candidate) => candidate.field === field)
      if (!choice || !choice.ids.includes(id)) return false
      if (state.choiceIds[field] === id) return true
      set({ choiceIds: { ...state.choiceIds, [field]: id }, lastRequest: undefined })
      return true
    },
    select(ownerId, id) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblank(id) || !state.items.some((item) => item.id === id)) return false
      if (state.selectedId !== id) set({ selectedId: id, lastRequest: undefined })
      return true
    },
    expand(ownerId, id) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblank(id) || !state.items.some((item) => item.id === id)) return false
      const expandedIds = state.expandedIds.includes(id)
        ? state.expandedIds.filter((candidate) => candidate !== id)
        : [...state.expandedIds, id]
      set({ expandedIds, lastRequest: undefined })
      return true
    },
    group(ownerId, id) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'groups') || !isNonblank(id)) return false
      if (!state.groups.some((group) => group.id === id)) return false
      const expandedGroupIds = state.expandedGroupIds.includes(id)
        ? state.expandedGroupIds.filter((candidate) => candidate !== id)
        : [...state.expandedGroupIds, id]
      set({ expandedGroupIds, lastRequest: undefined })
      return true
    },
    allGroups(ownerId, expanded) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'groups')) return false
      const expandedGroupIds = expanded ? [...groupIds(state.groups)] : []
      if (sameIds(state.expandedGroupIds, expandedGroupIds)) return true
      set({ expandedGroupIds, lastRequest: undefined })
      return true
    },
    sort(ownerId, sortId, explicitDescending) {
      const state = get()
      if (!ownsState(state, ownerId) || !isSortId(sortId)) return false
      const descending = explicitDescending ?? (state.sortId === sortId ? !state.descending : false)
      if (state.sortId !== sortId || state.descending !== descending)
        set({ sortId, descending, lastRequest: undefined })
      return true
    },
    pause(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      set({ paused: !state.paused, lastRequest: undefined })
      return true
    },
    toggleFollow(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      set({ follow: !state.follow, lastRequest: undefined })
      return true
    },
    toggleAttention(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'attention')) return false
      set({ attention: !state.attention, lastRequest: undefined })
      return true
    },
    silence(ownerId, id) {
      const state = get()
      if (
        !ownsState(state, ownerId) ||
        !actionAllowedForVariant(state, 'alerts') ||
        !isNonblank(id) ||
        !state.items.some((item) => item.id === id)
      )
        return false
      const mutedIds = state.mutedIds.includes(id)
        ? state.mutedIds.filter((candidate) => candidate !== id)
        : [...state.mutedIds, id]
      set({ mutedIds, lastRequest: undefined })
      return true
    },
    silenceFiring(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'alerts')) return false
      const resolved = new Set(state.resolvedIds)
      const muted = new Set(state.mutedIds)
      for (const item of state.items) {
        if (item.stateId === 'firing' && !resolved.has(item.id)) muted.add(item.id)
      }
      const mutedIds = state.items.map((item) => item.id).filter((id) => muted.has(id))
      if (sameIds(state.mutedIds, mutedIds)) return true
      set({ mutedIds, lastRequest: undefined })
      return true
    },
    resolve(ownerId, id) {
      const state = get()
      if (
        !ownsState(state, ownerId) ||
        !actionAllowedForVariant(state, 'alerts') ||
        !isNonblank(id) ||
        !state.items.some((item) => item.id === id)
      )
        return false
      if (state.resolvedIds.includes(id)) return true
      set({ resolvedIds: [...state.resolvedIds, id], lastRequest: undefined })
      return true
    },
    resetAlerts(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'alerts')) return false
      if (state.mutedIds.length === 0 && state.resolvedIds.length === 0) return true
      set({ mutedIds: [], resolvedIds: [], lastRequest: undefined })
      return true
    },
    setDraft(ownerId, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'draft') || value.length > MAX_DRAFT_LENGTH)
        return false
      if (state.draft !== value) set({ draft: value, lastRequest: undefined })
      return true
    },
    post(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'draft') || !isNonblank(state.draft))
        return false
      let suffix = state.localUpdates.length + 1
      let id = `local-update-${suffix}`
      while (state.localUpdates.some((update) => update.id === id)) {
        suffix += 1
        id = `local-update-${suffix}`
      }
      const localUpdates = [
        ...state.localUpdates,
        { id, body: state.draft, statusId: state.choiceIds.status ?? MONITORING_LOCAL_UPDATE_STATUS_ID },
      ].slice(-MAX_LOCAL_UPDATES)
      set({ localUpdates, draft: '', lastRequest: undefined })
      return true
    },
    clear(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId) || !actionAllowedForVariant(state, 'clear')) return false
      if (!state.cleared) set({ cleared: true, lastRequest: undefined })
      return true
    },
    request(ownerId, actionId, value) {
      const state = get()
      const request: MonitoringPreviewRequest = value === undefined ? { actionId } : { actionId, value }
      if (
        !ownsState(state, ownerId) ||
        !allowsRequest(state.requestActions, request) ||
        sameRequest(state.lastRequest, request)
      )
        return false
      set({ lastRequest: request })
      return true
    },
  }))
}

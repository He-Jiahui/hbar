import { createStore, type StoreApi } from 'zustand/vanilla'
import type { LumenKanbanContent } from '@lumen/app-ui/catalog'

export type KanbanPreviewVariant = 1 | 2 | 3 | 4 | 5 | 6

export interface KanbanPositionColumn {
  readonly id: string
  readonly cardIds: readonly string[]
}

export interface KanbanPositionLane {
  readonly id: string
  readonly columns: readonly KanbanPositionColumn[]
}

export interface KanbanRegroupValues {
  readonly id: string
  readonly statusId: string
  readonly assigneeId: string
  readonly priorityId: string
}

export interface KanbanNewBoardCard {
  readonly id: string
  readonly label: string
  readonly tag: string
  readonly assignee: string
  readonly assigneeName: string
  readonly priority: 'high' | 'medium' | 'low'
}

export interface KanbanBoardSeed {
  readonly kind: 'board'
  readonly columns: readonly KanbanPositionColumn[]
  readonly cardIds: readonly string[]
  readonly composerColumnId: string | null
  readonly draft: string
}

export interface KanbanSwimlaneSeed {
  readonly kind: 'swimlanes'
  readonly stages: readonly string[]
  readonly lanes: readonly KanbanPositionLane[]
  readonly collapsedLaneIds: readonly string[]
}

export interface KanbanRegroupSeed {
  readonly kind: 'regroup'
  readonly groups: readonly string[]
  readonly columns: Readonly<Record<string, readonly string[]>>
  readonly cards: readonly KanbanRegroupValues[]
  readonly groupId: string
}

export interface KanbanDetailSeed {
  readonly kind: 'detail'
  readonly columns: readonly string[]
  readonly cardIds: readonly string[]
  readonly statusByCard: Readonly<Record<string, string>>
  readonly selectedCardId: string | null
}

export interface KanbanSprintSeed {
  readonly kind: 'sprint'
  readonly stages: readonly string[]
  readonly cardIds: readonly string[]
  readonly stageByCard: Readonly<Record<string, string>>
}

export interface KanbanCompactSeed {
  readonly kind: 'compact'
  readonly columns: readonly string[]
  readonly cardIds: readonly string[]
  readonly columnByCard: Readonly<Record<string, string>>
  readonly selectedColumnId: string
}

export type KanbanPreviewSeedData =
  KanbanBoardSeed | KanbanSwimlaneSeed | KanbanRegroupSeed | KanbanDetailSeed | KanbanSprintSeed | KanbanCompactSeed

export interface KanbanPreviewSeed {
  readonly ownerId: string
  readonly variant: KanbanPreviewVariant
  readonly fixtureId: string
  readonly data: KanbanPreviewSeedData
}

type Announcement =
  | { readonly kind: 'grabbed'; readonly cardId: string; readonly groupId?: string }
  | { readonly kind: 'dropped'; readonly cardId: string; readonly targetId?: string }
  | { readonly kind: 'added'; readonly title: string }
  | { readonly kind: 'moved'; readonly cardId: string; readonly targetId: string }

interface BoardRuntime extends KanbanBoardSeed {
  readonly addedCards: readonly KanbanNewBoardCard[]
  readonly grabbedCardId: string | null
  readonly targetColumnId: string | null
  readonly announcement: Announcement | undefined
  readonly dragSnapshot: readonly KanbanPositionColumn[] | undefined
}

interface SwimlaneRuntime extends KanbanSwimlaneSeed {
  readonly grabbedCardId: string | null
  readonly announcement: Announcement | undefined
  readonly dragSnapshot: readonly KanbanPositionLane[] | undefined
}

interface RegroupRuntime extends KanbanRegroupSeed {
  readonly grabbedCardId: string | null
  readonly announcement: Announcement | undefined
  readonly dragSnapshot: readonly KanbanRegroupValues[] | undefined
}

interface DetailRuntime extends KanbanDetailSeed {
  readonly grabbedCardId: string | null
  readonly announcement: Announcement | undefined
  readonly dragSnapshot: Readonly<Record<string, string>> | undefined
}

interface SprintRuntime extends KanbanSprintSeed {
  readonly grabbedCardId: string | null
  readonly announcement: Announcement | undefined
  readonly dragSnapshot: Readonly<Record<string, string>> | undefined
}

interface CompactRuntime extends KanbanCompactSeed {
  readonly announcement: Announcement | undefined
}

export type KanbanPreviewRuntime =
  BoardRuntime | SwimlaneRuntime | RegroupRuntime | DetailRuntime | SprintRuntime | CompactRuntime

export interface KanbanPreviewModelState {
  readonly ownerId: string
  readonly variant: KanbanPreviewVariant
  readonly fixtureId: string
  readonly data: KanbanPreviewRuntime
  readonly refresh: (seed: KanbanPreviewSeed) => boolean
  readonly boardOpenComposer: (ownerId: string, columnId: string) => boolean
  readonly boardDraft: (ownerId: string, value: string) => boolean
  readonly boardCancelComposer: (ownerId: string) => boolean
  readonly boardAddCard: (
    ownerId: string,
    newCardTag: string,
    defaultAssignee: { readonly id: string; readonly name: string },
  ) => boolean
  readonly boardGrab: (ownerId: string, cardId: string, columnId: string) => boolean
  readonly boardTargetChange: (ownerId: string, columnId: string) => boolean
  readonly boardDrop: (ownerId: string, cardId: string, columnId: string) => boolean
  readonly boardCancelGrab: (ownerId: string) => boolean
  readonly swimToggleLane: (ownerId: string, laneId: string) => boolean
  readonly swimToggleAll: (ownerId: string) => boolean
  readonly swimGrab: (ownerId: string, cardId: string) => boolean
  readonly swimMove: (ownerId: string, cardId: string, laneId: string, stageId: string) => boolean
  readonly swimDrop: (ownerId: string, cardId: string) => boolean
  readonly swimCancelGrab: (ownerId: string) => boolean
  readonly regroupGroupChange: (ownerId: string, groupId: string) => boolean
  readonly regroupGrab: (ownerId: string, cardId: string) => boolean
  readonly regroupMove: (ownerId: string, cardId: string, groupId: string, columnId: string) => boolean
  readonly regroupDrop: (ownerId: string, cardId: string, columnId: string) => boolean
  readonly regroupCancelGrab: (ownerId: string) => boolean
  readonly detailSelect: (ownerId: string, cardId: string) => boolean
  readonly detailClose: (ownerId: string) => boolean
  readonly detailGrab: (ownerId: string, cardId: string) => boolean
  readonly detailMove: (ownerId: string, cardId: string, columnId: string) => boolean
  readonly detailCancelGrab: (ownerId: string) => boolean
  readonly sprintGrab: (ownerId: string, cardId: string) => boolean
  readonly sprintMove: (ownerId: string, cardId: string, stageId: string) => boolean
  readonly sprintDrop: (ownerId: string, cardId: string, stageId: string) => boolean
  readonly sprintCancelGrab: (ownerId: string) => boolean
  readonly compactSelectColumn: (ownerId: string, columnId: string) => boolean
  readonly compactMove: (ownerId: string, cardId: string, columnId: string) => boolean
}

export type KanbanPreviewStoreApi = StoreApi<KanbanPreviewModelState>

const MAX_DRAFT_LENGTH = 240
const MAX_CARDS = 160

function nonblank(value: string): boolean {
  return value.trim().length > 0
}

function firstUnique<T extends { readonly id: string }>(values: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const value of values) {
    if (!nonblank(value.id) || seen.has(value.id)) continue
    seen.add(value.id)
    result.push(value)
  }
  return result
}

function uniqueIds(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!nonblank(value) || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function validColumnIds(columns: readonly KanbanPositionColumn[]): readonly string[] {
  return columns.map(({ id }) => id)
}

function normalizePositions(
  columns: readonly KanbanPositionColumn[],
  cardIds: readonly string[],
): readonly KanbanPositionColumn[] {
  const allowed = new Set(cardIds)
  const seenCards = new Set<string>()
  const result: KanbanPositionColumn[] = []
  for (const column of firstUnique(columns)) {
    const ids: string[] = []
    for (const id of column.cardIds) {
      if (allowed.has(id) && !seenCards.has(id)) {
        seenCards.add(id)
        ids.push(id)
      }
    }
    result.push({ id: column.id, cardIds: ids })
  }
  const first = result[0]
  if (first) {
    const missing = cardIds.filter((id) => !seenCards.has(id))
    if (missing.length) result[0] = { ...first, cardIds: [...first.cardIds, ...missing] }
  }
  return result
}

function normalizeLanes(
  lanes: readonly KanbanPositionLane[],
  cardIds: readonly string[],
): readonly KanbanPositionLane[] {
  const allowed = new Set(cardIds)
  const seenCards = new Set<string>()
  const result: KanbanPositionLane[] = []
  for (const lane of firstUnique(lanes)) {
    const columns: KanbanPositionColumn[] = []
    for (const column of firstUnique(lane.columns)) {
      const ids: string[] = []
      for (const id of column.cardIds) {
        if (allowed.has(id) && !seenCards.has(id)) {
          seenCards.add(id)
          ids.push(id)
        }
      }
      columns.push({ id: column.id, cardIds: ids })
    }
    result.push({ id: lane.id, columns })
  }
  const firstLane = result[0]
  const firstColumn = firstLane?.columns[0]
  if (firstLane && firstColumn) {
    const missing = cardIds.filter((id) => !seenCards.has(id))
    if (missing.length) {
      result[0] = {
        ...firstLane,
        columns: [{ ...firstColumn, cardIds: [...firstColumn.cardIds, ...missing] }, ...firstLane.columns.slice(1)],
      }
    }
  }
  return result
}

function normalizeSeed(seed: KanbanPreviewSeed): KanbanPreviewSeed {
  const data = seed.data
  if (data.kind === 'board') {
    const columns = normalizePositions(data.columns, uniqueIds(data.cardIds))
    const columnIds = new Set(validColumnIds(columns))
    return {
      ...seed,
      data: {
        ...data,
        columns,
        cardIds: uniqueIds(data.cardIds),
        composerColumnId: data.composerColumnId && columnIds.has(data.composerColumnId) ? data.composerColumnId : null,
        draft: data.draft.slice(0, MAX_DRAFT_LENGTH),
      },
    }
  }
  if (data.kind === 'swimlanes') {
    const stages = uniqueIds(data.stages)
    const lanes = normalizeLanes(
      data.lanes,
      uniqueIds(data.lanes.flatMap((lane) => lane.columns.flatMap((column) => column.cardIds))),
    )
    const laneIds = new Set(lanes.map(({ id }) => id))
    return {
      ...seed,
      data: {
        ...data,
        stages,
        lanes,
        collapsedLaneIds: uniqueIds(data.collapsedLaneIds).filter((id) => laneIds.has(id)),
      },
    }
  }
  if (data.kind === 'regroup') {
    const groups = uniqueIds(data.groups)
    const columns: Record<string, readonly string[]> = {}
    for (const group of groups) columns[group] = uniqueIds(data.columns[group] ?? [])
    const groupId = groups.includes(data.groupId) ? data.groupId : (groups[0] ?? '')
    const normalizedCards = firstUnique(data.cards).map((card) => ({
      id: card.id,
      statusId: columns.status?.includes(card.statusId) ? card.statusId : (columns.status?.[0] ?? ''),
      assigneeId: columns.assignee?.includes(card.assigneeId) ? card.assigneeId : (columns.assignee?.[0] ?? ''),
      priorityId: columns.priority?.includes(card.priorityId) ? card.priorityId : (columns.priority?.[0] ?? ''),
    }))
    return { ...seed, data: { ...data, groups, columns, cards: normalizedCards, groupId } }
  }
  if (data.kind === 'detail') {
    const columns = uniqueIds(data.columns)
    const cardIds = uniqueIds(data.cardIds)
    const statuses: Record<string, string> = {}
    for (const id of cardIds)
      statuses[id] = columns.includes(data.statusByCard[id] ?? '') ? data.statusByCard[id]! : (columns[0] ?? '')
    const selectedCardId =
      data.selectedCardId === null
        ? null
        : data.selectedCardId && cardIds.includes(data.selectedCardId)
          ? data.selectedCardId
          : (cardIds[0] ?? null)
    return { ...seed, data: { ...data, columns, cardIds, statusByCard: statuses, selectedCardId } }
  }
  if (data.kind === 'sprint') {
    const stages = uniqueIds(data.stages)
    const cardIds = uniqueIds(data.cardIds)
    const stageByCard: Record<string, string> = {}
    for (const id of cardIds)
      stageByCard[id] = stages.includes(data.stageByCard[id] ?? '') ? data.stageByCard[id]! : (stages[0] ?? '')
    return { ...seed, data: { ...data, stages, cardIds, stageByCard } }
  }
  const columns = uniqueIds(data.columns)
  const cardIds = uniqueIds(data.cardIds)
  const columnByCard: Record<string, string> = {}
  for (const id of cardIds)
    columnByCard[id] = columns.includes(data.columnByCard[id] ?? '') ? data.columnByCard[id]! : (columns[0] ?? '')
  return {
    ...seed,
    data: {
      ...data,
      columns,
      cardIds,
      columnByCard,
      selectedColumnId: columns.includes(data.selectedColumnId) ? data.selectedColumnId : (columns[0] ?? ''),
    },
  }
}

function ownerMatches(state: KanbanPreviewModelState, ownerId: string): boolean {
  return nonblank(ownerId) && ownerId === state.ownerId && nonblank(state.ownerId)
}

function copyColumns(columns: readonly KanbanPositionColumn[]): readonly KanbanPositionColumn[] {
  return columns.map((column) => ({ ...column, cardIds: [...column.cardIds] }))
}

function copyLanes(lanes: readonly KanbanPositionLane[]): readonly KanbanPositionLane[] {
  return lanes.map((lane) => ({ ...lane, columns: copyColumns(lane.columns) }))
}

function boardCardExists(data: BoardRuntime, id: string): boolean {
  return data.cardIds.includes(id) || data.addedCards.some((card) => card.id === id)
}

function moveCard(
  columns: readonly KanbanPositionColumn[],
  cardId: string,
  targetId: string,
): readonly KanbanPositionColumn[] {
  const targetExists = columns.some(({ id }) => id === targetId)
  if (!targetExists) return columns
  return columns.map((column) => {
    const without = column.cardIds.filter((id) => id !== cardId)
    return column.id === targetId ? { ...column, cardIds: [...without, cardId] } : { ...column, cardIds: without }
  })
}

function findSwimCard(
  lanes: readonly KanbanPositionLane[],
  cardId: string,
): { laneId: string; stageId: string } | undefined {
  for (const lane of lanes) {
    for (const column of lane.columns)
      if (column.cardIds.includes(cardId)) return { laneId: lane.id, stageId: column.id }
  }
  return undefined
}

function moveSwimCard(
  lanes: readonly KanbanPositionLane[],
  cardId: string,
  laneId: string,
  stageId: string,
): readonly KanbanPositionLane[] {
  if (!lanes.some((lane) => lane.id === laneId && lane.columns.some((column) => column.id === stageId))) return lanes
  const card = lanes.flatMap((lane) => lane.columns).some((column) => column.cardIds.includes(cardId))
  if (!card) return lanes
  return lanes.map((lane) => ({
    ...lane,
    columns: lane.columns.map((column) => {
      const ids = column.cardIds.filter((id) => id !== cardId)
      return lane.id === laneId && column.id === stageId
        ? { ...column, cardIds: [...ids, cardId] }
        : { ...column, cardIds: ids }
    }),
  }))
}

function sameDataIdentity(state: KanbanPreviewModelState, seed: KanbanPreviewSeed): boolean {
  return state.ownerId === seed.ownerId && state.variant === seed.variant && state.fixtureId === seed.fixtureId
}

function runtimeFromSeed(seed: KanbanPreviewSeed): KanbanPreviewRuntime {
  const data = seed.data
  if (data.kind === 'board')
    return {
      ...data,
      addedCards: [],
      grabbedCardId: null,
      targetColumnId: null,
      announcement: undefined,
      dragSnapshot: undefined,
    }
  if (data.kind === 'swimlanes')
    return { ...data, grabbedCardId: null, announcement: undefined, dragSnapshot: undefined }
  if (data.kind === 'regroup') return { ...data, grabbedCardId: null, announcement: undefined, dragSnapshot: undefined }
  if (data.kind === 'detail') return { ...data, grabbedCardId: null, announcement: undefined, dragSnapshot: undefined }
  if (data.kind === 'sprint') return { ...data, grabbedCardId: null, announcement: undefined, dragSnapshot: undefined }
  return { ...data, announcement: undefined }
}

function nextBoardCardId(data: BoardRuntime): string {
  const existing = new Set([...data.cardIds, ...data.addedCards.map(({ id }) => id)])
  const numbered = [...existing].flatMap((id) => {
    const match = id.match(/^(.*?)(\d+)$/)
    return match?.[1] !== undefined && match[2] !== undefined ? [{ prefix: match[1], number: Number(match[2]) }] : []
  })
  const source = numbered.sort((left, right) => right.number - left.number)[0]
  const prefix = source?.prefix ?? 'local-'
  let index = (source?.number ?? 0) + 1
  while (existing.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

function committedRuntime(data: KanbanPreviewRuntime): KanbanPreviewRuntime {
  // Refresh cancels an unfinished gesture rather than committing its preview.
  if (!('dragSnapshot' in data) || !data.dragSnapshot) return data
  switch (data.kind) {
    case 'board':
      return { ...data, columns: data.dragSnapshot }
    case 'swimlanes':
      return { ...data, lanes: data.dragSnapshot }
    case 'regroup':
      return { ...data, cards: data.dragSnapshot }
    case 'detail':
      return { ...data, statusByCard: data.dragSnapshot }
    case 'sprint':
      return { ...data, stageByCard: data.dragSnapshot }
  }
}

function reconcileRuntime(previousInput: KanbanPreviewRuntime, nextSeed: KanbanPreviewSeed): KanbanPreviewRuntime {
  const previous = committedRuntime(previousInput)
  const next = runtimeFromSeed(nextSeed)
  if (previous.kind === 'board' && next.kind === 'board') {
    const nextIds = new Set(next.cardIds)
    const addedCards = previous.addedCards.filter((card) => !nextIds.has(card.id))
    const previousColumns = previous.columns.filter(({ id }) => next.columns.some((column) => column.id === id))
    const previousCardIds = new Set([...next.cardIds, ...addedCards.map(({ id }) => id)])
    const mergedColumns = next.columns.map((column) => {
      const old = previousColumns.find((candidate) => candidate.id === column.id)
      const ids = old?.cardIds.filter((id) => previousCardIds.has(id)) ?? column.cardIds
      return { ...column, cardIds: ids.filter((id, index, all) => all.indexOf(id) === index) }
    })
    const placed = new Set(mergedColumns.flatMap(({ cardIds }) => cardIds))
    // Incoming records use the host's own column, not an unrelated first-column default.
    for (const seededColumn of next.columns) {
      const index = mergedColumns.findIndex(({ id }) => id === seededColumn.id)
      const column = mergedColumns[index]
      if (!column) continue
      const incoming = seededColumn.cardIds.filter((id) => !placed.has(id))
      mergedColumns[index] = { ...column, cardIds: [...column.cardIds, ...incoming] }
      for (const id of incoming) placed.add(id)
    }
    const missing = [...next.cardIds, ...addedCards.map(({ id }) => id)].filter((id) => !placed.has(id))
    if (mergedColumns[0] && missing.length)
      mergedColumns[0] = { ...mergedColumns[0], cardIds: [...mergedColumns[0].cardIds, ...missing] }
    return {
      ...next,
      columns: mergedColumns,
      cardIds: [...next.cardIds, ...addedCards.map(({ id }) => id)],
      addedCards,
      composerColumnId:
        previous.composerColumnId && mergedColumns.some(({ id }) => id === previous.composerColumnId)
          ? previous.composerColumnId
          : null,
      draft:
        previous.composerColumnId && mergedColumns.some(({ id }) => id === previous.composerColumnId)
          ? previous.draft.slice(0, MAX_DRAFT_LENGTH)
          : '',
    }
  }
  if (previous.kind === 'swimlanes' && next.kind === 'swimlanes') {
    const validLanes = new Set(next.lanes.map(({ id }) => id))
    const collapsedLaneIds = previous.collapsedLaneIds.filter((id) => validLanes.has(id))
    const previousCardPositions = new Map<string, { readonly laneId: string; readonly columnId: string }>()
    for (const lane of previous.lanes) {
      for (const column of lane.columns) {
        for (const id of column.cardIds) previousCardPositions.set(id, { laneId: lane.id, columnId: column.id })
      }
    }
    const nextCardIds = new Set(next.lanes.flatMap((lane) => lane.columns.flatMap((column) => column.cardIds)))
    const seedPositions = new Map<string, { readonly laneId: string; readonly columnId: string }>()
    for (const lane of next.lanes)
      for (const column of lane.columns)
        for (const id of column.cardIds)
          if (!seedPositions.has(id)) seedPositions.set(id, { laneId: lane.id, columnId: column.id })
    const nextPositionKeys = new Set(
      next.lanes.flatMap((lane) => lane.columns.map((column) => `${lane.id}\u0000${column.id}`)),
    )
    const destination = new Map<string, { readonly laneId: string; readonly columnId: string }>()
    for (const id of nextCardIds) {
      const previous = previousCardPositions.get(id)
      const seeded = seedPositions.get(id)
      const previousKey = previous ? `${previous.laneId}\u0000${previous.columnId}` : ''
      if (previous && nextPositionKeys.has(previousKey)) destination.set(id, previous)
      else if (seeded) destination.set(id, seeded)
    }
    const orderByPosition = new Map<string, string[]>()
    const sourceOrder = previous.lanes.flatMap((lane) => lane.columns.flatMap((column) => column.cardIds))
    const seedOrder = next.lanes.flatMap((lane) => lane.columns.flatMap((column) => column.cardIds))
    for (const id of [...sourceOrder, ...seedOrder]) {
      const position = destination.get(id)
      if (!position) continue
      const key = `${position.laneId}\u0000${position.columnId}`
      const list = orderByPosition.get(key) ?? []
      if (!list.includes(id)) list.push(id)
      orderByPosition.set(key, list)
    }
    const lanes = next.lanes.map((lane) => ({
      ...lane,
      columns: lane.columns.map((column) => {
        const key = `${lane.id}\u0000${column.id}`
        return { ...column, cardIds: orderByPosition.get(key) ?? [] }
      }),
    }))
    return { ...next, lanes, collapsedLaneIds }
  }
  if (previous.kind === 'regroup' && next.kind === 'regroup') {
    const nextCards = next.cards.map((card) => {
      const previousCard = previous.cards.find(({ id }) => id === card.id)
      if (!previousCard) return card
      return {
        ...card,
        statusId: next.columns.status?.includes(previousCard.statusId) ? previousCard.statusId : card.statusId,
        assigneeId: next.columns.assignee?.includes(previousCard.assigneeId)
          ? previousCard.assigneeId
          : card.assigneeId,
        priorityId: next.columns.priority?.includes(previousCard.priorityId)
          ? previousCard.priorityId
          : card.priorityId,
      }
    })
    return {
      ...next,
      cards: nextCards,
      groupId: next.groups.includes(previous.groupId) ? previous.groupId : next.groupId,
    }
  }
  if (previous.kind === 'detail' && next.kind === 'detail') {
    const statusByCard: Record<string, string> = {}
    for (const id of next.cardIds)
      statusByCard[id] = next.columns.includes(previous.statusByCard[id] ?? '')
        ? previous.statusByCard[id]!
        : next.statusByCard[id]!
    return {
      ...next,
      statusByCard,
      selectedCardId:
        previous.selectedCardId === null
          ? null
          : previous.selectedCardId && next.cardIds.includes(previous.selectedCardId)
            ? previous.selectedCardId
            : next.selectedCardId,
    }
  }
  if (previous.kind === 'sprint' && next.kind === 'sprint') {
    const stageByCard: Record<string, string> = {}
    for (const id of next.cardIds)
      stageByCard[id] = next.stages.includes(previous.stageByCard[id] ?? '')
        ? previous.stageByCard[id]!
        : next.stageByCard[id]!
    return { ...next, stageByCard }
  }
  if (previous.kind === 'compact' && next.kind === 'compact') {
    const columnByCard: Record<string, string> = {}
    for (const id of next.cardIds)
      columnByCard[id] = next.columns.includes(previous.columnByCard[id] ?? '')
        ? previous.columnByCard[id]!
        : next.columnByCard[id]!
    return {
      ...next,
      columnByCard,
      selectedColumnId: next.columns.includes(previous.selectedColumnId)
        ? previous.selectedColumnId
        : next.selectedColumnId,
    }
  }
  return next
}

/** Creates an owner-scoped, variant-specific store for the Kanban preview. */
export function createKanbanPreviewStore(input: KanbanPreviewSeed): KanbanPreviewStoreApi {
  const seed = normalizeSeed(input)
  return createStore<KanbanPreviewModelState>((set, get) => ({
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    data: runtimeFromSeed(seed),
    refresh(nextInput) {
      const state = get()
      if (!sameDataIdentity(state, nextInput)) return false
      const normalized = normalizeSeed(nextInput)
      set({ data: reconcileRuntime(state.data, normalized) })
      return true
    },
    boardOpenComposer(ownerId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 1 ||
        state.data.kind !== 'board' ||
        !state.data.columns.some(({ id }) => id === columnId)
      )
        return false
      set({ data: { ...state.data, composerColumnId: columnId, draft: '', announcement: undefined } })
      return true
    },
    boardDraft(ownerId, value) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 1 ||
        state.data.kind !== 'board' ||
        state.data.composerColumnId === null
      )
        return false
      set({ data: { ...state.data, draft: value.slice(0, MAX_DRAFT_LENGTH) } })
      return true
    },
    boardCancelComposer(ownerId) {
      const state = get()
      if (!ownerMatches(state, ownerId) || state.variant !== 1 || state.data.kind !== 'board') return false
      set({ data: { ...state.data, composerColumnId: null, draft: '' } })
      return true
    },
    boardAddCard(ownerId, newCardTag, defaultAssignee) {
      const state = get()
      if (!ownerMatches(state, ownerId) || state.variant !== 1 || state.data.kind !== 'board') return false
      const data = state.data
      const title = data.draft.trim()
      if (
        !data.composerColumnId ||
        !nonblank(title) ||
        !nonblank(newCardTag) ||
        !nonblank(defaultAssignee.id) ||
        !nonblank(defaultAssignee.name) ||
        data.cardIds.length >= MAX_CARDS
      )
        return false
      const id = nextBoardCardId(data)
      const card: KanbanNewBoardCard = {
        id,
        label: title,
        tag: newCardTag,
        assignee: defaultAssignee.id,
        assigneeName: defaultAssignee.name,
        priority: 'medium',
      }
      set({
        data: {
          ...data,
          cardIds: [...data.cardIds, id],
          columns: data.columns.map((column) =>
            column.id === data.composerColumnId ? { ...column, cardIds: [id, ...column.cardIds] } : column,
          ),
          addedCards: [...data.addedCards, card],
          composerColumnId: null,
          draft: '',
          announcement: { kind: 'added', title },
        },
      })
      return true
    },
    boardGrab(ownerId, cardId, columnId) {
      const state = get()
      if (!ownerMatches(state, ownerId) || state.variant !== 1 || state.data.kind !== 'board') return false
      const data = state.data
      if (
        !boardCardExists(data, cardId) ||
        !data.columns.some(({ id, cardIds }) => id === columnId && cardIds.includes(cardId))
      )
        return false
      set({
        data: {
          ...data,
          grabbedCardId: cardId,
          targetColumnId: columnId,
          dragSnapshot: copyColumns(data.columns),
          announcement: { kind: 'grabbed', cardId },
        },
      })
      return true
    },
    boardTargetChange(ownerId, columnId) {
      const state = get()
      if (!ownerMatches(state, ownerId) || state.variant !== 1 || state.data.kind !== 'board') return false
      const data = state.data
      const grabbedCardId = data.grabbedCardId
      if (!grabbedCardId || !data.columns.some(({ id }) => id === columnId)) return false
      set({ data: { ...data, columns: moveCard(data.columns, grabbedCardId, columnId), targetColumnId: columnId } })
      return true
    },
    boardDrop(ownerId, cardId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 1 ||
        state.data.kind !== 'board' ||
        state.data.grabbedCardId !== cardId ||
        !state.data.columns.some(({ id }) => id === columnId)
      )
        return false
      const data = state.data
      const columns = data.targetColumnId === columnId ? data.columns : moveCard(data.columns, cardId, columnId)
      set({
        data: {
          ...data,
          columns,
          grabbedCardId: null,
          targetColumnId: null,
          dragSnapshot: undefined,
          announcement: { kind: 'dropped', cardId, targetId: columnId },
        },
      })
      return true
    },
    boardCancelGrab(ownerId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 1 ||
        state.data.kind !== 'board' ||
        state.data.grabbedCardId === null
      )
        return false
      const data = state.data
      set({
        data: {
          ...data,
          columns: data.dragSnapshot ? copyColumns(data.dragSnapshot) : data.columns,
          grabbedCardId: null,
          targetColumnId: null,
          dragSnapshot: undefined,
          announcement: undefined,
        },
      })
      return true
    },
    swimToggleLane(ownerId, laneId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 2 ||
        state.data.kind !== 'swimlanes' ||
        !state.data.lanes.some(({ id }) => id === laneId)
      )
        return false
      const collapsed = state.data.collapsedLaneIds.includes(laneId)
        ? state.data.collapsedLaneIds.filter((id) => id !== laneId)
        : [...state.data.collapsedLaneIds, laneId]
      set({ data: { ...state.data, collapsedLaneIds: collapsed } })
      return true
    },
    swimToggleAll(ownerId) {
      const state = get()
      if (!ownerMatches(state, ownerId) || state.variant !== 2 || state.data.kind !== 'swimlanes') return false
      const data = state.data
      const all = data.lanes.length > 0 && data.lanes.every(({ id }) => data.collapsedLaneIds.includes(id))
      set({ data: { ...data, collapsedLaneIds: all ? [] : data.lanes.map(({ id }) => id) } })
      return true
    },
    swimGrab(ownerId, cardId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 2 ||
        state.data.kind !== 'swimlanes' ||
        !findSwimCard(state.data.lanes, cardId)
      )
        return false
      set({
        data: {
          ...state.data,
          grabbedCardId: cardId,
          dragSnapshot: copyLanes(state.data.lanes),
          announcement: { kind: 'grabbed', cardId },
        },
      })
      return true
    },
    swimMove(ownerId, cardId, laneId, stageId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 2 ||
        state.data.kind !== 'swimlanes' ||
        state.data.grabbedCardId !== cardId ||
        !state.data.stages.includes(stageId)
      )
        return false
      const lanes = moveSwimCard(state.data.lanes, cardId, laneId, stageId)
      if (lanes === state.data.lanes) return false
      set({ data: { ...state.data, lanes } })
      return true
    },
    swimDrop(ownerId, cardId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 2 ||
        state.data.kind !== 'swimlanes' ||
        state.data.grabbedCardId !== cardId ||
        !findSwimCard(state.data.lanes, cardId)
      )
        return false
      const location = findSwimCard(state.data.lanes, cardId)
      set({
        data: {
          ...state.data,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement:
            location?.stageId === undefined
              ? { kind: 'dropped', cardId }
              : { kind: 'dropped', cardId, targetId: location.stageId },
        },
      })
      return true
    },
    swimCancelGrab(ownerId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 2 ||
        state.data.kind !== 'swimlanes' ||
        state.data.grabbedCardId === null
      )
        return false
      set({
        data: {
          ...state.data,
          lanes: state.data.dragSnapshot ? copyLanes(state.data.dragSnapshot) : state.data.lanes,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: undefined,
        },
      })
      return true
    },
    regroupGroupChange(ownerId, groupId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 3 ||
        state.data.kind !== 'regroup' ||
        !state.data.groups.includes(groupId)
      )
        return false
      const data = state.data
      set({
        data: {
          ...data,
          groupId,
          cards: data.dragSnapshot ? data.dragSnapshot : data.cards,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: undefined,
        },
      })
      return true
    },
    regroupGrab(ownerId, cardId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 3 ||
        state.data.kind !== 'regroup' ||
        !state.data.cards.some(({ id }) => id === cardId)
      )
        return false
      set({
        data: {
          ...state.data,
          grabbedCardId: cardId,
          dragSnapshot: state.data.cards.map((card) => ({ ...card })),
          announcement: { kind: 'grabbed', cardId, groupId: state.data.groupId },
        },
      })
      return true
    },
    regroupMove(ownerId, cardId, groupId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 3 ||
        state.data.kind !== 'regroup' ||
        state.data.grabbedCardId !== cardId ||
        groupId !== state.data.groupId ||
        !state.data.columns[groupId]?.includes(columnId)
      )
        return false
      const cards = state.data.cards.map((card) => {
        if (card.id !== cardId) return card
        if (groupId === 'assignee') return { ...card, assigneeId: columnId }
        if (groupId === 'priority') return { ...card, priorityId: columnId }
        return { ...card, statusId: columnId }
      })
      set({ data: { ...state.data, cards } })
      return true
    },
    regroupDrop(ownerId, cardId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 3 ||
        state.data.kind !== 'regroup' ||
        state.data.grabbedCardId !== cardId ||
        !state.data.columns[state.data.groupId]?.includes(columnId)
      )
        return false
      const moved = get().regroupMove(ownerId, cardId, state.data.groupId, columnId)
      if (!moved) return false
      const current = get().data
      if (current.kind !== 'regroup') return false
      set({
        data: {
          ...current,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: { kind: 'dropped', cardId, targetId: columnId },
        },
      })
      return true
    },
    regroupCancelGrab(ownerId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 3 ||
        state.data.kind !== 'regroup' ||
        state.data.grabbedCardId === null
      )
        return false
      set({
        data: {
          ...state.data,
          cards: state.data.dragSnapshot ? state.data.dragSnapshot.map((card) => ({ ...card })) : state.data.cards,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: undefined,
        },
      })
      return true
    },
    detailSelect(ownerId, cardId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 4 ||
        state.data.kind !== 'detail' ||
        !state.data.cardIds.includes(cardId)
      )
        return false
      set({ data: { ...state.data, selectedCardId: cardId, announcement: undefined } })
      return true
    },
    detailClose(ownerId) {
      const state = get()
      if (!ownerMatches(state, ownerId) || state.variant !== 4 || state.data.kind !== 'detail') return false
      set({ data: { ...state.data, selectedCardId: null, announcement: undefined } })
      return true
    },
    detailGrab(ownerId, cardId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 4 ||
        state.data.kind !== 'detail' ||
        !state.data.cardIds.includes(cardId)
      )
        return false
      set({
        data: {
          ...state.data,
          grabbedCardId: cardId,
          dragSnapshot: { ...state.data.statusByCard },
          announcement: { kind: 'grabbed', cardId },
        },
      })
      return true
    },
    detailMove(ownerId, cardId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 4 ||
        state.data.kind !== 'detail' ||
        !state.data.cardIds.includes(cardId) ||
        !state.data.columns.includes(columnId)
      )
        return false
      set({
        data: {
          ...state.data,
          statusByCard: { ...state.data.statusByCard, [cardId]: columnId },
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: { kind: 'moved', cardId, targetId: columnId },
        },
      })
      return true
    },
    detailCancelGrab(ownerId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 4 ||
        state.data.kind !== 'detail' ||
        state.data.grabbedCardId === null
      )
        return false
      set({
        data: {
          ...state.data,
          statusByCard: state.data.dragSnapshot ? { ...state.data.dragSnapshot } : state.data.statusByCard,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: undefined,
        },
      })
      return true
    },
    sprintGrab(ownerId, cardId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 5 ||
        state.data.kind !== 'sprint' ||
        !state.data.cardIds.includes(cardId)
      )
        return false
      set({
        data: {
          ...state.data,
          grabbedCardId: cardId,
          dragSnapshot: { ...state.data.stageByCard },
          announcement: { kind: 'grabbed', cardId },
        },
      })
      return true
    },
    sprintMove(ownerId, cardId, stageId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 5 ||
        state.data.kind !== 'sprint' ||
        state.data.grabbedCardId !== cardId ||
        !state.data.stages.includes(stageId)
      )
        return false
      set({ data: { ...state.data, stageByCard: { ...state.data.stageByCard, [cardId]: stageId } } })
      return true
    },
    sprintDrop(ownerId, cardId, stageId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 5 ||
        state.data.kind !== 'sprint' ||
        state.data.grabbedCardId !== cardId ||
        !state.data.stages.includes(stageId)
      )
        return false
      const stageByCard = { ...state.data.stageByCard, [cardId]: stageId }
      set({
        data: {
          ...state.data,
          stageByCard,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: { kind: 'dropped', cardId, targetId: stageId },
        },
      })
      return true
    },
    sprintCancelGrab(ownerId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 5 ||
        state.data.kind !== 'sprint' ||
        state.data.grabbedCardId === null
      )
        return false
      set({
        data: {
          ...state.data,
          stageByCard: state.data.dragSnapshot ? { ...state.data.dragSnapshot } : state.data.stageByCard,
          grabbedCardId: null,
          dragSnapshot: undefined,
          announcement: undefined,
        },
      })
      return true
    },
    compactSelectColumn(ownerId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 6 ||
        state.data.kind !== 'compact' ||
        !state.data.columns.includes(columnId)
      )
        return false
      set({ data: { ...state.data, selectedColumnId: columnId, announcement: undefined } })
      return true
    },
    compactMove(ownerId, cardId, columnId) {
      const state = get()
      if (
        !ownerMatches(state, ownerId) ||
        state.variant !== 6 ||
        state.data.kind !== 'compact' ||
        !state.data.cardIds.includes(cardId) ||
        !state.data.columns.includes(columnId)
      )
        return false
      set({
        data: {
          ...state.data,
          columnByCard: { ...state.data.columnByCard, [cardId]: columnId },
          announcement: { kind: 'moved', cardId, targetId: columnId },
        },
      })
      return true
    },
  }))
}

/** Build a model seed from the host-owned Kanban contract. */
export function createKanbanPreviewSeed(
  content: LumenKanbanContent,
  variant: KanbanPreviewVariant,
  ownerId: string,
  fixtureId: string,
): KanbanPreviewSeed {
  if (variant === 1) {
    const flow = content.referenceBoard
    const columns = flow?.columns ?? content.columns
    const cardIds = (flow?.cards ?? content.cards).map(({ id }) => id)
    return {
      ownerId,
      variant,
      fixtureId,
      data: {
        kind: 'board',
        columns: columns.map(({ id, cardIds: ids }) => ({ id, cardIds: ids })),
        cardIds,
        composerColumnId: flow?.composerColumnId ?? null,
        draft: flow?.draft ?? '',
      },
    }
  }
  if (variant === 2) {
    const flow = content.referenceSwimlanes
    const stages = (flow?.stages ?? content.columns).map(({ id }) => id)
    const lanes = flow?.lanes
      ? flow.lanes.map((lane) => ({
          id: lane.id,
          columns: stages.map((stageId) => ({
            id: stageId,
            cardIds: lane.cards.filter((card) => card.stageId === stageId).map(({ id }) => id),
          })),
        }))
      : content.lanes.map((lane) => ({
          id: lane.id,
          columns: lane.columns.map(({ id, cardIds }) => ({ id, cardIds })),
        }))
    return {
      ownerId,
      variant,
      fixtureId,
      data: { kind: 'swimlanes', stages, lanes, collapsedLaneIds: flow?.collapsedLaneIds ?? [] },
    }
  }
  if (variant === 3) {
    const flow = content.referenceRegroup
    const groups = flow?.groups ?? content.groups
    const columns: Record<string, readonly string[]> = {}
    for (const group of groups) columns[group.id] = (flow?.columns[group.id] ?? []).map(({ id }) => id)
    const cards =
      flow?.cards ??
      content.cards.map((card) => ({
        id: card.id,
        statusId: card.groupValues?.status ?? '',
        assigneeId: card.groupValues?.assignee ?? '',
        priorityId: card.groupValues?.priority ?? '',
      }))
    return {
      ownerId,
      variant,
      fixtureId,
      data: {
        kind: 'regroup',
        groups: groups.map(({ id }) => id),
        columns,
        cards: cards.map(({ id, statusId, assigneeId, priorityId }) => ({ id, statusId, assigneeId, priorityId })),
        groupId: flow?.groupId ?? content.initialGroupId,
      },
    }
  }
  if (variant === 4) {
    const flow = content.referenceDetail
    const cards = firstUnique(
      flow?.cards ??
        content.cards.map((card) => ({
          id: card.id,
          statusId: content.columns.find((column) => column.cardIds.includes(card.id))?.id ?? '',
        })),
    )
    const statusByCard: Record<string, string> = {}
    for (const card of cards) statusByCard[card.id] = card.statusId
    return {
      ownerId,
      variant,
      fixtureId,
      data: {
        kind: 'detail',
        columns: (flow?.columns ?? content.columns).map(({ id }) => id),
        cardIds: cards.map(({ id }) => id),
        statusByCard,
        selectedCardId: flow ? flow.selectedCardId : (cards[0]?.id ?? null),
      },
    }
  }
  if (variant === 5) {
    const flow = content.referenceSprint
    const cards = firstUnique(
      flow?.cards ??
        content.cards.map((card) => ({
          id: card.id,
          stageId: content.columns.find((column) => column.cardIds.includes(card.id))?.id ?? '',
        })),
    )
    const stageByCard: Record<string, string> = {}
    for (const card of cards) stageByCard[card.id] = card.stageId
    return {
      ownerId,
      variant,
      fixtureId,
      data: {
        kind: 'sprint',
        stages: (flow?.stages ?? content.columns).map(({ id }) => id),
        cardIds: cards.map(({ id }) => id),
        stageByCard,
      },
    }
  }
  const flow = content.referenceCompact
  const cards = firstUnique(
    flow?.cards ??
      content.cards.map((card) => ({
        id: card.id,
        columnId: content.compactColumns.find((column) => column.cardIds.includes(card.id))?.id ?? '',
      })),
  )
  const columnByCard: Record<string, string> = {}
  for (const card of cards) columnByCard[card.id] = card.columnId
  return {
    ownerId,
    variant,
    fixtureId,
    data: {
      kind: 'compact',
      columns: (flow?.columns ?? content.compactColumns).map(({ id }) => id),
      cardIds: cards.map(({ id }) => id),
      columnByCard,
      selectedColumnId: flow?.selectedColumnId ?? content.initialCompactColumnId,
    },
  }
}

import { createStore, type StoreApi } from 'zustand/vanilla'

export interface TablePreviewSlotItemSeed {
  readonly id: string
  readonly disabled?: boolean | undefined
}

export interface TablePreviewSelectionSlotSeed {
  readonly id: string
  readonly items: readonly TablePreviewSlotItemSeed[]
  readonly initialSelectedId?: string | undefined
}

export interface TablePreviewEditableFieldSeed {
  readonly id: string
  readonly value: number
  readonly min?: number | undefined
  readonly max?: number | undefined
  readonly locked?: boolean | undefined
}

export interface TablePreviewRowSeed {
  readonly id: string
  readonly disabled?: boolean | undefined
  readonly searchText: string
  readonly categoryId?: string | undefined
  readonly values: Readonly<Record<string, string | number>>
  readonly editable?: readonly TablePreviewEditableFieldSeed[] | undefined
}

export interface TablePreviewFlagSeed {
  readonly id: string
  readonly value: boolean
}

export interface TablePreviewSort {
  readonly field: string
  readonly direction: 'asc' | 'desc'
}

export type TablePreviewRequestAction =
  { readonly actionId: string } | { readonly actionId: string; readonly targetId: string }

export type TablePreviewRequest =
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

export type TablePreviewEditError = 'invalid'

export interface TablePreviewEditDraft {
  readonly ownerId: string
  readonly rowId: string
  readonly fieldId: string
  readonly value: string
}

export interface TablePreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly TablePreviewSelectionSlotSeed[]
  readonly rows: readonly TablePreviewRowSeed[]
  readonly flags: readonly TablePreviewFlagSeed[]
  readonly query?: string | undefined
  readonly sort?: TablePreviewSort | undefined
  readonly page?: number | undefined
  readonly pageSize?: number | undefined
  readonly allowedPageSizes?: readonly number[] | undefined
  /** Source total, which can be greater than the cached rows supplied to the preview. */
  readonly totalRows?: number | undefined
  readonly requestActions: readonly TablePreviewRequestAction[]
}

export interface TablePreviewModelState {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly TablePreviewSelectionSlotSeed[]
  readonly rows: readonly TablePreviewRowSeed[]
  readonly rowsById: Readonly<Record<string, TablePreviewRowSeed>>
  readonly flags: readonly TablePreviewFlagSeed[]
  readonly requestActions: readonly TablePreviewRequestAction[]
  readonly selectedBySlot: Readonly<Record<string, string | undefined>>
  readonly flagsById: Readonly<Record<string, boolean>>
  readonly query: string
  readonly sort: TablePreviewSort | undefined
  readonly page: number
  readonly pageSize: number
  readonly allowedPageSizes: readonly number[]
  readonly totalRows: number | undefined
  readonly filteredRowIds: readonly string[]
  readonly visibleRowIds: readonly string[]
  readonly editDraft: TablePreviewEditDraft | undefined
  readonly editError: TablePreviewEditError | undefined
  readonly lastRequest: TablePreviewRequest | undefined
  readonly select: (ownerId: string, slotId: string, itemId: string) => boolean
  readonly setQuery: (ownerId: string, value: string) => boolean
  readonly setFlag: (ownerId: string, id: string, value: boolean) => boolean
  readonly setSort: (ownerId: string, sort: TablePreviewSort) => boolean
  readonly setPage: (ownerId: string, page: number) => boolean
  readonly setPageSize: (ownerId: string, pageSize: number) => boolean
  readonly beginEdit: (ownerId: string, rowId: string, fieldId: string) => boolean
  readonly setEditDraft: (
    ownerId: string,
    valueOrRowId: string | number,
    fieldId?: string,
    value?: string | number,
  ) => boolean
  readonly commitEdit: (ownerId: string, value?: string | number) => boolean
  readonly cancelEdit: (ownerId: string) => boolean
  readonly refresh: (ownerId: string, seed: TablePreviewSeed) => boolean
  readonly request: (
    ownerId: string,
    action: TablePreviewRequestAction | string,
    targetId?: string,
  ) => TablePreviewRequest | undefined
}

export type TablePreviewStoreApi = StoreApi<TablePreviewModelState>

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

function normalizeItems(items: readonly TablePreviewSlotItemSeed[]): readonly TablePreviewSlotItemSeed[] {
  return uniqueById(items).map((item) => ({
    id: item.id,
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
  }))
}

function normalizeEditableFields(
  fields: readonly TablePreviewEditableFieldSeed[] | undefined,
): readonly TablePreviewEditableFieldSeed[] | undefined {
  if (fields === undefined) return undefined
  const normalized = uniqueById(fields).flatMap((field) => {
    if (!Number.isFinite(field.value)) return []
    return [
      {
        id: field.id,
        value: field.value,
        ...(Number.isFinite(field.min) ? { min: field.min } : {}),
        ...(Number.isFinite(field.max) ? { max: field.max } : {}),
        ...(field.locked === undefined ? {} : { locked: field.locked }),
      },
    ]
  })
  return normalized
}

function normalizeRows(rows: readonly TablePreviewRowSeed[]): readonly TablePreviewRowSeed[] {
  return uniqueById(rows).map((row) => ({
    id: row.id,
    ...(row.disabled === undefined ? {} : { disabled: row.disabled }),
    searchText: row.searchText,
    ...(row.categoryId === undefined ? {} : { categoryId: row.categoryId }),
    values: { ...row.values },
    ...(normalizeEditableFields(row.editable) === undefined ? {} : { editable: normalizeEditableFields(row.editable) }),
  }))
}

function normalizeSlots(slots: readonly TablePreviewSelectionSlotSeed[]): readonly TablePreviewSelectionSlotSeed[] {
  return uniqueById(slots).map((slot) => ({
    id: slot.id,
    items: normalizeItems(slot.items),
    ...(slot.initialSelectedId === undefined ? {} : { initialSelectedId: slot.initialSelectedId }),
  }))
}

function normalizeFlags(flags: readonly TablePreviewFlagSeed[]): readonly TablePreviewFlagSeed[] {
  return uniqueById(flags).map((flag) => ({ id: flag.id, value: flag.value }))
}

function targetIdOf(action: TablePreviewRequestAction): string | undefined {
  return 'targetId' in action ? action.targetId : undefined
}

function normalizeRequestActions(actions: readonly TablePreviewRequestAction[]): readonly TablePreviewRequestAction[] {
  const result: TablePreviewRequestAction[] = []
  for (const action of actions) {
    const targetId = targetIdOf(action)
    if (!isNonblankId(action.actionId) || (targetId !== undefined && !isNonblankId(targetId))) continue
    if (result.some((candidate) => candidate.actionId === action.actionId && targetIdOf(candidate) === targetId))
      continue
    result.push(targetId === undefined ? { actionId: action.actionId } : { actionId: action.actionId, targetId })
  }
  return result
}

function initialSelectedId(slot: TablePreviewSelectionSlotSeed): string | undefined {
  const requested = slot.initialSelectedId
  if (requested !== undefined) {
    const requestedItem = slot.items.find((item) => item.id === requested)
    if (requestedItem && requestedItem.disabled !== true) return requested
  }
  return slot.items.find((item) => item.disabled !== true)?.id
}

function selectedBySlot(slots: readonly TablePreviewSelectionSlotSeed[]): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, initialSelectedId(slot)]))
}

function flagsById(flags: readonly TablePreviewFlagSeed[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, flag.value]))
}

function rowsById(rows: readonly TablePreviewRowSeed[]): Readonly<Record<string, TablePreviewRowSeed>> {
  return Object.fromEntries(rows.map((row) => [row.id, row]))
}

function normalizeAllowedPageSizes(sizes: readonly number[]): readonly number[] {
  const result: number[] = []
  for (const size of sizes) {
    if (!Number.isInteger(size) || size <= 0 || result.includes(size)) continue
    result.push(size)
  }
  return result.length > 0 ? result : [10]
}

function normalizeSort(sort: TablePreviewSort | undefined): TablePreviewSort | undefined {
  if (sort === undefined) return undefined
  return {
    field: isNonblankId(sort.field) ? sort.field : 'id',
    direction: sort.direction === 'desc' ? 'desc' : 'asc',
  }
}

function normalizePage(page: number): number {
  return Number.isInteger(page) && page > 0 ? page : 1
}

function normalizeTotalRows(totalRows: number | undefined, rowsLength: number): number | undefined {
  if (totalRows === undefined || !Number.isFinite(totalRows) || totalRows < 0) return undefined
  return Math.max(rowsLength, Math.floor(totalRows))
}

interface NormalizedTablePreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly slots: readonly TablePreviewSelectionSlotSeed[]
  readonly rows: readonly TablePreviewRowSeed[]
  readonly flags: readonly TablePreviewFlagSeed[]
  readonly query: string
  readonly sort: TablePreviewSort | undefined
  readonly page: number
  readonly pageSize: number
  readonly allowedPageSizes: readonly number[]
  readonly totalRows: number | undefined
  readonly requestActions: readonly TablePreviewRequestAction[]
}

function normalizeSeed(seed: TablePreviewSeed): NormalizedTablePreviewSeed {
  const slots = normalizeSlots(seed.slots)
  const rows = normalizeRows(seed.rows)
  const flags = normalizeFlags(seed.flags)
  const allowedPageSizes = normalizeAllowedPageSizes(seed.allowedPageSizes ?? [10])
  const requestedPageSize = seed.pageSize ?? allowedPageSizes[0] ?? 10
  const pageSize = allowedPageSizes.includes(requestedPageSize) ? requestedPageSize : (allowedPageSizes[0] ?? 10)
  return {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots,
    rows,
    flags,
    query: seed.query ?? '',
    sort: normalizeSort(seed.sort),
    page: normalizePage(seed.page ?? 1),
    pageSize,
    allowedPageSizes,
    totalRows: normalizeTotalRows(seed.totalRows, rows.length),
    requestActions: normalizeRequestActions(seed.requestActions),
  }
}

function ownsState(state: Pick<TablePreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return (
    isNonblankId(ownerId) && isNonblankId(state.ownerId) && isNonblankId(state.fixtureId) && ownerId === state.ownerId
  )
}

function rowValue(row: TablePreviewRowSeed, field: string): string | number | undefined {
  if (field === 'id') return row.id
  return row.values[field]
}

function compareValues(left: string | number | undefined, right: string | number | undefined): number {
  if (left === right) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1
  const leftText = String(left)
  const rightText = String(right)
  if (leftText === rightText) return 0
  return leftText < rightText ? -1 : 1
}

function sortRows(
  rows: readonly TablePreviewRowSeed[],
  sort: TablePreviewSort | undefined,
): readonly TablePreviewRowSeed[] {
  if (sort === undefined) return rows
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = compareValues(rowValue(left.row, sort.field), rowValue(right.row, sort.field))
      if (comparison !== 0) return sort.direction === 'desc' ? -comparison : comparison
      return left.index - right.index
    })
    .map(({ row }) => row)
}

function selectedPlanId(state: Pick<TablePreviewModelState, 'slots' | 'selectedBySlot'>): string | undefined {
  if (!state.slots.some((slot) => slot.id === 'plan')) return undefined
  return state.selectedBySlot.plan
}

function deriveFilteredRows(
  state: Pick<TablePreviewModelState, 'rows' | 'query' | 'slots' | 'selectedBySlot' | 'sort'>,
): readonly TablePreviewRowSeed[] {
  const query = state.query.trim().toLocaleLowerCase()
  const plan = selectedPlanId(state)
  const filtered = state.rows.filter((row) => {
    if (query && !row.searchText.toLocaleLowerCase().includes(query)) return false
    if (plan !== undefined && plan !== 'all' && row.categoryId !== plan) return false
    return true
  })
  return sortRows(filtered, state.sort)
}

function totalPageCount(
  state: Pick<TablePreviewModelState, 'totalRows' | 'rows' | 'pageSize'>,
  filteredCount = state.rows.length,
): number {
  const knownTotal = Math.max(state.totalRows ?? 0, filteredCount)
  return Math.max(1, Math.ceil(knownTotal / state.pageSize))
}

function deriveIds(
  state: Pick<TablePreviewModelState, 'rows' | 'query' | 'slots' | 'selectedBySlot' | 'sort' | 'page' | 'pageSize'>,
): { readonly filteredRowIds: readonly string[]; readonly visibleRowIds: readonly string[] } {
  const filtered = deriveFilteredRows(state)
  const start = (state.page - 1) * state.pageSize
  return {
    filteredRowIds: filtered.map((row) => row.id),
    visibleRowIds: filtered.slice(start, start + state.pageSize).map((row) => row.id),
  }
}

function reconcileSelections(
  slots: readonly TablePreviewSelectionSlotSeed[],
  previous: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    slots.map((slot) => {
      const prior = previous[slot.id]
      const validPrior = prior !== undefined && slot.items.some((item) => item.id === prior && item.disabled !== true)
      return [slot.id, validPrior ? prior : initialSelectedId(slot)]
    }),
  )
}

function reconcileFlags(
  flags: readonly TablePreviewFlagSeed[],
  previous: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(flags.map((flag) => [flag.id, previous[flag.id] ?? flag.value]))
}

function allowsRequest(actions: readonly TablePreviewRequestAction[], action: TablePreviewRequestAction): boolean {
  const targetId = targetIdOf(action)
  return (
    isNonblankId(action.actionId) &&
    (targetId === undefined || isNonblankId(targetId)) &&
    actions.some((candidate) => candidate.actionId === action.actionId && targetIdOf(candidate) === targetId)
  )
}

function actionFromRequest(request: TablePreviewRequest): TablePreviewRequestAction {
  return 'targetId' in request
    ? { actionId: request.actionId, targetId: request.targetId }
    : { actionId: request.actionId }
}

function requestMatchesAction(request: TablePreviewRequest, action: TablePreviewRequestAction): boolean {
  return request.actionId === action.actionId && targetIdOf(request) === targetIdOf(actionFromRequest(request))
}

function requestFor(
  state: Pick<TablePreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: TablePreviewRequestAction,
): TablePreviewRequest {
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

function editableField(row: TablePreviewRowSeed, fieldId: string): TablePreviewEditableFieldSeed | undefined {
  return row.editable?.find((field) => field.id === fieldId)
}

function draftIsLive(
  draft: TablePreviewEditDraft | undefined,
  rowsByIdValue: Readonly<Record<string, TablePreviewRowSeed>>,
): boolean {
  if (!draft) return false
  const row = rowsByIdValue[draft.rowId]
  const field = row ? editableField(row, draft.fieldId) : undefined
  return Boolean(row && row.disabled !== true && field && field.locked !== true)
}

function draftValueIsValid(value: string | number, field: TablePreviewEditableFieldSeed): boolean {
  const text = typeof value === 'string' ? value.trim() : value
  if (text === '') return false
  const numeric = typeof text === 'number' ? text : Number(text)
  if (!Number.isFinite(numeric) || numeric < 0) return false
  if (field.min !== undefined && numeric < Math.max(0, field.min)) return false
  if (field.max !== undefined && numeric > field.max) return false
  return true
}

function numericDraftValue(value: string | number): number {
  return typeof value === 'number' ? value : Number(value.trim())
}

function updateRowsWithEdit(
  rows: readonly TablePreviewRowSeed[],
  draft: TablePreviewEditDraft,
  numeric: number,
): readonly TablePreviewRowSeed[] {
  return rows.map((row) => {
    if (row.id !== draft.rowId) return row
    const editable = row.editable?.map((field) => (field.id === draft.fieldId ? { ...field, value: numeric } : field))
    return {
      ...row,
      values: { ...row.values, [draft.fieldId]: numeric },
      ...(editable === undefined ? {} : { editable }),
    }
  })
}

function reconcileRows(
  rows: readonly TablePreviewRowSeed[],
  previous: Readonly<Record<string, TablePreviewRowSeed>>,
): readonly TablePreviewRowSeed[] {
  return rows.map((row) => {
    const prior = previous[row.id]
    if (!prior || row.disabled === true || prior.disabled === true || row.editable === undefined) return row
    let values = row.values
    let changed = false
    const nextEditable = row.editable.map((field) => {
      const priorField = editableField(prior, field.id)
      if (!priorField || priorField.locked === true || field.locked === true || !Number.isFinite(priorField.value))
        return field
      if (priorField.value === field.value && row.values[field.id] === priorField.value) return field
      changed = true
      values = { ...values, [field.id]: priorField.value }
      return { ...field, value: priorField.value }
    })
    return changed ? { ...row, values, editable: nextEditable } : row
  })
}

function normalizeVisibleState(
  state: Pick<TablePreviewModelState, 'rows' | 'query' | 'slots' | 'selectedBySlot' | 'sort' | 'page' | 'pageSize'>,
): { readonly filteredRowIds: readonly string[]; readonly visibleRowIds: readonly string[] } {
  return deriveIds(state)
}

function makeInitialState(
  seed: NormalizedTablePreviewSeed,
): Omit<
  TablePreviewModelState,
  | 'select'
  | 'setQuery'
  | 'setFlag'
  | 'setSort'
  | 'setPage'
  | 'setPageSize'
  | 'beginEdit'
  | 'setEditDraft'
  | 'commitEdit'
  | 'cancelEdit'
  | 'refresh'
  | 'request'
> {
  const selected = selectedBySlot(seed.slots)
  const flags = flagsById(seed.flags)
  const initial: Pick<
    TablePreviewModelState,
    | 'ownerId'
    | 'variant'
    | 'fixtureId'
    | 'slots'
    | 'rows'
    | 'rowsById'
    | 'flags'
    | 'requestActions'
    | 'selectedBySlot'
    | 'flagsById'
    | 'query'
    | 'sort'
    | 'page'
    | 'pageSize'
    | 'allowedPageSizes'
    | 'totalRows'
  > = {
    ownerId: seed.ownerId,
    variant: seed.variant,
    fixtureId: seed.fixtureId,
    slots: seed.slots,
    rows: seed.rows,
    rowsById: rowsById(seed.rows),
    flags: seed.flags,
    requestActions: seed.requestActions,
    selectedBySlot: selected,
    flagsById: flags,
    query: seed.query,
    sort: seed.sort,
    page: seed.page,
    pageSize: seed.pageSize,
    allowedPageSizes: seed.allowedPageSizes,
    totalRows: seed.totalRows,
  }
  const pageCount = totalPageCount({ ...initial, rows: seed.rows, pageSize: seed.pageSize, totalRows: seed.totalRows })
  const page = Math.min(initial.page, pageCount)
  const ids = normalizeVisibleState({ ...initial, page })
  return {
    ...initial,
    page,
    filteredRowIds: ids.filteredRowIds,
    visibleRowIds: ids.visibleRowIds,
    editDraft: undefined,
    editError: undefined,
    lastRequest: undefined,
  }
}

/** Preview-owned table state. It contains only local projection state and emits no I/O. */
export function createTablePreviewStore(input: TablePreviewSeed): TablePreviewStoreApi {
  const initial = makeInitialState(normalizeSeed(input))

  return createStore<TablePreviewModelState>((set, get) => ({
    ...initial,
    select(ownerId, slotId, itemId) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(slotId) || !isNonblankId(itemId)) return false
      const slot = state.slots.find((candidate) => candidate.id === slotId)
      const item = slot?.items.find((candidate) => candidate.id === itemId)
      if (!item || item.disabled === true) return false
      if (state.selectedBySlot[slotId] === itemId) return true
      const selected = { ...state.selectedBySlot, [slotId]: itemId }
      const ids = normalizeVisibleState({ ...state, selectedBySlot: selected, page: 1 })
      set({ selectedBySlot: selected, page: 1, ...ids, lastRequest: undefined })
      return true
    },
    setQuery(ownerId, value) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (state.query === value && state.page === 1) return true
      const ids = normalizeVisibleState({ ...state, query: value, page: 1 })
      set({ query: value, page: 1, ...ids, lastRequest: undefined })
      return true
    },
    setFlag(ownerId, id, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(id) || !state.flags.some((flag) => flag.id === id)) return false
      if (state.flagsById[id] === value) return true
      set({ flagsById: { ...state.flagsById, [id]: value }, lastRequest: undefined })
      return true
    },
    setSort(ownerId, sort) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(sort.field)) return false
      if (sort.direction !== 'asc' && sort.direction !== 'desc') return false
      if (
        sort.field !== 'id' &&
        !state.rows.some((row) => Object.prototype.hasOwnProperty.call(row.values, sort.field))
      )
        return false
      if (state.sort?.field === sort.field && state.sort.direction === sort.direction && state.page === 1) return true
      const nextSort = { field: sort.field, direction: sort.direction } as const
      const ids = normalizeVisibleState({ ...state, sort: nextSort, page: 1 })
      set({ sort: nextSort, page: 1, ...ids, lastRequest: undefined })
      return true
    },
    setPage(ownerId, page) {
      const state = get()
      if (!ownsState(state, ownerId) || !Number.isInteger(page) || page < 1) return false
      const maxPage = totalPageCount(state, state.filteredRowIds.length)
      if (page > maxPage) return false
      if (state.page === page) return true
      const ids = normalizeVisibleState({ ...state, page })
      set({ page, ...ids, lastRequest: undefined })
      return true
    },
    setPageSize(ownerId, pageSize) {
      const state = get()
      if (!ownsState(state, ownerId) || !state.allowedPageSizes.includes(pageSize)) return false
      if (state.pageSize === pageSize && state.page === 1) return true
      const ids = normalizeVisibleState({ ...state, pageSize, page: 1 })
      set({ pageSize, page: 1, ...ids, lastRequest: undefined })
      return true
    },
    beginEdit(ownerId, rowId, fieldId) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblankId(rowId) || !isNonblankId(fieldId)) return false
      if (!state.visibleRowIds.includes(rowId)) return false
      const row = state.rowsById[rowId]
      const field = row ? editableField(row, fieldId) : undefined
      if (!row || row.disabled === true || !field || field.locked === true) return false
      const editDraft: TablePreviewEditDraft = { ownerId, rowId, fieldId, value: String(field.value) }
      set({ editDraft, editError: undefined, lastRequest: undefined })
      return true
    },
    setEditDraft(ownerId, valueOrRowId, fieldId, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !state.editDraft) return false
      if (value !== undefined) {
        if (valueOrRowId !== state.editDraft.rowId || fieldId !== state.editDraft.fieldId) return false
        set({ editDraft: { ...state.editDraft, value: String(value) }, editError: undefined, lastRequest: undefined })
        return true
      }
      set({
        editDraft: { ...state.editDraft, value: String(valueOrRowId) },
        editError: undefined,
        lastRequest: undefined,
      })
      return true
    },
    commitEdit(ownerId, nextValue) {
      const state = get()
      if (!ownsState(state, ownerId) || !state.editDraft) return false
      if (nextValue !== undefined) {
        const draft: TablePreviewEditDraft = { ...state.editDraft, value: String(nextValue) }
        set({ editDraft: draft, editError: undefined })
        return get().commitEdit(ownerId)
      }
      const draft = state.editDraft
      const row = state.rowsById[draft.rowId]
      const field = row ? editableField(row, draft.fieldId) : undefined
      if (!row || row.disabled === true || !field || field.locked === true) {
        set({ editDraft: undefined, editError: undefined })
        return false
      }
      if (!draftValueIsValid(draft.value, field)) {
        set({ editError: 'invalid' })
        return false
      }
      const numeric = numericDraftValue(draft.value)
      const rows = updateRowsWithEdit(state.rows, draft, numeric)
      const nextRowsById = rowsById(rows)
      const ids = normalizeVisibleState({ ...state, rows, page: state.page })
      set({ rows, rowsById: nextRowsById, editDraft: undefined, editError: undefined, ...ids, lastRequest: undefined })
      return true
    },
    cancelEdit(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId) || !state.editDraft) return false
      set({ editDraft: undefined, editError: undefined, lastRequest: undefined })
      return true
    },
    refresh(ownerId, nextInput) {
      const state = get()
      if (
        !ownsState(state, ownerId) ||
        nextInput.ownerId !== state.ownerId ||
        nextInput.variant !== state.variant ||
        nextInput.fixtureId !== state.fixtureId
      )
        return false

      const next = normalizeSeed(nextInput)
      const selected = reconcileSelections(next.slots, state.selectedBySlot)
      const reconciledFlags = reconcileFlags(next.flags, state.flagsById)
      const pageSize = next.allowedPageSizes.includes(state.pageSize) ? state.pageSize : next.pageSize
      const sortFieldStillKnown =
        state.sort === undefined ||
        state.sort.field === 'id' ||
        next.rows.some((row) => Object.prototype.hasOwnProperty.call(row.values, state.sort?.field ?? ''))
      const sort = sortFieldStillKnown ? state.sort : next.sort
      const reconciledRows = reconcileRows(next.rows, state.rowsById)
      const rowsMap = rowsById(reconciledRows)
      const draft = draftIsLive(state.editDraft, rowsMap) ? state.editDraft : undefined
      const editError = draft ? state.editError : undefined
      const requests =
        state.lastRequest && allowsRequest(next.requestActions, actionFromRequest(state.lastRequest))
          ? state.lastRequest
          : undefined
      const base = {
        ...state,
        ownerId: next.ownerId,
        variant: next.variant,
        fixtureId: next.fixtureId,
        slots: next.slots,
        rows: reconciledRows,
        rowsById: rowsMap,
        flags: next.flags,
        requestActions: next.requestActions,
        selectedBySlot: selected,
        flagsById: reconciledFlags,
        pageSize,
        allowedPageSizes: next.allowedPageSizes,
        totalRows: next.totalRows,
        sort,
        editDraft: draft,
        editError,
        lastRequest: requests,
      }
      const page = Math.min(state.page, totalPageCount(base, reconciledRows.length))
      const ids = normalizeVisibleState({ ...base, page })
      set({ ...base, page, ...ids })
      return true
    },
    request(ownerId, actionOrId, targetId) {
      const state = get()
      if (!ownsState(state, ownerId)) return undefined
      const action: TablePreviewRequestAction =
        typeof actionOrId === 'string'
          ? targetId === undefined
            ? { actionId: actionOrId }
            : { actionId: actionOrId, targetId }
          : actionOrId
      if (!allowsRequest(state.requestActions, action)) return undefined
      if (state.lastRequest && requestMatchesAction(state.lastRequest, action)) return undefined
      const request = requestFor(state, action)
      set({ lastRequest: request })
      return request
    },
  }))
}

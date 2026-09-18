const MAX_LIST_ITEMS = 10_000
const MAX_VALUE_BYTES = 2 * 1024 * 1024
const idPattern = /^[a-zA-Z][a-zA-Z0-9._-]{0,159}$/
const componentPattern = /^[A-Z][A-Za-z0-9.]{0,127}$/
const schemaReferencePattern = /^[a-zA-Z][a-zA-Z0-9._-]{0,159}@[1-9][0-9]*$/

export interface KeyedListDescription {
  readonly id: string
  readonly version: number
  readonly labelKey: string
  readonly component: string
  readonly element: string
  readonly keyField: string
  readonly itemSchemaId: string
  readonly maxItems?: number
}

export interface CompiledKeyedList {
  readonly id: string
  readonly version: number
  readonly labelKey: string
  readonly component: string
  readonly element: string
  readonly keyField: string
  readonly itemSchemaId: string
  readonly maxItems: number
}

export type KeyedListItem = Readonly<Record<string, unknown>>

export interface KeyedListState {
  readonly listId: string
  readonly version: number
  readonly baseline: readonly KeyedListItem[]
  readonly draft: readonly KeyedListItem[]
  readonly order: readonly string[]
  readonly dirtyItems: readonly string[]
  readonly removedItems: readonly string[]
  readonly orderDirty: boolean
  readonly revision: number
}

export class KeyedListError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'KeyedListError'
  }
}

function clone<Value>(value: Value): Value {
  return structuredClone(value)
}

function freeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function bounded(value: unknown): void {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new KeyedListError('INVALID_ITEM', 'List items must be finite JSON data')
  }
  if (serialized === undefined || serialized.length > MAX_VALUE_BYTES)
    throw new KeyedListError('VALUE_TOO_LARGE', 'List data exceeds the size limit')
}

function keyFor(schema: CompiledKeyedList, item: KeyedListItem): string {
  const key = item[schema.keyField]
  if (typeof key !== 'string' || !key || key.length > 256)
    throw new KeyedListError('INVALID_ITEM_KEY', `List item needs a bounded ${schema.keyField}`)
  return key
}

function validateItems(schema: CompiledKeyedList, items: readonly KeyedListItem[]): KeyedListItem[] {
  const input: readonly KeyedListItem[] = items
  if (!Array.isArray(input as unknown) || input.length > schema.maxItems)
    throw new KeyedListError('LIST_CAPACITY', 'Keyed list exceeds its declared capacity')
  bounded(input)
  const copy: KeyedListItem[] = clone(input.map((item) => item))
  const keys = copy.map((item) => keyFor(schema, item))
  if (new Set(keys).size !== keys.length)
    throw new KeyedListError('DUPLICATE_ITEM_KEY', 'Keyed list item IDs must be unique')
  return copy
}

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null || typeof left !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => same(value, right[index]))
    )
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => Object.hasOwn(rightRecord, key) && same(leftRecord[key], rightRecord[key]))
  )
}

function finish(
  schema: CompiledKeyedList,
  baseline: readonly KeyedListItem[],
  draft: readonly KeyedListItem[],
  revision: number,
) {
  const validated = validateItems(schema, draft)
  const baselineById = new Map(baseline.map((item) => [keyFor(schema, item), item] as const))
  const draftById = new Map(validated.map((item) => [keyFor(schema, item), item] as const))
  const order = validated.map((item) => keyFor(schema, item))
  const baselineOrder = baseline.map((item) => keyFor(schema, item))
  const state: KeyedListState = {
    listId: schema.id,
    version: schema.version,
    baseline: clone(baseline),
    draft: validated,
    order,
    dirtyItems: order.filter((id) => !baselineById.has(id) || !same(baselineById.get(id), draftById.get(id))),
    removedItems: baselineOrder.filter((id) => !draftById.has(id)),
    orderDirty: !same(order, baselineOrder),
    revision,
  }
  return freeze(state)
}

function check(schema: CompiledKeyedList, state: KeyedListState): void {
  if (state.listId !== schema.id || state.version !== schema.version)
    throw new KeyedListError('LIST_MISMATCH', 'List state belongs to another schema revision')
}

export function compileKeyedList(description: KeyedListDescription): CompiledKeyedList {
  const maxItems = description.maxItems ?? 256
  if (
    !idPattern.test(description.id) ||
    !Number.isSafeInteger(description.version) ||
    description.version < 1 ||
    !description.labelKey.startsWith('i18n:') ||
    !componentPattern.test(description.component) ||
    !componentPattern.test(description.element) ||
    !idPattern.test(description.keyField) ||
    !schemaReferencePattern.test(description.itemSchemaId) ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > MAX_LIST_ITEMS
  )
    throw new KeyedListError('INVALID_LIST_DESCRIPTION', 'Keyed list description is invalid')
  return freeze({ ...description, maxItems })
}

export function createKeyedList(schema: CompiledKeyedList, items: readonly KeyedListItem[]): KeyedListState {
  const baseline = validateItems(schema, items)
  return finish(schema, baseline, baseline, 0)
}

export function setKeyedListItem(
  schema: CompiledKeyedList,
  state: KeyedListState,
  item: KeyedListItem,
): KeyedListState {
  check(schema, state)
  const copy = clone(item)
  const id = keyFor(schema, copy)
  const index = state.draft.findIndex((candidate) => keyFor(schema, candidate) === id)
  const draft = [...state.draft]
  if (index < 0) draft.push(copy)
  else draft[index] = copy
  return finish(schema, state.baseline, draft, state.revision + 1)
}

export function removeKeyedListItem(schema: CompiledKeyedList, state: KeyedListState, itemId: string): KeyedListState {
  check(schema, state)
  const draft = state.draft.filter((item) => keyFor(schema, item) !== itemId)
  if (draft.length === state.draft.length) throw new KeyedListError('ITEM_NOT_FOUND', 'Keyed list item does not exist')
  return finish(schema, state.baseline, draft, state.revision + 1)
}

export function moveKeyedListItem(
  schema: CompiledKeyedList,
  state: KeyedListState,
  itemId: string,
  beforeId: string | null,
): KeyedListState {
  check(schema, state)
  if (itemId === beforeId) return state
  const item = state.draft.find((candidate) => keyFor(schema, candidate) === itemId)
  if (!item) throw new KeyedListError('ITEM_NOT_FOUND', 'Keyed list item does not exist')
  const draft = state.draft.filter((candidate) => keyFor(schema, candidate) !== itemId)
  if (beforeId === null) draft.push(item)
  else {
    const index = draft.findIndex((candidate) => keyFor(schema, candidate) === beforeId)
    if (index < 0) throw new KeyedListError('ITEM_NOT_FOUND', 'Move target does not exist')
    draft.splice(index, 0, item)
  }
  return finish(schema, state.baseline, draft, state.revision + 1)
}

export function resetKeyedListItem(schema: CompiledKeyedList, state: KeyedListState, itemId: string): KeyedListState {
  check(schema, state)
  const baselineItem = state.baseline.find((item) => keyFor(schema, item) === itemId)
  let draft = state.draft.filter((item) => keyFor(schema, item) !== itemId)
  if (baselineItem) {
    const baselineIndex = state.baseline.findIndex((item) => keyFor(schema, item) === itemId)
    draft = [...draft.slice(0, baselineIndex), baselineItem, ...draft.slice(baselineIndex)]
  }
  return finish(schema, state.baseline, draft, state.revision + 1)
}

export function resetKeyedList(schema: CompiledKeyedList, state: KeyedListState): KeyedListState {
  check(schema, state)
  return finish(schema, state.baseline, state.baseline, state.revision + 1)
}

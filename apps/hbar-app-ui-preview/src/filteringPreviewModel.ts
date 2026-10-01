import { createStore, type StoreApi } from 'zustand/vanilla'

export interface FilteringPreviewChoice {
  readonly id: string
  readonly disabled?: boolean | undefined
}

interface FilteringPreviewFieldBase {
  readonly id: string
  readonly disabled?: boolean | undefined
}

export interface FilteringPreviewSingleField extends FilteringPreviewFieldBase {
  readonly kind: 'single'
  readonly choices: readonly FilteringPreviewChoice[]
  readonly initialValue: string
}

export interface FilteringPreviewMultiField extends FilteringPreviewFieldBase {
  readonly kind: 'multi'
  readonly choices: readonly FilteringPreviewChoice[]
  readonly initialValue: readonly string[]
  readonly maximumSelections?: number | undefined
  readonly allowCustom?: boolean | undefined
}

export interface FilteringPreviewTextField extends FilteringPreviewFieldBase {
  readonly kind: 'text'
  readonly initialValue: string
  readonly maximumLength?: number | undefined
}

export interface FilteringPreviewNumberField extends FilteringPreviewFieldBase {
  readonly kind: 'number'
  readonly initialValue: number
  readonly minimum: number
  readonly maximum: number
}

export interface FilteringPreviewBooleanField extends FilteringPreviewFieldBase {
  readonly kind: 'boolean'
  readonly initialValue: boolean
}

export type FilteringPreviewField =
  | FilteringPreviewSingleField
  | FilteringPreviewMultiField
  | FilteringPreviewTextField
  | FilteringPreviewNumberField
  | FilteringPreviewBooleanField

/** Alias kept explicit for hosts that call their input records field seeds. */
export type FilteringPreviewFieldSeed = FilteringPreviewField

export type FilteringPreviewValue = string | number | boolean | readonly string[]

export interface FilteringPreviewRequestAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface FilteringPreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
  readonly fields: readonly FilteringPreviewField[]
  readonly requestActions: readonly FilteringPreviewRequestAction[]
}

export interface FilteringPreviewRequest extends FilteringPreviewRequestAction {
  readonly ownerId: string
  readonly variant: number
  readonly fixtureId: string
}

export interface FilteringPreviewModelState extends FilteringPreviewSeed {
  readonly valuesById: Readonly<Record<string, FilteringPreviewValue>>
  readonly appliedById: Readonly<Record<string, FilteringPreviewValue>>
  /** Local request intent only; it does not claim that an external action succeeded. */
  readonly lastRequest: FilteringPreviewRequest | undefined
  readonly setValue: (ownerId: string, fieldId: string, value: FilteringPreviewValue) => boolean
  readonly reset: (ownerId: string, fieldIds?: readonly string[]) => boolean
  readonly apply: (ownerId: string) => boolean
  readonly request: (ownerId: string, action: FilteringPreviewRequestAction) => FilteringPreviewRequest | undefined
  readonly refresh: (seed: FilteringPreviewSeed) => boolean
}

export type FilteringPreviewStoreApi = StoreApi<FilteringPreviewModelState>

interface NormalizedFilteringPreviewSeed extends FilteringPreviewSeed {}

function isNonblank(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalDisabled(value: boolean | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function uniqueById<T extends { readonly id: string }>(records: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (!isNonblank(record.id) || seen.has(record.id)) return false
    seen.add(record.id)
    return true
  })
}

function normalizeChoices(choices: readonly FilteringPreviewChoice[]): readonly FilteringPreviewChoice[] {
  return uniqueById(choices).map((choice) => ({
    id: choice.id,
    ...(optionalDisabled(choice.disabled) === undefined ? {} : { disabled: choice.disabled }),
  }))
}

function enabledChoice(choices: readonly FilteringPreviewChoice[], id: string): FilteringPreviewChoice | undefined {
  return choices.find((choice) => choice.id === id && choice.disabled !== true)
}

function normalizeMaximum(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && Number.isFinite(value) && value >= 0 ? value : undefined
}

function normalizeTextMaximum(value: number | undefined): number | undefined {
  return normalizeMaximum(value)
}

function cleanMultiValue(
  value: readonly string[],
  choices: readonly FilteringPreviewChoice[],
  allowCustom: boolean,
): readonly string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (!isNonblank(candidate) || seen.has(candidate)) continue
    const choice = choices.find((item) => item.id === candidate)
    if (choice?.disabled === true) continue
    if (!choice && !allowCustom) continue
    seen.add(candidate)
    result.push(candidate)
  }
  return result
}

function hasInvalidMultiInput(
  value: readonly string[],
  choices: readonly FilteringPreviewChoice[],
  allowCustom: boolean,
): boolean {
  return value.some((candidate) => {
    if (!isNonblank(candidate)) return true
    const choice = choices.find((item) => item.id === candidate)
    return choice?.disabled === true || (choice === undefined && !allowCustom)
  })
}

function normalizeMultiInitialValue(
  value: readonly string[],
  choices: readonly FilteringPreviewChoice[],
  allowCustom: boolean,
  maximumSelections: number | undefined,
): readonly string[] {
  const cleaned = cleanMultiValue(value, choices, allowCustom)
  return maximumSelections === undefined ? cleaned : cleaned.slice(0, maximumSelections)
}

function normalizeSingleField(field: FilteringPreviewSingleField): FilteringPreviewSingleField {
  const choices = normalizeChoices(field.choices)
  const requested = typeof field.initialValue === 'string' ? field.initialValue : ''
  const initialValue =
    enabledChoice(choices, requested)?.id ?? choices.find((choice) => choice.disabled !== true)?.id ?? ''
  return {
    id: field.id,
    kind: 'single',
    choices,
    initialValue,
    ...(optionalDisabled(field.disabled) === undefined ? {} : { disabled: field.disabled }),
  }
}

function normalizeMultiField(field: FilteringPreviewMultiField): FilteringPreviewMultiField {
  const choices = normalizeChoices(field.choices)
  const maximumSelections = normalizeMaximum(field.maximumSelections)
  const allowCustom = field.allowCustom === true
  const initialValue = normalizeMultiInitialValue(field.initialValue, choices, allowCustom, maximumSelections)
  return {
    id: field.id,
    kind: 'multi',
    choices,
    initialValue,
    ...(maximumSelections === undefined ? {} : { maximumSelections }),
    ...(field.allowCustom === undefined ? {} : { allowCustom }),
    ...(optionalDisabled(field.disabled) === undefined ? {} : { disabled: field.disabled }),
  }
}

function normalizeTextField(field: FilteringPreviewTextField): FilteringPreviewTextField {
  const maximumLength = normalizeTextMaximum(field.maximumLength)
  const requested = typeof field.initialValue === 'string' ? field.initialValue : ''
  const initialValue = maximumLength === undefined ? requested : requested.slice(0, maximumLength)
  return {
    id: field.id,
    kind: 'text',
    initialValue,
    ...(maximumLength === undefined ? {} : { maximumLength }),
    ...(optionalDisabled(field.disabled) === undefined ? {} : { disabled: field.disabled }),
  }
}

function normalizeNumberField(field: FilteringPreviewNumberField): FilteringPreviewNumberField {
  const validBounds = isFiniteNumber(field.minimum) && isFiniteNumber(field.maximum) && field.minimum <= field.maximum
  const minimum = validBounds ? field.minimum : 0
  const maximum = validBounds ? field.maximum : 0
  const requested = isFiniteNumber(field.initialValue) ? field.initialValue : minimum
  const initialValue = Math.max(minimum, Math.min(maximum, requested))
  return {
    id: field.id,
    kind: 'number',
    initialValue,
    minimum,
    maximum,
    ...(optionalDisabled(field.disabled) === undefined ? {} : { disabled: field.disabled }),
  }
}

function normalizeBooleanField(field: FilteringPreviewBooleanField): FilteringPreviewBooleanField {
  return {
    id: field.id,
    kind: 'boolean',
    initialValue: typeof field.initialValue === 'boolean' ? field.initialValue : false,
    ...(optionalDisabled(field.disabled) === undefined ? {} : { disabled: field.disabled }),
  }
}

function normalizeField(field: FilteringPreviewField): FilteringPreviewField | undefined {
  if (!isNonblank(field.id)) return undefined
  switch (field.kind) {
    case 'single':
      return normalizeSingleField(field)
    case 'multi':
      return normalizeMultiField(field)
    case 'text':
      return normalizeTextField(field)
    case 'number':
      return normalizeNumberField(field)
    case 'boolean':
      return normalizeBooleanField(field)
    default:
      return undefined
  }
}

function normalizeFields(fields: readonly FilteringPreviewField[]): readonly FilteringPreviewField[] {
  const result: FilteringPreviewField[] = []
  const seen = new Set<string>()
  for (const field of fields) {
    if (seen.has(field.id)) continue
    const normalized = normalizeField(field)
    if (normalized === undefined) continue
    seen.add(normalized.id)
    result.push(normalized)
  }
  return result
}

function normalizeRequestActions(
  actions: readonly FilteringPreviewRequestAction[],
): readonly FilteringPreviewRequestAction[] {
  const result: FilteringPreviewRequestAction[] = []
  for (const action of actions) {
    const value = action.value
    if (!isNonblank(action.actionId) || (value !== undefined && !isNonblank(value))) continue
    if (result.some((candidate) => candidate.actionId === action.actionId && candidate.value === value)) continue
    result.push(value === undefined ? { actionId: action.actionId } : { actionId: action.actionId, value })
  }
  return result
}

function normalizeSeed(seed: FilteringPreviewSeed): NormalizedFilteringPreviewSeed {
  return {
    ownerId: seed.ownerId,
    variant: isFiniteNumber(seed.variant) ? seed.variant : 0,
    fixtureId: seed.fixtureId,
    fields: normalizeFields(seed.fields),
    requestActions: normalizeRequestActions(seed.requestActions),
  }
}

function ownsState(state: Pick<FilteringPreviewModelState, 'ownerId' | 'fixtureId'>, ownerId: string): boolean {
  return isNonblank(ownerId) && isNonblank(state.ownerId) && isNonblank(state.fixtureId) && ownerId === state.ownerId
}

function initialValue(field: FilteringPreviewField): FilteringPreviewValue {
  return isStringArray(field.initialValue) ? [...field.initialValue] : field.initialValue
}

function initialValues(fields: readonly FilteringPreviewField[]): Readonly<Record<string, FilteringPreviewValue>> {
  const values: Record<string, FilteringPreviewValue> = {}
  for (const field of fields) values[field.id] = initialValue(field)
  return values
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((candidate) => typeof candidate === 'string')
}

function normalizeValueForField(
  field: FilteringPreviewField,
  value: unknown,
  mode: 'input' | 'reconcile',
): FilteringPreviewValue | undefined {
  switch (field.kind) {
    case 'single':
      return typeof value === 'string' && enabledChoice(field.choices, value) !== undefined ? value : undefined
    case 'multi': {
      if (!isStringArray(value)) return undefined
      if (mode === 'input' && hasInvalidMultiInput(value, field.choices, field.allowCustom === true)) return undefined
      const cleaned = cleanMultiValue(value, field.choices, field.allowCustom === true)
      if (mode === 'input' && field.maximumSelections !== undefined && cleaned.length > field.maximumSelections)
        return undefined
      return field.maximumSelections === undefined ? cleaned : cleaned.slice(0, field.maximumSelections)
    }
    case 'text': {
      if (typeof value !== 'string') return undefined
      if (mode === 'input' && field.maximumLength !== undefined && value.length > field.maximumLength) return undefined
      return field.maximumLength === undefined ? value : value.slice(0, field.maximumLength)
    }
    case 'number': {
      if (!isFiniteNumber(value)) return undefined
      if (mode === 'input' && (value < field.minimum || value > field.maximum)) return undefined
      return Math.max(field.minimum, Math.min(field.maximum, value))
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined
    default:
      return undefined
  }
}

function sameValue(left: FilteringPreviewValue | undefined, right: FilteringPreviewValue | undefined): boolean {
  if (isStringArray(left) || isStringArray(right)) {
    if (!isStringArray(left) || !isStringArray(right) || left.length !== right.length) return false
    return left.every((value, index) => value === right[index])
  }
  return left === right
}

function cloneValue(value: FilteringPreviewValue): FilteringPreviewValue {
  return isStringArray(value) ? [...value] : value
}

function cloneValues(values: Readonly<Record<string, FilteringPreviewValue>>): Record<string, FilteringPreviewValue> {
  const result: Record<string, FilteringPreviewValue> = {}
  for (const [id, value] of Object.entries(values)) result[id] = cloneValue(value)
  return result
}

function sameValues(
  left: Readonly<Record<string, FilteringPreviewValue>>,
  right: Readonly<Record<string, FilteringPreviewValue>>,
): boolean {
  const leftIds = Object.keys(left)
  const rightIds = Object.keys(right)
  return leftIds.length === rightIds.length && leftIds.every((id) => sameValue(left[id], right[id]))
}

function reconcileValues(
  fields: readonly FilteringPreviewField[],
  previous: Readonly<Record<string, FilteringPreviewValue>>,
): Readonly<Record<string, FilteringPreviewValue>> {
  const result: Record<string, FilteringPreviewValue> = {}
  for (const field of fields) {
    const retained = normalizeValueForField(field, previous[field.id], 'reconcile')
    result[field.id] = cloneValue(retained === undefined ? initialValue(field) : retained)
  }
  return result
}

function sameChoices(left: readonly FilteringPreviewChoice[], right: readonly FilteringPreviewChoice[]): boolean {
  return (
    left.length === right.length &&
    left.every((choice, index) => choice.id === right[index]?.id && choice.disabled === right[index]?.disabled)
  )
}

function sameField(left: FilteringPreviewField, right: FilteringPreviewField): boolean {
  if (left.id !== right.id || left.kind !== right.kind || left.disabled !== right.disabled) return false
  switch (left.kind) {
    case 'single':
      return (
        right.kind === 'single' && left.initialValue === right.initialValue && sameChoices(left.choices, right.choices)
      )
    case 'multi':
      return (
        right.kind === 'multi' &&
        left.maximumSelections === right.maximumSelections &&
        left.allowCustom === right.allowCustom &&
        sameChoices(left.choices, right.choices) &&
        sameValue(left.initialValue, right.initialValue)
      )
    case 'text':
      return (
        right.kind === 'text' && left.initialValue === right.initialValue && left.maximumLength === right.maximumLength
      )
    case 'number':
      return (
        right.kind === 'number' &&
        left.initialValue === right.initialValue &&
        left.minimum === right.minimum &&
        left.maximum === right.maximum
      )
    case 'boolean':
      return right.kind === 'boolean' && left.initialValue === right.initialValue
    default:
      return false
  }
}

function sameFields(left: readonly FilteringPreviewField[], right: readonly FilteringPreviewField[]): boolean {
  return (
    left.length === right.length &&
    left.every((field, index) => right[index] !== undefined && sameField(field, right[index]))
  )
}

function sameRequestActions(
  left: readonly FilteringPreviewRequestAction[],
  right: readonly FilteringPreviewRequestAction[],
): boolean {
  return (
    left.length === right.length &&
    left.every((action, index) => {
      const other = right[index]
      return other !== undefined && action.actionId === other.actionId && action.value === other.value
    })
  )
}

function allowsRequest(
  actions: readonly FilteringPreviewRequestAction[],
  action: FilteringPreviewRequestAction,
): boolean {
  return (
    isNonblank(action.actionId) &&
    (action.value === undefined || isNonblank(action.value)) &&
    actions.some((candidate) => candidate.actionId === action.actionId && candidate.value === action.value)
  )
}

function requestFrom(
  state: Pick<FilteringPreviewModelState, 'ownerId' | 'variant' | 'fixtureId'>,
  action: FilteringPreviewRequestAction,
): FilteringPreviewRequest {
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

function actionFrom(request: FilteringPreviewRequest): FilteringPreviewRequestAction {
  return request.value === undefined
    ? { actionId: request.actionId }
    : { actionId: request.actionId, value: request.value }
}

function sameRequest(left: FilteringPreviewRequest | undefined, right: FilteringPreviewRequestAction): boolean {
  return left !== undefined && left.actionId === right.actionId && left.value === right.value
}

/** Owns the draft and applied values for a Filtering preview surface. */
export function createFilteringPreviewStore(input: FilteringPreviewSeed): FilteringPreviewStoreApi {
  const seed = normalizeSeed(input)
  const defaults = initialValues(seed.fields)

  return createStore<FilteringPreviewModelState>((set, get) => ({
    ...seed,
    valuesById: cloneValues(defaults),
    appliedById: cloneValues(defaults),
    lastRequest: undefined,
    setValue(ownerId, fieldId, value) {
      const state = get()
      if (!ownsState(state, ownerId) || !isNonblank(fieldId)) return false
      const field = state.fields.find((candidate) => candidate.id === fieldId)
      if (field === undefined || field.disabled === true) return false
      const nextValue = normalizeValueForField(field, value, 'input')
      if (nextValue === undefined) return false
      if (sameValue(state.valuesById[fieldId], nextValue)) return true
      set({
        valuesById: { ...state.valuesById, [fieldId]: cloneValue(nextValue) },
        lastRequest: undefined,
      })
      return true
    },
    reset(ownerId, fieldIds) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      const selectedIds = fieldIds === undefined ? state.fields.map((field) => field.id) : [...fieldIds]
      if (selectedIds.some((id) => !isNonblank(id) || !state.fields.some((field) => field.id === id))) return false
      const selected = new Set(selectedIds)
      const nextValues = cloneValues(state.valuesById)
      for (const field of state.fields) {
        if (selected.has(field.id)) nextValues[field.id] = initialValue(field)
      }
      if (sameValues(state.valuesById, nextValues)) return true
      set({ valuesById: nextValues, lastRequest: undefined })
      return true
    },
    apply(ownerId) {
      const state = get()
      if (!ownsState(state, ownerId)) return false
      if (sameValues(state.valuesById, state.appliedById)) return true
      set({ appliedById: cloneValues(state.valuesById), lastRequest: undefined })
      return true
    },
    request(ownerId, action) {
      const state = get()
      if (!ownsState(state, ownerId) || !allowsRequest(state.requestActions, action)) return undefined
      if (sameRequest(state.lastRequest, action)) return undefined
      const request = requestFrom(state, action)
      set({ lastRequest: request })
      return request
    },
    refresh(nextInput) {
      const state = get()
      const next = normalizeSeed(nextInput)
      if (
        !ownsState(state, state.ownerId) ||
        next.ownerId !== state.ownerId ||
        next.variant !== state.variant ||
        next.fixtureId !== state.fixtureId
      )
        return false

      const valuesById = reconcileValues(next.fields, state.valuesById)
      const appliedById = reconcileValues(next.fields, state.appliedById)
      const seedChanged =
        !sameFields(state.fields, next.fields) || !sameRequestActions(state.requestActions, next.requestActions)
      const valuesChanged = !sameValues(state.valuesById, valuesById) || !sameValues(state.appliedById, appliedById)
      const currentAction = state.lastRequest === undefined ? undefined : actionFrom(state.lastRequest)
      const preserveRequest =
        !seedChanged &&
        !valuesChanged &&
        currentAction !== undefined &&
        allowsRequest(next.requestActions, currentAction)
      set({
        ...next,
        valuesById,
        appliedById,
        lastRequest: preserveRequest ? state.lastRequest : undefined,
      })
      return true
    },
  }))
}

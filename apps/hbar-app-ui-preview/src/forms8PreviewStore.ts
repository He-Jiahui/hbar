import { createStore } from 'zustand/vanilla'

export type Forms8MatchMode = 'all' | 'any'
export type Forms8FieldKind = 'number' | 'text' | 'choice' | 'boolean'
export type Forms8ConditionValueKind =
  'number' | 'number-range' | 'text' | 'text-list' | 'choice' | 'choice-many' | 'boolean'

export interface Forms8Choice {
  readonly id: string
  readonly label: string
}

export interface Forms8ChoiceCatalog {
  readonly completeness: 'complete' | 'partial' | 'unobserved'
  readonly items: readonly Forms8Choice[]
}

export interface Forms8OperatorDefinition {
  readonly id: string
  readonly label: string
  readonly valueKind: Forms8ConditionValueKind
}

export interface Forms8ConditionField {
  readonly id: string
  readonly label: string
  readonly kind: Forms8FieldKind
  readonly operators: readonly Forms8OperatorDefinition[]
  readonly unitLabel?: string
  readonly options?: Forms8ChoiceCatalog
  /** Distinguishes directly checked field semantics from fixture-only inference. */
  readonly modelEvidence: 'source-observed' | 'inferred-from-field-type'
}

export type Forms8ConditionValue =
  | { readonly kind: 'number'; readonly value: string }
  | { readonly kind: 'number-range'; readonly lower: string; readonly upper: string }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'text-list'; readonly values: readonly string[] }
  | { readonly kind: 'choice'; readonly optionId: string }
  | { readonly kind: 'choice-many'; readonly optionIds: readonly string[] }
  | { readonly kind: 'boolean'; readonly value: boolean }

export interface Forms8Condition {
  readonly id: string
  readonly fieldId: string
  readonly operatorId: string
  readonly value: Forms8ConditionValue
}

export type Forms8RuleAction =
  | {
      readonly id: string
      readonly kind: 'route-to-zone'
      readonly label: string
      readonly zoneId: string
      readonly zoneLabel: string
    }
  | {
      readonly id: string
      readonly kind: 'notify'
      readonly label: string
      readonly recipientId: string
      readonly recipientLabel: string
    }

export interface Forms8RuleDraft {
  readonly matchMode: Forms8MatchMode
  readonly conditions: readonly Forms8Condition[]
  readonly actions: readonly Forms8RuleAction[]
}

export interface Forms8PreviewStoreSeed {
  readonly fields: readonly Forms8ConditionField[]
  readonly initialMatchMode: Forms8MatchMode
  readonly initialConditions: readonly Forms8Condition[]
  readonly actions: readonly Forms8RuleAction[]
}

export type Forms8PreviewHostRequest =
  | { readonly kind: 'save-rule'; readonly draft: Forms8RuleDraft }
  | { readonly kind: 'test-rule'; readonly draft: Forms8RuleDraft }
  | { readonly kind: 'remove-condition'; readonly conditionId: string }

export interface Forms8PreviewStoreState extends Omit<
  Forms8PreviewStoreSeed,
  'initialMatchMode' | 'initialConditions'
> {
  readonly matchMode: Forms8MatchMode
  readonly conditions: readonly Forms8Condition[]
  readonly setMatchMode: (mode: Forms8MatchMode) => boolean
  readonly setConditionField: (conditionId: string, fieldId: string) => boolean
  readonly setConditionOperator: (conditionId: string, operatorId: string) => boolean
  readonly setConditionValue: (conditionId: string, value: Forms8ConditionValue) => boolean
  readonly addCondition: () => string
  readonly removeCondition: (conditionId: string) => boolean
  readonly requestConditionRemoval: (conditionId: string) => Forms8PreviewHostRequest | null
  readonly requestSaveRule: () => Forms8PreviewHostRequest
  readonly requestTestRule: () => Forms8PreviewHostRequest
}

function assertUniqueIds(items: readonly { readonly id: string }[], label: string): void {
  const ids = items.map((item) => item.id)
  if (ids.some((id) => !id.trim())) throw new RangeError(`${label} IDs must not be empty.`)
  if (new Set(ids).size !== ids.length) throw new RangeError(`${label} IDs must be unique.`)
}

function fieldById(fields: readonly Forms8ConditionField[], fieldId: string): Forms8ConditionField | undefined {
  return fields.find((field) => field.id === fieldId)
}

function operatorById(field: Forms8ConditionField, operatorId: string): Forms8OperatorDefinition | undefined {
  return field.operators.find((operator) => operator.id === operatorId)
}

function isCompatibleValueKind(fieldKind: Forms8FieldKind, valueKind: Forms8ConditionValueKind): boolean {
  switch (fieldKind) {
    case 'number':
      return valueKind === 'number' || valueKind === 'number-range'
    case 'text':
      return valueKind === 'text' || valueKind === 'text-list'
    case 'choice':
      return valueKind === 'choice' || valueKind === 'choice-many'
    case 'boolean':
      return valueKind === 'boolean'
  }
}

function emptyValue(kind: Forms8ConditionValueKind): Forms8ConditionValue {
  switch (kind) {
    case 'number':
      return { kind, value: '' }
    case 'number-range':
      return { kind, lower: '', upper: '' }
    case 'text':
      return { kind, value: '' }
    case 'text-list':
      return { kind, values: [] }
    case 'choice':
      return { kind, optionId: '' }
    case 'choice-many':
      return { kind, optionIds: [] }
    case 'boolean':
      return { kind, value: false }
  }
}

function cloneValue(value: Forms8ConditionValue): Forms8ConditionValue {
  switch (value.kind) {
    case 'number':
    case 'text':
    case 'choice':
    case 'boolean':
      return { ...value }
    case 'number-range':
      return { ...value }
    case 'text-list':
      return { ...value, values: [...value.values] }
    case 'choice-many':
      return { ...value, optionIds: [...value.optionIds] }
  }
}

function cloneCondition(condition: Forms8Condition): Forms8Condition {
  return { ...condition, value: cloneValue(condition.value) }
}

function cloneField(field: Forms8ConditionField): Forms8ConditionField {
  return {
    ...field,
    operators: field.operators.map((operator) => ({ ...operator })),
    ...(field.options
      ? {
          options: {
            completeness: field.options.completeness,
            items: field.options.items.map((option) => ({ ...option })),
          },
        }
      : {}),
  }
}

function cloneAction(action: Forms8RuleAction): Forms8RuleAction {
  return { ...action }
}

function cloneDraft(draft: Forms8RuleDraft): Forms8RuleDraft {
  return {
    matchMode: draft.matchMode,
    conditions: draft.conditions.map(cloneCondition),
    actions: draft.actions.map(cloneAction),
  }
}

function assertSeed(seed: Forms8PreviewStoreSeed): void {
  if (seed.initialMatchMode !== 'all' && seed.initialMatchMode !== 'any') {
    throw new RangeError('The initial match mode must be all or any.')
  }
  if (seed.fields.length === 0) throw new RangeError('At least one condition field is required.')
  assertUniqueIds(seed.fields, 'Condition field')
  assertUniqueIds(seed.initialConditions, 'Condition')
  assertUniqueIds(seed.actions, 'Action')

  for (const field of seed.fields) {
    assertUniqueIds(field.operators, `Operator for ${field.id}`)
    if (field.operators.length === 0) throw new RangeError(`Condition field ${field.id} must have an operator.`)
    if (field.kind === 'choice' && !field.options) {
      throw new RangeError(`Choice field ${field.id} must declare its option catalog boundary.`)
    }
    if (field.kind !== 'choice' && field.options) {
      throw new RangeError(`Non-choice field ${field.id} cannot declare choice options.`)
    }
    if (field.options) assertUniqueIds(field.options.items, `Option for ${field.id}`)
    for (const operator of field.operators) {
      if (!isCompatibleValueKind(field.kind, operator.valueKind)) {
        throw new RangeError(`Operator ${operator.id} is incompatible with field ${field.id}.`)
      }
    }
  }

  for (const condition of seed.initialConditions) {
    const field = fieldById(seed.fields, condition.fieldId)
    if (!field) throw new RangeError(`Unknown field ID: ${condition.fieldId}`)
    const operator = operatorById(field, condition.operatorId)
    if (!operator) throw new RangeError(`Unknown operator ID ${condition.operatorId} for field ${field.id}.`)
    if (!isValidValue(field, operator, condition.value)) {
      throw new RangeError(`The initial value for condition ${condition.id} does not match its field/operator.`)
    }
  }
}

function isValidChoiceId(field: Forms8ConditionField, optionId: string): boolean {
  if (!optionId) return true
  const catalog = field.options
  if (!catalog || catalog.completeness !== 'complete') return true
  return catalog.items.some((option) => option.id === optionId)
}

function isValidValue(
  field: Forms8ConditionField,
  operator: Forms8OperatorDefinition,
  value: Forms8ConditionValue,
): boolean {
  if (value.kind !== operator.valueKind) return false
  switch (value.kind) {
    case 'number':
    case 'number-range':
    case 'text':
    case 'text-list':
    case 'boolean':
      return true
    case 'choice':
      return isValidChoiceId(field, value.optionId)
    case 'choice-many':
      return value.optionIds.every((optionId) => isValidChoiceId(field, optionId))
  }
}

function valuesEqual(left: Forms8ConditionValue, right: Forms8ConditionValue): boolean {
  switch (left.kind) {
    case 'number':
      return right.kind === 'number' && left.value === right.value
    case 'text':
      return right.kind === 'text' && left.value === right.value
    case 'choice':
      return right.kind === 'choice' && left.optionId === right.optionId
    case 'boolean':
      return right.kind === 'boolean' && left.value === right.value
    case 'number-range':
      return right.kind === 'number-range' && left.lower === right.lower && left.upper === right.upper
    case 'text-list':
      return (
        right.kind === 'text-list' &&
        left.values.length === right.values.length &&
        left.values.every((value, index) => value === right.values[index])
      )
    case 'choice-many':
      return (
        right.kind === 'choice-many' &&
        left.optionIds.length === right.optionIds.length &&
        left.optionIds.every((value, index) => value === right.optionIds[index])
      )
  }
}

function conditionForField(conditionId: string, field: Forms8ConditionField): Forms8Condition {
  const firstOperator = field.operators[0]
  if (!firstOperator) throw new RangeError(`Condition field ${field.id} must have an operator.`)
  return {
    id: conditionId,
    fieldId: field.id,
    operatorId: firstOperator.id,
    value: emptyValue(firstOperator.valueKind),
  }
}

export function createForms8PreviewStore(seed: Forms8PreviewStoreSeed) {
  assertSeed(seed)

  const immutableFields = seed.fields.map(cloneField)
  const immutableActions = seed.actions.map(cloneAction)
  const initialConditions = seed.initialConditions.map(cloneCondition)
  let nextConditionNumber = 1

  return createStore<Forms8PreviewStoreState>((set, get) => ({
    fields: immutableFields,
    actions: immutableActions,
    matchMode: seed.initialMatchMode,
    conditions: initialConditions,
    setMatchMode: (mode) => {
      if ((mode !== 'all' && mode !== 'any') || get().matchMode === mode) return false
      set({ matchMode: mode })
      return true
    },
    setConditionField: (conditionId, fieldId) => {
      const state = get()
      const condition = state.conditions.find((item) => item.id === conditionId)
      const field = fieldById(state.fields, fieldId)
      if (!condition || !field || condition.fieldId === fieldId) return false
      const replacement = conditionForField(condition.id, field)
      set({
        conditions: state.conditions.map((item) => (item.id === conditionId ? replacement : item)),
      })
      return true
    },
    setConditionOperator: (conditionId, operatorId) => {
      const state = get()
      const condition = state.conditions.find((item) => item.id === conditionId)
      if (!condition) return false
      const field = fieldById(state.fields, condition.fieldId)
      const operator = field ? operatorById(field, operatorId) : undefined
      if (!field || !operator || condition.operatorId === operatorId) return false
      const replacement: Forms8Condition = {
        ...condition,
        operatorId,
        value: emptyValue(operator.valueKind),
      }
      set({
        conditions: state.conditions.map((item) => (item.id === conditionId ? replacement : item)),
      })
      return true
    },
    setConditionValue: (conditionId, value) => {
      const state = get()
      const condition = state.conditions.find((item) => item.id === conditionId)
      if (!condition) return false
      const field = fieldById(state.fields, condition.fieldId)
      const operator = field ? operatorById(field, condition.operatorId) : undefined
      if (!field || !operator || !isValidValue(field, operator, value) || valuesEqual(condition.value, value)) {
        return false
      }
      set({
        conditions: state.conditions.map((item) =>
          item.id === conditionId ? { ...item, value: cloneValue(value) } : item,
        ),
      })
      return true
    },
    addCondition: () => {
      const state = get()
      const field = state.fields[0]
      if (!field) throw new RangeError('At least one condition field is required.')
      let conditionId = `condition-draft-${nextConditionNumber}`
      while (state.conditions.some((condition) => condition.id === conditionId)) {
        nextConditionNumber += 1
        conditionId = `condition-draft-${nextConditionNumber}`
      }
      nextConditionNumber += 1
      set({ conditions: [...state.conditions, conditionForField(conditionId, field)] })
      return conditionId
    },
    removeCondition: (conditionId) => {
      const state = get()
      if (!state.conditions.some((condition) => condition.id === conditionId)) return false
      set({ conditions: state.conditions.filter((condition) => condition.id !== conditionId) })
      return true
    },
    requestConditionRemoval: (conditionId) =>
      get().conditions.some((condition) => condition.id === conditionId)
        ? { kind: 'remove-condition', conditionId }
        : null,
    requestSaveRule: () => {
      const state = get()
      return {
        kind: 'save-rule',
        draft: cloneDraft({ matchMode: state.matchMode, conditions: state.conditions, actions: state.actions }),
      }
    },
    requestTestRule: () => {
      const state = get()
      return {
        kind: 'test-rule',
        draft: cloneDraft({ matchMode: state.matchMode, conditions: state.conditions, actions: state.actions }),
      }
    },
  }))
}

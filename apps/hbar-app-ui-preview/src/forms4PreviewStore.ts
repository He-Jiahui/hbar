import { createStore } from 'zustand/vanilla'

export type Forms4TextPropertyId = 'assetTag' | 'model' | 'site' | 'bayLocation' | 'custodian'
export type Forms4DatePropertyId = 'warrantyEnds' | 'lastServiced'
export type Forms4ChoicePropertyId = 'condition' | 'serviceInterval'
export type Forms4PropertyId = Forms4TextPropertyId | Forms4DatePropertyId | Forms4ChoicePropertyId
export type Forms4PropertyIcon =
  | 'asset-tag'
  | 'model'
  | 'site'
  | 'bay-location'
  | 'condition'
  | 'custodian'
  | 'warranty'
  | 'last-serviced'
  | 'service-interval'

export interface Forms4Choice {
  readonly id: string
  readonly label: string
}

interface Forms4PropertyBase<Id extends Forms4PropertyId> {
  readonly id: Id
  readonly label: string
  readonly valueLabel: string
  readonly icon: Forms4PropertyIcon
}

export interface Forms4TextProperty extends Forms4PropertyBase<Forms4TextPropertyId> {
  readonly kind: 'text'
  readonly value: string
}

export interface Forms4DateProperty extends Forms4PropertyBase<Forms4DatePropertyId> {
  readonly kind: 'date'
  readonly value: string
}

export interface Forms4ChoiceProperty extends Forms4PropertyBase<Forms4ChoicePropertyId> {
  readonly kind: 'choice'
  readonly value: string
  readonly choices: readonly Forms4Choice[]
}

export type Forms4Property = Forms4TextProperty | Forms4DateProperty | Forms4ChoiceProperty

export interface Forms4SaveRequest {
  readonly propertyId: Forms4PropertyId
  readonly value: string
}

export interface Forms4PreviewStoreSeed {
  readonly properties: readonly Forms4Property[]
  readonly conditionTrackingEnabled: boolean
}

export interface Forms4PreviewStoreState extends Forms4PreviewStoreSeed {
  readonly editing: Forms4SaveRequest | null
  readonly lastSaveRequest: Forms4SaveRequest | null
  readonly beginEdit: (propertyId: Forms4PropertyId) => boolean
  readonly updateEditValue: (value: string) => boolean
  readonly cancelEdit: () => boolean
  readonly requestSave: () => Forms4SaveRequest | null
  readonly setConditionTracking: (enabled: boolean) => boolean
}

function assertUniquePropertyIds(properties: readonly Forms4Property[]): void {
  const seen = new Set<Forms4PropertyId>()
  for (const property of properties) {
    if (seen.has(property.id)) throw new RangeError('Equipment property IDs must be unique.')
    seen.add(property.id)
  }
}

function assertChoices(property: Forms4Property): void {
  if (property.kind !== 'choice') return
  const seen = new Set<string>()
  for (const choice of property.choices) {
    if (!choice.id.trim()) throw new RangeError(`Choices for ${property.id} must have non-empty IDs.`)
    if (seen.has(choice.id)) throw new RangeError(`Choices for ${property.id} must be unique.`)
    seen.add(choice.id)
  }
  if (!seen.has(property.value)) {
    throw new RangeError(`The selected ${property.id} value must reference an available choice.`)
  }
}

export function createForms4PreviewStore(seed: Forms4PreviewStoreSeed) {
  assertUniquePropertyIds(seed.properties)
  for (const property of seed.properties) assertChoices(property)

  return createStore<Forms4PreviewStoreState>()((set, get) => ({
    ...seed,
    properties: seed.properties.map((property) => ({
      ...property,
      ...(property.kind === 'choice'
        ? { choices: property.choices.map((choice) => ({ ...choice })) }
        : {}),
    })),
    editing: null,
    lastSaveRequest: null,
    beginEdit: (propertyId) => {
      const property = get().properties.find((candidate) => candidate.id === propertyId)
      if (!property) return false
      const next = { propertyId, value: property.value }
      if (get().editing?.propertyId === propertyId && get().editing?.value === next.value) return false
      set({ editing: next })
      return true
    },
    updateEditValue: (value) => {
      const editing = get().editing
      if (!editing || editing.value === value) return false
      set({ editing: { ...editing, value } })
      return true
    },
    cancelEdit: () => {
      if (get().editing === null) return false
      set({ editing: null })
      return true
    },
    requestSave: () => {
      const editing = get().editing
      if (!editing) return null
      const request = { ...editing }
      set({ lastSaveRequest: request })
      return request
    },
    setConditionTracking: (enabled) => {
      if (get().conditionTrackingEnabled === enabled) return false
      set({ conditionTrackingEnabled: enabled })
      return true
    },
  }))
}

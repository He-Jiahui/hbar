import { createStore } from 'zustand/vanilla'

export type Forms3TextFieldId = 'bookingReference' | 'taxIdentifier' | 'bookingContact'
export type Forms3DateFieldId = 'pickupDate' | 'deliveryDate'
export type Forms3ChoiceFieldId = 'accountId' | 'incotermId' | 'serviceLevelId' | 'currencyId'
export type Forms3LineTextFieldId = 'quantity' | 'unitRate'
export type Forms3LineChoiceFieldId = 'descriptionId' | 'dutyRateId'

export interface Forms3CurrencyOption {
  readonly id: string
  readonly code: string
}

export interface Forms3DutyRateOption {
  readonly id: string
  readonly basisPoints: number
}

export interface Forms3DraftLine {
  readonly id: string
  readonly descriptionId: string | null
  readonly quantity: string
  readonly unitRate: string
  readonly dutyRateId: string | null
}

export interface Forms3Draft {
  readonly accountId: string
  readonly bookingReference: string
  readonly taxIdentifier: string
  readonly bookingContact: string
  readonly pickupDate: string
  readonly deliveryDate: string
  readonly incotermId: string
  readonly serviceLevelId: string
  readonly currencyId: string
  readonly lines: readonly Forms3DraftLine[]
}

export interface Forms3PreviewStoreSeed {
  readonly initialDraft: Forms3Draft
  readonly accountIds: readonly string[]
  readonly incotermIds: readonly string[]
  readonly serviceLevelIds: readonly string[]
  readonly currencies: readonly Forms3CurrencyOption[]
  readonly descriptionIds: readonly string[]
  readonly dutyRates: readonly Forms3DutyRateOption[]
}

export interface Forms3LineTotals {
  readonly lineId: string
  readonly baseAmountMinor: number
  readonly dutyAmountMinor: number
  readonly amountMinor: number
}

export interface Forms3Totals {
  readonly lineAmounts: readonly Forms3LineTotals[]
  readonly subtotalMinor: number
  readonly dutyTotalMinor: number
  readonly grandTotalMinor: number
}

export interface Forms3PreviewStoreState extends Forms3PreviewStoreSeed {
  readonly draft: Forms3Draft
  readonly nextLineNumber: number
  readonly setTextField: (fieldId: Forms3TextFieldId, value: string) => boolean
  readonly setDateField: (fieldId: Forms3DateFieldId, value: string) => boolean
  readonly selectChoice: (fieldId: Forms3ChoiceFieldId, choiceId: string) => boolean
  readonly setLineText: (lineId: string, fieldId: Forms3LineTextFieldId, value: string) => boolean
  readonly selectLineChoice: (lineId: string, fieldId: Forms3LineChoiceFieldId, choiceId: string) => boolean
  readonly addLine: () => string
  readonly removeLine: (lineId: string) => boolean
}

function cloneDraft(draft: Forms3Draft): Forms3Draft {
  return { ...draft, lines: draft.lines.map((line) => ({ ...line })) }
}

function assertUniqueIds(ids: readonly string[], name: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!id.trim()) throw new RangeError(`${name} IDs must not be empty.`)
    if (seen.has(id)) throw new RangeError(`${name} IDs must be unique.`)
    seen.add(id)
  }
}

function assertAvailableChoice(options: readonly string[], selectedId: string, name: string): void {
  if (!options.includes(selectedId)) throw new RangeError(`The initial ${name} must reference an available choice.`)
}

function assertDraftLines(seed: Forms3PreviewStoreSeed): void {
  assertUniqueIds(
    seed.initialDraft.lines.map((line) => line.id),
    'Cargo line',
  )
  const descriptionIds = new Set(seed.descriptionIds)
  const dutyRateIds = new Set(seed.dutyRates.map((rate) => rate.id))
  for (const line of seed.initialDraft.lines) {
    if (line.descriptionId !== null && !descriptionIds.has(line.descriptionId)) {
      throw new RangeError('Initial cargo descriptions must reference an available choice.')
    }
    if (line.dutyRateId !== null && !dutyRateIds.has(line.dutyRateId)) {
      throw new RangeError('Initial duty rates must reference an available choice.')
    }
  }
}

function numericValue(value: string): number {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function moneyMinor(value: string): number {
  return Math.round(numericValue(value) * 100)
}

export function deriveForms3Totals(
  lines: readonly Forms3DraftLine[],
  dutyRates: readonly Forms3DutyRateOption[],
): Forms3Totals {
  const rateById = new Map(dutyRates.map((rate) => [rate.id, rate.basisPoints]))
  let subtotalMinor = 0
  let dutyTotalMinor = 0
  const lineAmounts = lines.map((line) => {
    const baseAmountMinor = Math.round(numericValue(line.quantity) * moneyMinor(line.unitRate))
    const basisPoints = line.dutyRateId === null ? 0 : (rateById.get(line.dutyRateId) ?? 0)
    const dutyAmountMinor = Math.round((baseAmountMinor * basisPoints) / 10_000)
    subtotalMinor += baseAmountMinor
    dutyTotalMinor += dutyAmountMinor
    return {
      lineId: line.id,
      baseAmountMinor,
      dutyAmountMinor,
      amountMinor: baseAmountMinor + dutyAmountMinor,
    }
  })

  return { lineAmounts, subtotalMinor, dutyTotalMinor, grandTotalMinor: subtotalMinor + dutyTotalMinor }
}

export function createForms3PreviewStore(seed: Forms3PreviewStoreSeed) {
  assertUniqueIds(seed.accountIds, 'Account')
  assertUniqueIds(seed.incotermIds, 'Incoterm')
  assertUniqueIds(seed.serviceLevelIds, 'Service level')
  assertUniqueIds(
    seed.currencies.map((currency) => currency.id),
    'Currency',
  )
  assertUniqueIds(seed.descriptionIds, 'Cargo description')
  assertUniqueIds(
    seed.dutyRates.map((rate) => rate.id),
    'Duty rate',
  )
  assertAvailableChoice(seed.accountIds, seed.initialDraft.accountId, 'account')
  assertAvailableChoice(seed.incotermIds, seed.initialDraft.incotermId, 'incoterm')
  assertAvailableChoice(seed.serviceLevelIds, seed.initialDraft.serviceLevelId, 'service level')
  assertAvailableChoice(
    seed.currencies.map((currency) => currency.id),
    seed.initialDraft.currencyId,
    'currency',
  )
  assertDraftLines(seed)

  const initialDraft = cloneDraft(seed.initialDraft)
  return createStore<Forms3PreviewStoreState>((set, get) => ({
    ...seed,
    currencies: seed.currencies.map((currency) => ({ ...currency })),
    dutyRates: seed.dutyRates.map((rate) => ({ ...rate })),
    draft: cloneDraft(initialDraft),
    nextLineNumber: initialDraft.lines.length + 1,
    setTextField: (fieldId, value) => {
      const state = get()
      if (state.draft[fieldId] === value) return false
      set({ draft: { ...state.draft, [fieldId]: value } })
      return true
    },
    setDateField: (fieldId, value) => {
      const state = get()
      if (state.draft[fieldId] === value) return false
      set({ draft: { ...state.draft, [fieldId]: value } })
      return true
    },
    selectChoice: (fieldId, choiceId) => {
      const state = get()
      const availableIds: Readonly<Record<Forms3ChoiceFieldId, readonly string[]>> = {
        accountId: state.accountIds,
        incotermId: state.incotermIds,
        serviceLevelId: state.serviceLevelIds,
        currencyId: state.currencies.map((currency) => currency.id),
      }
      if (!availableIds[fieldId].includes(choiceId) || state.draft[fieldId] === choiceId) return false
      set({ draft: { ...state.draft, [fieldId]: choiceId } })
      return true
    },
    setLineText: (lineId, fieldId, value) => {
      const state = get()
      const line = state.draft.lines.find((candidate) => candidate.id === lineId)
      if (!line || line[fieldId] === value) return false
      set({
        draft: {
          ...state.draft,
          lines: state.draft.lines.map((candidate) =>
            candidate.id === lineId ? { ...candidate, [fieldId]: value } : candidate,
          ),
        },
      })
      return true
    },
    selectLineChoice: (lineId, fieldId, choiceId) => {
      const state = get()
      const line = state.draft.lines.find((candidate) => candidate.id === lineId)
      if (!line) return false
      const availableIds = fieldId === 'descriptionId' ? state.descriptionIds : state.dutyRates.map((rate) => rate.id)
      if (!availableIds.includes(choiceId) || line[fieldId] === choiceId) return false
      set({
        draft: {
          ...state.draft,
          lines: state.draft.lines.map((candidate) =>
            candidate.id === lineId ? { ...candidate, [fieldId]: choiceId } : candidate,
          ),
        },
      })
      return true
    },
    addLine: () => {
      const state = get()
      const currentIds = new Set(state.draft.lines.map((line) => line.id))
      let sequence = state.nextLineNumber
      let lineId = `cargo-line-${sequence}`
      while (currentIds.has(lineId)) {
        sequence += 1
        lineId = `cargo-line-${sequence}`
      }
      set((current) => ({
        draft: {
          ...current.draft,
          lines: [
            ...current.draft.lines,
            { id: lineId, descriptionId: null, quantity: '', unitRate: '', dutyRateId: null },
          ],
        },
        nextLineNumber: sequence + 1,
      }))
      return lineId
    },
    removeLine: (lineId) => {
      const state = get()
      if (!state.draft.lines.some((line) => line.id === lineId)) return false
      set((current) => ({
        draft: { ...current.draft, lines: current.draft.lines.filter((line) => line.id !== lineId) },
      }))
      return true
    },
  }))
}

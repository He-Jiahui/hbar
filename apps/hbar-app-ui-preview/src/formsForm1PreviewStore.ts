import { createStore } from 'zustand/vanilla'

export type FormsForm1TextFieldId = 'surveyTitle' | 'stationCode' | 'vessel'
export type FormsForm1DateFieldId = 'deployment' | 'recovery'

export interface FormsForm1Choice {
  readonly id: string
  readonly label: string
}

export interface FormsForm1StationPhoto {
  readonly id: string
  readonly initials: string
}

export interface FormsForm1Draft {
  readonly surveyTitle: string
  readonly stationCode: string
  readonly vessel: string
  readonly deployment: string
  readonly recovery: string
  readonly dailyStart: string
  readonly methodIds: readonly string[]
  readonly leadCrewId: string
  readonly dataReleaseId: string
  readonly holdForTwelveMonths: boolean
  readonly stationPhoto: FormsForm1StationPhoto | null
}

export interface FormsForm1PreviewStoreSeed {
  readonly initialDraft: FormsForm1Draft
  readonly methods: readonly FormsForm1Choice[]
  readonly leadCrews: readonly FormsForm1Choice[]
  readonly dataReleaseOptions: readonly FormsForm1Choice[]
  /** The preview keeps its short method-token collection content-grown. */
  readonly methodListStrategy: 'content-grown'
}

export interface FormsForm1PreviewStoreState {
  readonly savedDraft: FormsForm1Draft
  readonly draft: FormsForm1Draft
  readonly methods: readonly FormsForm1Choice[]
  readonly leadCrews: readonly FormsForm1Choice[]
  readonly dataReleaseOptions: readonly FormsForm1Choice[]
  readonly methodListStrategy: 'content-grown'
  readonly dirty: boolean
  readonly completionPercent: number
  readonly methodQuery: string
  readonly setTextField: (fieldId: FormsForm1TextFieldId, value: string) => boolean
  readonly setDateField: (fieldId: FormsForm1DateFieldId, value: string) => boolean
  readonly setDailyStart: (value: string) => boolean
  readonly setMethodQuery: (value: string) => boolean
  readonly addMethod: (methodId: string) => boolean
  readonly removeMethod: (methodId: string) => boolean
  readonly selectLeadCrew: (choiceId: string) => boolean
  readonly selectDataRelease: (choiceId: string) => boolean
  readonly setHoldForTwelveMonths: (value: boolean) => boolean
  readonly removeStationPhoto: () => boolean
  readonly revert: () => boolean
  readonly requestSave: () => FormsForm1Draft | null
}

const progressFieldCount = 10

function cloneDraft(draft: FormsForm1Draft): FormsForm1Draft {
  return {
    ...draft,
    methodIds: [...draft.methodIds],
    stationPhoto: draft.stationPhoto ? { ...draft.stationPhoto } : null,
  }
}

function sameDraft(left: FormsForm1Draft, right: FormsForm1Draft): boolean {
  return (
    left.surveyTitle === right.surveyTitle &&
    left.stationCode === right.stationCode &&
    left.vessel === right.vessel &&
    left.deployment === right.deployment &&
    left.recovery === right.recovery &&
    left.dailyStart === right.dailyStart &&
    left.leadCrewId === right.leadCrewId &&
    left.dataReleaseId === right.dataReleaseId &&
    left.holdForTwelveMonths === right.holdForTwelveMonths &&
    left.methodIds.length === right.methodIds.length &&
    left.methodIds.every((methodId, index) => methodId === right.methodIds[index]) &&
    left.stationPhoto?.id === right.stationPhoto?.id &&
    left.stationPhoto?.initials === right.stationPhoto?.initials
  )
}

function completionFor(draft: FormsForm1Draft): number {
  const answered = [
    draft.surveyTitle.trim().length > 0,
    draft.stationCode.trim().length > 0,
    draft.vessel.trim().length > 0,
    draft.deployment.length > 0,
    draft.recovery.length > 0,
    draft.dailyStart.length > 0,
    draft.methodIds.length > 0,
    draft.leadCrewId.length > 0,
    draft.dataReleaseId.length > 0,
    typeof draft.holdForTwelveMonths === 'boolean',
  ].filter(Boolean).length
  return Math.round((answered / progressFieldCount) * 100)
}

function assertUniqueChoices(choices: readonly FormsForm1Choice[], name: string): void {
  const seen = new Set<string>()
  for (const choice of choices) {
    if (!choice.id.trim()) throw new RangeError(`${name} IDs must not be empty.`)
    if (seen.has(choice.id)) throw new RangeError(`${name} IDs must be unique.`)
    seen.add(choice.id)
  }
}

function assertSelection(choices: readonly FormsForm1Choice[], selectedId: string, name: string): void {
  if (!choices.some((choice) => choice.id === selectedId)) {
    throw new RangeError(`The initial ${name} selection must reference an available option.`)
  }
}

export function createFormsForm1PreviewStore(seed: FormsForm1PreviewStoreSeed) {
  assertUniqueChoices(seed.methods, 'Method')
  assertUniqueChoices(seed.leadCrews, 'Lead crew')
  assertUniqueChoices(seed.dataReleaseOptions, 'Data release')

  const initialDraft = cloneDraft(seed.initialDraft)
  if (new Set(initialDraft.methodIds).size !== initialDraft.methodIds.length) {
    throw new RangeError('Initial method IDs must be unique.')
  }
  if (initialDraft.methodIds.some((methodId) => !seed.methods.some((method) => method.id === methodId))) {
    throw new RangeError('Initial methods must reference available options.')
  }
  assertSelection(seed.leadCrews, initialDraft.leadCrewId, 'lead crew')
  assertSelection(seed.dataReleaseOptions, initialDraft.dataReleaseId, 'data release')

  return createStore<FormsForm1PreviewStoreState>((set, get) => ({
    savedDraft: cloneDraft(initialDraft),
    draft: cloneDraft(initialDraft),
    methods: seed.methods.map((method) => ({ ...method })),
    leadCrews: seed.leadCrews.map((choice) => ({ ...choice })),
    dataReleaseOptions: seed.dataReleaseOptions.map((choice) => ({ ...choice })),
    methodListStrategy: seed.methodListStrategy,
    dirty: false,
    completionPercent: completionFor(initialDraft),
    methodQuery: '',
    setTextField: (fieldId, value) => {
      if (get().draft[fieldId] === value) return false
      set((state) => {
        const draft = { ...state.draft, [fieldId]: value }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    setDateField: (fieldId, value) => {
      if (get().draft[fieldId] === value) return false
      set((state) => {
        const draft = { ...state.draft, [fieldId]: value }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    setDailyStart: (value) => {
      if (get().draft.dailyStart === value) return false
      set((state) => {
        const draft = { ...state.draft, dailyStart: value }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    setMethodQuery: (value) => {
      if (get().methodQuery === value) return false
      set({ methodQuery: value })
      return true
    },
    addMethod: (methodId) => {
      const state = get()
      if (!state.methods.some((method) => method.id === methodId) || state.draft.methodIds.includes(methodId)) {
        return false
      }
      set((current) => {
        const draft = { ...current.draft, methodIds: [...current.draft.methodIds, methodId] }
        return {
          draft,
          dirty: !sameDraft(draft, current.savedDraft),
          completionPercent: completionFor(draft),
          methodQuery: '',
        }
      })
      return true
    },
    removeMethod: (methodId) => {
      if (!get().draft.methodIds.includes(methodId)) return false
      set((state) => {
        const draft = { ...state.draft, methodIds: state.draft.methodIds.filter((id) => id !== methodId) }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    selectLeadCrew: (choiceId) => {
      if (!get().leadCrews.some((choice) => choice.id === choiceId) || get().draft.leadCrewId === choiceId) {
        return false
      }
      set((state) => {
        const draft = { ...state.draft, leadCrewId: choiceId }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    selectDataRelease: (choiceId) => {
      if (
        !get().dataReleaseOptions.some((choice) => choice.id === choiceId) ||
        get().draft.dataReleaseId === choiceId
      ) {
        return false
      }
      set((state) => {
        const draft = { ...state.draft, dataReleaseId: choiceId }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    setHoldForTwelveMonths: (value) => {
      if (get().draft.holdForTwelveMonths === value) return false
      set((state) => {
        const draft = { ...state.draft, holdForTwelveMonths: value }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    removeStationPhoto: () => {
      if (get().draft.stationPhoto === null) return false
      set((state) => {
        const draft = { ...state.draft, stationPhoto: null }
        return { draft, dirty: !sameDraft(draft, state.savedDraft), completionPercent: completionFor(draft) }
      })
      return true
    },
    revert: () => {
      const state = get()
      if (!state.dirty) return false
      const draft = cloneDraft(state.savedDraft)
      set({ draft, dirty: false, completionPercent: completionFor(draft), methodQuery: '' })
      return true
    },
    requestSave: () => {
      const state = get()
      return state.dirty ? cloneDraft(state.draft) : null
    },
  }))
}

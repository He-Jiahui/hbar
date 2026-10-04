import { createStore } from 'zustand/vanilla'

export type Forms2TextFieldId = 'sessionTitle' | 'abstract' | 'speakerName' | 'contactAddress' | 'affiliation'

export type Forms2SessionFormatId = 'conference-talk' | 'hands-on-workshop' | 'lightning-slot'
export type Forms2ReadinessItemId = 'sessionTitle' | 'abstract' | 'contactAddress' | 'recordingConsent'
export type Forms2ValidationFieldId = Forms2ReadinessItemId

export interface Forms2Choice<Id extends string = string> {
  readonly id: Id
  readonly label: string
}

export interface Forms2SessionFormat extends Forms2Choice<Forms2SessionFormatId> {
  readonly description: string
  readonly durationMinutes: number
  readonly icon: 'presentation' | 'workshop' | 'microphone'
}

export interface Forms2RoomRequirement extends Forms2Choice {
  readonly initiallyChecked: boolean
}

export interface Forms2Draft {
  readonly sessionTitle: string
  readonly abstract: string
  readonly formatId: Forms2SessionFormatId
  readonly trackId: string
  readonly audienceLevelId: string
  readonly speakerName: string
  readonly contactAddress: string
  readonly affiliation: string
  readonly roomRequirementIds: readonly string[]
  readonly recordingConsent: boolean
}

export interface Forms2ValidationRules {
  readonly sessionTitleMinCharacters: number
  readonly abstractMinCharacters: number
  readonly abstractCounterLimit: number
}

export type Forms2RequestStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string }

export interface Forms2PreviewStoreSeed {
  readonly initialDraft: Forms2Draft
  readonly formats: readonly Forms2SessionFormat[]
  readonly tracks: readonly Forms2Choice[]
  readonly audienceLevels: readonly Forms2Choice[]
  readonly roomRequirements: readonly Forms2RoomRequirement[]
  readonly validationRules: Forms2ValidationRules
}

export interface Forms2ValidationIssues {
  readonly sessionTitle: boolean
  readonly abstract: boolean
  readonly contactAddress: boolean
  readonly recordingConsent: boolean
}

export type Forms2SubmitAttempt =
  | { readonly kind: 'invalid'; readonly draft: Forms2Draft; readonly issues: Forms2ValidationIssues }
  | { readonly kind: 'request'; readonly draft: Forms2Draft }

export interface Forms2PreviewStoreState extends Forms2PreviewStoreSeed {
  readonly draft: Forms2Draft
  readonly submitAttempted: boolean
  readonly requestStatus: Forms2RequestStatus
  readonly setTextField: (fieldId: Forms2TextFieldId, value: string) => boolean
  readonly selectFormat: (formatId: Forms2SessionFormatId) => boolean
  readonly selectTrack: (trackId: string) => boolean
  readonly selectAudienceLevel: (levelId: string) => boolean
  readonly setRoomRequirement: (requirementId: string, checked: boolean) => boolean
  readonly setRecordingConsent: (checked: boolean) => boolean
  readonly setRequestStatus: (status: Forms2RequestStatus) => void
  readonly attemptSubmit: () => Forms2SubmitAttempt
}

function cloneDraft(draft: Forms2Draft): Forms2Draft {
  return { ...draft, roomRequirementIds: [...draft.roomRequirementIds] }
}

function assertUniqueIds(items: readonly { readonly id: string }[], name: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (!item.id.trim()) throw new RangeError(`${name} IDs must not be empty.`)
    if (seen.has(item.id)) throw new RangeError(`${name} IDs must be unique.`)
    seen.add(item.id)
  }
}

function assertSelectedId(choices: readonly Forms2Choice[], selectedId: string, name: string): void {
  if (!choices.some((choice) => choice.id === selectedId)) {
    throw new RangeError(`The initial ${name} must reference an available choice.`)
  }
}

function isContactAddressValid(value: string): boolean {
  const address = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
}

export function deriveForms2ValidationIssues(draft: Forms2Draft, rules: Forms2ValidationRules): Forms2ValidationIssues {
  return {
    sessionTitle: draft.sessionTitle.trim().length < rules.sessionTitleMinCharacters,
    abstract: draft.abstract.length < rules.abstractMinCharacters,
    contactAddress: !isContactAddressValid(draft.contactAddress),
    recordingConsent: !draft.recordingConsent,
  }
}

export function deriveForms2Readiness(
  draft: Forms2Draft,
  rules: Forms2ValidationRules,
): Readonly<Record<Forms2ReadinessItemId, boolean>> {
  const issues = deriveForms2ValidationIssues(draft, rules)
  return {
    sessionTitle: !issues.sessionTitle,
    abstract: !issues.abstract,
    contactAddress: !issues.contactAddress,
    recordingConsent: !issues.recordingConsent,
  }
}

export function createForms2PreviewStore(seed: Forms2PreviewStoreSeed) {
  assertUniqueIds(seed.formats, 'Session format')
  assertUniqueIds(seed.tracks, 'Track')
  assertUniqueIds(seed.audienceLevels, 'Audience level')
  assertUniqueIds(seed.roomRequirements, 'Room requirement')
  assertSelectedId(seed.formats, seed.initialDraft.formatId, 'session format')
  assertSelectedId(seed.tracks, seed.initialDraft.trackId, 'track')
  assertSelectedId(seed.audienceLevels, seed.initialDraft.audienceLevelId, 'audience level')

  const initialDraft = cloneDraft(seed.initialDraft)
  const requirementIds = new Set(seed.roomRequirements.map((item) => item.id))
  if (new Set(initialDraft.roomRequirementIds).size !== initialDraft.roomRequirementIds.length) {
    throw new RangeError('Initial room requirement IDs must be unique.')
  }
  if (initialDraft.roomRequirementIds.some((id) => !requirementIds.has(id))) {
    throw new RangeError('Initial room requirements must reference available choices.')
  }

  return createStore<Forms2PreviewStoreState>((set, get) => ({
    ...seed,
    formats: seed.formats.map((item) => ({ ...item })),
    tracks: seed.tracks.map((item) => ({ ...item })),
    audienceLevels: seed.audienceLevels.map((item) => ({ ...item })),
    roomRequirements: seed.roomRequirements.map((item) => ({ ...item })),
    draft: cloneDraft(initialDraft),
    submitAttempted: false,
    requestStatus: { kind: 'idle' },
    setTextField: (fieldId, value) => {
      if (get().draft[fieldId] === value) return false
      set((state) => ({ draft: { ...state.draft, [fieldId]: value } }))
      return true
    },
    selectFormat: (formatId) => {
      const state = get()
      if (!state.formats.some((format) => format.id === formatId) || state.draft.formatId === formatId) {
        return false
      }
      set((current) => ({ draft: { ...current.draft, formatId } }))
      return true
    },
    selectTrack: (trackId) => {
      const state = get()
      if (!state.tracks.some((track) => track.id === trackId) || state.draft.trackId === trackId) {
        return false
      }
      set((current) => ({ draft: { ...current.draft, trackId } }))
      return true
    },
    selectAudienceLevel: (levelId) => {
      const state = get()
      if (!state.audienceLevels.some((level) => level.id === levelId) || state.draft.audienceLevelId === levelId) {
        return false
      }
      set((current) => ({ draft: { ...current.draft, audienceLevelId: levelId } }))
      return true
    },
    setRoomRequirement: (requirementId, checked) => {
      const state = get()
      if (!state.roomRequirements.some((requirement) => requirement.id === requirementId)) return false
      const selected = state.draft.roomRequirementIds.includes(requirementId)
      if (selected === checked) return false
      set((current) => ({
        draft: {
          ...current.draft,
          roomRequirementIds: checked
            ? [...current.draft.roomRequirementIds, requirementId]
            : current.draft.roomRequirementIds.filter((id) => id !== requirementId),
        },
      }))
      return true
    },
    setRecordingConsent: (checked) => {
      if (get().draft.recordingConsent === checked) return false
      set((state) => ({ draft: { ...state.draft, recordingConsent: checked } }))
      return true
    },
    setRequestStatus: (status) => set({ requestStatus: status }),
    attemptSubmit: () => {
      set({ submitAttempted: true })
      const state = get()
      const draft = cloneDraft(state.draft)
      const issues = deriveForms2ValidationIssues(draft, state.validationRules)
      const isInvalid = Object.values(issues).some(Boolean)
      return isInvalid ? { kind: 'invalid', draft, issues } : { kind: 'request', draft }
    },
  }))
}

import { createStore } from 'zustand/vanilla'

export const FORMS12_STEP_IDS = ['business', 'coverage', 'property', 'review'] as const
export const FORMS12_SECTION_IDS = ['business-details', 'coverage', 'property-location', 'contact'] as const
export const FORMS12_CONSENT_IDS = ['information-accuracy', 'policy-terms'] as const
export const FORMS12_PREMIUM_LINE_IDS = ['base-premium', 'coverage-adjustments', 'multi-cover-discount'] as const
export const FORMS12_FIELD_IDS = [
  'legal-business-name',
  'industry',
  'employee-count',
  'cover-types',
  'aggregate-limit',
  'primary-address',
  'territory',
  'cover-start-date',
  'named-contact',
  'email',
  'phone',
] as const

export type Forms12StepId = (typeof FORMS12_STEP_IDS)[number]
export type Forms12SectionId = (typeof FORMS12_SECTION_IDS)[number]
export type Forms12ConsentId = (typeof FORMS12_CONSENT_IDS)[number]
export type Forms12PremiumLineId = (typeof FORMS12_PREMIUM_LINE_IDS)[number]
export type Forms12FieldId = (typeof FORMS12_FIELD_IDS)[number]

export type Forms12FieldValues = Readonly<Record<Forms12FieldId, string>>
export type Forms12ConsentState = Readonly<Record<Forms12ConsentId, boolean>>

export interface Forms12PremiumLineSnapshot {
  readonly id: Forms12PremiumLineId
  readonly amountMinorUnits: number
  readonly formattedAmount: string
}

export interface Forms12PremiumSnapshot {
  readonly currency: 'GBP'
  readonly lines: readonly Forms12PremiumLineSnapshot[]
  readonly annualTotalMinorUnits: number
  readonly formattedAnnualTotal: string
  readonly recalculationEvidence: 'static-source-values-only-edited-result-unobserved'
}

export interface Forms12PreviewStoreSeed {
  readonly reviewFields: Forms12FieldValues
  readonly premium: Forms12PremiumSnapshot
}

export interface Forms12SectionFieldSnapshot {
  readonly sectionId: Forms12SectionId
  readonly values: Readonly<Partial<Record<Forms12FieldId, string>>>
}

export type Forms12HostRequest =
  | {
      readonly kind: 'cancel-section-edit-request'
      readonly sectionId: Forms12SectionId
      readonly resultBehavior: 'typed-host-request-only-source-result-unobserved'
    }
  | {
      readonly kind: 'save-section-request'
      readonly section: Forms12SectionFieldSnapshot
      readonly resultBehavior: 'typed-host-request-only-source-result-unobserved'
    }
  | {
      readonly kind: 'request-bound-quote'
      readonly reviewFields: Forms12FieldValues
      readonly consents: Forms12ConsentState
      readonly premium: Forms12PremiumSnapshot
      readonly resultBehavior: 'typed-host-request-only-source-result-unobserved'
    }

export interface Forms12PreviewStoreState {
  readonly reviewFields: Forms12FieldValues
  readonly editingSectionId: Forms12SectionId | null
  readonly editDraft: Forms12FieldValues | null
  readonly consents: Forms12ConsentState
  readonly premium: Forms12PremiumSnapshot
  readonly beginSectionEdit: (sectionId: string) => boolean
  readonly setDraftFieldValue: (fieldId: string, value: string) => boolean
  readonly setConsentChecked: (consentId: string, checked: boolean) => boolean
  readonly requestCancelSectionEdit: (sectionId: string) => Forms12HostRequest | null
  readonly requestSaveSection: (sectionId: string) => Forms12HostRequest | null
  readonly requestBoundQuote: () => Forms12HostRequest
}

export const FORMS12_FIELD_IDS_BY_SECTION: Readonly<Record<Forms12SectionId, readonly Forms12FieldId[]>> = {
  'business-details': ['legal-business-name', 'industry', 'employee-count'],
  coverage: ['cover-types', 'aggregate-limit'],
  'property-location': ['primary-address', 'territory', 'cover-start-date'],
  contact: ['named-contact', 'email', 'phone'],
}

function isForms12SectionId(value: string): value is Forms12SectionId {
  return FORMS12_SECTION_IDS.some((id) => id === value)
}

function isForms12FieldId(value: string): value is Forms12FieldId {
  return FORMS12_FIELD_IDS.some((id) => id === value)
}

function isForms12ConsentId(value: string): value is Forms12ConsentId {
  return FORMS12_CONSENT_IDS.some((id) => id === value)
}

function cloneFields(fields: Forms12FieldValues): Forms12FieldValues {
  return { ...fields }
}

function cloneConsents(consents: Forms12ConsentState): Forms12ConsentState {
  return { ...consents }
}

function clonePremiumSnapshot(snapshot: Forms12PremiumSnapshot): Forms12PremiumSnapshot {
  return {
    currency: snapshot.currency,
    lines: snapshot.lines.map((line) => ({ ...line })),
    annualTotalMinorUnits: snapshot.annualTotalMinorUnits,
    formattedAnnualTotal: snapshot.formattedAnnualTotal,
    recalculationEvidence: snapshot.recalculationEvidence,
  }
}

function snapshotSectionFields(sectionId: Forms12SectionId, values: Forms12FieldValues): Forms12SectionFieldSnapshot {
  const sectionValues: Partial<Record<Forms12FieldId, string>> = {}
  for (const fieldId of FORMS12_FIELD_IDS_BY_SECTION[sectionId]) {
    sectionValues[fieldId] = values[fieldId]
  }
  return { sectionId, values: sectionValues }
}

export function createForms12PreviewStore(seed: Forms12PreviewStoreSeed) {
  const initialReviewFields = cloneFields(seed.reviewFields)
  const initialPremium = clonePremiumSnapshot(seed.premium)

  return createStore<Forms12PreviewStoreState>((set, get) => ({
    reviewFields: initialReviewFields,
    editingSectionId: null,
    editDraft: null,
    consents: {
      'information-accuracy': false,
      'policy-terms': false,
    },
    premium: initialPremium,
    beginSectionEdit: (sectionId) => {
      if (!isForms12SectionId(sectionId)) return false
      const state = get()
      if (state.editingSectionId !== null) return false
      set({
        editingSectionId: sectionId,
        editDraft: cloneFields(state.reviewFields),
      })
      return true
    },
    setDraftFieldValue: (fieldId, value) => {
      if (!isForms12FieldId(fieldId)) return false
      const state = get()
      const editingSectionId = state.editingSectionId
      const currentDraft = state.editDraft
      if (
        editingSectionId === null ||
        currentDraft === null ||
        !FORMS12_FIELD_IDS_BY_SECTION[editingSectionId].includes(fieldId) ||
        currentDraft[fieldId] === value
      ) {
        return false
      }
      set({ editDraft: { ...currentDraft, [fieldId]: value } })
      return true
    },
    setConsentChecked: (consentId, checked) => {
      if (!isForms12ConsentId(consentId)) return false
      const state = get()
      if (state.consents[consentId] === checked) return false
      set({ consents: { ...state.consents, [consentId]: checked } })
      return true
    },
    requestCancelSectionEdit: (sectionId) => {
      if (!isForms12SectionId(sectionId) || get().editingSectionId !== sectionId) return null
      return {
        kind: 'cancel-section-edit-request',
        sectionId,
        resultBehavior: 'typed-host-request-only-source-result-unobserved',
      }
    },
    requestSaveSection: (sectionId) => {
      const state = get()
      if (!isForms12SectionId(sectionId) || state.editingSectionId !== sectionId || state.editDraft === null) {
        return null
      }
      return {
        kind: 'save-section-request',
        section: snapshotSectionFields(sectionId, state.editDraft),
        resultBehavior: 'typed-host-request-only-source-result-unobserved',
      }
    },
    requestBoundQuote: () => {
      const state = get()
      return {
        kind: 'request-bound-quote',
        reviewFields: cloneFields(state.reviewFields),
        consents: cloneConsents(state.consents),
        premium: clonePremiumSnapshot(state.premium),
        resultBehavior: 'typed-host-request-only-source-result-unobserved',
      }
    },
  }))
}

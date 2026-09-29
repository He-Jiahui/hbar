import { createStore } from 'zustand/vanilla'

export const FORMS7_REQUIRED_FIELD_COUNT = 8
export const FORMS7_SUMMARY_CHARACTER_BUDGET = 400
export const FORMS7_ATTACHMENT_LIMIT = 5

export type Forms7TextFieldId = 'projectTitle' | 'organization' | 'contactEmail'

export interface Forms7Choice {
  readonly id: string
  readonly label: string
}

export interface Forms7FundingTier extends Forms7Choice {
  readonly description: string
  readonly amountLabel: string
}

export interface Forms7Attachment {
  readonly id: string
  readonly fileName: string
  readonly sizeLabel: string
}

export interface Forms7SelectedFileMetadata {
  readonly fileName: string
  readonly byteSize: number
  readonly mediaType: string
}

export interface Forms7Draft {
  readonly projectTitle: string
  readonly organization: string
  readonly contactEmail: string
  readonly focusAreaId: string
  readonly tagInput: string
  readonly tags: readonly Forms7Choice[]
  readonly fundingTierId: string
  readonly summary: string
  readonly consentChecked: boolean
}

export interface Forms7PreviewStoreSeed {
  readonly initialDraft: Forms7Draft
  readonly focusAreas: readonly Forms7Choice[]
  readonly fundingTiers: readonly Forms7FundingTier[]
  readonly attachments: readonly Forms7Attachment[]
  readonly submitDisabled: boolean
}

export type Forms7HostRequest =
  | { readonly kind: 'commit-discipline-tag'; readonly value: string }
  | { readonly kind: 'remove-discipline-tag'; readonly tagId: string }
  | { readonly kind: 'select-supporting-files'; readonly files: readonly Forms7SelectedFileMetadata[] }
  | { readonly kind: 'remove-supporting-file'; readonly attachmentId: string }
  | { readonly kind: 'save-application-draft' }
  | { readonly kind: 'submit-application' }

export interface Forms7PreviewStoreState extends Forms7PreviewStoreSeed {
  readonly draft: Forms7Draft
  readonly setTextField: (fieldId: Forms7TextFieldId, value: string) => boolean
  readonly selectFocusArea: (focusAreaId: string) => boolean
  readonly setTagInput: (value: string) => boolean
  readonly requestTagCommit: () => Forms7HostRequest | null
  readonly requestTagRemoval: (tagId: string) => Forms7HostRequest | null
  readonly replaceTagsFromHost: (tags: readonly Forms7Choice[]) => boolean
  readonly selectFundingTier: (fundingTierId: string) => boolean
  readonly setSummary: (value: string) => boolean
  readonly setConsent: (checked: boolean) => boolean
  readonly requestFileSelection: (files: readonly Forms7SelectedFileMetadata[]) => Forms7HostRequest
  readonly requestAttachmentRemoval: (attachmentId: string) => Forms7HostRequest | null
  readonly replaceAttachmentsFromHost: (attachments: readonly Forms7Attachment[]) => boolean
  readonly requestSaveDraft: () => Forms7HostRequest
  readonly requestSubmit: () => Forms7HostRequest | null
}

function cloneDraft(draft: Forms7Draft): Forms7Draft {
  return { ...draft, tags: draft.tags.map((tag) => ({ ...tag })) }
}

function assertUniqueIds(items: readonly { readonly id: string }[], label: string): void {
  const ids = items.map((item) => item.id)
  if (ids.some((id) => !id.trim())) throw new RangeError(`${label} IDs must not be empty.`)
  if (new Set(ids).size !== ids.length) throw new RangeError(`${label} IDs must be unique.`)
}

function assertAttachmentCapacity(attachments: readonly Forms7Attachment[]): void {
  if (attachments.length > FORMS7_ATTACHMENT_LIMIT) {
    throw new RangeError(`Supporting documents cannot exceed ${FORMS7_ATTACHMENT_LIMIT} host records.`)
  }
  assertUniqueIds(attachments, 'Attachment')
}

function assertSelection(options: readonly Forms7Choice[], id: string, label: string): void {
  if (id && !options.some((option) => option.id === id)) {
    throw new RangeError(`The selected ${label} must reference an available option.`)
  }
}

function cloneAttachments(attachments: readonly Forms7Attachment[]): Forms7Attachment[] {
  return attachments.map((attachment) => ({ ...attachment }))
}

export function createForms7PreviewStore(seed: Forms7PreviewStoreSeed) {
  assertUniqueIds(seed.focusAreas, 'Focus-area')
  assertUniqueIds(seed.fundingTiers, 'Funding-tier')
  assertUniqueIds(seed.initialDraft.tags, 'Discipline-tag')
  assertSelection(seed.focusAreas, seed.initialDraft.focusAreaId, 'focus-area selection')
  assertSelection(seed.fundingTiers, seed.initialDraft.fundingTierId, 'funding-tier selection')
  assertAttachmentCapacity(seed.attachments)

  const initialDraft = cloneDraft(seed.initialDraft)
  return createStore<Forms7PreviewStoreState>((set, get) => ({
    ...seed,
    focusAreas: seed.focusAreas.map((area) => ({ ...area })),
    fundingTiers: seed.fundingTiers.map((tier) => ({ ...tier })),
    attachments: cloneAttachments(seed.attachments),
    draft: cloneDraft(initialDraft),
    setTextField: (fieldId, value) => {
      const state = get()
      if (state.draft[fieldId] === value) return false
      set({ draft: { ...state.draft, [fieldId]: value } })
      return true
    },
    selectFocusArea: (focusAreaId) => {
      const state = get()
      if (!state.focusAreas.some((area) => area.id === focusAreaId) || state.draft.focusAreaId === focusAreaId) {
        return false
      }
      set({ draft: { ...state.draft, focusAreaId } })
      return true
    },
    setTagInput: (value) => {
      const state = get()
      if (state.draft.tagInput === value) return false
      set({ draft: { ...state.draft, tagInput: value } })
      return true
    },
    requestTagCommit: () => {
      const value = get().draft.tagInput.trim()
      return value ? { kind: 'commit-discipline-tag', value } : null
    },
    requestTagRemoval: (tagId) => {
      if (!get().draft.tags.some((tag) => tag.id === tagId)) return null
      return { kind: 'remove-discipline-tag', tagId }
    },
    replaceTagsFromHost: (tags) => {
      assertUniqueIds(tags, 'Discipline-tag')
      const state = get()
      if (
        state.draft.tags.length === tags.length &&
        state.draft.tags.every((tag, index) => tag.id === tags[index]?.id && tag.label === tags[index]?.label)
      ) {
        return false
      }
      set({ draft: { ...state.draft, tags: tags.map((tag) => ({ ...tag })) } })
      return true
    },
    selectFundingTier: (fundingTierId) => {
      const state = get()
      if (
        !state.fundingTiers.some((tier) => tier.id === fundingTierId) ||
        state.draft.fundingTierId === fundingTierId
      ) {
        return false
      }
      set({ draft: { ...state.draft, fundingTierId } })
      return true
    },
    setSummary: (value) => {
      const state = get()
      if (state.draft.summary === value) return false
      set({ draft: { ...state.draft, summary: value } })
      return true
    },
    setConsent: (checked) => {
      const state = get()
      if (state.draft.consentChecked === checked) return false
      set({ draft: { ...state.draft, consentChecked: checked } })
      return true
    },
    requestFileSelection: (files) => ({
      kind: 'select-supporting-files',
      files: files.map((file) => ({ ...file })),
    }),
    requestAttachmentRemoval: (attachmentId) => {
      if (!get().attachments.some((attachment) => attachment.id === attachmentId)) return null
      return { kind: 'remove-supporting-file', attachmentId }
    },
    replaceAttachmentsFromHost: (attachments) => {
      assertAttachmentCapacity(attachments)
      const state = get()
      if (
        state.attachments.length === attachments.length &&
        state.attachments.every(
          (attachment, index) =>
            attachment.id === attachments[index]?.id &&
            attachment.fileName === attachments[index]?.fileName &&
            attachment.sizeLabel === attachments[index]?.sizeLabel,
        )
      ) {
        return false
      }
      set({ attachments: cloneAttachments(attachments) })
      return true
    },
    requestSaveDraft: () => ({ kind: 'save-application-draft' }),
    requestSubmit: () => (get().submitDisabled ? null : { kind: 'submit-application' }),
  }))
}

import { createStore } from 'zustand/vanilla'
import type { HbarAppUiSupportTicketFormContent } from 'hbar-app-ui/catalog'

export type SupportTicketPreviewOutcome = 'confirmed' | 'failed'

export interface SupportTicketPreviewRequest {
  readonly requestId: string
  readonly outcome: 'preview-only'
}

export interface SupportTicketPreviewState {
  readonly areaId: string
  readonly workspaceId: string
  readonly priorityId: string
  readonly subject: string
  readonly description: string
  readonly attached: boolean
  readonly phase: 'idle' | 'pending' | 'confirmed' | 'failed'
  readonly error: string | null
  readonly pendingRequest: SupportTicketPreviewRequest | null
  readonly setAreaId: (areaId: string) => void
  readonly setWorkspaceId: (workspaceId: string) => void
  readonly setPriorityId: (priorityId: string) => void
  readonly replaceChoices: (
    choices: Pick<HbarAppUiSupportTicketFormContent, 'areas' | 'workspaces' | 'priorities'>,
  ) => void
  readonly setSubject: (subject: string) => void
  readonly setDescription: (description: string) => void
  readonly addAttachment: () => void
  readonly removeAttachment: () => void
  readonly startSubmit: () => SupportTicketPreviewRequest | null
  readonly completePending: (requestId: string, outcome: SupportTicketPreviewOutcome, error: string | null) => boolean
  readonly cancelPending: () => boolean
}

function uniqueChoices(choices: HbarAppUiSupportTicketFormContent['areas']) {
  const seen = new Set<string>()
  return choices.filter((choice) => {
    const id = choice.id.trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function initialId(id: string, choices: readonly { readonly id: string }[]): string {
  return choices.some((choice) => choice.id === id) ? id : (choices[0]?.id ?? '')
}

let nextOwner = 0

export function createSupportTicketPreviewStore(content: HbarAppUiSupportTicketFormContent) {
  const ownerId = ++nextOwner
  const areas = uniqueChoices(content.areas)
  const workspaces = uniqueChoices(content.workspaces)
  const priorities = uniqueChoices(content.priorities)
  let areaIds = new Set(areas.map(({ id }) => id))
  let workspaceIds = new Set(workspaces.map(({ id }) => id))
  let priorityIds = new Set(priorities.map(({ id }) => id))
  let sequence = 0

  return createStore<SupportTicketPreviewState>((set, get) => {
    const canEdit = () => get().phase === 'idle' || get().phase === 'failed'

    return {
      areaId: initialId(content.initialAreaId, areas),
      workspaceId: initialId(content.initialWorkspaceId, workspaces),
      priorityId: initialId(content.initialPriorityId, priorities),
      subject: content.initialSubject,
      description: '',
      attached: Boolean(content.attachmentName.trim()),
      phase: 'idle',
      error: null,
      pendingRequest: null,
      setAreaId: (areaId) => {
        if (canEdit() && areaIds.has(areaId)) set({ areaId })
      },
      setWorkspaceId: (workspaceId) => {
        if (canEdit() && workspaceIds.has(workspaceId)) set({ workspaceId })
      },
      setPriorityId: (priorityId) => {
        if (canEdit() && priorityIds.has(priorityId)) set({ priorityId })
      },
      replaceChoices: (choices) => {
        const nextAreas = uniqueChoices(choices.areas)
        const nextWorkspaces = uniqueChoices(choices.workspaces)
        const nextPriorities = uniqueChoices(choices.priorities)
        areaIds = new Set(nextAreas.map(({ id }) => id))
        workspaceIds = new Set(nextWorkspaces.map(({ id }) => id))
        priorityIds = new Set(nextPriorities.map(({ id }) => id))
        const current = get()
        const areaId = initialId(current.areaId, nextAreas)
        const workspaceId = initialId(current.workspaceId, nextWorkspaces)
        const priorityId = initialId(current.priorityId, nextPriorities)
        if (areaId === current.areaId && workspaceId === current.workspaceId && priorityId === current.priorityId)
          return
        // A changed request target invalidates its pending acknowledgement, but not the draft.
        set({
          areaId,
          workspaceId,
          priorityId,
          ...(current.phase === 'pending' ? { phase: 'idle', pendingRequest: null, error: null } : {}),
        })
      },
      setSubject: (subject) => {
        if (canEdit()) set({ subject })
      },
      setDescription: (description) => {
        if (canEdit()) set({ description })
      },
      addAttachment: () => {
        if (canEdit()) set({ attached: true })
      },
      removeAttachment: () => {
        if (canEdit()) set({ attached: false })
      },
      startSubmit: () => {
        if (!canEdit()) return null
        const request = {
          requestId: `support-ticket:${ownerId}:${++sequence}`,
          outcome: 'preview-only' as const,
        }
        set({ phase: 'pending', error: null, pendingRequest: request })
        return request
      },
      completePending: (requestId, outcome, error) => {
        const pendingRequest = get().pendingRequest
        if (get().phase !== 'pending' || pendingRequest?.requestId !== requestId) return false
        set({ phase: outcome, error: outcome === 'failed' ? error : null, pendingRequest: null })
        return true
      },
      cancelPending: () => {
        if (get().phase !== 'pending' || !get().pendingRequest) return false
        set({ phase: 'idle', error: null, pendingRequest: null })
        return true
      },
    }
  })
}

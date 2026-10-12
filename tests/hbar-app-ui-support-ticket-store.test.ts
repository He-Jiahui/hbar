import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenSupport, LumenSupportProvider, type LumenSupportContent, type LumenSupportTicketFormContent } from '@lumen/app-ui/catalog'
import {
  createSupportTicketPreviewStore,
  type SupportTicketPreviewState,
} from '../apps/hbar-app-ui-preview/src/supportTicketPreviewStore'
import { HBAR_APP_UI_SUPPORT_FIXTURES } from './fixtures/hbar-app-ui-support-fixtures'

const ticket = (() => {
  const content = HBAR_APP_UI_SUPPORT_FIXTURES.ticket
  if (!content) throw new Error('Expected the support ticket fixture')
  return content
})()

type TicketReferenceFlow = NonNullable<LumenSupportTicketFormContent['referenceFlow']>

function makeFlow(state: SupportTicketPreviewState, changes: Partial<TicketReferenceFlow> = {}): TicketReferenceFlow {
  return {
    areaId: state.areaId,
    workspaceId: state.workspaceId,
    priorityId: state.priorityId,
    subject: state.subject,
    description: state.description,
    attached: state.attached,
    phase: state.phase,
    error: state.error,
    labels: {
      pending: 'Sending the preview request…',
      confirmed: 'Preview accepted. No support ticket was created.',
      errorUnavailable: 'The preview request is unavailable. Try again.',
    },
    onAreaChange: state.setAreaId,
    onWorkspaceChange: state.setWorkspaceId,
    onPriorityChange: state.setPriorityId,
    onSubjectChange: state.setSubject,
    onDescriptionChange: state.setDescription,
    onAttachmentAdd: state.addAttachment,
    onAttachmentRemove: state.removeAttachment,
    onSubmit: state.startSubmit,
    onSaveDraft() {},
    ...changes,
  }
}

function renderTicket(flow: TicketReferenceFlow, instances = 1): string {
  const content: LumenSupportContent = {
    ...HBAR_APP_UI_SUPPORT_FIXTURES,
    ticket: { ...ticket, referenceFlow: flow },
  }
  return renderToStaticMarkup(
    createElement(LumenSupportProvider, {
      content,
      children: createElement(
        Fragment,
        null,
        ...Array.from({ length: instances }, (_, index) =>
          createElement(LumenSupport, { key: index, variant: 2, variantId: `ticket-${index}` }),
        ),
      ),
    }),
  )
}

function attributeValues(markup: string, attribute: 'id' | 'for'): string[] {
  return [...markup.matchAll(new RegExp(`\\s${attribute}="([^"]+)"`, 'g'))].flatMap((match) =>
    match[1] ? [match[1]] : [],
  )
}

describe('support ticket preview store', () => {
  test('starts from valid Host choices and keeps edits Host-owned', () => {
    const store = createSupportTicketPreviewStore({
      ...ticket,
      initialAreaId: 'stale-area',
      initialWorkspaceId: 'stale-workspace',
      initialPriorityId: 'stale-priority',
    })
    const state = store.getState()

    expect(state.phase).toBe('idle')
    expect(state.areaId).toBe(ticket.areas[0]?.id ?? '')
    expect(state.workspaceId).toBe(ticket.workspaces[0]?.id ?? '')
    expect(state.priorityId).toBe(ticket.priorities[0]?.id ?? '')
    expect(state.subject).toBe(ticket.initialSubject)
    expect(state.description).toBe('')
    expect(state.attached).toBe(true)

    state.setAreaId(ticket.areas[1]!.id)
    state.setWorkspaceId(ticket.workspaces[1]!.id)
    state.setPriorityId(ticket.priorities[2]!.id)
    state.setSubject('Export contains no rows')
    state.setDescription('The run completed without output.')
    state.removeAttachment()

    expect(store.getState()).toMatchObject({
      areaId: ticket.areas[1]!.id,
      workspaceId: ticket.workspaces[1]!.id,
      priorityId: ticket.priorities[2]!.id,
      subject: 'Export contains no rows',
      description: 'The run completed without output.',
      attached: false,
    })
    state.setAreaId('unknown')
    expect(store.getState().areaId).toBe(ticket.areas[1]!.id)
  })

  test('deduplicates submissions, ignores stale completions, and confirms only a preview request', () => {
    const store = createSupportTicketPreviewStore(ticket)
    const request = store.getState().startSubmit()

    expect(request).toMatchObject({ outcome: 'preview-only' })
    expect(store.getState().phase).toBe('pending')
    expect(store.getState().startSubmit()).toBeNull()
    store.getState().setSubject('Cannot change a pending request')
    expect(store.getState().subject).toBe(ticket.initialSubject)
    expect(store.getState().completePending('another-owner:1', 'confirmed', null)).toBe(false)
    expect(store.getState().completePending(request?.requestId ?? '', 'confirmed', null)).toBe(true)
    expect(store.getState().phase).toBe('confirmed')
    expect(store.getState().pendingRequest).toBeNull()
    expect(store.getState().startSubmit()).toBeNull()
    expect(store.getState().completePending(request?.requestId ?? '', 'confirmed', null)).toBe(false)
  })

  test('reconciles changed Host choices without losing drafts or accepting retired target callbacks', () => {
    const store = createSupportTicketPreviewStore(ticket)
    store.getState().setSubject('Keep while Host choices change')
    const request = store.getState().startSubmit()
    if (!request) throw new Error('Expected a preview request')
    const area = { id: 'current-area', label: 'Aktueller Bereich' }
    const workspace = { id: 'current-workspace', label: 'Aktueller Arbeitsbereich' }
    const priority = { id: 'current-priority', label: 'Aktuelle Priorität' }
    store.getState().replaceChoices({ areas: [area, area], workspaces: [workspace], priorities: [priority] })
    expect(store.getState()).toMatchObject({
      areaId: area.id,
      workspaceId: workspace.id,
      priorityId: priority.id,
      subject: 'Keep while Host choices change',
      phase: 'idle',
      pendingRequest: null,
    })
    expect(store.getState().completePending(request.requestId, 'confirmed', null)).toBe(false)
    store.getState().setAreaId(ticket.initialAreaId)
    expect(store.getState().areaId).toBe(area.id)
    store.getState().replaceChoices({ areas: [], workspaces: [], priorities: [] })
    expect(store.getState()).toMatchObject({ areaId: '', workspaceId: '', priorityId: '' })
    store.getState().setAreaId(area.id)
    expect(store.getState().areaId).toBe('')
  })

  test('keeps drafts on failure, permits edits and retry, and accepts only the current result', () => {
    const store = createSupportTicketPreviewStore(ticket)
    store.getState().setSubject('Keep this request draft')
    store.getState().setDescription('Retain these details after a failed preview.')
    const failedRequest = store.getState().startSubmit()
    if (!failedRequest) throw new Error('Expected a preview request')

    expect(store.getState().completePending(failedRequest.requestId, 'failed', 'Preview unavailable.')).toBe(true)
    expect(store.getState()).toMatchObject({
      phase: 'failed',
      error: 'Preview unavailable.',
      subject: 'Keep this request draft',
      description: 'Retain these details after a failed preview.',
    })
    expect(store.getState().completePending(failedRequest.requestId, 'confirmed', null)).toBe(false)

    store.getState().setSubject('Retry with an updated subject')
    const retryRequest = store.getState().startSubmit()
    expect(retryRequest?.requestId).not.toBe(failedRequest.requestId)
    expect(store.getState().error).toBeNull()
    expect(store.getState().completePending(retryRequest?.requestId ?? '', 'confirmed', null)).toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'confirmed', subject: 'Retry with an updated subject' })
  })

  test('cancels pending work without losing the draft or accepting a late completion', () => {
    const store = createSupportTicketPreviewStore(ticket)
    store.getState().setSubject('Keep after cancel')
    const request = store.getState().startSubmit()
    if (!request) throw new Error('Expected a preview request')

    expect(store.getState().cancelPending()).toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'idle', subject: 'Keep after cancel', pendingRequest: null })
    expect(store.getState().completePending(request.requestId, 'confirmed', null)).toBe(false)
    expect(store.getState().cancelPending()).toBe(false)
  })

  test('isolates request identity and drafts between Host owners', () => {
    const first = createSupportTicketPreviewStore(ticket)
    const second = createSupportTicketPreviewStore(ticket)
    first.getState().setSubject('First owner')
    second.getState().setSubject('Second owner')

    const firstRequest = first.getState().startSubmit()
    const secondRequest = second.getState().startSubmit()

    expect(firstRequest?.requestId).not.toBe(secondRequest?.requestId)
    expect(first.getState().subject).toBe('First owner')
    expect(second.getState().subject).toBe('Second owner')
    expect(second.getState().completePending(firstRequest?.requestId ?? '', 'confirmed', null)).toBe(false)
    expect(second.getState().phase).toBe('pending')
  })

  test('projects pending, confirmed, and failed feedback with unique controlled field IDs', () => {
    const store = createSupportTicketPreviewStore(ticket)
    const initial = makeFlow(store.getState())
    const pending = renderTicket({ ...initial, phase: 'pending' })
    expect(pending).toContain(initial.labels.pending)
    expect(pending).toContain('aria-busy="true"')
    expect(pending).toContain('disabled=""')

    const confirmed = renderTicket({ ...initial, phase: 'confirmed' }, 2)
    expect(confirmed).toContain(initial.labels.confirmed)
    const ids = attributeValues(confirmed, 'id')
    const labelTargets = attributeValues(confirmed, 'for')
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labelTargets).size).toBe(labelTargets.length)
    for (const labelTarget of labelTargets) expect(ids).toContain(labelTarget)

    const failed = renderTicket({
      ...initial,
      phase: 'failed',
      error: 'Preview unavailable. Try again.',
    })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('Preview unavailable. Try again.')
    expect(failed).not.toContain('aria-busy="true"')
  })
})

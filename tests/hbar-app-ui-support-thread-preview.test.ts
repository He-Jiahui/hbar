import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenSupport,
  LumenSupportProvider,
  type LumenSupportContent,
  type LumenSupportThreadContent,
} from '../hbar-ui/packages/lumen-app-ui/src/support'
import {
  createSupportThreadPreviewStore,
  type SupportThreadPreviewState,
} from '../apps/hbar-app-ui-preview/src/supportThreadPreviewStore'
import { createSupportThreadPreviewCopy } from '../apps/hbar-app-ui-preview/src/supportThreadPreviewCopy'
import { createSupportThreadReferenceFixtures } from './fixtures/hbar-app-ui-support-thread-reference-fixtures'

const baseContent = createSupportThreadReferenceFixtures()
const thread = (() => {
  const value = baseContent.thread
  if (!value) throw new Error('Expected the support thread preview fixture')
  return value
})()

type ThreadReferenceFlow = NonNullable<LumenSupportThreadContent['referenceFlow']>

function makeFlow(
  state: SupportThreadPreviewState,
  copy = createSupportThreadPreviewCopy('en'),
  changes: Partial<ThreadReferenceFlow> = {},
): ThreadReferenceFlow {
  return {
    resolved: state.resolved,
    reply: state.reply,
    replyPhase: state.replyPhase,
    resolvePhase: state.resolvePhase,
    replyErrorCode: state.replyErrorCode,
    resolveErrorCode: state.resolveErrorCode,
    replyLimitReached: state.confirmedReplies.length >= state.maximumAdditionalMessages,
    showResolutionControl: false,
    labels: {
      replyLabel: copy.replyLabel,
      replyPending: copy.replyPending,
      replyConfirmed: copy.replyConfirmed,
      replyErrorUnavailable: copy.replyErrorUnavailable,
      replyLimitReached: copy.replyLimitReached,
      resolvePending: copy.resolvePending,
      resolveConfirmed: copy.resolveConfirmed,
      resolveErrorUnavailable: copy.resolveErrorUnavailable,
    },
    onReplyChange: state.setReply,
    onSubmitReply: state.startReply,
    onToggleResolution: (resolved) => state.startResolution(resolved),
    ...changes,
  }
}

function renderThread(
  flow: ThreadReferenceFlow,
  options: { instances?: number; messages?: LumenSupportThreadContent['messages'] } = {},
): string {
  const content: LumenSupportContent = {
    ...baseContent,
    thread: {
      ...thread,
      messages: options.messages ?? thread.messages,
      referenceFlow: flow,
    },
  }
  const instances = options.instances ?? 1
  return renderToStaticMarkup(
    createElement(LumenSupportProvider, {
      content,
      children: createElement(
        Fragment,
        null,
        ...Array.from({ length: instances }, (_, index) =>
          createElement(LumenSupport, { key: index, variant: 3, variantId: `thread-${index}` }),
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

describe('support thread preview store', () => {
  test('captures a thread-scoped preview-only reply and deduplicates pending sends', () => {
    const store = createSupportThreadPreviewStore('ticket-4192', 3)
    store.getState().setReply('  Please share the saved-view lock steps.  ')
    const request = store.getState().startReply()

    expect(request).toMatchObject({
      threadId: 'ticket-4192',
      outcome: 'preview-only',
      reply: 'Please share the saved-view lock steps.',
    })
    expect(store.getState().replyPhase).toBe('pending')
    expect(store.getState().startReply()).toBeNull()
    store.getState().setReply('Edits are locked while waiting.')
    expect(store.getState().reply).toBe('  Please share the saved-view lock steps.  ')
    expect(store.getState().completeReply('another-owner:1', 'confirmed')).toBe(false)
    expect(store.getState().confirmedReplies).toEqual([])
    expect(store.getState().completeReply(request?.requestId ?? '', 'confirmed')).toBe(true)
    expect(store.getState()).toMatchObject({
      reply: '',
      replyPhase: 'confirmed',
      confirmedReplies: [{ id: request?.requestId, body: 'Please share the saved-view lock steps.' }],
    })
    expect(store.getState().completeReply(request?.requestId ?? '', 'confirmed')).toBe(false)
  })

  test('retains drafts across failure, re-localizes feedback, and retries with a current request', () => {
    const store = createSupportThreadPreviewStore('ticket-4192', 3)
    store.getState().setReply('Keep my reply draft.')
    const failedRequest = store.getState().startReply()
    if (!failedRequest) throw new Error('Expected a reply preview request')

    expect(store.getState().completeReply(failedRequest.requestId, 'failed')).toBe(true)
    expect(store.getState()).toMatchObject({
      reply: 'Keep my reply draft.',
      replyPhase: 'failed',
      replyErrorCode: 'unavailable',
      confirmedReplies: [],
    })
    const english = renderThread(makeFlow(store.getState(), createSupportThreadPreviewCopy('en')))
    const german = renderThread(makeFlow(store.getState(), createSupportThreadPreviewCopy('de')))
    expect(english).toContain('The reply preview could not be confirmed. Your draft is kept; try again.')
    expect(german).toContain('Die Antwortvorschau konnte nicht bestätigt werden.')
    expect(german).toContain('Keep my reply draft.')

    store.getState().setReply('Updated after failure.')
    const retryRequest = store.getState().startReply()
    expect(retryRequest?.requestId).not.toBe(failedRequest.requestId)
    expect(store.getState().completeReply(retryRequest?.requestId ?? '', 'confirmed')).toBe(true)
    expect(store.getState()).toMatchObject({ reply: '', replyPhase: 'confirmed', replyErrorCode: null })
  })

  test('cancels both asynchronous actions and rejects late completion', () => {
    const store = createSupportThreadPreviewStore('ticket-4192', 4)
    store.getState().setReply('A draft survives cancellation.')
    const reply = store.getState().startReply()
    if (!reply) throw new Error('Expected a reply preview request')

    expect(store.getState().cancelPending()).toBe(true)
    expect(store.getState()).toMatchObject({
      reply: 'A draft survives cancellation.',
      replyPhase: 'idle',
      resolvePhase: 'idle',
      resolved: false,
      pendingReplyRequest: null,
      pendingResolutionRequest: null,
    })
    expect(store.getState().completeReply(reply.requestId, 'confirmed')).toBe(false)

    const resolution = store.getState().startResolution(true)
    if (!resolution) throw new Error('Expected a resolution preview request')
    expect(store.getState().resolvePhase).toBe('pending')
    expect(store.getState().cancelPending()).toBe(true)
    expect(store.getState().completeResolution(resolution.requestId, 'confirmed')).toBe(false)
    expect(store.getState().cancelPending()).toBe(false)
    expect(store.getState().reply).toBe('A draft survives cancellation.')
  })

  test('keeps resolution status host-owned and does not change it after failure', () => {
    const store = createSupportThreadPreviewStore('ticket-4192', 4)
    const request = store.getState().startResolution(true)
    if (!request) throw new Error('Expected a resolution preview request')
    expect(request).toMatchObject({ threadId: 'ticket-4192', outcome: 'preview-only', resolved: true })
    expect(store.getState().completeResolution(request.requestId, 'failed')).toBe(true)
    expect(store.getState()).toMatchObject({ resolved: false, resolvePhase: 'failed', resolveErrorCode: 'unavailable' })
    const copy = createSupportThreadPreviewCopy('en')
    const flow = makeFlow(store.getState(), copy, { showResolutionControl: true })
    expect(renderThread(flow)).toContain(copy.resolveErrorUnavailable)
    const retry = store.getState().startResolution(true)
    expect(retry?.requestId).not.toBe(request.requestId)
    expect(store.getState().completeResolution(retry?.requestId ?? '', 'confirmed')).toBe(true)
    expect(store.getState()).toMatchObject({ resolved: true, resolvePhase: 'confirmed' })
  })

  test('bounds local replies, owner identities, and changed capacity', () => {
    const first = createSupportThreadPreviewStore('ticket-4192', 1)
    const second = createSupportThreadPreviewStore('ticket-5000', 1)
    first.getState().setReply('First thread reply')
    second.getState().setReply('Second thread reply')
    const firstRequest = first.getState().startReply()
    const secondRequest = second.getState().startReply()

    expect(firstRequest?.requestId).not.toBe(secondRequest?.requestId)
    expect(second.getState().completeReply(firstRequest?.requestId ?? '', 'confirmed')).toBe(false)
    expect(first.getState().completeReply(firstRequest?.requestId ?? '', 'confirmed')).toBe(true)
    expect(second.getState().completeReply(secondRequest?.requestId ?? '', 'confirmed')).toBe(true)
    expect(first.getState().confirmedReplies).toHaveLength(1)
    expect(second.getState().confirmedReplies).toHaveLength(1)
    expect(first.getState().startReply()).toBeNull()
    expect(first.getState().confirmedReplies).toHaveLength(1)

    const pending = createSupportThreadPreviewStore('ticket-shrink', 2)
    pending.getState().setReply('Preserve on capacity change')
    const pendingRequest = pending.getState().startReply()
    if (!pendingRequest) throw new Error('Expected a pending reply')
    pending.getState().setMaximumAdditionalMessages(0)
    expect(pending.getState()).toMatchObject({
      reply: 'Preserve on capacity change',
      maximumAdditionalMessages: 0,
      replyPhase: 'idle',
      pendingReplyRequest: null,
    })
    expect(pending.getState().confirmedReplies).toEqual([])
    expect(pending.getState().completeReply(pendingRequest.requestId, 'confirmed')).toBe(false)
    pending.getState().setMaximumAdditionalMessages(Number.POSITIVE_INFINITY)
    expect(pending.getState().maximumAdditionalMessages).toBe(0)
  })

  test('renders the reference thread without invented resolution UI and with controlled feedback', () => {
    const store = createSupportThreadPreviewStore('ticket-4192', 4)
    store.getState().setReply('Please send the lock instructions.')
    const pendingRequest = store.getState().startReply()
    if (!pendingRequest) throw new Error('Expected a pending reply')
    const pending = renderThread(makeFlow(store.getState()))
    expect(pending).toContain('aria-busy="true"')
    expect(pending).toContain('Waiting for the preview acknowledgement.')
    expect(pending).toContain('disabled=""')
    expect(pending).toContain('Write a reply')
    expect(pending).not.toContain(thread.labels.resolve)
    expect(pending).not.toContain(thread.labels.awaiting)
    expect(pending.match(/class="lumen-support-avatar is-own">You</g)).toBeTruthy()

    const sourceMessageCount = thread.messages.length
    const confirmedMessages: LumenSupportThreadContent['messages'] = [
      ...thread.messages,
      {
        id: 'preview-confirmed-reply-1',
        sender: 'Priya Shah',
        avatar: 'PS',
        time: 'Just now',
        body: 'A host-confirmed preview reply.',
        own: true,
      },
    ]
    const confirmed = renderThread(
      makeFlow(store.getState(), createSupportThreadPreviewCopy('de'), { replyPhase: 'confirmed' }),
      { instances: 2, messages: confirmedMessages },
    )
    expect(confirmed).toContain('Antwortvorschau bestätigt. Es wurde keine echte Antwort gesendet.')
    expect(confirmed).toContain('A host-confirmed preview reply.')
    expect(confirmed.match(/class="lumen-support-messages"/g)).toHaveLength(2)
    expect(confirmed.match(/A host-confirmed preview reply\./g)).toHaveLength(2)
    expect(confirmedMessages.length).toBe(sourceMessageCount + 1)
    const ids = attributeValues(confirmed, 'id')
    const labelTargets = attributeValues(confirmed, 'for')
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labelTargets).size).toBe(labelTargets.length)
    for (const labelTarget of labelTargets) expect(ids).toContain(labelTarget)

    const failed = renderThread(
      makeFlow(store.getState(), createSupportThreadPreviewCopy('en'), {
        reply: 'Keep this draft after failure.',
        replyPhase: 'failed',
        replyErrorCode: 'unavailable',
      }),
    )
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('Keep this draft after failure.')
  })
})

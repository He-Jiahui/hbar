import { memo, useEffect, useMemo, useState } from 'react'
import { RotateCw } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenCompactMetrics,
  LumenFrame,
  LumenIcon,
  LumenText,
  LumenContentText,
  LumenRecordRow,
} from '@lumen/app-ui'
import type { SessionRequestsRuntime, UsageRequestItem } from '@hbar/app-runtime'
import { createSessionRequestContext, USAGE_REQUEST_MAX_ITEMS } from '@hbar/app-runtime'
import type { Message } from '@hbar/contracts'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { CodeTextCopyAction, type HbarCodeBlockLabels } from './code-block-copy-action'
import { createMessageScope } from './messages'
import './session-request-details.css'

export const SESSION_RAW_MESSAGES_PAGE_SIZE = 20

export interface HbarSessionRequestLabels {
  readonly title: string
  readonly loading: string
  readonly empty: string
  readonly refresh: string
  readonly more: string
  readonly offline: string
  readonly gap: string
  readonly limit: (count: number) => string
  readonly error: (code: string) => string
  readonly unavailable: string
  readonly number: (value: number) => string
  readonly cacheRatio: (cached: number, input: number) => string
  readonly time: (value: number | null) => string
  readonly duration: (value: number | null) => string
  readonly cost: (value: UsageRequestItem['cost']) => string
  readonly status: (value: UsageRequestItem['runStatus']) => string
  readonly source: (value: UsageRequestItem['source']) => string
  readonly summary: (tokens: number, duration: number | null, cost: UsageRequestItem['cost']) => string
  readonly fields: Readonly<
    Record<
      | 'provider'
      | 'model'
      | 'attempt'
      | 'run'
      | 'source'
      | 'status'
      | 'started'
      | 'ended'
      | 'input'
      | 'output'
      | 'cacheRead'
      | 'cacheWrite'
      | 'cacheHitRate'
      | 'billable'
      | 'cost'
      | 'pricing'
      | 'response'
      | 'firstProviderEvent'
      | 'firstThinking'
      | 'firstText',
      string
    >
  >
  readonly raw: {
    readonly request: string
    readonly runMessages: string
    readonly sessionMessages: string
    readonly scope: string
    readonly empty: string
    readonly unavailable: string
    readonly more: (count: number) => string
    readonly older: string
    readonly olderLimit: string
    readonly count: (visible: number, loaded: number) => string
    readonly message: (role: Message['role'], timestamp: number, id: string) => string
  }
  readonly codeBlock: HbarCodeBlockLabels
}

export const sessionRequestMessages = createMessageScope<HbarSessionRequestLabels>()

export function sessionRequestLatency(item: UsageRequestItem, end: number | null): number | null {
  return item.startedAt === null || end === null || end < item.startedAt ? null : end - item.startedAt
}

function RawJson({ identity, value }: { readonly identity: readonly string[]; readonly value: unknown }) {
  const { t } = sessionRequestMessages.useMessages()
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])
  return (
    <LumenFrame className="hbar-session-request-json">
      <CodeTextCopyAction identity={identity} text={text} source={identity.join(':')} labels={t('codeBlock')} />
      <LumenFrame as="pre">
        <LumenText as="code">{text}</LumenText>
      </LumenFrame>
    </LumenFrame>
  )
}

/** Only loaded canonical messages are shown; model-attempt payloads are not inferred. */
export function HbarSessionRawMessages({
  messages,
  identity,
}: {
  readonly messages: readonly Readonly<Message>[]
  readonly identity: string
}) {
  const { t } = sessionRequestMessages.useMessages()
  const [visible, setVisible] = useState(SESSION_RAW_MESSAGES_PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)
  const ordered = useMemo(() => [...messages].sort((left, right) => right.seq - left.seq), [messages])
  const count = Math.min(visible, ordered.length)
  return (
    <LumenFrame className="hbar-session-raw-messages">
      <LumenContentText context="section.description" tone="muted">
        {t('raw').count(count, ordered.length)}
      </LumenContentText>
      {ordered.length === 0 ? (
        <LumenContentText context="section.description">{t('raw').empty}</LumenContentText>
      ) : (
        <LumenCollection as="ul">
          {ordered.slice(0, count).map((message) => (
            <LumenCollectionItem key={message.id} data-message-id={message.id}>
              <HbarLumenDisclosure
                label={t('raw').message(message.role, message.createdAt, message.id)}
                open={expanded === message.id}
                onOpenChange={(open) => setExpanded(open ? message.id : null)}
              >
                {expanded === message.id && <RawJson identity={[identity, message.id]} value={message} />}
              </HbarLumenDisclosure>
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      )}
      {count < ordered.length && (
        <LumenButton
          size="s"
          variant="text"
          indicator="none"
          onClick={() => setVisible(count + SESSION_RAW_MESSAGES_PAGE_SIZE)}
        >
          {t('raw').more(Math.min(SESSION_RAW_MESSAGES_PAGE_SIZE, ordered.length - count))}
        </LumenButton>
      )}
    </LumenFrame>
  )
}

export function HbarSessionRequestRecord({
  item,
  messages,
}: {
  readonly item: UsageRequestItem
  readonly messages: readonly Readonly<Message>[] | null
}) {
  const { t } = sessionRequestMessages.useMessages()
  const [rawRequest, setRawRequest] = useState(false)
  const [rawMessages, setRawMessages] = useState(false)
  const fields = t('fields')
  const metric = (id: keyof typeof fields, value: string) => ({ id, label: fields[id], value })
  const runMessages = useMemo(
    () =>
      messages?.filter(
        (message) => message.sessionId === item.sessionId && item.runId !== null && message.runId === item.runId,
      ) ?? null,
    [item.runId, item.sessionId, messages],
  )
  return (
    <LumenFrame className="hbar-session-request-record">
      <LumenCompactMetrics
        label={t('title')}
        metrics={[
          metric('provider', item.providerId),
          metric('model', item.modelId),
          metric('status', t('status')(item.runStatus)),
          metric('source', t('source')(item.source)),
          metric('input', t('number')(item.input)),
          metric('output', t('number')(item.output)),
          metric('cacheRead', t('number')(item.cacheRead)),
          metric('cacheHitRate', t('cacheRatio')(item.cacheRead, item.input)),
          metric('cacheWrite', t('number')(item.cacheWrite)),
          metric('billable', t('number')(item.billableTokens)),
          metric('cost', t('cost')(item.cost)),
          metric('response', t('duration')(sessionRequestLatency(item, item.endedAt))),
          metric('firstText', t('duration')(sessionRequestLatency(item, item.firstTextAt))),
          metric('firstThinking', t('duration')(sessionRequestLatency(item, item.firstThinkingAt))),
          metric('firstProviderEvent', t('duration')(sessionRequestLatency(item, item.firstProviderEventAt))),
          metric('started', t('time')(item.startedAt)),
          metric('ended', t('time')(item.endedAt)),
          metric('attempt', item.attemptId),
          metric('run', item.runId ?? t('unavailable')),
          metric('pricing', item.pricingVersion ?? t('unavailable')),
        ]}
      />
      <HbarLumenDisclosure label={t('raw').request} open={rawRequest} onOpenChange={setRawRequest}>
        {rawRequest && <RawJson identity={[item.sessionId, item.id]} value={item} />}
      </HbarLumenDisclosure>
      <HbarLumenDisclosure label={t('raw').runMessages} open={rawMessages} onOpenChange={setRawMessages}>
        {rawMessages && (
          <>
            <LumenContentText context="section.description" tone="muted">
              {t('raw').scope}
            </LumenContentText>
            {runMessages !== null && item.runId !== null ? (
              <HbarSessionRawMessages key={item.runId} identity={item.runId} messages={runMessages} />
            ) : (
              <LumenContentText context="section.description">{t('raw').unavailable}</LumenContentText>
            )}
          </>
        )}
      </HbarLumenDisclosure>
    </LumenFrame>
  )
}

function RequestList({
  requests,
  connected,
  messages,
  revision,
}: {
  readonly requests: SessionRequestsRuntime
  readonly connected: boolean
  readonly messages: readonly Readonly<Message>[] | null
  readonly revision: number
}) {
  const { t } = sessionRequestMessages.useMessages()
  const state = useHbarRuntimeState(requests.reader)
  const [expanded, setExpanded] = useState<string | null>(null)
  const busy = state.status === 'loading'
  useEffect(() => {
    if (!connected) return
    let current = true
    const pending = requests.reader.getSnapshot().status === 'loading'
    void requests
      .refresh()
      .then(() => {
        // A usage fact may arrive while an earlier export is in flight.
        if (current && pending) return requests.refresh()
        return undefined
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [connected, requests, revision])
  return (
    <LumenFrame className="hbar-session-requests" aria-label={t('title')}>
      <LumenFrame as="header">
        <LumenContentText context="section.title">{t('title')}</LumenContentText>
        <LumenButton
          size="s"
          variant="text"
          indicator="none"
          disabled={!connected || busy}
          onClick={() => {
            setExpanded(null)
            void requests.refresh().catch(() => undefined)
          }}
        >
          <LumenIcon icon={RotateCw} tier="sm" />
          <LumenContentText context="control.label">{t('refresh')}</LumenContentText>
        </LumenButton>
      </LumenFrame>
      {busy && (
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {connected && state.status === 'error' && (
        <LumenContentText context="feedback.message" role="alert">
          {t('error')(state.error ?? 'EXECUTION_FAILED')}
        </LumenContentText>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <LumenContentText context="section.description">{t('empty')}</LumenContentText>
      )}
      {state.gap && (
        <LumenContentText context="feedback.message" role="status">
          {t('gap')}
        </LumenContentText>
      )}
      <LumenCollection as="ul" aria-busy={busy}>
        {state.items.map((item) => (
          <LumenCollectionItem key={item.id} data-usage-id={item.id} data-run-id={item.runId}>
            <HbarLumenDisclosure
              open={expanded === item.id}
              onOpenChange={(open) => setExpanded(open ? item.id : null)}
              label={
                <LumenRecordRow
                  as="span"
                  className="hbar-session-request-summary"
                  title={item.modelId}
                  description={t('summary')(
                    item.input + item.output,
                    sessionRequestLatency(item, item.endedAt),
                    item.cost,
                  )}
                  trailing={
                    item.endedAt === null ? undefined : (
                      <LumenContentText context="metadata" tone="muted">
                        {t('time')(item.endedAt)}
                      </LumenContentText>
                    )
                  }
                />
              }
            >
              {expanded === item.id && <HbarSessionRequestRecord item={item} messages={messages} />}
            </HbarLumenDisclosure>
          </LumenCollectionItem>
        ))}
      </LumenCollection>
      {state.hasMore && (
        <LumenButton
          size="s"
          variant="text"
          indicator="none"
          disabled={!connected || busy}
          onClick={() => {
            void requests.loadMore().catch(() => undefined)
          }}
        >
          {t('more')}
        </LumenButton>
      )}
      {!state.hasMore && state.items.length >= USAGE_REQUEST_MAX_ITEMS && (
        <LumenContentText context="feedback.message" role="status">
          {t('limit')(state.items.length)}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}

/** Each mounted status pane has an independently scoped, cancellable request reader. */
function SessionRequestDetailsView({
  sessionId,
  connected,
  view = 'all',
}: {
  readonly sessionId: string
  readonly connected: boolean
  readonly view?: 'all' | 'requests' | 'messages'
}) {
  const { t } = sessionRequestMessages.useMessages()
  const runtime = useHbarRuntime()
  const context = useMemo(() => createSessionRequestContext(runtime.state.timeline, sessionId), [runtime, sessionId])
  const timeline = useHbarRuntimeState(context)
  const [owner, setOwner] = useState<{ readonly sessionId: string; readonly requests: SessionRequestsRuntime } | null>(
    null,
  )
  const [rawOpen, setRawOpen] = useState(false)
  useEffect(() => {
    if (view === 'messages') return undefined
    const requests = runtime.state.sessionRequests.create(sessionId)
    setOwner({ sessionId, requests })
    return () => requests.dispose()
  }, [runtime, sessionId, view])
  const requests = owner?.sessionId === sessionId ? owner.requests : null
  const { messages, revision } = timeline
  const loadingOlder = timeline.olderStatus === 'loading'
  const rawBody = (
    <>
      {messages ? (
        <HbarSessionRawMessages key={sessionId} identity={sessionId} messages={messages} />
      ) : (
        <LumenContentText context="section.description">{t('raw').unavailable}</LumenContentText>
      )}
      {connected && timeline.olderStatus === 'error' && (
        <LumenContentText context="feedback.message" role="alert">
          {t('error')(timeline.olderError ?? 'EXECUTION_FAILED')}
        </LumenContentText>
      )}
      {timeline.olderStatus === 'limit' && (
        <LumenContentText context="feedback.message" role="status">
          {t('raw').olderLimit}
        </LumenContentText>
      )}
      {timeline.hasOlder && timeline.olderStatus !== 'limit' && (
        <LumenButton
          size="s"
          variant="text"
          indicator="none"
          disabled={!connected || loadingOlder}
          onClick={() => {
            void runtime.commands.execute('timeline.loadOlder', { sessionId }).catch(() => undefined)
          }}
        >
          {loadingOlder ? t('loading') : t('raw').older}
        </LumenButton>
      )}
    </>
  )
  return (
    <>
      {view !== 'messages' &&
        (requests ? (
          <RequestList requests={requests} connected={connected} messages={messages} revision={revision} />
        ) : (
          <LumenContentText context="feedback.detail" role="status">
            {t('loading')}
          </LumenContentText>
        ))}
      {view === 'messages' ? (
        rawBody
      ) : view === 'all' ? (
        <HbarLumenDisclosure
          label={t('raw').sessionMessages}
          open={rawOpen}
          onOpenChange={setRawOpen}
          className="hbar-session-context"
        >
          {rawOpen && rawBody}
        </HbarLumenDisclosure>
      ) : null}
    </>
  )
}

export const HbarSessionRequestDetails = memo(function HbarSessionRequestDetails({
  labels,
  ...props
}: {
  readonly sessionId: string
  readonly labels: HbarSessionRequestLabels
  readonly connected: boolean
  readonly view?: 'all' | 'requests' | 'messages'
}) {
  return (
    <sessionRequestMessages.Provider messages={labels}>
      <SessionRequestDetailsView {...props} />
    </sessionRequestMessages.Provider>
  )
})

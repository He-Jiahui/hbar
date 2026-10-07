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
} from '@lumen/app-ui'
import type { SessionRequestsRuntime, UsageRequestItem } from '@hbar/app-runtime'
import { createSessionRequestContext, USAGE_REQUEST_MAX_ITEMS } from '@hbar/app-runtime'
import type { Message } from '@hbar/contracts'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { CodeTextCopyAction, type HbarCodeBlockLabels } from './code-block-copy-action'
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

export function sessionRequestLatency(item: UsageRequestItem, end: number | null): number | null {
  return item.startedAt === null || end === null || end < item.startedAt ? null : end - item.startedAt
}

function RawJson({
  identity,
  value,
  labels,
}: {
  readonly identity: readonly string[]
  readonly value: unknown
  readonly labels: HbarCodeBlockLabels
}) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])
  return (
    <LumenFrame className="hbar-session-request-json">
      <CodeTextCopyAction identity={identity} text={text} source={identity.join(':')} labels={labels} />
      <LumenFrame as="pre">
        <LumenText as="code">{text}</LumenText>
      </LumenFrame>
    </LumenFrame>
  )
}

/** Only loaded canonical messages are shown; model-attempt payloads are not inferred. */
export function HbarSessionRawMessages({
  messages,
  labels,
  identity,
}: {
  readonly messages: readonly Readonly<Message>[]
  readonly labels: HbarSessionRequestLabels
  readonly identity: string
}) {
  const [visible, setVisible] = useState(SESSION_RAW_MESSAGES_PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)
  const ordered = useMemo(() => [...messages].sort((left, right) => right.seq - left.seq), [messages])
  const count = Math.min(visible, ordered.length)
  return (
    <LumenFrame className="hbar-session-raw-messages">
      <LumenText as="p" tone="muted">
        {labels.raw.count(count, ordered.length)}
      </LumenText>
      {ordered.length === 0 ? (
        <LumenText as="p">{labels.raw.empty}</LumenText>
      ) : (
        <LumenCollection as="ul">
          {ordered.slice(0, count).map((message) => (
            <LumenCollectionItem key={message.id} data-message-id={message.id}>
              <HbarLumenDisclosure
                label={labels.raw.message(message.role, message.createdAt, message.id)}
                open={expanded === message.id}
                onOpenChange={(open) => setExpanded(open ? message.id : null)}
              >
                {expanded === message.id && (
                  <RawJson identity={[identity, message.id]} value={message} labels={labels.codeBlock} />
                )}
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
          {labels.raw.more(Math.min(SESSION_RAW_MESSAGES_PAGE_SIZE, ordered.length - count))}
        </LumenButton>
      )}
    </LumenFrame>
  )
}

export function HbarSessionRequestRecord({
  item,
  messages,
  labels,
}: {
  readonly item: UsageRequestItem
  readonly messages: readonly Readonly<Message>[] | null
  readonly labels: HbarSessionRequestLabels
}) {
  const [rawRequest, setRawRequest] = useState(false)
  const [rawMessages, setRawMessages] = useState(false)
  const fields = labels.fields
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
        label={labels.title}
        metrics={[
          metric('provider', item.providerId),
          metric('model', item.modelId),
          metric('status', labels.status(item.runStatus)),
          metric('source', labels.source(item.source)),
          metric('input', labels.number(item.input)),
          metric('output', labels.number(item.output)),
          metric('cacheRead', labels.number(item.cacheRead)),
          metric('cacheWrite', labels.number(item.cacheWrite)),
          metric('billable', labels.number(item.billableTokens)),
          metric('cost', labels.cost(item.cost)),
          metric('response', labels.duration(sessionRequestLatency(item, item.endedAt))),
          metric('firstText', labels.duration(sessionRequestLatency(item, item.firstTextAt))),
          metric('firstThinking', labels.duration(sessionRequestLatency(item, item.firstThinkingAt))),
          metric('firstProviderEvent', labels.duration(sessionRequestLatency(item, item.firstProviderEventAt))),
          metric('started', labels.time(item.startedAt)),
          metric('ended', labels.time(item.endedAt)),
          metric('attempt', item.attemptId),
          metric('run', item.runId ?? labels.unavailable),
          metric('pricing', item.pricingVersion ?? labels.unavailable),
        ]}
      />
      <HbarLumenDisclosure label={labels.raw.request} open={rawRequest} onOpenChange={setRawRequest}>
        {rawRequest && <RawJson identity={[item.sessionId, item.id]} value={item} labels={labels.codeBlock} />}
      </HbarLumenDisclosure>
      <HbarLumenDisclosure label={labels.raw.runMessages} open={rawMessages} onOpenChange={setRawMessages}>
        {rawMessages && (
          <>
            <LumenText as="p" tone="muted">
              {labels.raw.scope}
            </LumenText>
            {runMessages !== null && item.runId !== null ? (
              <HbarSessionRawMessages key={item.runId} identity={item.runId} messages={runMessages} labels={labels} />
            ) : (
              <LumenText as="p">{labels.raw.unavailable}</LumenText>
            )}
          </>
        )}
      </HbarLumenDisclosure>
    </LumenFrame>
  )
}

function RequestList({
  requests,
  labels,
  connected,
  messages,
  revision,
}: {
  readonly requests: SessionRequestsRuntime
  readonly labels: HbarSessionRequestLabels
  readonly connected: boolean
  readonly messages: readonly Readonly<Message>[] | null
  readonly revision: number
}) {
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
    <LumenFrame className="hbar-session-requests" aria-label={labels.title}>
      <LumenFrame as="header">
        <LumenText as="h2">{labels.title}</LumenText>
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
          <LumenText as="span">{labels.refresh}</LumenText>
        </LumenButton>
      </LumenFrame>
      {!connected && (
        <LumenText as="p" role="status">
          {labels.offline}
        </LumenText>
      )}
      {busy && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {state.status === 'error' && (
        <LumenText as="p" role="alert">
          {labels.error(state.error ?? 'EXECUTION_FAILED')}
        </LumenText>
      )}
      {state.status === 'ready' && state.items.length === 0 && <LumenText as="p">{labels.empty}</LumenText>}
      {state.gap && (
        <LumenText as="p" role="status">
          {labels.gap}
        </LumenText>
      )}
      <LumenCollection as="ul" aria-busy={busy}>
        {state.items.map((item) => (
          <LumenCollectionItem key={item.id} data-usage-id={item.id} data-run-id={item.runId}>
            <HbarLumenDisclosure
              open={expanded === item.id}
              onOpenChange={(open) => setExpanded(open ? item.id : null)}
              label={
                <LumenFrame as="span" className="hbar-session-request-summary">
                  <LumenFrame as="span">
                    <LumenText as="strong">{item.modelId}</LumenText>
                    <LumenText as="span">{labels.time(item.endedAt)}</LumenText>
                  </LumenFrame>
                  <LumenText as="span">
                    {labels.summary(item.input + item.output, sessionRequestLatency(item, item.endedAt), item.cost)}
                  </LumenText>
                </LumenFrame>
              }
            >
              {expanded === item.id && <HbarSessionRequestRecord item={item} messages={messages} labels={labels} />}
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
          {labels.more}
        </LumenButton>
      )}
      {!state.hasMore && state.items.length >= USAGE_REQUEST_MAX_ITEMS && (
        <LumenText as="p" role="status">
          {labels.limit(state.items.length)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

/** Each mounted status pane has an independently scoped, cancellable request reader. */
export const HbarSessionRequestDetails = memo(function HbarSessionRequestDetails({
  sessionId,
  labels,
  connected,
}: {
  readonly sessionId: string
  readonly labels: HbarSessionRequestLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const context = useMemo(() => createSessionRequestContext(runtime.state.timeline, sessionId), [runtime, sessionId])
  const timeline = useHbarRuntimeState(context)
  const [owner, setOwner] = useState<{ readonly sessionId: string; readonly requests: SessionRequestsRuntime } | null>(
    null,
  )
  const [rawOpen, setRawOpen] = useState(false)
  useEffect(() => {
    const requests = runtime.state.sessionRequests.create(sessionId)
    setOwner({ sessionId, requests })
    return () => requests.dispose()
  }, [runtime, sessionId])
  const requests = owner?.sessionId === sessionId ? owner.requests : null
  const { messages, revision } = timeline
  const loadingOlder = timeline.olderStatus === 'loading'
  return (
    <>
      {requests ? (
        <RequestList
          requests={requests}
          connected={connected}
          labels={labels}
          messages={messages}
          revision={revision}
        />
      ) : (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      <HbarLumenDisclosure
        label={labels.raw.sessionMessages}
        open={rawOpen}
        onOpenChange={setRawOpen}
        className="hbar-session-context"
      >
        {rawOpen && (
          <>
            {messages ? (
              <HbarSessionRawMessages key={sessionId} identity={sessionId} messages={messages} labels={labels} />
            ) : (
              <LumenText as="p">{labels.raw.unavailable}</LumenText>
            )}
            {timeline.olderStatus === 'error' && (
              <LumenText as="p" role="alert">
                {labels.error(timeline.olderError ?? 'EXECUTION_FAILED')}
              </LumenText>
            )}
            {timeline.olderStatus === 'limit' && (
              <LumenText as="p" role="status">
                {labels.raw.olderLimit}
              </LumenText>
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
                {loadingOlder ? labels.loading : labels.raw.older}
              </LumenButton>
            )}
          </>
        )}
      </HbarLumenDisclosure>
    </>
  )
})

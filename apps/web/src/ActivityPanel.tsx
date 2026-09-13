import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowLeft, Search, Square } from 'lucide-react'
import type { SessionEvent } from '@hbar/contracts'
import { client, report, useConnection, useSessions, useWorkbench } from './stores'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import {
  EmptyState,
  ReferenceMetricStrip,
  ReferenceTabs,
  Timeline,
  referenceAttributes,
  type TimelineItem,
  type TimelineStatus,
} from './react-bits'
import { useReferenceProjections } from './react-bits/production-context'
import { useLocale, type LocaleMessageKey } from './locale'
import './ActivityPanel.css'

type ActivityMode = 'activity' | 'trace'

function activityEventLabel(event: SessionEvent, t: (key: LocaleMessageKey) => string): string {
  const data = event.data as { name?: unknown; tool?: unknown; run?: { status?: unknown } } | null
  if (event.type === 'tool.started' && typeof data?.name === 'string') return `${t('executingTool')} ${data.name}`
  if (event.type === 'run.queued') return t('queued')
  if (event.type === 'run.status' && typeof data?.run?.status === 'string') return `${t('runStatus')}：${data.run.status}`
  if (event.type === 'run.settled' && typeof data?.run?.status === 'string') return `${t('runFinished')}：${data.run.status}`
  if (event.type === 'approval.requested') return t('approvalPending')
  if (event.type === 'approval.resolved') return t('approvalProcessed')
  return event.type.replaceAll('.', ' · ')
}

function activityEventState(event: SessionEvent): 'done' | 'active' | 'waiting' {
  if (event.type === 'tool.started' || event.type === 'approval.requested') return 'active'
  if (event.type === 'run.status') {
    const status = (event.data as { run?: { status?: unknown } } | null)?.run?.status
    if (status === 'running' || status === 'waiting_approval') return 'active'
  }
  return 'done'
}

/**
 * Agent Activity view for the right tool region. It owns only local display
 * state; session snapshots remain the single source of truth in the store.
 */
export default function ActivityPanel() {
  const { t } = useLocale()
  const sessionId = useWorkbench((state) => state.activeSession)
  const snapshot = useSessions((state) => state.snapshots[sessionId])
  const connection = useConnection((state) => state.client)
  const referenceProjections = useReferenceProjections(sessionId)
  const [mode, setMode] = useState<ActivityMode>('activity')
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [detail, setDetail] = useState<SessionEvent | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const requestSerial = useRef(0)
  const cursor = snapshot?.cursor

  useEffect(() => {
    setEvents([])
    setDetail(null)
    setEventsError('')
  }, [connection, sessionId])

  useEffect(() => {
    const requestId = ++requestSerial.current
    let alive = true
    if (cursor === undefined || !sessionId) {
      setEvents([])
      setDetail(null)
      setEventsError('')
      setEventsLoading(false)
      return () => {
        alive = false
      }
    }
    if (!connection) {
      setEvents([])
      setDetail(null)
      setEventsLoading(false)
      setEventsError(t('hostCannotLoadEvents'))
      return () => {
        alive = false
      }
    }
    setEventsLoading(true)
    setEventsError('')
    void connection
      .call('session.follow', { sessionId, cursor: Math.max(0, cursor - 80) })
      .then((result) => {
        if (alive && requestId === requestSerial.current && useConnection.getState().client === connection)
          setEvents(result.events)
      })
      .catch((failure) => {
        if (alive && requestId === requestSerial.current && useConnection.getState().client === connection) {
          setEventsError(failure instanceof Error ? failure.message : String(failure))
        }
      })
      .finally(() => {
        if (alive && requestId === requestSerial.current && useConnection.getState().client === connection)
          setEventsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [connection, sessionId, cursor, t])

  const usage = referenceProjections.usage.usage
  const runningCount =
    snapshot?.runs.filter((run) => ['running', 'queued', 'waiting_approval'].includes(run.status)).length ?? 0
  useEffect(() => {
    if (!runningCount) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [runningCount])
  const timelineRun =
    snapshot?.runs.find((run) => ['running', 'queued', 'waiting_approval'].includes(run.status)) ?? snapshot?.runs[0]
  const timelineEvents = timelineRun ? events.filter((event) => event.runId === timelineRun.id).slice(-12) : []
  const visibleEvents = events.filter((event) => {
    const query = eventFilter.trim().toLocaleLowerCase()
    if (!query) return true
    const data = JSON.stringify(event.data ?? '').toLocaleLowerCase()
    return event.type.toLocaleLowerCase().includes(query) || data.includes(query)
  })
  const timelineItems: TimelineItem[] = timelineEvents.map((event) => {
    const state = activityEventState(event)
    const status: TimelineStatus = state === 'active' ? 'running' : state === 'waiting' ? 'waiting' : 'success'
    return {
      id: event.eventId,
      title: activityEventLabel(event, t),
      meta: new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status,
    }
  })

  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1', 'activity')}
      className="activity-panel rb-activity-panel"
      aria-label={t('activityAndEvents')}
      aria-busy={eventsLoading}
    >
      <GlassSurface className="activity-panel-glass" width="100%" height="100%" aria-hidden="true" />
      <ReferenceTabs<ActivityMode>
        className="tool-panel-tabs"
        ariaLabel={t('activityView')}
        value={mode}
        options={[{ value: 'activity', label: t('run') }, { value: 'trace', label: t('events') }]}
        onChange={setMode}
        reference="https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2"
        adapter="activity"
      />
      {mode === 'activity' ? (
        <>
          <div className="activity-heading">
            <div>
              <h2>{t('currentSession')}</h2>
              <span className="small-muted">{snapshot?.runs.length ?? 0} {t('runCount')}</span>
            </div>
            {runningCount > 0 && <span className="activity-live-indicator">{runningCount} {t('activeCount')}</span>}
          </div>
          {timelineRun && (
            <section className="activity-timeline" aria-label={t('timeline')}>
              <div className="activity-timeline-heading">
                <div>
                  <strong>{timelineRun.input.text.slice(0, 80) || t('imageMessage')}</strong>
                  <span>
                    {timelineRun.status} ·{' '}
                    {timelineRun.startedAt
                      ? `${Math.max(0, Math.round(((timelineRun.endedAt ?? clock) - timelineRun.startedAt) / 1000))}s`
                      : t('notStarted')}
                  </span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(timelineRun.status) && (
                  <button
                    type="button"
                    aria-label={t('stopRun')}
                    title={t('stopRun')}
                    onClick={() =>
                      void client()
                        .call('run.cancel', { runId: timelineRun.id })
                        .catch((failure) => report(failure))
                    }
                  >
                    <Square size={12} />
                  </button>
                )}
              </div>
              {timelineEvents.length > 0 && <Timeline className="activity-timeline-list" items={timelineItems} />}
            </section>
          )}
          <ReferenceMetricStrip
            className="metrics"
            reference="https://pro.reactbits.dev/docs/app-ui/ai-usage"
            adapter="usage"
            metrics={[
              { id: 'input', label: t('inputTokens'), value: (usage?.input ?? 0).toLocaleString() },
              { id: 'output', label: t('outputTokens'), value: (usage?.output ?? 0).toLocaleString() },
              { id: 'cache', label: t('cacheRead'), value: (usage?.cacheRead ?? 0).toLocaleString() },
              {
                id: 'cost',
                label: t('cost'),
                value: `$${(referenceProjections.usage.usage.cost ?? 0).toFixed(4)}`,
              },
            ]}
          />
          <div className="section-label">{t('runHistory')}</div>
          <AnimatedList className="run-list" viewportClassName="run-list-viewport" showGradients={false}>
            {snapshot?.runs.map((run) => (
              <SpotlightCard
                className="run-row"
                key={run.id}
                spotlightColor="color-mix(in srgb, var(--rb-status) 30%, transparent)"
              >
                <i className={`status-dot ${run.status}`} aria-hidden="true" />
                <div>
                  <strong>{run.input.text.slice(0, 65) || t('imageMessage')}</strong>
                  <span>
                    {run.status} ·{' '}
                    {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(run.status) && (
                  <button
                    type="button"
                    title={t('stopRun')}
                    aria-label={t('stopRun')}
                    onClick={() =>
                      void client()
                        .call('run.cancel', { runId: run.id })
                        .catch((failure) => report(failure))
                    }
                  >
                    <Square size={12} />
                  </button>
                )}
              </SpotlightCard>
            ))}
          </AnimatedList>
          {!snapshot?.runs.length && (
            <EmptyState className="empty-tool" icon={<Activity size={25} />} title={t('noRunHistory')} description={t('runHistoryHint')} />
          )}
        </>
      ) : detail ? (
        <section className="event-detail-panel" aria-label={`${detail.type} ${t('eventDetails')}`}>
          <header className="event-detail-header">
            <button
              type="button"
              className="event-detail-back"
              aria-label={t('backToEvents')}
              title={t('backToEvents')}
              onClick={() => setDetail(null)}
            >
              <ArrowLeft size={13} />
              {t('events')}
            </button>
            <code>{detail.type}</code>
          </header>
          <dl className="event-detail-meta">
            <div>
              <dt>{t('sequence')}</dt>
              <dd>{detail.seq}</dd>
            </div>
            <div>
              <dt>{t('time')}</dt>
              <dd>{new Date(detail.time).toLocaleString()}</dd>
            </div>
            {detail.runId && (
              <div>
                <dt>{t('eventRun')}</dt>
                <dd>{detail.runId}</dd>
              </div>
            )}
          </dl>
          <pre className="event-detail">{JSON.stringify(detail.data ?? null, null, 2)}</pre>
        </section>
      ) : (
        <>
          {eventsLoading && <p className="activity-loading">{t('loadingEvents')}</p>}
          {eventsError && (
            <p className="inline-error activity-error" role="alert">
              {eventsError}
            </p>
          )}
          <label className="event-filter">
            <Search size={13} aria-hidden="true" />
            <input
              aria-label={t('filterEvents')}
              placeholder={t('filterEventsPlaceholder')}
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            />
            {eventFilter && <span>{visibleEvents.length}</span>}
          </label>
          <div
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-5', 'session-events')}
            className="event-list"
          >
            {visibleEvents.map((event) => (
              <SpotlightCard
                as="button"
                type="button"
                className="event-entry"
                key={event.eventId}
                aria-label={`${t('viewEvent')} ${event.type}`}
                spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                onClick={() => setDetail(event)}
              >
                <span className="event-seq">{event.seq}</span>
                <code>{event.type}</code>
                <time>{new Date(event.time).toLocaleTimeString()}</time>
              </SpotlightCard>
            ))}
          </div>
          {!eventsLoading && !eventsError && !events.length && <EmptyState className="empty-tool" title={t('noEvents')} description={t('eventsHint')} />}
          {!eventsLoading && !eventsError && events.length > 0 && !visibleEvents.length && <EmptyState className="empty-tool" title={t('noMatchingEvents')} description={t('adjustFilterHint')} />}
        </>
      )}
    </div>
  )
}

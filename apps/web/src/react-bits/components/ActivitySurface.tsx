import { useEffect, useState } from 'react'
import { Activity, ArrowLeft, Search, Square } from 'lucide-react'
import type { Run, SessionEvent } from '@hbar/contracts'
import AnimatedList from '../AnimatedList'
import GlassSurface from '../GlassSurface'
import SpotlightCard from '../SpotlightCard'
import {
  ReferenceMetricStrip,
  ReferenceTabs,
  referenceAttributes,
  type ReferenceMetric,
} from '../production'
import { EmptyState, Timeline, type TimelineItem } from '../semantic'

export type ActivitySurfaceMode = 'activity' | 'trace'

export interface ActivitySurfaceLabels {
  readonly activityAndEvents: string
  readonly activityView: string
  readonly run: string
  readonly events: string
  readonly currentSession: string
  readonly runCount: string
  readonly activeCount: string
  readonly timeline: string
  readonly imageMessage: string
  readonly notStarted: string
  readonly stopRun: string
  readonly runHistory: string
  readonly noRunHistory: string
  readonly runHistoryHint: string
  readonly eventDetails: string
  readonly backToEvents: string
  readonly sequence: string
  readonly time: string
  readonly eventRun: string
  readonly loadingEvents: string
  readonly filterEvents: string
  readonly filterEventsPlaceholder: string
  readonly viewEvent: string
  readonly noEvents: string
  readonly eventsHint: string
  readonly noMatchingEvents: string
  readonly adjustFilterHint: string
}

export interface ActivitySurfaceProps {
  readonly labels: ActivitySurfaceLabels
  readonly runs: readonly Run[]
  readonly timelineRun?: Run | undefined
  readonly timelineEvents: readonly TimelineItem[]
  readonly metrics: readonly ReferenceMetric[]
  readonly events: readonly SessionEvent[]
  readonly eventsLoading: boolean
  readonly eventsError: string
  readonly runningCount: number
  onStopRun(run: Run): void
}

function eventMatches(event: SessionEvent, query: string): boolean {
  if (!query) return true
  const data = JSON.stringify(event.data ?? '').toLocaleLowerCase()
  return event.type.toLocaleLowerCase().includes(query) || data.includes(query)
}

/**
 * ReactBits agent-activity surface. It owns mode switching, event filtering,
 * run detail disclosure and elapsed-time presentation; the host supplies only
 * normalized live entities and cancellation callbacks.
 *
 * References:
 * - https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1
 * - https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2
 * - https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-3
 * - https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-4
 * - https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-5
 * - https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-7
 * - https://pro.reactbits.dev/docs/app-ui/ai-usage
 */
export default function ActivitySurface({
  labels,
  runs,
  timelineRun,
  timelineEvents,
  metrics,
  events,
  eventsLoading,
  eventsError,
  runningCount,
  onStopRun,
}: ActivitySurfaceProps) {
  const [mode, setMode] = useState<ActivitySurfaceMode>('activity')
  const [detail, setDetail] = useState<SessionEvent | null>(null)
  const [eventFilter, setEventFilter] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!runningCount) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [runningCount])
  const query = eventFilter.trim().toLocaleLowerCase()
  const visibleEvents = events.filter((event) => eventMatches(event, query))
  const timelineDuration = timelineRun?.startedAt
    ? `${Math.max(0, Math.round(((timelineRun.endedAt ?? clock) - timelineRun.startedAt) / 1000))}s`
    : labels.notStarted

  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1', 'activity')}
      className="activity-panel rb-activity-panel rb-activity-surface"
      aria-label={labels.activityAndEvents}
      aria-busy={eventsLoading}
    >
      <GlassSurface className="activity-panel-glass" width="100%" height="100%" aria-hidden="true" />
      <ReferenceTabs<ActivitySurfaceMode>
        className="tool-panel-tabs"
        ariaLabel={labels.activityView}
        value={mode}
        options={[{ value: 'activity', label: labels.run }, { value: 'trace', label: labels.events }]}
        onChange={setMode}
        reference="https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2"
        adapter="activity"
      />
      {mode === 'activity' ? (
        <>
          <div {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-3', 'activity')} className="activity-heading">
            <div>
              <h2>{labels.currentSession}</h2>
              <span className="small-muted">{runs.length} {labels.runCount}</span>
            </div>
            {runningCount > 0 && <span className="activity-live-indicator">{runningCount} {labels.activeCount}</span>}
          </div>
          {timelineRun && (
            <section {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2', 'activity')} className="activity-timeline" aria-label={labels.timeline}>
              <div className="activity-timeline-heading">
                <div>
                  <strong>{timelineRun.input.text.slice(0, 80) || labels.imageMessage}</strong>
                  <span>{timelineRun.status} · {timelineDuration}</span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(timelineRun.status) && (
                  <button type="button" aria-label={labels.stopRun} title={labels.stopRun} onClick={() => onStopRun(timelineRun)}>
                    <Square size={12} />
                  </button>
                )}
              </div>
              {timelineEvents.length > 0 && <Timeline className="activity-timeline-list" items={timelineEvents} />}
            </section>
          )}
          <ReferenceMetricStrip className="metrics" metricClassName="activity-metric" reference="https://pro.reactbits.dev/docs/app-ui/ai-usage" adapter="usage" metrics={metrics} />
          <div className="section-label">{labels.runHistory}</div>
          <AnimatedList {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-4', 'activity')} className="run-list" viewportClassName="run-list-viewport" showGradients={false}>
            {runs.map((run) => (
              <SpotlightCard className="run-row" key={run.id} spotlightColor="color-mix(in srgb, var(--rb-status) 30%, transparent)">
                <i className={`status-dot ${run.status}`} aria-hidden="true" />
                <div>
                  <strong>{run.input.text.slice(0, 65) || labels.imageMessage}</strong>
                  <span>{run.status} · {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(run.status) && (
                  <button type="button" title={labels.stopRun} aria-label={labels.stopRun} onClick={() => onStopRun(run)}><Square size={12} /></button>
                )}
              </SpotlightCard>
            ))}
          </AnimatedList>
          {!runs.length && <EmptyState className="empty-tool" icon={<Activity size={25} />} title={labels.noRunHistory} description={labels.runHistoryHint} />}
        </>
      ) : detail ? (
        <section {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-7', 'session-events')} className="event-detail-panel" aria-label={`${detail.type} ${labels.eventDetails}`}>
          <header className="event-detail-header">
            <button type="button" className="event-detail-back" aria-label={labels.backToEvents} title={labels.backToEvents} onClick={() => setDetail(null)}><ArrowLeft size={13} />{labels.events}</button>
            <code>{detail.type}</code>
          </header>
          <dl className="event-detail-meta">
            <div><dt>{labels.sequence}</dt><dd>{detail.seq}</dd></div>
            <div><dt>{labels.time}</dt><dd>{new Date(detail.time).toLocaleString()}</dd></div>
            {detail.runId && <div><dt>{labels.eventRun}</dt><dd>{detail.runId}</dd></div>}
          </dl>
          <pre className="event-detail">{JSON.stringify(detail.data ?? null, null, 2)}</pre>
        </section>
      ) : (
        <>
          {eventsLoading && <p {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/empty-state', 'session-events')} className="activity-loading">{labels.loadingEvents}</p>}
          {eventsError && <p {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/notifications', 'session-events')} className="inline-error activity-error" role="alert">{eventsError}</p>}
          <label {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/filtering', 'session-events')} className="event-filter">
            <Search size={13} aria-hidden="true" />
            <input aria-label={labels.filterEvents} placeholder={labels.filterEventsPlaceholder} value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} />
            {eventFilter && <span>{visibleEvents.length}</span>}
          </label>
          <div {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-5', 'session-events')} className="event-list">
            {visibleEvents.map((event) => (
              <SpotlightCard as="button" type="button" className="event-entry" key={event.eventId} aria-label={`${labels.viewEvent} ${event.type}`} spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)" onClick={() => setDetail(event)}>
                <span className="event-seq">{event.seq}</span><code>{event.type}</code><time>{new Date(event.time).toLocaleTimeString()}</time>
              </SpotlightCard>
            ))}
          </div>
          {!eventsLoading && !eventsError && !events.length && <EmptyState className="empty-tool" title={labels.noEvents} description={labels.eventsHint} />}
          {!eventsLoading && !eventsError && events.length > 0 && !visibleEvents.length && <EmptyState className="empty-tool" title={labels.noMatchingEvents} description={labels.adjustFilterHint} />}
        </>
      )}
    </div>
  )
}

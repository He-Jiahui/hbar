import { useEffect, useRef, useState } from 'react'
import type { SessionEvent } from '@hbar/contracts'
import { client, report, useConnection, useSessions, useWorkbench } from './stores'
import {
  ActivitySurface,
  type ActivitySurfaceLabels,
  type ReferenceMetric,
  type TimelineItem,
  type TimelineStatus,
} from './react-bits'
import { useReferenceProjections } from './react-bits/production-context'
import { useLocale, type LocaleMessageKey } from './locale'
import './ActivityPanel.css'

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
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState('')
  const requestSerial = useRef(0)
  const cursor = snapshot?.cursor

  useEffect(() => {
    setEvents([])
    setEventsError('')
  }, [connection, sessionId])

  useEffect(() => {
    const requestId = ++requestSerial.current
    let alive = true
    if (cursor === undefined || !sessionId) {
      setEvents([])
      setEventsError('')
      setEventsLoading(false)
      return () => {
        alive = false
      }
    }
    if (!connection) {
      setEvents([])
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
  const timelineRun =
    snapshot?.runs.find((run) => ['running', 'queued', 'waiting_approval'].includes(run.status)) ?? snapshot?.runs[0]
  const timelineEvents = timelineRun ? events.filter((event) => event.runId === timelineRun.id).slice(-12) : []
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

  const metrics: ReferenceMetric[] = [
    { id: 'input', label: t('inputTokens'), value: (usage?.input ?? 0).toLocaleString() },
    { id: 'output', label: t('outputTokens'), value: (usage?.output ?? 0).toLocaleString() },
    { id: 'cache', label: t('cacheRead'), value: (usage?.cacheRead ?? 0).toLocaleString() },
    { id: 'cost', label: t('cost'), value: `$${(referenceProjections.usage.usage.cost ?? 0).toFixed(4)}` },
  ]
  const labels: ActivitySurfaceLabels = {
    activityAndEvents: t('activityAndEvents'),
    activityView: t('activityView'),
    run: t('run'),
    events: t('events'),
    currentSession: t('currentSession'),
    runCount: t('runCount'),
    activeCount: t('activeCount'),
    timeline: t('timeline'),
    imageMessage: t('imageMessage'),
    notStarted: t('notStarted'),
    stopRun: t('stopRun'),
    runHistory: t('runHistory'),
    noRunHistory: t('noRunHistory'),
    runHistoryHint: t('runHistoryHint'),
    eventDetails: t('eventDetails'),
    backToEvents: t('backToEvents'),
    sequence: t('sequence'),
    time: t('time'),
    eventRun: t('eventRun'),
    loadingEvents: t('loadingEvents'),
    filterEvents: t('filterEvents'),
    filterEventsPlaceholder: t('filterEventsPlaceholder'),
    viewEvent: t('viewEvent'),
    noEvents: t('noEvents'),
    eventsHint: t('eventsHint'),
    noMatchingEvents: t('noMatchingEvents'),
    adjustFilterHint: t('adjustFilterHint'),
  }
  return (
    <ActivitySurface
      labels={labels}
      runs={snapshot?.runs ?? []}
      timelineRun={timelineRun}
      timelineEvents={timelineItems}
      metrics={metrics}
      events={events}
      eventsLoading={eventsLoading}
      eventsError={eventsError}
      runningCount={runningCount}
      onStopRun={(run) => {
        void client().call('run.cancel', { runId: run.id }).catch((failure) => report(failure))
      }}
    />
  )
}

import { useEffect, useState } from 'react'
import { Activity, Search, Square } from 'lucide-react'
import type { SessionEvent } from '@hbar/contracts'
import { client, report, useSessions, useWorkbench } from './stores'
import { Modal } from './Settings'
import AnimatedList from './react-bits/AnimatedList'
import GlassSurface from './react-bits/GlassSurface'
import SpotlightCard from './react-bits/SpotlightCard'
import './ActivityPanel.css'

type ActivityMode = 'activity' | 'trace'

function activityEventLabel(event: SessionEvent): string {
  const data = event.data as { name?: unknown; tool?: unknown; run?: { status?: unknown } } | null
  if (event.type === 'tool.started' && typeof data?.name === 'string') return `正在执行 ${data.name}`
  if (event.type === 'run.queued') return '已加入队列'
  if (event.type === 'run.status' && typeof data?.run?.status === 'string') return `运行状态：${data.run.status}`
  if (event.type === 'run.settled' && typeof data?.run?.status === 'string') return `运行结束：${data.run.status}`
  if (event.type === 'approval.requested') return '等待审批'
  if (event.type === 'approval.resolved') return '审批已处理'
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
  const sessionId = useWorkbench((state) => state.activeSession)
  const snapshot = useSessions((state) => state.snapshots[sessionId])
  const [mode, setMode] = useState<ActivityMode>('activity')
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [detail, setDetail] = useState<SessionEvent | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const cursor = snapshot?.cursor

  useEffect(() => {
    if (cursor === undefined) return
    let alive = true
    setEventsLoading(true)
    setEventsError('')
    void client()
      .call('session.follow', { sessionId, cursor: Math.max(0, cursor - 80) })
      .then((result) => {
        if (alive) setEvents(result.events)
      })
      .catch((failure) => {
        if (alive) {
          setEventsError(failure instanceof Error ? failure.message : String(failure))
          report(failure)
        }
      })
      .finally(() => {
        if (alive) setEventsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [mode, sessionId, cursor])

  const usage = snapshot?.usage
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

  return (
    <div className="activity-panel rb-activity-panel" aria-label="运行与事件">
      <GlassSurface className="activity-panel-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="tool-panel-tabs" role="tablist" aria-label="运行与事件视图">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'activity'}
          className={mode === 'activity' ? 'selected' : ''}
          onClick={() => setMode('activity')}
        >
          运行
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'trace'}
          className={mode === 'trace' ? 'selected' : ''}
          onClick={() => setMode('trace')}
        >
          事件
        </button>
      </div>
      {mode === 'activity' ? (
        <>
          <div className="activity-heading">
            <div>
              <h2>当前会话</h2>
              <span className="small-muted">{snapshot?.runs.length ?? 0} runs</span>
            </div>
            {runningCount > 0 && <span className="activity-live-indicator">{runningCount} active</span>}
          </div>
          {timelineRun && (
            <section className="activity-timeline" aria-label="运行时间线">
              <div className="activity-timeline-heading">
                <div>
                  <strong>{timelineRun.input.text.slice(0, 80) || '图片消息'}</strong>
                  <span>
                    {timelineRun.status} ·{' '}
                    {timelineRun.startedAt
                      ? `${Math.max(0, Math.round(((timelineRun.endedAt ?? clock) - timelineRun.startedAt) / 1000))}s`
                      : '未开始'}
                  </span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(timelineRun.status) && (
                  <button
                    type="button"
                    aria-label="停止此运行"
                    title="停止此运行"
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
              {timelineEvents.length > 0 && (
                <ol className="activity-timeline-list">
                  {timelineEvents.map((event) => (
                    <li className={`activity-timeline-entry ${activityEventState(event)}`} key={event.eventId}>
                      <i aria-hidden="true" />
                      <span>{activityEventLabel(event)}</span>
                      <time>{new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          <dl className="metrics">
            <SpotlightCard
              className="activity-metric"
              spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
            >
              <dt>输入 tokens</dt>
              <dd>{(usage?.input ?? 0).toLocaleString()}</dd>
            </SpotlightCard>
            <SpotlightCard
              className="activity-metric"
              spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
            >
              <dt>输出 tokens</dt>
              <dd>{(usage?.output ?? 0).toLocaleString()}</dd>
            </SpotlightCard>
            <SpotlightCard
              className="activity-metric"
              spotlightColor="color-mix(in srgb, var(--rb-status) 18%, transparent)"
            >
              <dt>缓存读取</dt>
              <dd>{(usage?.cacheRead ?? 0).toLocaleString()}</dd>
            </SpotlightCard>
            <SpotlightCard
              className="activity-metric"
              spotlightColor="color-mix(in srgb, var(--hbar-wn) 18%, transparent)"
            >
              <dt>费用</dt>
              <dd>${(usage?.cost ?? 0).toFixed(4)}</dd>
            </SpotlightCard>
          </dl>
          <div className="section-label">运行记录</div>
          <AnimatedList className="run-list" viewportClassName="run-list-viewport" showGradients={false}>
            {snapshot?.runs.map((run) => (
              <SpotlightCard
                className="run-row"
                key={run.id}
                spotlightColor="color-mix(in srgb, var(--rb-status) 30%, transparent)"
              >
                <i className={`status-dot ${run.status}`} aria-hidden="true" />
                <div>
                  <strong>{run.input.text.slice(0, 65) || '图片消息'}</strong>
                  <span>
                    {run.status} ·{' '}
                    {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {['running', 'queued', 'waiting_approval'].includes(run.status) && (
                  <button
                    type="button"
                    title="停止此运行"
                    aria-label="停止此运行"
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
            <div className="empty-tool">
              <Activity size={25} />
              <span>尚无运行记录</span>
            </div>
          )}
        </>
      ) : (
        <>
          {eventsLoading && <p className="activity-loading">正在加载事件…</p>}
          {eventsError && (
            <p className="inline-error activity-error" role="alert">
              {eventsError}
            </p>
          )}
          <label className="event-filter">
            <Search size={13} aria-hidden="true" />
            <input
              aria-label="筛选事件"
              placeholder="筛选事件、工具或状态"
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
            />
            {eventFilter && <span>{visibleEvents.length}</span>}
          </label>
          <div className="event-list">
            {visibleEvents.map((event) => (
              <SpotlightCard
                as="button"
                type="button"
                className="event-entry"
                key={event.eventId}
                aria-label={`查看事件 ${event.type}`}
                spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                onClick={() => setDetail(event)}
              >
                <span className="event-seq">{event.seq}</span>
                <code>{event.type}</code>
                <time>{new Date(event.time).toLocaleTimeString()}</time>
              </SpotlightCard>
            ))}
          </div>
          {!eventsLoading && !eventsError && !events.length && <div className="empty-tool">尚无事件</div>}
          {!eventsLoading && !eventsError && events.length > 0 && !visibleEvents.length && (
            <div className="empty-tool">没有匹配的事件</div>
          )}
          {detail && (
            <Modal title={detail.type} onClose={() => setDetail(null)}>
              <pre className="event-detail">{JSON.stringify(detail, null, 2)}</pre>
            </Modal>
          )}
        </>
      )}
    </div>
  )
}

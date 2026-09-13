import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Globe,
  ListChecks,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCw,
  Target,
  X,
} from 'lucide-react'
import type { BrowserPage, BrowserScreenshot, BrowserSnapshot } from '@hbar/contracts'
import { client, openSession, report, useCatalog, useConnection, useSessions, useWorkbench } from './stores'
import SessionCapabilityDialog from './SessionCapabilityDialog'
import { useSessionCapabilities, type SessionCapabilityTab } from './session-capabilities'
import GlassSurface from './react-bits/GlassSurface'
import AnimatedList from './react-bits/AnimatedList'
import SpotlightCard from './react-bits/SpotlightCard'
import {
  EmptyState,
  ProgressRail,
  ReferenceMetricStrip,
  referenceAttributes,
  type ProgressStep,
} from './react-bits'
import { useReferenceProjections } from './react-bits/production-context'
import { useLocale } from './locale'

type PanelProps = { sessionId?: string }

function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  onRefresh,
  reference,
  adapter,
}: {
  icon: typeof Activity
  title: string
  subtitle?: string
  onRefresh?: () => void
  reference?: string
  adapter?: string
}) {
  const { t } = useLocale()
  return (
    <header
      {...(reference ? referenceAttributes(reference, adapter) : {})}
      className="tool-surface-header rb-tool-header"
    >
      <GlassSurface className="tool-header-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="tool-surface-title">
        <span className="tool-surface-icon"><Icon size={15} /></span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {onRefresh && (
        <button type="button" className="tool-surface-refresh" title={t('toolRefresh')} aria-label={`${t('toolRefresh')}${title}`} onClick={onRefresh}>
          <RefreshCw size={14} />
        </button>
      )}
    </header>
  )
}
function EmptyTool({
  icon: Icon,
  title,
  body,
  reference,
  adapter,
}: {
  icon: typeof Activity
  title: string
  body: string
  reference?: string
  adapter?: string
}) {
  return (
    <div
      {...(reference ? referenceAttributes(reference, adapter) : {})}
      className="tool-empty-state rb-tool-empty"
    >
      <GlassSurface className="tool-empty-glass" width="100%" height="100%" aria-hidden="true" />
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}

type BrowserStatus = { available: boolean; contexts: BrowserPage[]; history: string[] }
type BrowserConnection = ReturnType<typeof client>
type BrowserRequest = {
  sessionId: string
  generation: number
  serial: number
  connection: BrowserConnection | null
}

export function BrowserPanel({ sessionId = '' }: PanelProps) {
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const [status, setStatus] = useState<BrowserStatus | null>(null)
  const [page, setPage] = useState<BrowserPage | null>(null)
  const [snapshot, setSnapshot] = useState<BrowserSnapshot | null>(null)
  const [screenshot, setScreenshot] = useState<BrowserScreenshot | null>(null)
  const [url, setUrl] = useState('https://')
  const [newPageContextId, setNewPageContextId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sessionRef = useRef(sessionId)
  const sessionGeneration = useRef(0)
  const requestSerial = useRef(0)

  const beginRequest = useCallback(
    (targetSessionId: string): BrowserRequest => ({
      sessionId: targetSessionId,
      generation: sessionGeneration.current,
      serial: ++requestSerial.current,
      connection,
    }),
    [connection],
  )

  const isCurrent = useCallback((request: BrowserRequest) => {
    return (
      request.sessionId === sessionRef.current &&
      request.generation === sessionGeneration.current &&
      request.serial === requestSerial.current &&
      request.connection === useConnection.getState().client
    )
  }, [])

  const invalidateRequests = useCallback(() => {
    requestSerial.current += 1
  }, [])

  const refresh = useCallback(
    async (request?: BrowserRequest) => {
      const scope = request ?? beginRequest(sessionId)
      if (!request) setBusy(false)
      if (!scope.sessionId) {
        if (isCurrent(scope)) {
          setStatus(null)
          setPage(null)
        }
        return
      }
      try {
        if (!scope.connection) throw new Error('Host is not connected')
        const next = await scope.connection.call('browser.status', { sessionId: scope.sessionId })
        if (!isCurrent(scope)) return
        setStatus(next)
        setError('')
        setPage(
          (current) =>
            next.contexts.find((item) => item.contextId === current?.contextId && item.pageId === current.pageId) ??
            next.contexts[0] ??
            null,
        )
      } catch (cause) {
        if (!isCurrent(scope)) return
        setStatus(null)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [beginRequest, isCurrent, sessionId],
  )

  useEffect(() => {
    sessionRef.current = sessionId
    sessionGeneration.current += 1
    invalidateRequests()
    setStatus(null)
    setPage(null)
    setBusy(false)
    setError('')
    void refresh()
    setSnapshot(null)
    setScreenshot(null)
    setNewPageContextId('')
    setUrl('https://')
    return () => invalidateRequests()
  }, [invalidateRequests, refresh, sessionId])

  async function inspect(nextPage: BrowserPage | null = page, request?: BrowserRequest) {
    if (!sessionId || !nextPage) return
    const scope = request ?? beginRequest(sessionId)
    if (!isCurrent(scope)) return
    const ownsBusyState = !request
    if (ownsBusyState) setBusy(true)
    setError('')
    try {
      if (!scope.connection) throw new Error('Host is not connected')
      const [snapshotResult, screenshotResult] = await Promise.allSettled([
        scope.connection.call('browser.snapshot', {
          sessionId: scope.sessionId,
          contextId: nextPage.contextId,
          pageId: nextPage.pageId,
        }),
        scope.connection.call('browser.screenshot', {
          sessionId: scope.sessionId,
          contextId: nextPage.contextId,
          pageId: nextPage.pageId,
          fullPage: false,
        }),
      ])
      if (snapshotResult.status === 'rejected') throw snapshotResult.reason
      if (!isCurrent(scope)) return
      setPage(nextPage)
      setUrl(nextPage.url)
      setSnapshot(snapshotResult.value)
      setScreenshot(screenshotResult.status === 'fulfilled' ? screenshotResult.value : null)
    } catch (cause) {
      if (!isCurrent(scope)) return
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (ownsBusyState && isCurrent(scope)) setBusy(false)
    }
  }

  async function navigateHistory(action: 'back' | 'forward' | 'reload') {
    if (!sessionId || !page || busy) return
    const scope = beginRequest(sessionId)
    const currentPage = page
    setBusy(true)
    setError('')
    try {
      if (!scope.connection) throw new Error('Host is not connected')
      const next = await scope.connection.call('browser.go', {
        sessionId: scope.sessionId,
        action,
        contextId: currentPage.contextId,
        pageId: currentPage.pageId,
      })
      await inspect(next, scope)
      await refresh(scope)
    } catch (cause) {
      if (isCurrent(scope)) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrent(scope)) setBusy(false)
    }
  }

  async function navigate(event: React.FormEvent) {
    event.preventDefault()
    if (!sessionId || !url.trim() || busy) return
    const scope = beginRequest(sessionId)
    const currentUrl = url.trim()
    const currentPage = page
    const pendingContextId = newPageContextId
    setBusy(true)
    setError('')
    try {
      if (!scope.connection) throw new Error('Host is not connected')
      const next = await scope.connection.call('browser.navigate', {
        sessionId: scope.sessionId,
        url: currentUrl,
        ...(currentPage
          ? { contextId: currentPage.contextId, pageId: currentPage.pageId }
          : pendingContextId
            ? { contextId: pendingContextId }
            : {}),
      })
      if (!isCurrent(scope)) return
      setNewPageContextId('')
      setPage(next)
      setUrl(next.url)
      await inspect(next, scope)
      await refresh(scope)
    } catch (cause) {
      if (isCurrent(scope)) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrent(scope)) setBusy(false)
    }
  }

  function startNewPage() {
    invalidateRequests()
    setBusy(false)
    setNewPageContextId(page?.contextId ?? status?.contexts.at(-1)?.contextId ?? '')
    setPage(null)
    setSnapshot(null)
    setScreenshot(null)
    setError('')
    setUrl('https://')
  }

  async function closePage() {
    if (!sessionId || !page || busy) return
    const scope = beginRequest(sessionId)
    const currentPage = page
    setBusy(true)
    setError('')
    try {
      if (!scope.connection) throw new Error('Host is not connected')
      await scope.connection.call('browser.close', {
        sessionId: scope.sessionId,
        contextId: currentPage.contextId,
        pageId: currentPage.pageId,
      })
      if (!isCurrent(scope)) return
      setPage(null)
      setSnapshot(null)
      setScreenshot(null)
      await refresh(scope)
    } catch (cause) {
      if (isCurrent(scope)) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (isCurrent(scope)) setBusy(false)
    }
  }

  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-4', 'session-chat')}
      className="tool-surface browser-panel"
    >
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader
        icon={Globe}
        title={t('browser')}
        subtitle={page?.title || t('sessionBrowser')}
        onRefresh={() => void refresh()}
        reference="https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-4"
        adapter="session-chat"
      />
      {!sessionId ? (
        <EmptyTool
          icon={Globe}
          title={t('noSessionSelected')}
          body={t('browserEmptyBody')}
          reference="https://pro.reactbits.dev/docs/app-ui/empty-state"
        />
      ) : (
        <div className="tool-surface-body">
          <div className="browser-navigation-row">
            <div className="browser-navigation-actions" aria-label={t('pageNavigation')}>
              <button type="button" title={t('back')} aria-label={t('back')} disabled={!page || busy} onClick={() => void navigateHistory('back')}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" title={t('forward')} aria-label={t('forward')} disabled={!page || busy} onClick={() => void navigateHistory('forward')}>
                <ChevronRight size={14} />
              </button>
              <button type="button" title={t('reloadPage')} aria-label={t('reloadPage')} disabled={!page || busy} onClick={() => void navigateHistory('reload')}>
                <RotateCw size={13} />
              </button>
              <button type="button" title={t('newPage')} aria-label={t('newPage')} disabled={busy} onClick={startNewPage}>
                <Plus size={14} />
              </button>
            </div>
            <form className="browser-address rb-browser-address" onSubmit={(event) => void navigate(event)}>
              <GlassSurface className="browser-address-glass" width="100%" height="100%" aria-hidden="true" />
              <Globe size={13} />
              <input aria-label={t('browserAddress')} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" />
              <button type="submit" title={t('openAddress')} aria-label={t('openAddress')} disabled={busy || !url.trim()}>
                {busy ? <LoaderCircle size={14} className="spinning" /> : <ExternalLink size={14} />}
              </button>
            </form>
          </div>
          {error && <p className="tool-error" role="alert"><CircleAlert size={14} />{error}</p>}
          {status && !status.available && <p className="tool-muted">{t('browserUnavailable')}</p>}
          {status?.contexts.length ? (
            <AnimatedList viewportClassName="browser-pages" aria-label={t('openPages')}>
              {status.contexts.map((item) => (
                <SpotlightCard
                  as="button"
                  type="button"
                  className={`browser-page-card ${page?.pageId === item.pageId ? 'selected' : ''}`}
                  key={`${item.contextId}:${item.pageId}`}
                  aria-pressed={page?.pageId === item.pageId}
                  spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                  onClick={() => void inspect(item)}
                >
                  <span>{item.title || item.url}</span>
                  <small>{item.url}</small>
                </SpotlightCard>
              ))}
            </AnimatedList>
          ) : (
            <EmptyTool
              icon={Globe}
              title={t('noOpenPages')}
              body={t('startBrowsing')}
              reference="https://pro.reactbits.dev/docs/app-ui/empty-state"
            />
          )}
          {snapshot && (
            <section
              {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-4', 'session-chat')}
              className="browser-snapshot rb-tool-detail-surface"
            >
              <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
              <div className="tool-section-label"><span>{t('pageText')}</span>{page && <button type="button" onClick={() => void closePage()}><X size={13} />{t('closePage')}</button>}</div>
              <pre>{snapshot.text || t('unreadablePage')}</pre>
            </section>
          )}
          {screenshot?.data && (
            <SpotlightCard className="browser-screenshot-card" spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)">
              <img className="browser-screenshot" src={`data:${screenshot.mime};base64,${screenshot.data}`} alt={page?.title || t('browserPage')} />
            </SpotlightCard>
          )}
          {status?.history.length ? (
            <details
              {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-4', 'activity')}
              className="browser-history"
            >
              <summary>{t('recentVisits')}</summary>
              {status.history.slice(0, 8).map((item, index) => <div key={`${item}-${index}`}>{item}</div>)}
            </details>
          ) : null}
        </div>
      )}
    </section>
  )
}

export function SessionInspectorPanel({ sessionId = '' }: PanelProps) {
  const { t } = useLocale()
  const snapshot = useSessions((state) => (sessionId ? state.snapshots[sessionId] : undefined))
  const catalog = useCatalog((state) => state.data)
  const modelId = useWorkbench((state) => state.modelId)
  const referenceProjections = useReferenceProjections(sessionId)
  const session = catalog?.sessions.find((item) => item.id === sessionId) ?? snapshot?.session
  const model = catalog?.models.find((item) => item.id === modelId)
  const activeRuns = snapshot?.runs.filter((run) => ['running', 'queued', 'waiting_approval'].includes(run.status)).length ?? 0
  const toolCalls = snapshot?.messages.reduce((total, message) => total + message.content.filter((block) => block.type === 'tool_call').length, 0) ?? 0
  const approvalCount = referenceProjections.approval.approvals.length
  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-6', 'activity')}
      className="tool-surface"
    >
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader
        icon={FileSearch}
        title={t('sessionInspector')}
        subtitle={session?.title || t('session')}
        onRefresh={() => sessionId && void openSession(sessionId).catch(report)}
        reference="https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-6"
        adapter="activity"
      />
      {!sessionId || !snapshot ? (
        <EmptyTool
          icon={FileSearch}
          title={t('sessionNotLoaded')}
          body={t('inspectSessionHint')}
          reference="https://pro.reactbits.dev/docs/app-ui/empty-state"
        />
      ) : (
        <div className="tool-surface-body">
          <ReferenceMetricStrip
            className="inspector-grid"
            metricClassName="inspector-metric"
            reference="https://pro.reactbits.dev/docs/app-ui/dashboard"
            adapter="activity"
            metrics={[
              {
                id: 'status',
                label: t('status'),
                value: activeRuns ? t('active') : t('idle'),
                status: activeRuns ? 'running' : 'idle',
              },
              { id: 'model', label: t('model'), value: model?.name ?? (modelId || t('unconfigured')) },
              { id: 'messages', label: t('messageCount'), value: referenceProjections.chat.messages.length.toLocaleString() },
              { id: 'tools', label: t('toolCallCount'), value: toolCalls.toLocaleString() },
              { id: 'cursor', label: t('eventCursor'), value: snapshot.cursor.toLocaleString() },
              {
                id: 'approvals',
                label: t('approvals'),
                value: approvalCount ? `${approvalCount} ${t('pendingCount')}` : t('noPending'),
                status: approvalCount ? 'waiting' : 'idle',
              },
            ]}
          />
          <section
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-7', 'activity')}
            className="tool-detail-card rb-tool-detail-surface"
          >
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <h3>{t('recentRuns')}</h3>
            <AnimatedList className="inspector-runs-list" viewportClassName="inspector-runs" showGradients={false}>
              {snapshot.runs.slice(0, 8).map((run) => (
                <SpotlightCard className="inspector-run" key={run.id} spotlightColor="color-mix(in srgb, var(--rb-status) 24%, transparent)">
                  <span className={`inspector-dot ${run.status}`} />
                  <span>{run.input.text || t('imageMessage')}</span>
                  <small>{run.status}</small>
                </SpotlightCard>
              ))}
            </AnimatedList>
            {!snapshot.runs.length && <p className="tool-muted">{t('noRunRecords')}</p>}
          </section>
        </div>
      )}
    </section>
  )
}

export function PlanPanel({ sessionId = '' }: PanelProps) {
  const { t } = useLocale()
  const state = useSessionCapabilities((current) => (sessionId ? current.sessions[sessionId] : undefined))
  const referenceProjections = useReferenceProjections(sessionId)
  const [dialog, setDialog] = useState<SessionCapabilityTab | null>(null)
  const goal = state?.goal
  const snapshot = useSessions((current) => (sessionId ? current.snapshots[sessionId] : undefined))
  const activeRun = snapshot?.runs.find((run) => ['running', 'queued', 'waiting_approval'].includes(run.status))
  const completedSteps = referenceProjections.plan.completed
  const currentStep = referenceProjections.plan.steps.find((step) => step.status === 'in_progress')
  const totalSteps = referenceProjections.plan.steps.length
  const progressSteps: ProgressStep[] = referenceProjections.plan.steps.map((step, index) => ({
    id: `${index}-${step.label}`,
    title: step.label,
    status: step.status === 'in_progress' ? 'in_progress' : step.status === 'completed' ? 'completed' : 'pending',
  }))
  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-plan', 'plan')}
      className="tool-surface"
    >
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader
        icon={ListChecks}
        title={t('plan')}
        subtitle={goal?.objective || t('plan')}
        reference="https://pro.reactbits.dev/docs/app-ui/agent-plan"
        adapter="plan"
      />
      {!sessionId ? (
        <EmptyTool
          icon={ListChecks}
          title={t('noSessionSelected')}
          body={t('selectSessionPlanHint')}
          reference="https://pro.reactbits.dev/docs/app-ui/empty-state"
        />
      ) : (
        <div className="tool-surface-body">
          <section
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-plan', 'plan')}
            className="tool-detail-card goal-card rb-tool-detail-surface"
          >
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <div className="tool-section-label">
              <span>
                <Target size={13} />
                Goal
              </span>
              <button type="button" onClick={() => setDialog('goal')}>
                <Target size={13} />
                {t('edit')}
              </button>
            </div>
            {goal ? (
              <>
                <p>{goal.objective}</p>
                <div className="goal-meta">
                  <span>{goal.status}</span>
                  <span>{goal.tokensUsed.toLocaleString()} tokens</span>
                </div>
              </>
            ) : (
              <p className="tool-muted">{t('noActiveGoal')}</p>
            )}
          </section>
          <section
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-plan', 'plan')}
            className="tool-detail-card plan-card rb-tool-detail-surface"
          >
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <div className="plan-progress-heading">
              <div>
                <strong>Plan</strong>
                <span>
                  {completedSteps} of {totalSteps} done
                </span>
              </div>
              {activeRun && (
                <button
                  type="button"
                  aria-label={t('stopPlanRun')}
                  title={t('stopPlanRun')}
                  onClick={() => void client().call('run.cancel', { runId: activeRun.id }).catch(report)}
                >
                  <X size={12} />
                  {t('stop')}
                </button>
              )}
            </div>
            {totalSteps > 0 && (
              <div className="plan-progress-track" aria-label={`${t('planProgress')} ${completedSteps} / ${totalSteps}`}>
                <span style={{ width: `${Math.round((completedSteps / totalSteps) * 100)}%` }} />
              </div>
            )}
            {currentStep && <p className="plan-current-step">{t('processing')}：{currentStep.label}</p>}
            <div className="tool-section-label">
              <span>
                <ListChecks size={13} />
                {t('steps')}
              </span>
              <button type="button" onClick={() => setDialog('plan')}>
                <ListChecks size={13} />
                {t('edit')}
              </button>
            </div>
            {!progressSteps.length && <EmptyState title={t('noPlanSteps')} description={t('createPlanHint')} />}
            {progressSteps.length > 0 && <ProgressRail className="plan-progress-rail" steps={progressSteps} aria-label={t('planStepsProgress')} />}
          </section>
        </div>
      )}
      {dialog && sessionId && (
        <SessionCapabilityDialog sessionId={sessionId} initialTab={dialog} onClose={() => setDialog(null)} />
      )}
    </section>
  )
}

export function InsightsPanel({ sessionId = '' }: PanelProps) {
  const { t } = useLocale()
  const snapshot = useSessions((state) => (sessionId ? state.snapshots[sessionId] : undefined))
  const referenceProjections = useReferenceProjections(sessionId)
  const stats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const message of snapshot?.messages ?? [])
      for (const block of message.content) if (block.type === 'tool_call') counts.set(block.name, (counts.get(block.name) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [snapshot?.messages])
  const max = stats[0]?.[1] ?? 1
  const usage = referenceProjections.usage.usage
  const cacheRate = usage?.input ? Math.round((usage.cacheRead / usage.input) * 100) : 0
  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-usage', 'usage')}
      className="tool-surface"
    >
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader
        icon={Activity}
        title={t('sessionInsights')}
        subtitle={t('toolTokenUsage')}
        reference="https://pro.reactbits.dev/docs/app-ui/ai-usage"
        adapter="usage"
      />
      {!sessionId || !snapshot ? (
        <EmptyTool
          icon={Activity}
          title={t('noSessionData')}
          body={t('runHistoryHint')}
          reference="https://pro.reactbits.dev/docs/app-ui/empty-state"
        />
      ) : (
        <div className="tool-surface-body">
          <ReferenceMetricStrip
            className="insight-kpis"
            metricClassName="insight-kpi"
            reference="https://pro.reactbits.dev/docs/app-ui/ai-usage"
            adapter="usage"
            metrics={[
              { id: 'input', label: t('inputTokens'), value: usage.input.toLocaleString() },
              { id: 'output', label: t('outputTokens'), value: usage.output.toLocaleString() },
              { id: 'runs', label: t('runMetric'), value: snapshot.runs.length.toLocaleString() },
              { id: 'cost', label: t('cost'), value: `$${usage.cost.toFixed(4)}`, status: usage.cost > 0 ? 'warning' : 'idle' },
              { id: 'cache', label: t('cacheHit'), value: `${cacheRate}%` },
            ]}
          />
          <section
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/analytics', 'usage')}
            className="tool-detail-card insight-chart rb-tool-detail-surface"
          >
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <h3>{t('toolCallCount')}</h3>
            <AnimatedList className="insight-list" viewportClassName="insight-rows" showGradients={false}>
              {stats.map(([name, count]) => <SpotlightCard className="insight-row" key={name} spotlightColor="color-mix(in srgb, var(--rb-accent) 24%, transparent)"><span>{name}</span><i><b style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></i><strong>{count}</strong></SpotlightCard>)}
            </AnimatedList>
            {!stats.length && <p className="tool-muted">{t('noToolCalls')}</p>}
          </section>
        </div>
      )}
    </section>
  )
}

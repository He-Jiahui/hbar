import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Globe,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react'
import type { BrowserPage, BrowserScreenshot, BrowserSnapshot } from '@hbar/contracts'
import {
  client,
  openSession,
  report,
  useCatalog,
  useSessions,
  useWorkbench,
} from './stores'
import SessionCapabilityDialog from './SessionCapabilityDialog'
import { useSessionCapabilities, type SessionCapabilityTab } from './session-capabilities'
import GlassSurface from './react-bits/GlassSurface'
import AnimatedList from './react-bits/AnimatedList'
import SpotlightCard from './react-bits/SpotlightCard'

type PanelProps = { sessionId?: string }

function PanelHeader({ icon: Icon, title, subtitle, onRefresh }: { icon: typeof Activity; title: string; subtitle?: string; onRefresh?: () => void }) {
  return (
    <header className="tool-surface-header rb-tool-header">
      <GlassSurface className="tool-header-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="tool-surface-title">
        <span className="tool-surface-icon"><Icon size={15} /></span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {onRefresh && (
        <button type="button" className="tool-surface-refresh" title="刷新" aria-label={`刷新${title}`} onClick={onRefresh}>
          <RefreshCw size={14} />
        </button>
      )}
    </header>
  )
}

function EmptyTool({ icon: Icon, title, body }: { icon: typeof Activity; title: string; body: string }) {
  return (
    <div className="tool-empty-state rb-tool-empty">
      <GlassSurface className="tool-empty-glass" width="100%" height="100%" aria-hidden="true" />
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}

type BrowserStatus = { available: boolean; contexts: BrowserPage[]; history: string[] }

export function BrowserPanel({ sessionId = '' }: PanelProps) {
  const [status, setStatus] = useState<BrowserStatus | null>(null)
  const [page, setPage] = useState<BrowserPage | null>(null)
  const [snapshot, setSnapshot] = useState<BrowserSnapshot | null>(null)
  const [screenshot, setScreenshot] = useState<BrowserScreenshot | null>(null)
  const [url, setUrl] = useState('https://')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setStatus(null)
      return
    }
    try {
      const next = await client().call('browser.status', { sessionId })
      setStatus(next)
      setError('')
      const current = next.contexts[0]
      if (current) setPage(current)
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    setSnapshot(null)
    setScreenshot(null)
  }, [refresh])

  async function inspect(nextPage: BrowserPage | null = page) {
    if (!sessionId || !nextPage) return
    setBusy(true)
    setError('')
    try {
      const [nextSnapshot, nextScreenshot] = await Promise.all([
        client().call('browser.snapshot', { sessionId, contextId: nextPage.contextId, pageId: nextPage.pageId }),
        client().call('browser.screenshot', {
          sessionId,
          contextId: nextPage.contextId,
          pageId: nextPage.pageId,
          fullPage: false,
        }),
      ])
      setPage(nextPage)
      setSnapshot(nextSnapshot)
      setScreenshot(nextScreenshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function navigate(event: React.FormEvent) {
    event.preventDefault()
    if (!sessionId || !url.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const next = await client().call('browser.navigate', {
        sessionId,
        url: url.trim(),
        ...(page ? { contextId: page.contextId, pageId: page.pageId } : {}),
      })
      setPage(next)
      setUrl(next.url)
      await inspect(next)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  async function closePage() {
    if (!sessionId || !page || busy) return
    setBusy(true)
    try {
      await client().call('browser.close', { sessionId, contextId: page.contextId, pageId: page.pageId })
      setPage(null)
      setSnapshot(null)
      setScreenshot(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="tool-surface browser-panel">
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader icon={Globe} title="浏览器" subtitle={page?.title || '会话浏览器'} onRefresh={() => void refresh()} />
      {!sessionId ? (
        <EmptyTool icon={Globe} title="尚未选择会话" body="打开一个会话后即可使用浏览器工具。" />
      ) : (
        <div className="tool-surface-body">
          <form className="browser-address rb-browser-address" onSubmit={(event) => void navigate(event)}>
            <GlassSurface className="browser-address-glass" width="100%" height="100%" aria-hidden="true" />
            <Globe size={13} />
            <input aria-label="浏览器地址" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" />
            <button type="submit" title="打开地址" aria-label="打开地址" disabled={busy || !url.trim()}>
              {busy ? <LoaderCircle size={14} className="spinning" /> : <ExternalLink size={14} />}
            </button>
          </form>
          {error && <p className="tool-error" role="alert"><CircleAlert size={14} />{error}</p>}
          {status && !status.available && <p className="tool-muted">浏览器运行时不可用，请检查浏览器插件配置。</p>}
          {status?.contexts.length ? (
            <AnimatedList viewportClassName="browser-pages" aria-label="打开的页面">
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
            <EmptyTool icon={Globe} title="没有打开的页面" body="在上方输入地址开始浏览。" />
          )}
          {snapshot && (
            <section className="browser-snapshot rb-tool-detail-surface">
              <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
              <div className="tool-section-label"><span>页面文本</span>{page && <button type="button" onClick={() => void closePage()}><X size={13} />关闭页面</button>}</div>
              <pre>{snapshot.text || '页面没有可读文本。'}</pre>
            </section>
          )}
          {screenshot?.data && (
            <SpotlightCard className="browser-screenshot-card" spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)">
              <img className="browser-screenshot" src={`data:${screenshot.mime};base64,${screenshot.data}`} alt={page?.title || '浏览器页面'} />
            </SpotlightCard>
          )}
          {status?.history.length ? (
            <details className="browser-history">
              <summary>最近访问</summary>
              {status.history.slice(0, 8).map((item, index) => <div key={`${item}-${index}`}>{item}</div>)}
            </details>
          ) : null}
        </div>
      )}
    </section>
  )
}

export function SessionInspectorPanel({ sessionId = '' }: PanelProps) {
  const snapshot = useSessions((state) => (sessionId ? state.snapshots[sessionId] : undefined))
  const catalog = useCatalog((state) => state.data)
  const modelId = useWorkbench((state) => state.modelId)
  const session = catalog?.sessions.find((item) => item.id === sessionId) ?? snapshot?.session
  const model = catalog?.models.find((item) => item.id === modelId)
  const activeRuns = snapshot?.runs.filter((run) => ['running', 'queued', 'waiting_approval'].includes(run.status)).length ?? 0
  const toolCalls = snapshot?.messages.reduce((total, message) => total + message.content.filter((block) => block.type === 'tool_call').length, 0) ?? 0
  return (
    <section className="tool-surface">
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader icon={FileSearch} title="会话检查" subtitle={session?.title || 'Session'} onRefresh={() => sessionId && void openSession(sessionId).catch(report)} />
      {!sessionId || !snapshot ? (
        <EmptyTool icon={FileSearch} title="尚未加载会话" body="选择一个会话后查看运行时信息。" />
      ) : (
        <div className="tool-surface-body">
          <dl className="inspector-grid">
            <SpotlightCard className="inspector-metric" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><dt>状态</dt><dd><span className={`inspector-dot ${activeRuns ? 'active' : ''}`} />{activeRuns ? '运行中' : '空闲'}</dd></SpotlightCard>
            <SpotlightCard className="inspector-metric" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><dt>模型</dt><dd>{model?.name ?? (modelId || '未配置')}</dd></SpotlightCard>
            <SpotlightCard className="inspector-metric" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><dt>消息</dt><dd>{snapshot.messages.length.toLocaleString()}</dd></SpotlightCard>
            <SpotlightCard className="inspector-metric" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><dt>工具调用</dt><dd>{toolCalls.toLocaleString()}</dd></SpotlightCard>
            <SpotlightCard className="inspector-metric" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><dt>事件游标</dt><dd>{snapshot.cursor.toLocaleString()}</dd></SpotlightCard>
            <SpotlightCard className="inspector-metric" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><dt>权限</dt><dd><ShieldCheck size={13} />{snapshot.approvals.length ? `${snapshot.approvals.length} 待处理` : '无待处理'}</dd></SpotlightCard>
          </dl>
          <section className="tool-detail-card rb-tool-detail-surface">
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <h3>最近运行</h3>
            <AnimatedList className="inspector-runs-list" viewportClassName="inspector-runs" showGradients={false}>
              {snapshot.runs.slice(0, 8).map((run) => (
                <SpotlightCard className="inspector-run" key={run.id} spotlightColor="color-mix(in srgb, var(--rb-status) 24%, transparent)">
                  <span className={`inspector-dot ${run.status}`} />
                  <span>{run.input.text || '图片消息'}</span>
                  <small>{run.status}</small>
                </SpotlightCard>
              ))}
            </AnimatedList>
            {!snapshot.runs.length && <p className="tool-muted">暂无运行记录。</p>}
          </section>
        </div>
      )}
    </section>
  )
}

export function PlanPanel({ sessionId = '' }: PanelProps) {
  const state = useSessionCapabilities((current) => (sessionId ? current.sessions[sessionId] : undefined))
  const [dialog, setDialog] = useState<SessionCapabilityTab | null>(null)
  const goal = state?.goal
  const plan = state?.plan
  const snapshot = useSessions((current) => (sessionId ? current.snapshots[sessionId] : undefined))
  const activeRun = snapshot?.runs.find((run) => ['running', 'queued', 'waiting_approval'].includes(run.status))
  const completedSteps = plan?.plan.filter((step) => step.status === 'completed').length ?? 0
  const currentStep = plan?.plan.find((step) => step.status === 'in_progress')
  const totalSteps = plan?.plan.length ?? 0
  return (
    <section className="tool-surface">
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader icon={ListChecks} title="计划" subtitle={goal?.objective || 'Agent plan'} />
      {!sessionId ? (
        <EmptyTool icon={ListChecks} title="尚未选择会话" body="选择会话后查看 Goal 和 Plan。" />
      ) : (
        <div className="tool-surface-body">
          <section className="tool-detail-card goal-card rb-tool-detail-surface">
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <div className="tool-section-label">
              <span>
                <Target size={13} />
                Goal
              </span>
              <button type="button" onClick={() => setDialog('goal')}>
                <Target size={13} />
                编辑
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
              <p className="tool-muted">当前会话没有活动 Goal。</p>
            )}
          </section>
          <section className="tool-detail-card plan-card rb-tool-detail-surface">
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
                  aria-label="停止计划运行"
                  title="停止计划运行"
                  onClick={() => void client().call('run.cancel', { runId: activeRun.id }).catch(report)}
                >
                  <X size={12} />
                  停止
                </button>
              )}
            </div>
            {totalSteps > 0 && (
              <div className="plan-progress-track" aria-label={`计划进度 ${completedSteps} / ${totalSteps}`}>
                <span style={{ width: `${Math.round((completedSteps / totalSteps) * 100)}%` }} />
              </div>
            )}
            {currentStep && <p className="plan-current-step">正在处理：{currentStep.step}</p>}
            <div className="tool-section-label">
              <span>
                <ListChecks size={13} />
                步骤
              </span>
              <button type="button" onClick={() => setDialog('plan')}>
                <ListChecks size={13} />
                编辑
              </button>
            </div>
            {plan?.plan.length ? (
              <ol>
                {plan.plan.map((step, index) => (
                  <li key={`${index}-${step.step}`} className={step.status}>
                    <span>{step.status === 'completed' ? <Check size={13} /> : index + 1}</span>
                    <p>{step.step}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tool-muted">当前会话没有计划步骤。</p>
            )}
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
  const snapshot = useSessions((state) => (sessionId ? state.snapshots[sessionId] : undefined))
  const stats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const message of snapshot?.messages ?? [])
      for (const block of message.content) if (block.type === 'tool_call') counts.set(block.name, (counts.get(block.name) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [snapshot?.messages])
  const max = stats[0]?.[1] ?? 1
  return (
    <section className="tool-surface">
      <GlassSurface className="tool-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <PanelHeader icon={Activity} title="会话洞察" subtitle="工具与 token 使用" />
      {!sessionId || !snapshot ? (
        <EmptyTool icon={Activity} title="暂无会话数据" body="运行一次会话后查看洞察。" />
      ) : (
        <div className="tool-surface-body">
          <div className="insight-kpis">
            <SpotlightCard className="insight-kpi" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><span>输入</span><strong>{snapshot.usage.input.toLocaleString()}</strong></SpotlightCard>
            <SpotlightCard className="insight-kpi" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><span>输出</span><strong>{snapshot.usage.output.toLocaleString()}</strong></SpotlightCard>
            <SpotlightCard className="insight-kpi" spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"><span>运行</span><strong>{snapshot.runs.length.toLocaleString()}</strong></SpotlightCard>
          </div>
          <section className="tool-detail-card insight-chart rb-tool-detail-surface">
            <GlassSurface className="tool-detail-glass" width="100%" height="100%" aria-hidden="true" />
            <h3>工具调用</h3>
            <AnimatedList className="insight-list" viewportClassName="insight-rows" showGradients={false}>
              {stats.map(([name, count]) => <SpotlightCard className="insight-row" key={name} spotlightColor="color-mix(in srgb, var(--rb-accent) 24%, transparent)"><span>{name}</span><i><b style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></i><strong>{count}</strong></SpotlightCard>)}
            </AnimatedList>
            {!stats.length && <p className="tool-muted">暂无工具调用。</p>}
          </section>
        </div>
      )}
    </section>
  )
}


import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { Run } from '@hbar/contracts'
import {
  HbarAppUiEventLog,
  HbarAppUiUsageOverview,
  HbarAppUiRunActivity,
  HbarAppUiTabs,
  type HbarAppUiRunActivityItem,
} from 'hbar-app-ui'
import { cancelSessionRun, useConnection, useSessions, useWorkbench, report } from './stores'
import { useLocale, type LocaleMessageKey } from './locale'
import { Modal } from './Settings'
import { activityModel } from './activity-actions'
import { getActivityCopy } from './activity-locale'
import './activity-panel.css'
const runStatusMessageKeys: Readonly<Record<Run['status'], LocaleMessageKey>> = {
  queued: 'queuedStatus',
  running: 'running',
  waiting_approval: 'waitingApprovalStatus',
  completed: 'runCompletedStatus',
  cancelled: 'cancelledStatus',
  failed: 'failed',
  interrupted: 'interruptedStatus',
}

function formatRunDuration(run: Run, locale: string): string | undefined {
  if (run.startedAt === null || run.endedAt === null) return undefined
  const seconds = Math.max(0, Math.round((run.endedAt - run.startedAt) / 1000))
  if (locale.toLocaleLowerCase().startsWith('zh')) {
    if (seconds < 60) return `${seconds} 秒`
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  }
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function toRunActivityItem(run: Run, locale: string, t: (key: LocaleMessageKey) => string): HbarAppUiRunActivityItem {
  const createdAt = new Date(run.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return {
    id: run.id,
    label: run.input.text || t('imageMessage'),
    status: run.status,
    detail: run.error ? `${createdAt} · ${run.error}` : createdAt,
    duration: formatRunDuration(run, locale),
  }
}

export function ActivityPanel() {
  const sessionId = useWorkbench((state) => state.activeSession),
    snapshot = useSessions((state) => state.snapshots[sessionId]),
    cancellingRunIds = useSessions((state) => state.cancellingRunIds),
    cancellationError = useSessions((state) => state.cancellationError)
  const [mode, setMode] = useState<'activity' | 'trace'>('activity')
  const connection = useConnection((state) => state.client)
  const record = useStore(activityModel.store, (state) => state.traces[sessionId])
  const trace = record?.source === connection ? record : undefined
  const detail = trace?.events.find((event) => event.eventId === trace.selectedId)
  const { locale, t } = useLocale()
  const copy = getActivityCopy(locale)
  const cursor = snapshot?.cursor
  useEffect(() => {
    if (mode !== 'trace' || cursor === undefined) return
    void activityModel.load(sessionId, cursor)
  }, [mode, sessionId, cursor, connection])
  const usage = snapshot?.usage
  return (
    <div className="activity-panel hbar-app-ui-activity-panel">
      <HbarAppUiTabs
        label={t('activityViewLabel')}
        value={mode}
        options={[
          { id: 'activity', label: t('run') },
          { id: 'trace', label: t('events') },
        ]}
        onChange={(value) => {
          if (value === 'activity' || value === 'trace') setMode(value)
        }}
      />
      {mode === 'activity' ? (
        <>
          <HbarAppUiUsageOverview
            title={copy.totals}
            description={t('activityCurrentSession')}
            meters={[]}
            metrics={[
              { label: t('inputTokens'), value: (usage?.input ?? 0).toLocaleString(locale) },
              { label: t('outputTokens'), value: (usage?.output ?? 0).toLocaleString(locale) },
              { label: t('cacheRead'), value: (usage?.cacheRead ?? 0).toLocaleString(locale) },
              { label: t('cost'), value: `$${(usage?.cost ?? 0).toFixed(4)}` },
            ]}
          />
          <HbarAppUiRunActivity
            listStrategy="virtual"
            labels={{
              title: t('runHistory'),
              emptyTitle: t('noRunHistory'),
              emptyDescription: t('runHistoryHint'),
              cancelLabel: t('stopRun'),
              cancellingLabel: t('stopping'),
              countLabel: copy.runs,
              statusLabel: (status) => t(runStatusMessageKeys[status]),
            }}
            runs={snapshot?.runs.map((run) => toRunActivityItem(run, locale, t)) ?? []}
            cancellingRunIds={cancellingRunIds}
            feedback={cancellationError?.sessionId === sessionId ? cancellationError.message : undefined}
            onCancelRun={(runId) => {
              void cancelSessionRun(sessionId, runId).catch(report)
            }}
          />
        </>
      ) : (
        <>
          <HbarAppUiEventLog
            labels={{
              title: t('events'),
              scope: copy.events(trace?.events.length ?? 0),
              empty: copy.empty,
              loading: copy.loading,
              retry: copy.retry,
            }}
            items={
              trace?.events.map((event) => ({
                id: event.eventId,
                sequence: String(event.seq),
                type: event.type,
                time: new Date(event.time).toLocaleTimeString(locale),
              })) ?? []
            }
            loading={trace?.loading ?? false}
            error={trace?.error}
            selectedId={trace?.selectedId}
            onSelect={(id) => activityModel.select(sessionId, id)}
            onRetry={() => {
              void activityModel.load(sessionId, cursor ?? 0)
            }}
          />
          {detail && (
            <Modal title={detail.type} onClose={() => activityModel.select(sessionId, undefined)}>
              <pre className="event-detail">{JSON.stringify(detail, null, 2)}</pre>
            </Modal>
          )}
        </>
      )}
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Database, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { LumenButton, LumenDialog, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { chatDatabaseViewKey } from '@hbar/app-runtime'
import type {
  ChatDatabaseScope,
  ChatDatabaseOperation,
  ChatDatabaseSkipReason,
  ChatDatabaseCleanupKind,
  ChatDatabaseStatistics,
  ChatDatabaseTask,
  ChatDatabaseCacheCategory,
} from '@hbar/contracts/commands/chat-database'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './chat-database-settings.css'

export type ChatDatabaseMetricId =
  | 'sessions'
  | 'archived'
  | 'messages'
  | 'content'
  | 'logical'
  | 'database'
  | 'wal'
  | 'shm'
  | 'freePages'
  | 'logs'
  | 'attachments'
  | 'cache'
export interface ChatDatabaseSettingsLabels {
  readonly title: string
  readonly description: string
  readonly overview: string
  readonly attributable: string
  readonly physical: string
  readonly shared: string
  readonly totalHelp: string
  readonly scopedHelp: string
  readonly rules: string
  readonly rulesHelp: string
  readonly savedRules: string
  readonly automatic: string
  readonly manual: string
  readonly manualHelp: string
  readonly records: string
  readonly noRecords: string
  readonly loading: string
  readonly incomplete: string
  readonly offline: string
  readonly refresh: string
  readonly review: string
  readonly generatePreview: string
  readonly previewTitle: string
  readonly noCandidates: string
  readonly confirm: string
  readonly confirmHelp: string
  readonly close: string
  readonly cancel: string
  readonly reconcile: string
  readonly retryOriginal: string
  readonly unknown: string
  readonly firstPage: string
  readonly nextPage: string
  readonly skipped: string
  readonly lastRun: string
  readonly nextRun: string
  readonly cacheBreakdown: string
  readonly cacheCategories: Readonly<Record<ChatDatabaseCacheCategory, string>>
  readonly metrics: readonly {
    readonly id: ChatDatabaseMetricId
    readonly label: string
    readonly kind: 'bytes' | 'count'
    readonly shared: boolean
  }[]
  readonly actions: readonly {
    readonly kind: ChatDatabaseCleanupKind
    readonly title: string
    readonly help: string
    readonly globalOnly: boolean
  }[]
  readonly bytes: (bytes: number) => string
  readonly count: (count: number) => string
  readonly date: (time: number | null) => string
  readonly sampledAt: (time: number) => string
  readonly previewSummary: (operation: ChatDatabaseOperation) => string
  readonly expiresAt: (time: number | null) => string
  readonly operation: (operation: ChatDatabaseOperation) => string
  readonly outcome: (operation: ChatDatabaseOperation) => string
  readonly task: (task: ChatDatabaseTask) => string
  readonly scope: (scope: ChatDatabaseScope) => string
  readonly skipReason: (reason: ChatDatabaseSkipReason) => string
  readonly error: (code: string) => string
}
function metricValues(report: ChatDatabaseStatistics): Record<ChatDatabaseMetricId, number> {
  return {
    sessions: report.history.sessionCount,
    archived: report.history.archivedCount,
    messages: report.history.messageCount,
    content: report.history.contentBytes,
    logical: report.history.logicalBytes,
    database: report.disk.databaseBytes,
    wal: report.disk.walBytes,
    shm: report.disk.shmBytes,
    freePages: report.history.freePageBytes,
    logs: report.scope.kind === 'global' ? report.disk.logBytes : report.disk.scopedLogBytes,
    attachments: report.scope.kind === 'global' ? report.disk.attachmentBytes : report.disk.scopedAttachmentBytes,
    cache: report.disk.cacheBytes,
  }
}
function Skips({
  skipped,
  labels,
}: {
  readonly skipped: ChatDatabaseOperation['skipped']
  readonly labels: ChatDatabaseSettingsLabels
}) {
  return skipped.length ? (
    <details className="hbar-chat-database-skips">
      <summary>{labels.skipped}</summary>
      <dl>
        {skipped.map((skip) => (
          <div key={skip.code}>
            <dt>{labels.skipReason(skip.code)}</dt>
            <dd>{labels.count(skip.count)}</dd>
          </div>
        ))}
      </dl>
    </details>
  ) : null
}
function Operation({
  operation,
  labels,
  onCancel,
  onReconcile,
  connected,
}: {
  readonly operation: ChatDatabaseOperation
  readonly labels: ChatDatabaseSettingsLabels
  readonly connected: boolean
  readonly onCancel?: () => void
  readonly onReconcile?: () => void
}) {
  const active = ['accepted', 'running', 'cancelRequested'].includes(operation.status)
  return (
    <LumenFrame
      as="article"
      className="hbar-chat-database-operation"
      data-operation-id={operation.operationId}
      data-operation-status={operation.status}
    >
      <LumenFrame className="hbar-chat-database-row">
        <LumenText as="p" role={active ? 'status' : undefined}>
          {labels.operation(operation)}
        </LumenText>
        {onCancel && active && (
          <LumenButton disabled={!connected || operation.cancellationRequested} onClick={onCancel}>
            {labels.cancel}
          </LumenButton>
        )}
        {onReconcile && operation.status === 'unknown' && (
          <LumenButton disabled={!connected} onClick={onReconcile}>
            {labels.reconcile}
          </LumenButton>
        )}
      </LumenFrame>
      <LumenText as="p" tone="muted">
        {labels.outcome(operation)}
      </LumenText>
      {operation.error && (
        <LumenText as="p" role="alert">
          {labels.error(operation.error)}
        </LumenText>
      )}
      <Skips skipped={operation.skipped} labels={labels} />
    </LumenFrame>
  )
}

/** Settings owns the scroll pane; each preview/history list retains one 50-row cursor page. */
export function HbarChatDatabaseSettings({
  instanceId,
  scope,
  connected,
  labels,
  ruleForm,
  savedRevision,
}: {
  readonly instanceId: string
  readonly scope: ChatDatabaseScope
  readonly connected: boolean
  readonly labels: ChatDatabaseSettingsLabels
  readonly ruleForm: ReactNode
  readonly savedRevision: string
}) {
  const runtime = useHbarRuntime()
  const snapshot = useHbarRuntimeState(runtime.state.chatDatabase)
  const key = chatDatabaseViewKey(instanceId, scope)
  const state = snapshot.entries[key]
  const [confirming, setConfirming] = useState<string | null>(null)
  const actions = runtime.chatDatabase
  useEffect(() => actions.acquire(instanceId, scope), [actions, instanceId, scope])
  useEffect(() => {
    if (connected) void actions.refresh(instanceId, scope)
  }, [actions, connected, instanceId, savedRevision, scope])
  useEffect(() => {
    if (confirming && state?.preview?.operationId !== confirming) setConfirming(null)
  }, [confirming, state?.preview?.operationId])
  const report = state?.statistics
  const values = report ? metricValues(report) : null
  const preview = state?.preview
  const reviewReady =
    preview?.status === 'completed' &&
    state?.operation?.previewId !== preview.operationId &&
    preview.candidateCount > 0 &&
    preview.expiresAt !== null &&
    Date.now() < preview.expiresAt
  const automatic = state?.task?.operation
  const automaticActive = automatic && ['accepted', 'running', 'cancelRequested', 'unknown'].includes(automatic.status)
  const active = automaticActive ? automatic : (state?.operation ?? automatic)
  const busy =
    state?.writing ||
    state?.unknown ||
    [preview, active].some(
      (item) => item && ['accepted', 'running', 'cancelRequested', 'unknown'].includes(item.status),
    )
  const allowedActions = labels.actions.filter((action) => !action.globalOnly || scope.kind === 'global')
  const metrics = (shared: boolean) =>
    labels.metrics.filter((item) => (scope.kind === 'global' ? !shared : item.shared === shared))
  const renderMetrics = (shared: boolean) =>
    values && (
      <dl className="hbar-chat-database-metrics">
        {metrics(shared).map((metric) => (
          <div key={metric.id} data-database-metric={metric.id}>
            <dt>{metric.label}</dt>
            <dd>{metric.kind === 'bytes' ? labels.bytes(values[metric.id]) : labels.count(values[metric.id])}</dd>
          </div>
        ))}
      </dl>
    )
  return (
    <LumenFrame as="section" className="hbar-chat-database-settings" aria-label={labels.title}>
      <header>
        <LumenText as="h2" variant="heading">
          <LumenIcon icon={Database} tier="md" />
          {labels.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {labels.description}
        </LumenText>
      </header>
      {!connected && (
        <LumenText as="p" role="status">
          {labels.offline}
        </LumenText>
      )}
      {state?.error && (
        <LumenText as="p" role="alert">
          {labels.error(state.error)}
        </LumenText>
      )}
      {state?.unknown && (
        <LumenFrame className="hbar-chat-database-row">
          <LumenText as="p" role="status">
            {labels.unknown}
          </LumenText>
          <LumenButton
            disabled={!connected || state.writing}
            onClick={() => void actions.retryOriginal(instanceId, scope)}
          >
            {labels.retryOriginal}
          </LumenButton>
        </LumenFrame>
      )}
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.overview}>
        <div className="hbar-chat-database-row">
          <LumenText as="h3">{labels.overview}</LumenText>
          <LumenButton disabled={!connected || state?.loading} onClick={() => void actions.refresh(instanceId, scope)}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {labels.refresh}
          </LumenButton>
        </div>
        {report && (
          <div className="hbar-chat-database-total">
            <LumenText as="span">{report.totalKind === 'physical' ? labels.physical : labels.attributable}</LumenText>
            <LumenText as="strong">{labels.bytes(report.totalBytes)}</LumenText>
          </div>
        )}
        <LumenText as="p" tone="muted">
          {scope.kind === 'global' ? labels.totalHelp : labels.scopedHelp}
        </LumenText>
        {renderMetrics(false)}
        {report && scope.kind === 'global' && (
          <details>
            <summary>{labels.cacheBreakdown}</summary>
            <dl className="hbar-chat-database-metrics">
              {report.disk.cacheCategories.map((item) => (
                <div key={item.id}>
                  <dt>{labels.cacheCategories[item.id]}</dt>
                  <dd>{labels.bytes(item.bytes)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        {scope.kind !== 'global' && (
          <details>
            <summary>{labels.shared}</summary>
            {renderMetrics(true)}
          </details>
        )}
        {report?.sampledAt ? (
          <LumenText as="p" tone="muted">
            {labels.sampledAt(report.sampledAt)}
          </LumenText>
        ) : null}
        {(state?.loading || report?.status === 'scanning') && (
          <LumenText as="p" role="status">
            {labels.loading}
          </LumenText>
        )}
        {report && !report.complete && (
          <LumenText as="p" role="status">
            {labels.incomplete}
          </LumenText>
        )}
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.rules}>
        <LumenText as="h3">{labels.rules}</LumenText>
        <LumenText as="p" tone="muted">
          {labels.rulesHelp}
        </LumenText>
        {ruleForm}
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.automatic}>
        <LumenText as="h3">{labels.automatic}</LumenText>
        {state?.task && (
          <>
            <LumenText as="p">{labels.task(state.task)}</LumenText>
            <dl className="hbar-chat-database-metrics">
              <div>
                <dt>{labels.lastRun}</dt>
                <dd>{labels.date(state.task.lastRunAt)}</dd>
              </div>
              <div>
                <dt>{labels.nextRun}</dt>
                <dd>{labels.date(state.task.nextDueAt)}</dd>
              </div>
            </dl>
            {state.task.error && (
              <LumenText as="p" role="alert">
                {labels.error(state.task.error)}
              </LumenText>
            )}
          </>
        )}
        <LumenText as="p" tone="muted">
          {labels.savedRules}
        </LumenText>
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.manual}>
        <LumenText as="h3">{labels.manual}</LumenText>
        <LumenText as="p" tone="muted">
          {labels.manualHelp}
        </LumenText>
        {allowedActions.map((action) => (
          <LumenFrame as="article" aria-label={action.title} className="hbar-chat-database-action" key={action.kind}>
            <div>
              <LumenText as="h4">{action.title}</LumenText>
              <LumenText as="p" tone="muted">
                {action.help}
              </LumenText>
            </div>
            <LumenButton
              disabled={!connected || busy}
              onClick={() => void actions.preview(instanceId, scope, action.kind)}
            >
              <LumenIcon icon={Trash2} tier="sm" />
              {labels.generatePreview}
            </LumenButton>
          </LumenFrame>
        ))}
        {preview && (
          <>
            <Operation
              operation={preview}
              labels={labels}
              connected={connected}
              onCancel={() => void actions.cancel(instanceId, scope, preview.operationId)}
            />
            {reviewReady && (
              <LumenButton
                tone="warning"
                disabled={!connected || state?.writing || state?.unknown}
                onClick={() => setConfirming(preview.operationId)}
              >
                {labels.review}
              </LumenButton>
            )}
            {preview.status === 'completed' && preview.candidateCount === 0 && (
              <LumenText as="p">{labels.noCandidates}</LumenText>
            )}
          </>
        )}
        {active && (
          <Operation
            operation={active}
            labels={labels}
            connected={connected}
            onCancel={() => void actions.cancel(instanceId, scope, active.operationId)}
            onReconcile={() => void actions.reconcile(instanceId, scope, active.operationId)}
          />
        )}
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.records}>
        <LumenText as="h3">{labels.records}</LumenText>
        {state?.history.length ? (
          state.history.map((item) => (
            <Operation key={item.operationId} operation={item} labels={labels} connected={connected} />
          ))
        ) : (
          <LumenText as="p">{labels.noRecords}</LumenText>
        )}
        <div className="hbar-chat-database-row">
          <LumenButton
            disabled={!connected || state?.loading}
            onClick={() => void actions.historyPage(instanceId, scope, null)}
          >
            {labels.firstPage}
          </LumenButton>
          <LumenButton
            disabled={!connected || !state?.historyNext || state.loading}
            onClick={() => void actions.historyPage(instanceId, scope, state?.historyNext ?? null)}
          >
            {labels.nextPage}
          </LumenButton>
        </div>
      </LumenFrame>
      <LumenDialog
        open={Boolean(confirming && preview?.operationId === confirming)}
        title={labels.previewTitle}
        closeLabel={labels.close}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <LumenButton onClick={() => setConfirming(null)}>{labels.close}</LumenButton>
            <LumenButton
              tone="danger"
              disabled={!connected || !reviewReady || state?.writing || state?.unknown}
              onClick={() => {
                if (confirming) {
                  void actions.confirm(instanceId, scope, confirming)
                  setConfirming(null)
                }
              }}
            >
              {labels.confirm}
            </LumenButton>
          </>
        }
      >
        {preview && (
          <LumenFrame className="hbar-chat-database-confirm">
            <LumenText as="p">{labels.scope(scope)}</LumenText>
            <LumenText as="p">{labels.previewSummary(preview)}</LumenText>
            <LumenText as="p" tone="muted">
              {labels.expiresAt(preview.expiresAt)}
            </LumenText>
            <LumenText as="p">
              <LumenIcon icon={ShieldCheck} tier="md" />
              {labels.confirmHelp}
            </LumenText>
            <ol className="hbar-chat-database-preview-list">
              {state?.previewItems.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <LumenText as="p">{item.title}</LumenText>
                  <LumenText as="p" tone="muted">
                    {labels.bytes(item.estimatedBytes)}
                  </LumenText>
                  {item.skipReason && (
                    <LumenText as="p" tone="muted">
                      {labels.skipReason(item.skipReason)}
                    </LumenText>
                  )}
                </li>
              ))}
            </ol>
            <Skips skipped={preview.skipped} labels={labels} />
            <div className="hbar-chat-database-row">
              <LumenButton disabled={!connected} onClick={() => void actions.previewPage(instanceId, scope, null)}>
                {labels.firstPage}
              </LumenButton>
              <LumenButton
                disabled={!connected || !state?.previewNext}
                onClick={() => void actions.previewPage(instanceId, scope, state?.previewNext ?? null)}
              >
                {labels.nextPage}
              </LumenButton>
            </div>
          </LumenFrame>
        )}
      </LumenDialog>
    </LumenFrame>
  )
}

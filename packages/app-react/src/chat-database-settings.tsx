import { useEffect, useState, type ReactNode } from 'react'
import { Database, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenDialog,
  LumenDisclosure,
  LumenFrame,
  LumenIcon,
  LumenText,
} from '@lumen/app-ui'
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
    <LumenDisclosure className="hbar-chat-database-skips" summary={labels.skipped}>
      <LumenCollection as="dl">
        {skipped.map((skip) => (
          <LumenFrame key={skip.code}>
            <LumenCollectionItem as="dt">{labels.skipReason(skip.code)}</LumenCollectionItem>
            <LumenCollectionItem as="dd">{labels.count(skip.count)}</LumenCollectionItem>
          </LumenFrame>
        ))}
      </LumenCollection>
    </LumenDisclosure>
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
        <LumenContentText context="feedback.message" role={active ? 'status' : undefined}>
          {labels.operation(operation)}
        </LumenContentText>
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
      <LumenContentText context="form.description" tone="muted">
        {labels.outcome(operation)}
      </LumenContentText>
      {operation.error && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(operation.error)}
        </LumenContentText>
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
      <LumenCollection as="dl" className="hbar-chat-database-metrics">
        {metrics(shared).map((metric) => (
          <LumenFrame key={metric.id} data-database-metric={metric.id}>
            <LumenCollectionItem as="dt">{metric.label}</LumenCollectionItem>
            <LumenCollectionItem as="dd">
              {metric.kind === 'bytes' ? labels.bytes(values[metric.id]) : labels.count(values[metric.id])}
            </LumenCollectionItem>
          </LumenFrame>
        ))}
      </LumenCollection>
    )
  return (
    <LumenFrame as="section" className="hbar-chat-database-settings" aria-label={labels.title}>
      <LumenFrame as="header">
        <LumenContentText context="section.title">
          <LumenIcon icon={Database} tier="md" />
          {labels.title}
        </LumenContentText>
        <LumenContentText context="form.description" tone="muted">
          {labels.description}
        </LumenContentText>
      </LumenFrame>
      {!connected && (
        <LumenContentText context="feedback.message" role="status">
          {labels.offline}
        </LumenContentText>
      )}
      {state?.error && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(state.error)}
        </LumenContentText>
      )}
      {state?.unknown && (
        <LumenFrame className="hbar-chat-database-row">
          <LumenContentText context="feedback.message" role="status">
            {labels.unknown}
          </LumenContentText>
          <LumenButton
            disabled={!connected || state.writing}
            onClick={() => void actions.retryOriginal(instanceId, scope)}
          >
            {labels.retryOriginal}
          </LumenButton>
        </LumenFrame>
      )}
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.overview}>
        <LumenFrame className="hbar-chat-database-row">
          <LumenContentText context="section.subtitle">{labels.overview}</LumenContentText>
          <LumenButton disabled={!connected || state?.loading} onClick={() => void actions.refresh(instanceId, scope)}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
        {report && (
          <LumenFrame className="hbar-chat-database-total">
            <LumenContentText context="message.inline">
              {report.totalKind === 'physical' ? labels.physical : labels.attributable}
            </LumenContentText>
            <LumenContentText context="record.title">{labels.bytes(report.totalBytes)}</LumenContentText>
          </LumenFrame>
        )}
        <LumenContentText context="form.description" tone="muted">
          {scope.kind === 'global' ? labels.totalHelp : labels.scopedHelp}
        </LumenContentText>
        {renderMetrics(false)}
        {report && scope.kind === 'global' && (
          <LumenDisclosure summary={labels.cacheBreakdown}>
            <LumenCollection as="dl" className="hbar-chat-database-metrics">
              {report.disk.cacheCategories.map((item) => (
                <LumenFrame key={item.id}>
                  <LumenCollectionItem as="dt">{labels.cacheCategories[item.id]}</LumenCollectionItem>
                  <LumenCollectionItem as="dd">{labels.bytes(item.bytes)}</LumenCollectionItem>
                </LumenFrame>
              ))}
            </LumenCollection>
          </LumenDisclosure>
        )}
        {scope.kind !== 'global' && <LumenDisclosure summary={labels.shared}>{renderMetrics(true)}</LumenDisclosure>}
        {report?.sampledAt ? (
          <LumenContentText context="form.description" tone="muted">
            {labels.sampledAt(report.sampledAt)}
          </LumenContentText>
        ) : null}
        {(state?.loading || report?.status === 'scanning') && (
          <LumenContentText context="feedback.message" role="status">
            {labels.loading}
          </LumenContentText>
        )}
        {report && !report.complete && (
          <LumenContentText context="feedback.message" role="status">
            {labels.incomplete}
          </LumenContentText>
        )}
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.rules}>
        <LumenContentText context="section.subtitle">{labels.rules}</LumenContentText>
        <LumenContentText context="form.description" tone="muted">
          {labels.rulesHelp}
        </LumenContentText>
        {ruleForm}
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.automatic}>
        <LumenContentText context="section.subtitle">{labels.automatic}</LumenContentText>
        {state?.task && (
          <>
            <LumenContentText context="form.description">{labels.task(state.task)}</LumenContentText>
            <LumenCollection as="dl" className="hbar-chat-database-metrics">
              <LumenFrame>
                <LumenCollectionItem as="dt">{labels.lastRun}</LumenCollectionItem>
                <LumenCollectionItem as="dd">{labels.date(state.task.lastRunAt)}</LumenCollectionItem>
              </LumenFrame>
              <LumenFrame>
                <LumenCollectionItem as="dt">{labels.nextRun}</LumenCollectionItem>
                <LumenCollectionItem as="dd">{labels.date(state.task.nextDueAt)}</LumenCollectionItem>
              </LumenFrame>
            </LumenCollection>
            {state.task.error && (
              <LumenContentText context="feedback.message" role="alert">
                {labels.error(state.task.error)}
              </LumenContentText>
            )}
          </>
        )}
        <LumenContentText context="form.description" tone="muted">
          {labels.savedRules}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame as="section" className="hbar-chat-database-section" aria-label={labels.manual}>
        <LumenContentText context="section.subtitle">{labels.manual}</LumenContentText>
        <LumenContentText context="form.description" tone="muted">
          {labels.manualHelp}
        </LumenContentText>
        {allowedActions.map((action) => (
          <LumenFrame as="article" aria-label={action.title} className="hbar-chat-database-action" key={action.kind}>
            <LumenFrame>
              <LumenText as="h4">{action.title}</LumenText>
              <LumenContentText context="form.description" tone="muted">
                {action.help}
              </LumenContentText>
            </LumenFrame>
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
              <LumenContentText context="form.description">{labels.noCandidates}</LumenContentText>
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
        <LumenContentText context="section.subtitle">{labels.records}</LumenContentText>
        {state?.history.length ? (
          state.history.map((item) => (
            <Operation key={item.operationId} operation={item} labels={labels} connected={connected} />
          ))
        ) : (
          <LumenContentText context="form.description">{labels.noRecords}</LumenContentText>
        )}
        <LumenFrame className="hbar-chat-database-row">
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
        </LumenFrame>
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
            <LumenContentText context="dialog.body">{labels.scope(scope)}</LumenContentText>
            <LumenContentText context="dialog.body">{labels.previewSummary(preview)}</LumenContentText>
            <LumenContentText context="dialog.body" tone="muted">
              {labels.expiresAt(preview.expiresAt)}
            </LumenContentText>
            <LumenContentText context="dialog.body">
              <LumenIcon icon={ShieldCheck} tier="md" />
              {labels.confirmHelp}
            </LumenContentText>
            <LumenCollection as="ol" className="hbar-chat-database-preview-list">
              {state?.previewItems.map((item) => (
                <LumenCollectionItem as="li" key={`${item.kind}:${item.id}`}>
                  <LumenContentText context="dialog.body">{item.title}</LumenContentText>
                  <LumenContentText context="dialog.body" tone="muted">
                    {labels.bytes(item.estimatedBytes)}
                  </LumenContentText>
                  {item.skipReason && (
                    <LumenContentText context="dialog.body" tone="muted">
                      {labels.skipReason(item.skipReason)}
                    </LumenContentText>
                  )}
                </LumenCollectionItem>
              ))}
            </LumenCollection>
            <Skips skipped={preview.skipped} labels={labels} />
            <LumenFrame className="hbar-chat-database-row">
              <LumenButton disabled={!connected} onClick={() => void actions.previewPage(instanceId, scope, null)}>
                {labels.firstPage}
              </LumenButton>
              <LumenButton
                disabled={!connected || !state?.previewNext}
                onClick={() => void actions.previewPage(instanceId, scope, state?.previewNext ?? null)}
              >
                {labels.nextPage}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        )}
      </LumenDialog>
    </LumenFrame>
  )
}

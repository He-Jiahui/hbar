import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LumenSurface,
  LumenButton,
  LumenDialog,
  LumenFrame,
  LumenContentText,
  LumenCollection,
  LumenCollectionItem,
  LumenKanban01,
  LumenKanban04,
  LumenKanban06,
  type LumenKanbanAction,
  type LumenKanbanContent,
} from '@lumen/app-ui'
import { useHbarRuntimeState, type HbarRuntimeView } from '@hbar/app-react'
import type { RunBoardItem } from '@hbar/contracts/commands/run-board'
import type { ShellLocale } from './shell-copy'
import { runBoardCopy, type RunBoardPageLabels } from './run-board-copy'
import './run-board-page.css'

export interface RunBoardPageProps {
  readonly runtime: HbarRuntimeView
  readonly locale: ShellLocale
  readonly variant?: 1 | 4 | 6
  readonly instanceId?: string | undefined
  readonly labels?: RunBoardPageLabels | undefined
}

const statuses = [
  'queued',
  'running',
  'waiting_approval',
  'guided',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
] as const
type Status = (typeof statuses)[number]

function displayName(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback
}
function usageText(item: RunBoardItem): string | null {
  if (!item.usage) return null
  const input = item.usage.input
  const output = item.usage.output
  return `${input + output}`
}
function planText(item: RunBoardItem): string | null {
  return item.plan ? `${item.plan.plan.filter((step) => step.status !== 'completed').length}` : null
}

export type RunBoardAction = {
  readonly command: 'app.setSession' | 'operation.cancel' | 'run.retry'
  readonly input: Record<string, string>
} | null
function canCancelRun(status: Status): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_approval' || status === 'guided'
}
function canRetryRun(status: Status): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'interrupted'
}
export function resolveRunBoardAction(
  action: LumenKanbanAction,
  item: RunBoardItem | undefined,
  workspaceId: string | null,
): RunBoardAction {
  if (!item || !workspaceId || action.value !== item.run.id) return null
  if (action.actionId === 'open')
    return { command: 'app.setSession', input: { sessionId: item.run.sessionId, workspaceId } }
  if (action.actionId === 'cancel' && canCancelRun(item.run.status))
    return { command: 'operation.cancel', input: { operationId: item.run.id } }
  if (action.actionId === 'retry' && canRetryRun(item.run.status))
    return { command: 'run.retry', input: { operationId: item.run.id, sessionId: item.run.sessionId } }
  return null
}

function contentFor(items: readonly RunBoardItem[], labels: RunBoardPageLabels): LumenKanbanContent {
  const cards = items.map((item) => {
    const title = displayName(item.sessionTitle ?? item.run.sessionTitle, labels.missingSession)
    const workspace = displayName(item.workspaceName ?? item.run.workspaceName, labels.missingWorkspace)
    const canCancel = canCancelRun(item.run.status)
    const canRetry = canRetryRun(item.run.status)
    const actions = [
      ...(canCancel ? [{ id: 'cancel', runId: item.run.id, label: labels.cancelRun(title) }] : []),
      ...(canRetry ? [{ id: 'retry', runId: item.run.id, label: labels.retryRun(title) }] : []),
    ]
    return {
      id: item.run.id,
      label: title,
      tag: labels.statusLabel(item.run.status),
      assignee: workspace,
      assigneeContext: 'collection.detail' as const,
      openLabel: labels.openRun(title),
      detail: `${labels.usageLabel(usageText(item))} · ${labels.planLabel(planText(item))}`,
      blocked: item.run.status === 'failed',
      actions,
    }
  })
  const columns = statuses.map((status) => ({
    id: status,
    label: labels.columnLabel(status),
    cardIds: items.filter((item) => item.run.status === status).map((item) => item.run.id),
  }))
  return {
    labels: {
      boardTitle: labels.title,
      boardDetail: labels.boardDetail,
      board: labels.board,
      participants: labels.participants,
      add: labels.add,
      newCard: labels.newCard,
      move: labels.move,
      theme: labels.theme,
      standard: labels.standard,
      swimlaneTitle: labels.swimlaneTitle,
      swimlaneDetail: labels.swimlaneDetail,
      workstream: labels.workstream,
      regroupTitle: labels.regroupTitle,
      regroupDetail: labels.regroupDetail,
      groupBy: labels.groupBy,
      detailTitle: labels.detailTitle,
      detailDetail: labels.detailDetail,
      addCard: labels.addCard,
      properties: labels.properties,
      assignee: labels.assignee,
      priority: labels.priority,
      activity: labels.activity,
      save: labels.save,
      sprintTitle: labels.sprintTitle,
      sprintDetail: labels.sprintDetail,
      blocked: labels.blocked,
      capacity: labels.capacity,
      moved: labels.moved,
      compactTitle: labels.compactTitle,
      compactDetail: labels.compactDetail,
      column: labels.column,
      steps: labels.steps,
      nextStep: labels.nextStep,
      more: labels.more,
      empty: labels.empty,
      emptyColumn: labels.emptyColumn,
    },
    participants: [],
    columns,
    cards,
    lanes: [],
    groups: [],
    initialGroupId: '',
    assignees: [],
    priorities: [],
    metrics: [],
    compactColumns: columns,
    initialCompactColumnId: statuses[0],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 400 },
  }
}

export function RunBoardPage({ runtime, locale, variant = 1, instanceId, labels: providedLabels }: RunBoardPageProps) {
  const localizedLabels = useMemo(() => runBoardCopy(locale), [locale])
  const labels = providedLabels ?? localizedLabels
  const board = useHbarRuntimeState(runtime.state.runBoard)
  const [selection, setSelection] = useState<{ readonly workspaceId: string | null; readonly runId: string } | null>(
    null,
  )
  const [actionFailure, setActionFailure] = useState<{ readonly workspaceId: string; readonly runId: string } | null>(
    null,
  )
  const boardInstanceId = instanceId ?? runtime.instanceId
  const refresh = useCallback(() => {
    void runtime.commands.execute('runBoard.refresh', { instanceId: boardInstanceId }).catch(() => undefined)
  }, [boardInstanceId, runtime])
  const loadMore = useCallback(() => {
    void runtime.commands.execute('runBoard.loadMore', { instanceId: boardInstanceId }).catch((reason: unknown) => {
      const code =
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string' ? reason.code : ''
      if (code === 'STALE_CURSOR') refresh()
    })
  }, [boardInstanceId, refresh, runtime])
  useEffect(() => {
    refresh()
  }, [refresh])
  const items = useMemo(() => {
    const seen = new Set<string>()
    return board.items
      .filter((item) => {
        if (seen.has(item.run.id)) return false
        seen.add(item.run.id)
        return true
      })
      .slice(0, 400)
  }, [board.items])
  const onAction = useCallback(
    (action: LumenKanbanAction) => {
      const item = items.find((candidate) => candidate.run.id === action.value)
      if (action.actionId === 'open' && item) {
        setSelection({ workspaceId: board.workspaceId, runId: item.run.id })
        return
      }
      const resolved = resolveRunBoardAction(action, item, board.workspaceId)
      if (!resolved) return
      setActionFailure(null)
      const workspaceId = board.workspaceId
      if (!workspaceId || !item) return
      void runtime.commands
        .execute(resolved.command, resolved.input)
        .catch(() => setActionFailure({ workspaceId, runId: item.run.id }))
    },
    [board.workspaceId, items, runtime],
  )
  const Kanban = variant === 4 ? LumenKanban04 : variant === 6 ? LumenKanban06 : LumenKanban01
  const content = useMemo(() => contentFor(items, labels), [items, labels])
  const error = board.error ? `${labels.pageLoadError}: ${board.error}` : null
  const selectedItem =
    selection?.workspaceId === board.workspaceId ? items.find((item) => item.run.id === selection?.runId) : undefined
  const actionError =
    actionFailure?.workspaceId === board.workspaceId && items.some((item) => item.run.id === actionFailure?.runId)
      ? labels.operationFailed
      : null
  const closeDetails = useCallback(() => setSelection(null), [])
  const openConversation = useCallback(() => {
    if (!selectedItem || !board.workspaceId) return
    void runtime.commands
      .execute('app.setSession', { sessionId: selectedItem.run.sessionId, workspaceId: board.workspaceId })
      .catch(() => undefined)
  }, [board.workspaceId, runtime, selectedItem])
  const plan = selectedItem?.plan
  const planBody = plan ? (
    <LumenFrame>
      <LumenContentText context="section.description">
        {labels.planSteps(plan.plan.length, plan.revision)}
      </LumenContentText>
      <LumenCollection aria-label={labels.planSteps(plan.plan.length, plan.revision)}>
        {plan.plan.map((step, index) => (
          <LumenCollectionItem key={index}>
            <LumenContentText context="collection.detail">
              {labels.cardLabel(step.step, labels.statusLabel(step.status))}
            </LumenContentText>
          </LumenCollectionItem>
        ))}
      </LumenCollection>
    </LumenFrame>
  ) : (
    <LumenContentText context="empty.description">{labels.noPlan}</LumenContentText>
  )
  return (
    <LumenFrame className="hbar-web-run-board" aria-busy={board.status === 'loading'}>
      <LumenFrame as="header">
        <LumenContentText context="workspace.title" level={2}>
          {labels.title}
        </LumenContentText>
        <LumenContentText context="workspace.context">{labels.description}</LumenContentText>
        <LumenFrame className="hbar-run-board-reader" role="group" aria-label={labels.title} tabIndex={0}>
          <LumenButton disabled={board.status === 'loading'} onClick={refresh}>
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      {board.status === 'loading' ? (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      ) : null}
      {error ? (
        <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
          {error}
        </LumenContentText>
      ) : null}
      {actionError ? (
        <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
          {actionError}
        </LumenContentText>
      ) : null}
      {board.status === 'ready' && items.length === 0 ? (
        <LumenContentText context="empty.description">{labels.empty}</LumenContentText>
      ) : null}
      <Kanban content={content} readOnly onAction={onAction} />
      {items.length >= 400 ? (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.capacityReached(items.length)}
        </LumenContentText>
      ) : null}
      {board.nextCursor ? (
        <LumenFrame className="hbar-run-board-reader" role="group" aria-label={labels.loadMore} tabIndex={0}>
          <LumenButton onClick={loadMore} disabled={board.status === 'loading'}>
            {labels.loadMore}
          </LumenButton>
        </LumenFrame>
      ) : null}
      <LumenDialog
        open={Boolean(selectedItem)}
        title={selectedItem?.sessionTitle ?? labels.missingSession}
        closeLabel={labels.closeDetails}
        onClose={closeDetails}
        appearance="panel"
        footer={
          <LumenFrame className="hbar-run-board-reader" role="group" aria-label={labels.detailTitle} tabIndex={0}>
            <LumenButton onClick={openConversation}>
              {selectedItem
                ? labels.openRun(selectedItem.sessionTitle ?? labels.missingSession)
                : labels.openRun(labels.missingSession)}
            </LumenButton>
          </LumenFrame>
        }
      >
        {selectedItem ? (
          <>
            <LumenContentText context="feedback.paragraph">
              {labels.detailStatus(labels.statusLabel(selectedItem.run.status))}
            </LumenContentText>
            <LumenContentText context="collection.detail">
              {labels.detailWorkspace(selectedItem.workspaceName ?? labels.missingWorkspace)}
            </LumenContentText>
            <LumenContentText context="collection.title">
              {labels.detailSession(selectedItem.sessionTitle ?? labels.missingSession)}
            </LumenContentText>
            <LumenContentText context="feedback.paragraph">
              {selectedItem.usage?.cost.availability === 'available' && selectedItem.usage.cost.value !== null
                ? labels.usageCost(`${selectedItem.usage.cost.value} ${selectedItem.usage.cost.unit}`)
                : labels.usageUnavailable}
            </LumenContentText>
            <LumenSurface className="hbar-run-board-plan">{planBody}</LumenSurface>
          </>
        ) : null}
      </LumenDialog>
    </LumenFrame>
  )
}

export { contentFor as createRunBoardKanbanContent }
export type { Status }

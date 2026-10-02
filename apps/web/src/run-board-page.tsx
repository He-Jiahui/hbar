import { useCallback, useEffect, useMemo } from 'react'
import { LumenButton, LumenFrame, LumenText, LumenKanban01, LumenKanban04, LumenKanban06, type LumenKanbanContent } from '@lumen/app-ui'
import { useHbarRuntimeState, type HbarRuntimeView } from '@hbar/app-react'
import type { RunBoardItem } from '@hbar/contracts/commands/run-board'
import type { ShellLocale } from './shell-copy'
import { runBoardCopy, type RunBoardPageLabels } from './run-board-copy'

export interface RunBoardPageProps { readonly runtime: HbarRuntimeView; readonly locale: ShellLocale; readonly variant?: 1 | 4 | 6 }

const statuses = ['queued', 'running', 'waiting_approval', 'guided', 'completed', 'cancelled', 'failed', 'interrupted'] as const
type Status = typeof statuses[number]

function displayName(value: string | null | undefined, fallback: string): string { return value?.trim() || fallback }
function usageText(item: RunBoardItem): string {
  if (!item.usage) return '—'
  const input = item.usage.inputTokens ?? 0
  const output = item.usage.outputTokens ?? 0
  return `${input + output}`
}
function planText(item: RunBoardItem): string { return item.plan ? `${item.plan.plan.filter((step) => step.status !== 'completed').length}` : '—' }

function contentFor(items: readonly RunBoardItem[], labels: RunBoardPageLabels): LumenKanbanContent {
  const cards = items.map((item) => {
    const title = displayName(item.sessionTitle ?? item.run.sessionTitle, labels.missingSession)
    const workspace = displayName(item.workspaceName ?? item.run.workspaceName, labels.missingWorkspace)
    return { id: item.run.id, label: title, tag: labels.statusLabel(item.run.status), assignee: workspace, detail: `${labels.usageLabel(usageText(item))} · ${labels.planLabel(planText(item))}`, blocked: item.run.status === 'failed' }
  })
  const columns = statuses.map((status) => ({ id: status, label: labels.columnLabel(status), cardIds: items.filter((item) => item.run.status === status).map((item) => item.run.id) }))
  return {
    labels: { boardTitle: labels.title, boardDetail: labels.boardDetail, board: labels.board, participants: labels.participants, add: labels.add, newCard: labels.newCard, move: labels.move, theme: labels.theme, standard: labels.standard, swimlaneTitle: labels.swimlaneTitle, swimlaneDetail: labels.swimlaneDetail, workstream: labels.workstream, regroupTitle: labels.regroupTitle, regroupDetail: labels.regroupDetail, groupBy: labels.groupBy, detailTitle: labels.detailTitle, detailDetail: labels.detailDetail, addCard: labels.addCard, properties: labels.properties, assignee: labels.assignee, priority: labels.priority, activity: labels.activity, save: labels.save, sprintTitle: labels.sprintTitle, sprintDetail: labels.sprintDetail, blocked: labels.blocked, capacity: labels.capacity, moved: labels.moved, compactTitle: labels.compactTitle, compactDetail: labels.compactDetail, column: labels.column, steps: labels.steps, nextStep: labels.nextStep, more: labels.more, empty: labels.empty, emptyColumn: labels.emptyColumn }, participants: [], columns, cards, lanes: [], groups: [], initialGroupId: '', assignees: [], priorities: [], metrics: [], compactColumns: columns, initialCompactColumnId: statuses[0], listStrategy: { kind: 'pane-scroll', expectedMaximum: 400 },
  }
}

export function RunBoardPage({ runtime, locale, variant = 1 }: RunBoardPageProps) {
  const labels = useMemo(() => runBoardCopy(locale), [locale])
  const board = useHbarRuntimeState(runtime.state.runBoard)
  const refresh = useCallback(() => { void runtime.commands.execute('runBoard.refresh', { instanceId: runtime.instanceId }).catch(() => undefined) }, [runtime])
  useEffect(() => { refresh() }, [refresh])
  const items = useMemo(() => { const seen = new Set<string>(); return board.items.filter((item) => { if (seen.has(item.run.id)) return false; seen.add(item.run.id); return true }).slice(0, 400) }, [board.items])
  const onAction = useCallback((action: { readonly actionId: string; readonly value?: string }) => {
    const id = action.value
    if (!id) return
    const item = items.find((candidate) => candidate.run.id === id)
    if (!item || !board.workspaceId) return
    if (action.actionId === 'open') void runtime.commands.execute('app.setSession', { sessionId: item.run.sessionId, workspaceId: board.workspaceId }).catch(() => undefined)
    if (action.actionId === 'cancel') void runtime.commands.execute('operation.cancel', { operationId: item.run.id }).catch(() => undefined)
    if (action.actionId === 'retry') void runtime.commands.execute('run.retry', { operationId: item.run.id, sessionId: item.run.sessionId }).catch(() => undefined)
  }, [board.workspaceId, items, runtime])
  const Kanban = variant === 4 ? LumenKanban04 : variant === 6 ? LumenKanban06 : LumenKanban01
  const content = useMemo(() => contentFor(items, labels), [items, labels])
  const error = board.error ? `${labels.pageLoadError}: ${board.error}` : null
  return <LumenFrame className="hbar-web-run-board" aria-busy={board.status === 'loading'}>
    <header><LumenText as="h2">{labels.title}</LumenText><LumenText as="p">{labels.description}</LumenText><LumenButton onClick={refresh}>{labels.refresh}</LumenButton></header>
    {board.status === 'loading' ? <LumenText role="status">{labels.loading}</LumenText> : null}
    {error ? <LumenText tone="danger" role="alert">{error}</LumenText> : null}
    {board.status === 'ready' && items.length === 0 ? <LumenText>{labels.empty}</LumenText> : null}
    <Kanban content={content} readOnly onAction={onAction} />
    {board.nextCursor ? <LumenButton onClick={refresh}>{labels.loadMore}</LumenButton> : null}
  </LumenFrame>
}

export { contentFor as createRunBoardKanbanContent }
export type { Status }

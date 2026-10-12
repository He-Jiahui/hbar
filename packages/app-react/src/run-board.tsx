import { LumenKanban01, LumenKanban04, LumenKanban06 } from '@lumen/app-ui/kanban'
import type { LumenKanbanContent } from '@lumen/app-ui/kanban'
import './run-board.css'

export interface HbarRunBoardAction {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}

export interface HbarRunBoardRun {
  readonly id: string
  readonly sessionId: string
  readonly title: string
  readonly workspaceName: string
  readonly sessionTitle: string
  readonly statusLabel: string
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger'
  readonly detail?: string
  readonly error?: string
  readonly busy?: boolean
  readonly actions: readonly HbarRunBoardAction[]
}

export interface HbarRunBoardColumn {
  readonly id: string
  readonly label: string
  readonly runIds: readonly string[]
}

export interface HbarRunBoardLabels {
  readonly title: string
  readonly description: string
  readonly refresh: string
  readonly loading: string
  readonly empty: string
  readonly emptyColumn: string
  readonly loadMore: string
  readonly columnCount: (label: string, count: number) => string
  readonly openRun: (title: string) => string
  readonly pageSummary: (shown: number, total: number) => string
}

/**
 * Pane-owned scrolling with a bounded page. The host supplies at most
 * expectedMaximum unique runs and advances its cursor through onLoadMore.
 * Oversized input is visibly bounded; duplicate IDs use the first record.
 */
export interface HbarRunBoardProps {
  readonly labels: HbarRunBoardLabels
  readonly columns: readonly HbarRunBoardColumn[]
  readonly runs: readonly HbarRunBoardRun[]
  readonly selectedRunId: string | null
  readonly expectedMaximum: number
  readonly hasMore: boolean
  readonly loading: boolean
  readonly error?: string | null
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
  readonly onSelectRun: (runId: string, sessionId: string) => void
  readonly onRunAction: (runId: string, sessionId: string, actionId: string) => void
  /** Host-supplied, localized Kanban content built from the current Run projection. */
  readonly kanbanContent: LumenKanbanContent
  readonly kanbanVariant?: 1 | 4 | 6
}

export function HbarRunBoard({
  columns: _columns,
  runs,
  expectedMaximum,
  onSelectRun,
  onRunAction,
  kanbanContent,
  kanbanVariant = 1,
}: HbarRunBoardProps) {
  void _columns
  const maximum = Number.isFinite(expectedMaximum) ? Math.max(1, Math.floor(expectedMaximum)) : 1
  const uniqueRuns = new Map<string, HbarRunBoardRun>()
  for (const run of runs) {
    if (!uniqueRuns.has(run.id)) uniqueRuns.set(run.id, run)
  }
  void maximum
  const Kanban = kanbanVariant === 4 ? LumenKanban04 : kanbanVariant === 6 ? LumenKanban06 : LumenKanban01
  return (
    <Kanban
      content={kanbanContent}
      readOnly
      onAction={({ actionId, value }) => {
        if (actionId === 'open' && value) onSelectRun(value, uniqueRuns.get(value)?.sessionId ?? '')
        if (actionId === 'retry' && value) onRunAction(value, uniqueRuns.get(value)?.sessionId ?? '', 'retry')
        if (actionId === 'cancel' && value) onRunAction(value, uniqueRuns.get(value)?.sessionId ?? '', 'cancel')
      }}
    />
  )
}

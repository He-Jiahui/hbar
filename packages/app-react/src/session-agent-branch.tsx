import { LumenButton, LumenFrame, LumenContentText } from '@lumen/app-ui'
import type { DirectoryState, SessionAgentTreeState } from '@hbar/app-runtime'
import type { Session } from '@hbar/contracts/directory'
import type { SessionActivityExecution } from '@hbar/contracts/sidebar-directory'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import {
  SessionNavigationRow,
  type SessionNavigationRowLabels,
  type SessionNavigationRowMetadata,
} from './session-navigation-row'
import type { SessionActivityIndicatorContent } from './session-activity-indicator'
import { visibleSessionAgentRows } from './session-agent-visible-rows'
import './session-agent-branch.css'

export interface SessionAgentTreeLabels {
  readonly expand: (title: string, count: number) => string
  readonly collapse: (title: string, count: number) => string
  readonly children: (title: string) => string
  readonly count: (count: number) => string
  readonly loading: string
  readonly empty: string
  readonly noResponse: string
  readonly loadMore: string
  readonly retry: string
  readonly capacity: string
  readonly error: (code: string) => string
  readonly execution: Readonly<Record<SessionActivityExecution['state'], string>>
}
interface Props {
  readonly session: Readonly<Session>
  readonly childCount: number
  readonly connected: boolean
  readonly labels: SessionNavigationRowLabels
  readonly treeLabels: SessionAgentTreeLabels
  readonly now: number
  readonly onOpen: (session: Readonly<Session>) => void
  readonly batchSelecting: boolean
  readonly batchSelection: ReadonlyMap<string, unknown>
  readonly onToggleBatchSelection: (session: Readonly<Session>) => void
  readonly onExitBatchSelection: () => void
  readonly metadata?: SessionNavigationRowMetadata | undefined
  readonly execution?: SessionActivityIndicatorContent | undefined
}
interface Projection {
  readonly tree: SessionAgentTreeState
  readonly directory: DirectoryState
  readonly selectedId: string | null
  readonly action: (operation: 'toggle' | 'refresh' | 'loadMore', parentSessionId: string) => void
}

/** Same Session row actions and exact IDs in both project and time views; no View-owned queries. */
export function SessionAgentBranch(props: Props) {
  const runtime = useHbarRuntime()
  const tree = useHbarRuntimeState(runtime.state.sessionAgentTree)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const projection: Projection = {
    tree,
    directory,
    selectedId: presentation.page.kind === 'session' ? navigation.sessionId : null,
    action: (operation, parentSessionId) => {
      void runtime.commands.execute(`sessionAgentTree.${operation}`, { parentSessionId }).catch(() => {})
    },
  }
  return <Branch {...props} projection={projection} path={[]} />
}

function Branch({
  projection,
  path,
  responseTime,
  ...props
}: Props & {
  readonly projection: Projection
  readonly path: readonly string[]
  readonly responseTime?: { readonly at: number | null; readonly emptyLabel: string }
}) {
  const { session, treeLabels, connected } = props
  const branch = projection.tree.branches[session.id]
  const expanded = branch?.expanded ?? false
  const count = branch?.status === 'ready' ? branch.totalCount : Math.max(props.childCount, branch?.totalCount ?? 0)
  const hasChildren = count > 0 || expanded
  const nextPath = [...path, session.id]
  const rows = visibleSessionAgentRows(session, path, projection.directory, projection.tree)
  const children = expanded ? (
    <LumenFrame
      className="hbar-app-react-agent-branch-children"
      data-flat-depth={nextPath.length >= 4}
      data-sidebar-level="subagent-sessions"
      role="group"
      aria-label={treeLabels.children(session.title)}
    >
      {rows.map(({ row, child }) => (
        <Branch
          key={child.id}
          {...props}
          session={child}
          childCount={row.agentChildCount}
          metadata={undefined}
          execution={{ state: row.execution.state, label: treeLabels.execution[row.execution.state] }}
          responseTime={{ at: row.lastResponseAt, emptyLabel: treeLabels.noResponse }}
          projection={projection}
          path={nextPath}
        />
      ))}
      {branch?.status === 'loading' && (
        <LumenContentText context="feedback.detail" role="status">
          {treeLabels.loading}
        </LumenContentText>
      )}
      {branch?.status === 'ready' && rows.length === 0 && (
        <LumenContentText context="empty.description">{treeLabels.empty}</LumenContentText>
      )}
      {branch?.error && (
        <LumenFrame className="hbar-app-react-agent-branch-feedback" role="alert">
          <LumenContentText context="feedback.detail">{treeLabels.error(branch.error)}</LumenContentText>
          <LumenFrame
            className="hbar-app-react-agent-branch-actions"
            role="group"
            aria-label={treeLabels.retry}
            tabIndex={0}
          >
            <LumenButton
              size="s"
              variant="outlined"
              disabled={!connected}
              onClick={() => projection.action('refresh', session.id)}
            >
              {treeLabels.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
      {branch?.limitReached && <LumenContentText context="feedback.detail">{treeLabels.capacity}</LumenContentText>}
      {branch?.nextCursor && (
        <LumenFrame
          className="hbar-app-react-agent-branch-actions"
          role="group"
          aria-label={treeLabels.loadMore}
          tabIndex={0}
        >
          <LumenButton
            size="s"
            variant="text"
            disabled={!connected || branch.status === 'loading' || branch.limitReached}
            onClick={() => projection.action('loadMore', session.id)}
          >
            {treeLabels.loadMore}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  ) : null
  return (
    <LumenFrame
      className="hbar-app-react-agent-branch"
      data-agent-parent={session.id}
      data-sidebar-level={path.length === 0 ? 'parent-session' : 'subagent-session'}
      data-sidebar-depth={path.length + 2}
    >
      <SessionNavigationRow
        session={session}
        connected={connected}
        labels={props.labels}
        now={props.now}
        selected={projection.selectedId === session.id}
        onOpen={() => props.onOpen(session)}
        metadata={props.metadata}
        execution={props.execution}
        responseTime={responseTime}
        batchSelecting={props.batchSelecting}
        batchSelected={props.batchSelection.has(`${session.workspaceId}\u0000${session.id}`)}
        onToggleBatchSelection={() => props.onToggleBatchSelection(session)}
        onExitBatchSelection={props.onExitBatchSelection}
        treeNode={{
          nodeId: `session:${session.id}`,
          expanded: hasChildren ? expanded : undefined,
          expansionDisabled: !connected && !expanded,
          onExpandedChange: hasChildren
            ? (next) => {
                if (next !== expanded) projection.action('toggle', session.id)
              }
            : undefined,
          children,
        }}
        treeAdornment={
          count > 0 ? (
            <LumenContentText
              context="metadata"
              className="hbar-app-react-agent-branch-count"
              title={treeLabels.count(count)}
            >
              {count}
            </LumenContentText>
          ) : null
        }
      />
    </LumenFrame>
  )
}

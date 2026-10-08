import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime, type RunBoardState } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { runBoardCommands, type RunBoardItem, type RunBoardPage } from '@hbar/contracts/commands/run-board'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { LumenProvider, LumenFrame, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { RunBoardPage as Board } from '../../apps/web/src/run-board-page'
import { runBoardCopy } from '../../apps/web/src/run-board-copy'
import { runBoardContentName, runBoardContentWorkspace, runBoardContentStep } from './run-board-content-data'
import '@lumen/app-ui/styles.css'

export interface RunBoardContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly suffix: string
  readonly steps?: number
  readonly failure?: boolean
  readonly duplicate?: boolean
  readonly foreign?: boolean
  readonly oversizedPage?: boolean
  readonly longId?: boolean
  readonly longWorkspace?: boolean
  readonly stepLength?: number
}
declare global {
  interface Window {
    mountRunBoardContent(input: RunBoardContentInput): Promise<void>
    runBoardContentState(): {
      readonly calls: readonly { name: string; input: unknown }[]
      readonly board: RunBoardState
    }
    reorderRunBoardContent(remove?: boolean): Promise<unknown>
    repairRunBoardContent(): void
    loadMoreRunBoardContent(): Promise<unknown>
    refreshRunBoardContent(): Promise<unknown>
    disposeRunBoardContent?: () => void
  }
}
const workspace = { id: 'original-workspace', path: 'D:/owned-board', name: 'Original workspace', createdAt: 1 }
const session = {
  id: 'original-session',
  workspaceId: workspace.id,
  title: 'Original session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
let root: Root | undefined
window.mountRunBoardContent = async (input) => {
  window.disposeRunBoardContent?.()
  const element = document.getElementById('run-board-content-fixture')
  if (!element) throw new Error('Missing owned run board fixture')
  const calls: { name: string; input: unknown }[] = []
  let failed = input.failure ?? false
  let items: RunBoardItem[] = Array.from({ length: input.count }, (_, index) => ({
    run: {
      id: input.duplicate
        ? 'same-run'
        : input.longId
          ? `original-run-${index}-` + 'r'.repeat(140)
          : `original-run-${index}`,
      sessionId: input.foreign ? 'foreign-session' : session.id,
      workspaceName: input.longWorkspace ? runBoardContentWorkspace.padEnd(4000, '原') : runBoardContentWorkspace,
      sessionTitle: runBoardContentName(index),
      requestId: `original-request-${index}`,
      modelId: 'original-model',
      status: index % 2 === 0 ? 'running' : 'failed',
      createdAt: index + 1,
      startedAt: index + 1,
      endedAt: null,
      error: null,
    },
    workspaceName: input.longWorkspace ? runBoardContentWorkspace.padEnd(4000, '原') : runBoardContentWorkspace,
    sessionTitle: runBoardContentName(index),
    usage: null,
    plan: {
      sessionId: session.id,
      revision: 3,
      turnId: null,
      explanation: null,
      plan: Array.from({ length: input.steps ?? 1 }, (_, step) => ({
        step: input.stepLength
          ? runBoardContentStep(step).padEnd(input.stepLength, '原').slice(0, input.stepLength)
          : runBoardContentStep(step),
        status: 'pending',
      })),
      updatedAt: 2,
    },
  }))
  const owned = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'owned-board-fixture',
    directory: {
      execute(name) {
        if (name === 'session.get') return Promise.resolve(session)
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        return Promise.reject(new Error(`Unexpected directory read ${name}`))
      },
    },
    surfaces: { canRender: (id) => id === 'run-board' },
    runBoard: {
      execute(name, raw) {
        calls.push({ name, input: raw })
        if (failed) return Promise.reject(new CommandError('READ_FAILED', 'Owned board read failure'))
        const query = runBoardCommands['run.board.list'].input.parse(raw)
        const start = query.cursor ? items.findIndex((item) => item.run.id === query.cursor?.runId) + 1 : 0
        const rows = items.slice(start, start + (input.oversizedPage ? 101 : query.limit))
        const last = rows.at(-1)?.run
        const page: RunBoardPage = {
          workspaceId: workspace.id,
          sessionId: session.id,
          workspaceName: workspace.name,
          sessionTitle: session.title,
          revision: 1,
          observedAt: 1,
          items: rows,
          nextCursor:
            last && start + rows.length < items.length
              ? { revision: 1, createdAt: last.createdAt, runId: last.id }
              : null,
        }
        return Promise.resolve(page)
      },
    },
    run: {
      getReceipt: () => Promise.resolve(null),
      execute(name, raw) {
        calls.push({ name, input: raw })
        return Promise.reject(new CommandError('READ_FAILED', 'Owned original operation failure'))
      },
    },
  })
  await owned.ready
  await owned.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const panel = await owned.view.commands.execute('app.openPanel', { panelId: 'run-board' })
  const base = runBoardCopy(input.locale)
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    refresh: base.refresh + input.suffix,
    columnLabel: (status: Parameters<typeof base.columnLabel>[0]) => base.columnLabel(status) + input.suffix,
  }
  window.runBoardContentState = () => ({ calls, board: owned.view.state.runBoard.getSnapshot() })
  window.refreshRunBoardContent = () =>
    owned.view.commands.execute('runBoard.refresh', { instanceId: panel.instanceId })
  window.loadMoreRunBoardContent = () =>
    owned.view.commands.execute('runBoard.loadMore', { instanceId: panel.instanceId })
  window.repairRunBoardContent = () => {
    failed = false
  }
  window.reorderRunBoardContent = (remove = false) => {
    items = [...items].reverse().filter((item) => !remove || item.run.id !== 'original-run-0')
    return window.refreshRunBoardContent()
  }
  window.disposeRunBoardContent = () => {
    root?.unmount()
    owned.dispose()
    root = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider
      className="owned-board-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <HbarRuntimeProvider view={owned.view}>
        <LumenFrame className="owned-board-pane" role="region" aria-label={labels.title}>
          <Board runtime={owned.view} locale={input.locale} instanceId={panel.instanceId} labels={labels} />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}

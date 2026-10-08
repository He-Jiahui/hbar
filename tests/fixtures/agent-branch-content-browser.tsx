import { createRoot, type Root } from 'react-dom/client'
import { LumenProvider, LumenFrame, LumenTree, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { HbarRuntimeProvider, SessionAgentBranch } from '@hbar/app-react'
import { sessionAgentChildrenInputSchema } from '@hbar/contracts/sidebar-directory'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/lumen-workspace-shell.css'
import '../../packages/app-react/src/sidebar-time-view.css'

export interface AgentBranchContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly total: number
  readonly phase?: 'ready' | 'failed' | 'loading'
  readonly duplicate?: boolean
  readonly connected?: boolean
}
declare global {
  interface Window {
    mountAgentBranchContent(input: AgentBranchContentInput): Promise<void>
    repairAgentBranchContent(): void
    releaseAgentBranchContent(): void
    agentBranchContentTargets(): readonly string[]
    disposeAgentBranchContent?: () => void
  }
}
let root: Root | undefined
window.mountAgentBranchContent = async (input) => {
  window.disposeAgentBranchContent?.()
  const node = document.getElementById('agent-branch-content-fixture')
  if (!node) throw new Error('Missing owned agent branch fixture')
  const copy = getShellCopy(input.locale).shell
  const labels = {
    ...copy.agentTree,
    empty: copy.agentTree.empty.repeat(8),
    loading: copy.agentTree.loading.repeat(8),
    error: (code: string) => copy.agentTree.error(code).repeat(8),
    capacity: copy.agentTree.capacity.repeat(8),
    retry: copy.agentTree.retry.repeat(16),
    loadMore: copy.agentTree.loadMore.repeat(16),
  }
  const parent = {
    id: 'owned-parent',
    workspaceId: 'owned-workspace',
    title: labels.children(copy.agentTree.empty).repeat(8).slice(0, 156),
    parentId: null,
    archived: false,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
  }
  const execution = { state: 'idle' as const, activeCount: 0, queuedCount: 0 }
  const items = Array.from({ length: input.total }, (_, index) => ({
    session: {
      ...parent,
      id: `owned-child-${String(input.duplicate && index === 1 ? 0 : index).padStart(3, '0')}`,
      parentId: parent.id,
      title: `${parent.title} ${index}`,
    },
    execution,
    lastResponseAt: null,
    agentChildCount: 0,
  }))
  const targets: string[] = []
  let failed = input.phase === 'failed'
  let waiting = input.phase === 'loading'
  window.repairAgentBranchContent = () => {
    failed = false
  }
  window.releaseAgentBranchContent = () => undefined
  window.agentBranchContentTargets = () => targets
  const runtime = createAppRuntime({
    instanceId: 'owned-agent-branch',
    hostId: 'owned-test',
    surfaces: { canRender: () => true },
    directory: {
      async execute(name, value, options) {
        if (name !== 'session.agentChildren.list') throw new Error(name)
        const request = sessionAgentChildrenInputSchema.parse(value)
        targets.push(request.parentSessionId)
        if (failed) throw new CommandError('READ_FAILED', 'Owned fixture read failure')
        if (waiting)
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => options?.signal?.removeEventListener('abort', abort)
            const abort = () => {
              cleanup()
              reject(new CommandError('CANCELLED', 'Owned fixture disposal'))
            }
            window.releaseAgentBranchContent = () => {
              cleanup()
              waiting = false
              resolve()
            }
            if (options?.signal?.aborted) abort()
            else options?.signal?.addEventListener('abort', abort, { once: true })
          })
        const start = request.cursor ? items.findIndex((item) => item.session.id === request.cursor?.sessionId) + 1 : 0
        const page = items.slice(start, start + request.limit)
        const last = page.at(-1)
        return {
          parentSessionId: request.parentSessionId,
          revision: 1,
          totalCount: items.length,
          items: page,
          includedItem: null,
          nextCursor:
            start + page.length < items.length && last
              ? {
                  parentSessionId: request.parentSessionId,
                  revision: 1,
                  responseAt: 0,
                  createdAt: 1,
                  sessionId: last.session.id,
                }
              : null,
        }
      },
    },
  })
  await runtime.ready
  root = createRoot(node)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <LumenFrame
          as="main"
          style={{ padding: '1rem', minInlineSize: 0, blockSize: '100dvh', display: 'flex', flexDirection: 'column' }}
        >
          <LumenTree
            label={labels.children(parent.title)}
            style={{ flex: '1 1 auto', minBlockSize: 0, overflow: 'auto' }}
          >
            <SessionAgentBranch
              session={parent}
              childCount={input.total}
              connected={input.connected ?? true}
              labels={copy}
              treeLabels={labels}
              now={1000}
              onOpen={(session) => {
                targets.push(session.id)
              }}
              batchSelecting={false}
              batchSelection={new Map()}
              onToggleBatchSelection={() => undefined}
              onExitBatchSelection={() => undefined}
            />
          </LumenTree>
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.disposeAgentBranchContent = () => {
    root?.unmount()
    runtime.dispose()
  }
  const read = runtime.view.commands.execute('sessionAgentTree.toggle', { parentSessionId: parent.id })
  if (waiting) void read.catch(() => undefined)
  else await read
}

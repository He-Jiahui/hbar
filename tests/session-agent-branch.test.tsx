import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider, SessionAgentBranch } from '@hbar/app-react'
import { sessionAgentChildrenInputSchema, type SessionAgentChildItem } from '@hbar/contracts/sidebar-directory'
import { getShellCopy } from '../apps/web/src/shell-copy'

const parent = {
  id: 'parent',
  workspaceId: 'workspace',
  title: '很长的主 agent 标题'.repeat(8),
  parentId: null,
  archived: false,
  seq: 1,
  createdAt: 1,
  updatedAt: 1,
}
const execution = { state: 'idle' as const, activeCount: 0, queuedCount: 0 }

test('Agent branch renders localized empty, one, boundary and overflow states in normal flow with stable targets', async () => {
  for (const count of [0, 1, 128, 129]) {
    const items: SessionAgentChildItem[] = Array.from({ length: count }, (_, index) => ({
      session: {
        ...parent,
        id: `child-${String(index).padStart(3, '0')}`,
        parentId: parent.id,
        title: `子 agent ${index}`,
        updatedAt: 900,
      },
      execution,
      lastResponseAt: null,
      agentChildCount: 0,
    }))
    const runtime = createAppRuntime({
      instanceId: 'tree-view',
      hostId: 'test',
      surfaces: { canRender: () => true },
      directory: {
        async execute(name: string, input: unknown) {
          if (name !== 'session.agentChildren.list') throw new Error(name)
          const request = sessionAgentChildrenInputSchema.parse(input)
          const start = request.cursor
            ? items.findIndex((item) => item.session.id === request.cursor?.sessionId) + 1
            : 0
          const page = items.slice(start, start + request.limit)
          const last = page.at(-1)
          return {
            parentSessionId: parent.id,
            revision: 1,
            totalCount: count,
            items: page,
            includedItem: null,
            nextCursor:
              start + page.length < count && last
                ? { parentSessionId: parent.id, revision: 1, responseAt: 0, createdAt: 1, sessionId: last.session.id }
                : null,
          }
        },
      },
    })
    try {
      await runtime.ready
      await runtime.view.commands.execute('sessionAgentTree.toggle', { parentSessionId: parent.id })
      if (count >= 128) {
        await runtime.view.commands.execute('sessionAgentTree.loadMore', { parentSessionId: parent.id })
        await runtime.view.commands.execute('sessionAgentTree.loadMore', { parentSessionId: parent.id })
      }
      for (const locale of ['en-US', 'zh-CN'] as const) {
        const copy = getShellCopy(locale).shell
        const html = renderToStaticMarkup(
          <HbarRuntimeProvider view={runtime.view}>
            <SessionAgentBranch
              session={parent}
              childCount={count}
              connected
              labels={copy}
              treeLabels={copy.agentTree}
              now={1000}
              onOpen={() => {}}
              batchSelecting={false}
              batchSelection={new Map()}
              onToggleBatchSelection={() => {}}
              onExitBatchSelection={() => {}}
            />
          </HbarRuntimeProvider>,
        )
        expect(html).toContain('aria-expanded="true"')
        expect(html).toContain('data-sidebar-level="parent-session"')
        expect(html).toContain('data-sidebar-depth="2"')
        expect(html.match(/data-agent-parent=/g)).toHaveLength(Math.min(count, 128) + 1)
        if (count === 0) expect(html).toContain(copy.agentTree.empty)
        else {
          expect(html).toContain(copy.agentTree.noResponse)
          expect(html).toContain('data-agent-parent="child-000"')
          expect(html).toContain('data-sidebar-level="subagent-session"')
          expect(html).toContain('data-sidebar-level="subagent-sessions"')
          expect(html).toContain('data-sidebar-depth="3"')
          expect(html.match(/<time/g)).toHaveLength(1) // only the parent uses its ordinary update time
        }
        if (count === 129) expect(html).toContain(copy.agentTree.capacity)
        expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/)
      }
    } finally {
      runtime.dispose()
    }
  }
})

test('Deep Agent ancestry retains semantic parent groups without unbounded visual indentation', async () => {
  const ids = ['parent', ...Array.from({ length: 31 }, (_, index) => `deep-${index}`)]
  const runtime = createAppRuntime({
    instanceId: 'deep-tree',
    hostId: 'test',
    surfaces: { canRender: () => true },
    directory: {
      async execute(name: string, input: unknown) {
        if (name !== 'session.agentChildren.list') throw new Error(name)
        const request = sessionAgentChildrenInputSchema.parse(input)
        const index = ids.indexOf(request.parentSessionId)
        const id = ids[index + 1]
        return {
          parentSessionId: request.parentSessionId,
          revision: 1,
          totalCount: id ? 1 : 0,
          items: id
            ? [
                {
                  session: { ...parent, id, parentId: request.parentSessionId },
                  execution,
                  lastResponseAt: null,
                  agentChildCount: index < 30 ? 1 : 0,
                },
              ]
            : [],
          includedItem: null,
          nextCursor: null,
        }
      },
    },
  })
  try {
    await runtime.ready
    for (const id of ids.slice(0, -1))
      await runtime.view.commands.execute('sessionAgentTree.toggle', { parentSessionId: id })
    const copy = getShellCopy('zh-CN').shell
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <SessionAgentBranch
          session={parent}
          childCount={1}
          connected
          labels={copy}
          treeLabels={copy.agentTree}
          now={1000}
          onOpen={() => {}}
          batchSelecting={false}
          batchSelection={new Map()}
          onToggleBatchSelection={() => {}}
          onExitBatchSelection={() => {}}
        />
      </HbarRuntimeProvider>,
    )
    expect(html.match(/data-agent-parent=/g)).toHaveLength(32)
    expect(html).toContain('data-sidebar-level="parent-session"')
    expect(html).toContain('data-sidebar-level="subagent-session"')
    expect(html.match(/class="hbar-app-react-agent-branch-children"[^>]*data-flat-depth="false"/g)).toHaveLength(3)
    expect(html.match(/class="hbar-app-react-agent-branch-children"[^>]*data-flat-depth="true"/g)).toHaveLength(28)
    expect(html).toContain('data-agent-parent="deep-30"')
  } finally {
    runtime.dispose()
  }
})

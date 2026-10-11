import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider, HbarSessionBranchTargetControl } from '@hbar/app-react'
import { sessionBranchTargetCopy } from '../apps/web/src/session-branch-target-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`plain-directory capability removes a stale branch trigger and preserves a later Git recovery: ${locale}`, async () => {
    const workspace = { id: 'workspace-a', path: 'D:/fixture-only', name: 'Fixture', createdAt: 1 }
    const session = {
      id: 'session-a',
      workspaceId: workspace.id,
      title: 'Branch fixture',
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      seq: 0,
    }
    let plain = false
    const runtime = createAppRuntime({
      instanceId: 'plain-branch-react-fixture',
      hostId: 'fixture',
      directory: {
        async execute(name) {
          if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
          if (name === 'workspace.get') return workspace
          if (name === 'session.list') return { items: [session], nextCursor: null }
          if (name === 'session.get') return session
          throw new Error('Unexpected directory query')
        },
      },
      sessionBranchTargets: {
        async execute(name) {
          if (name !== 'sessionBranchTarget.list') throw new Error('Unexpected branch mutation')
          return {
            sessionId: session.id,
            workspaceId: workspace.id,
            revision: 0,
            ...(plain ? { repository: 'plain' } : {}),
            execution: { path: workspace.path, kind: plain ? 'directory' : 'checkout', branch: plain ? null : 'main' },
            base: null,
            branches: [],
            nextCursor: null,
            incomplete: false,
            pending: null,
          }
        },
      },
    })
    const render = () =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionBranchTargetControl
            sessionId={session.id}
            workspaceId={workspace.id}
            connected
            busy={false}
            branch="previous-branch"
            labels={sessionBranchTargetCopy(locale)}
            branchLabel={sessionContextCopy(locale).branch}
          />
        </HbarRuntimeProvider>,
      )
    const refresh = () =>
      runtime.view.commands.execute('sessionBranchTargetPicker.refresh', {
        sessionId: session.id,
        workspaceId: workspace.id,
      })
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
      await refresh()
      const git = render()
      expect(git).toContain('hbar-session-branch-trigger')
      expect(git).toContain(sessionContextCopy(locale).branch('main'))
      plain = true
      await refresh()
      expect(render()).toBe('')
      expect(runtime.view.state.sessionBranchTargetPicker.getSnapshot().entries[session.id]?.error).toBeNull()
      plain = false
      await refresh()
      expect(render()).toContain('hbar-session-branch-trigger')
    } finally {
      runtime.dispose()
    }
  })
}

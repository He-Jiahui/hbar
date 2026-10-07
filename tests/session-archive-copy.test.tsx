import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { CommandError } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { SessionArchiveFeedback, SessionArchiveRecovery } from '../packages/app-react/src/session-archive'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const error of ['CAPACITY_EXCEEDED', 'BUSY', 'CONNECTION_CLOSED'] as const) {
    test(`archive feedback distinguishes client capacity from an active Host Run: ${locale}/${error}`, async () => {
      const workspace = { id: 'workspace', name: 'Original workspace', path: 'D:/fixture', createdAt: 1 }
      const session = {
        id: 'session',
        workspaceId: workspace.id,
        title: 'Original target',
        archived: false,
        parentId: null,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
      }
      const runtime = createAppRuntime({
        instanceId: `archive-feedback-${locale}-${error}`,
        hostId: 'fixture',
        directory: {
          execute(name, raw) {
            if (name === 'workspace.get') {
              const input = directoryCommands['workspace.get'].input.parse(raw)
              return Promise.resolve(input.workspaceId === workspace.id ? workspace : null)
            }
            if (name === 'session.get') {
              const input = directoryCommands['session.get'].input.parse(raw)
              return Promise.resolve(input.sessionId === session.id ? session : null)
            }
            throw new Error(`Unexpected fixture query: ${name}`)
          },
        },
        // This test injects typed refusal feedback; the actual bounded floor is covered by archive-runtime tests.
        workspaces: { execute: () => Promise.reject(new CommandError(error, 'Fixture refusal')) },
      })
      try {
        await runtime.ready
        await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
        await runtime.view.commands.execute('sessionArchive.begin', {
          workspaceId: workspace.id,
          sessionId: session.id,
        })
        const revision = runtime.view.state.sessionArchive.getSnapshot().mutation.revision
        await expect(
          runtime.view.commands.execute('sessionArchive.confirm', { sessionId: session.id, revision }),
        ).rejects.toMatchObject({ code: error })
        expect(runtime.view.state.sessionArchive.getSnapshot().mutation).toMatchObject({
          status: error === 'CONNECTION_CLOSED' ? 'unknown' : 'failed',
          error,
          target: { sessionId: session.id, title: session.title },
        })
        const copy = getShellCopy(locale).shell.archive
        const markup = renderToStaticMarkup(
          <HbarRuntimeProvider view={runtime.view}>
            <SessionArchiveFeedback labels={copy} connected />
          </HbarRuntimeProvider>,
        )
        expect(markup).toContain('role="alert"')
        expect(markup).toContain(copy.confirmTitle(session.title))
        const feedback = error === 'CONNECTION_CLOSED' ? copy.unknown : copy.error(error)
        expect(markup).toContain(feedback)
        if (error === 'CONNECTION_CLOSED') {
          expect(markup).toContain(copy.reconcile)
          expect(markup).not.toContain(`>${copy.cancel}</`)
        } else {
          expect(markup).not.toContain(copy.error(error === 'BUSY' ? 'CAPACITY_EXCEEDED' : 'BUSY'))
          expect(markup).toContain(copy.cancel)
          expect(markup).not.toContain(copy.reconcile)
        }
        expect(copy.error('CAPACITY_EXCEEDED')).not.toContain('CAPACITY_EXCEEDED')
        expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(session.id)
        const recovery = (inlineSessionIds: ReadonlySet<string>) =>
          renderToStaticMarkup(
            <HbarRuntimeProvider view={runtime.view}>
              <SessionArchiveRecovery labels={copy} connected inlineSessionIds={inlineSessionIds} />
            </HbarRuntimeProvider>,
          )
        // A cached unarchived fact does not prove the current roster renders its row.
        expect(recovery(new Set())).toContain(copy.confirmTitle(session.title))
        expect(recovery(new Set())).toContain(feedback)
        expect(recovery(new Set([session.id]))).toBe('')
      } finally {
        runtime.dispose()
      }
    })
  }
}

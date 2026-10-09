import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { HbarDeletedSessionWorkspace } from '../packages/app-react/src/deleted-session-workspace'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const count of [0, 1, 12])
  test(`deleted Chinese conversation keeps ${count} authored attachments and a long localized empty state`, async () => {
    const runtime = createAppRuntime({
      instanceId: 'deleted-view',
      hostId: 'host',
      directory: { execute: () => Promise.reject(new Error('Deleted View must not read Host history')) },
    })
    try {
      await runtime.view.commands.execute('draft.setText', { sessionId: 'deleted', text: '原来的未发送草稿' })
      const attachments = Array.from({ length: count }, (_, index) => ({
        kind: 'file' as const,
        artifact: {
          id: index.toString(16).padStart(64, '0'),
          name: `原来的附件-${index}.txt`,
          mime: 'text/plain',
          size: 10,
        },
      }))
      await runtime.view.commands.execute('draft.setAttachments', {
        sessionId: 'deleted',
        attachments,
        expectedRevision: 1,
      })
      const base = getShellCopy('zh-CN').session
      const long = base.error('SESSION_DELETED').repeat(5)
      const labels = { ...base, error: (code: string) => (code === 'SESSION_DELETED' ? long : base.error(code)) }
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarDeletedSessionWorkspace
            sessionId="deleted"
            sessionTitle="已清理的聊天"
            workspaceName="原来的项目"
            sessionWorkspaceId="workspace"
            labels={labels}
            connected
          />
        </HbarRuntimeProvider>,
      )
      expect(html).toContain(long)
      expect(html).toContain('原来的未发送草稿')
      expect(html.match(/class="[^"]*\blumen-attachment-chip\b[^"]*"/g) ?? []).toHaveLength(count)
      expect(html).not.toContain('role="alert"')
      expect(html).not.toContain(base.retryTimeline)
      expect(html).not.toContain(base.emptyHero.description)
      const before = runtime.view.state.drafts.getSnapshot().deleted
      await expect(
        runtime.view.commands.execute('draft.setAttachments', {
          sessionId: 'deleted',
          attachments: [
            ...attachments,
            ...Array.from({ length: 13 - count }, (_, index) => ({
              kind: 'file' as const,
              artifact: {
                id: (index + count + 1).toString(16).padStart(64, '0'),
                name: `extra-${index}.txt`,
                mime: 'text/plain',
                size: 10,
              },
            })),
          ],
          expectedRevision: before?.revision ?? 0,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect(runtime.view.state.drafts.getSnapshot().deleted).toBe(before)
    } finally {
      runtime.dispose()
    }
  })

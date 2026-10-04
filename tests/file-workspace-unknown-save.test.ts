import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { createFileCommands } from '@hbar/kernel'
import { LocalExecution } from '@hbar/local-tools'
import { Storage } from '@hbar/storage'

for (const failure of ['post-write-invalidation', 'connection-closed', 'untyped-transport', 'rpc-error'] as const) {
  test(`accepted file write remains unknown after ${failure} and never permits replay`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-file-write-unknown-'))
    const storage = new Storage(join(root, 'data.sqlite'))
    const execution = new LocalExecution()
    const host = createFileCommands(storage, execution)
    let writes = 0
    const runtime = createAppRuntime({
      instanceId: 'file-save-unknown-test',
      hostId: 'isolated-test-host',
      directory: { execute: () => Promise.reject(new Error('unused')) },
      surfaces: { canRender: (id) => id === 'files' },
      files: {
        async execute(name, input, options) {
          if (name === 'file.write') writes += 1
          const result = await host.dispatch(
            {
              protocol: COMMAND_PROTOCOL_VERSION,
              requestId: options?.requestId ?? crypto.randomUUID(),
              commandId: name,
              commandVersion: options?.version ?? 1,
              input,
            },
            'test-device',
          )
          if (name === 'file.write') {
            if (failure === 'connection-closed') throw new CommandError('CONNECTION_CLOSED', 'Response lost')
            if (failure === 'untyped-transport') throw new Error('Transport failed after the Host wrote')
            if (failure === 'rpc-error') throw new CommandError('RPC_ERROR', 'Response could not be decoded')
          }
          return result
        },
      },
    })
    try {
      await storage.call('ready')
      const workspace = await storage.call('createWorkspace', root, 'Isolated file save')
      await writeFile(join(root, 'source.txt'), 'original source')
      const commands = runtime.view.commands
      await commands.execute('app.openPanel', { panelId: 'files', workspaceId: workspace.id })
      await commands.execute('fileWorkspace.refresh', { instanceId: 'files' })
      await commands.execute('fileWorkspace.openEntry', { instanceId: 'files', path: 'source.txt', directory: false })
      const original = runtime.view.state.files.getSnapshot().entries.files!.document!
      await commands.execute('fileWorkspace.setText', { instanceId: 'files', text: 'accepted new source' })
      if (failure === 'post-write-invalidation') {
        // Real LocalExecution first atomically replaces the target, then invalidates
        // its index. A failure at this seam is not proof the write was rejected.
        execution.workspaceQuery.invalidate = () => Promise.reject(new Error('Index invalidation failed'))
      }
      await expect(commands.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
        code:
          failure === 'connection-closed'
            ? 'CONNECTION_CLOSED'
            : failure === 'rpc-error'
              ? 'RPC_ERROR'
              : 'EXECUTION_FAILED',
      })
      expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('accepted new source')
      await commands.execute('fileWorkspace.showBrowser', { instanceId: 'files' })
      await commands.execute('fileWorkspace.openEntry', { instanceId: 'files', path: 'source.txt', directory: false })
      const document = runtime.view.state.files.getSnapshot().entries.files!.document!
      expect(document).toMatchObject({
        status: 'unknown',
        baseline: 'original source',
        sha256: original.sha256,
        pendingText: 'accepted new source',
        draft: 'accepted new source',
      })
      await expect(commands.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
        code: 'BUSY',
      })
      await expect(
        commands.execute('fileWorkspace.discardAndReload', {
          instanceId: 'files',
          workspaceId: workspace.id,
          path: 'source.txt',
          expectedDraft: document.draft,
          expectedSha256: document.sha256,
        }),
      ).rejects.toMatchObject({ code: 'BUSY' })
      expect(writes).toBe(1)
      await commands.execute('fileWorkspace.reconcile', { instanceId: 'files' })
      expect(runtime.view.state.files.getSnapshot().entries.files!.document).toMatchObject({
        status: 'succeeded',
        baseline: 'accepted new source',
        pendingText: null,
      })
      expect(writes).toBe(1)
    } finally {
      runtime.dispose()
      host.dispose()
      execution.dispose()
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  })
}

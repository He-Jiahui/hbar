import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { createHash } from 'node:crypto'

test('real file preview ACK is request-bound and abort removes only the unconsumed original reveal', async () => {
  const gate = Promise.withResolvers<void>()
  const text = 'one\ntwo\nthree'
  const runtime = createAppRuntime({
    instanceId: 'reveal-runtime',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      async execute(name) {
        if (name === 'file.list') return { items: [] }
        if (name !== 'file.read') throw new Error(`Unexpected write or command: ${name}`)
        await gate.promise
        return {
          workspaceId: 'w',
          path: 'a.ts',
          text,
          size: text.length,
          sha256: createHash('sha256').update(text).digest('hex'),
        }
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.openPanel', { panelId: 'files', workspaceId: 'w' })
    await runtime.view.commands.execute('fileWorkspace.refresh', { instanceId: 'files' })
    const firstController = new AbortController()
    const first = runtime.view.commands
      .execute(
        'fileWorkspace.openEntry',
        { instanceId: 'files', path: 'a.ts', directory: false, reveal: { line: 2 } },
        { signal: firstController.signal },
      )
      .catch((reason: unknown) => reason)
    const preview = () => runtime.view.state.files.getSnapshot().entries.files?.previews[0]
    const original = preview()
    if (original?.kind !== 'document' || !original.reveal) throw new Error('First reveal was not published')
    const firstRequest = original.reveal.requestId
    firstController.abort()
    expect(preview()).not.toHaveProperty('reveal')
    const second = runtime.view.commands.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      path: 'a.ts',
      directory: false,
      reveal: { line: 3, column: 2 },
    })
    const latest = preview()
    if (latest?.kind !== 'document' || !latest.reveal) throw new Error('New reveal was not published')
    expect(latest.id).toBe(original.id)
    expect(latest.reveal.requestId).not.toBe(firstRequest)
    await runtime.view.commands.execute('fileWorkspace.consumeReveal', {
      instanceId: 'files',
      workspaceId: 'w',
      previewId: latest.id,
      requestId: firstRequest,
    })
    expect(preview()).toMatchObject({ reveal: { requestId: latest.reveal.requestId, line: 3, column: 2 } })
    gate.resolve()
    await first
    await second
    await runtime.view.commands.execute('fileWorkspace.consumeReveal', {
      instanceId: 'files',
      workspaceId: 'w',
      previewId: latest.id,
      requestId: latest.reveal.requestId,
    })
    expect(preview()).not.toHaveProperty('reveal')
    expect(runtime.view.state.files.getSnapshot().entries.files?.document?.draft).toBe(text)
  } finally {
    gate.resolve()
    runtime.dispose()
  }
})

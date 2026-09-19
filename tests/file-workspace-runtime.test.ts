import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

test('file workspace binds a panel target, pages entries, preserves concurrent edits, and reconciles saves', async () => {
  const files = new Map([
    ['docs/readme.md', 'before'],
    ['root.txt', 'root'],
  ])
  const writeGate = Promise.withResolvers<void>()
  let delayWrite = true
  const filePort: CommandExecutor = {
    async execute(name, raw) {
      const input = raw as { path: string; after?: string; text?: string; expectedSha256?: string | null }
      if (name === 'file.list') {
        const items =
          input.path === '.'
            ? [
                { name: 'docs', path: 'docs', directory: true },
                { name: 'root.txt', path: 'root.txt', directory: false },
              ]
            : [{ name: 'readme.md', path: 'docs/readme.md', directory: false }]
        const filtered = input.after ? items.filter((item) => item.path > input.after!) : items
        return { items: filtered.slice(0, 200) }
      }
      if (name === 'file.read') {
        const text = files.get(input.path)
        if (text === undefined) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' })
        return { workspaceId: 'w1', path: input.path, text, size: text.length, sha256: sha(text) }
      }
      if (name === 'file.write') {
        const before = files.get(input.path)
        if (sha(before ?? '') !== input.expectedSha256)
          throw Object.assign(new Error('conflict'), { code: 'FILE_CONFLICT' })
        if (delayWrite) await writeGate.promise
        files.set(input.path, input.text!)
        return {
          workspaceId: 'w1',
          path: input.path,
          created: false,
          beforeSha256: input.expectedSha256,
          afterSha256: sha(input.text!),
          size: input.text!.length,
        }
      }
      throw new Error(`unexpected ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'files-runtime',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    files: filePort,
    surfaces: { canRender: (id) => id === 'files' },
  })
  try {
    await runtime.view.commands.execute('app.openPanel', { panelId: 'files', workspaceId: 'w1' })
    await runtime.view.commands.execute('fileWorkspace.refresh', { instanceId: 'files' })
    expect(runtime.view.state.files.getSnapshot().entries.files).toMatchObject({
      workspaceId: 'w1',
      path: '.',
      status: 'ready',
      items: [
        { path: 'docs', directory: true },
        { path: 'root.txt', directory: false },
      ],
    })
    await runtime.view.commands.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      path: 'docs',
      directory: true,
    })
    await runtime.view.commands.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      path: 'docs/readme.md',
      directory: false,
    })
    await runtime.view.commands.execute('fileWorkspace.setText', { instanceId: 'files', text: 'submitted' })
    const saving = runtime.view.commands.execute('fileWorkspace.save', { instanceId: 'files' })
    await Bun.sleep(0)
    await runtime.view.commands.execute('fileWorkspace.setText', { instanceId: 'files', text: 'newer edit' })
    writeGate.resolve()
    await saving
    const document = runtime.view.state.files.getSnapshot().entries.files?.document
    expect(document).toMatchObject({
      baseline: 'submitted',
      draft: 'newer edit',
      status: 'succeeded',
      pendingText: null,
    })
    expect(files.get('docs/readme.md')).toBe('submitted')

    delayWrite = false
    files.set('docs/readme.md', 'external')
    await expect(runtime.view.commands.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
      code: 'FILE_CONFLICT',
    })
    expect(runtime.view.state.files.getSnapshot().entries.files?.document).toMatchObject({
      draft: 'newer edit',
      status: 'failed',
      error: 'FILE_CONFLICT',
    })
  } finally {
    runtime.dispose()
  }
})

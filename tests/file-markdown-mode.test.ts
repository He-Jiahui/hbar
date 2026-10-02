import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { fileCommands } from '@hbar/contracts/commands/files'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

function fixture() {
  const text = '# Read me\n\n- first\n- second\n'
  let writeUnknown = false
  const reads: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'markdown-mode',
    hostId: 'fixture',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      async execute(name, raw) {
        if (name === 'file.list') return { items: [{ name: 'README.md', path: 'README.md', directory: false }] }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          reads.push(input.path)
          return {
            workspaceId: input.workspaceId,
            path: input.path,
            text,
            size: text.length,
            sha256: sha(text),
          }
        }
        if (name === 'file.write') {
          const input = fileCommands['file.write'].input.parse(raw)
          if (writeUnknown) throw new CommandError('RESULT_UNKNOWN', 'Lost write response')
          return {
            workspaceId: input.workspaceId,
            path: input.path,
            created: false,
            beforeSha256: input.expectedSha256,
            afterSha256: sha(input.text),
            size: input.text.length,
          }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  const execute = runtime.view.commands.execute
  const open = (reveal?: { line: number; column?: number }) =>
    execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'workspace',
      path: 'README.md',
      directory: false,
      ...(reveal ? { reveal } : {}),
    })
  const entry = () => {
    const current = runtime.view.state.files.getSnapshot().entries.files
    if (!current) throw new Error('Expected the Files entry created through the public command')
    return current
  }
  return { runtime, execute, open, reads, entry, setWriteUnknown: (value: boolean) => (writeUnknown = value) }
}

test('markdown source mode keeps the preview identity and draft while line reveals select source', async () => {
  const f = fixture()
  try {
    await f.execute('app.openPanel', { instanceId: 'files', panelId: 'files', workspaceId: 'workspace' })
    await f.execute('fileWorkspace.refresh', { instanceId: 'files' })
    await f.open()
    const before = f.entry()
    const previewId = before.activePreviewId
    expect(previewId).not.toBeNull()
    if (!previewId) throw new Error('Expected an active document preview')
    expect(before.documentMode).toBe('preview')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: '# local draft' })
    await f.execute('fileWorkspace.setDocumentMode', {
      instanceId: 'files',
      workspaceId: 'workspace',
      previewId,
      path: 'README.md',
      mode: 'source',
    })
    const source = f.entry()
    expect(source).toMatchObject({
      activePreviewId: previewId,
      documentMode: 'source',
      document: { draft: '# local draft', baseline: '# Read me\n\n- first\n- second\n', status: 'ready' },
    })
    await f.open({ line: 3, column: 2 })
    const revealed = f.entry()
    expect(revealed.activePreviewId).toBe(previewId)
    expect(revealed.documentMode).toBe('source')
    expect(revealed.document?.draft).toBe('# local draft')
    expect(revealed.previews[0]?.kind).toBe('document')
    expect(revealed.previews[0]?.id).toBe(previewId)
    expect(revealed.previews[0]?.kind === 'document' ? revealed.previews[0].reveal : undefined).toMatchObject({
      line: 3,
      column: 2,
    })
    expect(f.reads).toEqual(['README.md'])
  } finally {
    f.runtime.dispose()
  }
})

test('a source reveal does not take focus from an explicit edit mode or alter unknown save state', async () => {
  const f = fixture()
  try {
    await f.execute('app.openPanel', { instanceId: 'files', panelId: 'files', workspaceId: 'workspace' })
    await f.execute('fileWorkspace.refresh', { instanceId: 'files' })
    await f.open()
    const previewId = f.entry().activePreviewId
    if (!previewId) throw new Error('Expected an active document preview')
    await f.execute('fileWorkspace.setDocumentMode', {
      instanceId: 'files',
      workspaceId: 'workspace',
      previewId,
      path: 'README.md',
      mode: 'edit',
    })
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: '# pending write' })
    f.setWriteUnknown(true)
    await expect(f.execute('fileWorkspace.save', { instanceId: 'files', previewId })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await f.open({ line: 2 })
    const current = f.entry()
    expect(current).toMatchObject({
      activePreviewId: previewId,
      documentMode: 'edit',
      document: { draft: '# pending write', status: 'unknown', pendingText: '# pending write' },
    })
    expect(current.previews[0]?.id).toBe(previewId)
  } finally {
    f.runtime.dispose()
  }
})

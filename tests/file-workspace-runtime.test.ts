import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import { CommandError } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import { MAX_CACHED_FILE_DOCUMENTS } from '../packages/app-runtime/src/file-workspace-documents'

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
      view: 'browser',
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
    expect(runtime.view.state.files.getSnapshot().entries.files?.view).toBe('document')
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
    const browser = await runtime.view.commands.execute('fileWorkspace.showBrowser', { instanceId: 'files' })
    expect(browser).toMatchObject({ view: 'browser', selectedPath: null, dirty: false })
    // Back hides the active projection, not the unsaved canonical document or its preview reference.
    const retained = runtime.view.state.files
      .getSnapshot()
      .entries.files?.previews.find((preview) => preview.kind === 'document' && preview.document.draft === 'newer edit')
    expect(retained).toMatchObject({
      kind: 'document',
      document: { draft: 'newer edit', status: 'failed', error: 'FILE_CONFLICT' },
    })
    expect(runtime.view.state.files.getSnapshot().entries.files).toMatchObject({
      view: 'browser',
      document: null,
      previews: [
        { kind: 'document', document: { path: 'docs/readme.md', draft: 'newer edit', error: 'FILE_CONFLICT' } },
      ],
    })
  } finally {
    runtime.dispose()
  }
})

function draftFixture() {
  const contents = new Map<string, string>()
  const reads: string[] = []
  const writes: { key: string; requestId: string | undefined; text: string; before: string | null }[] = []
  let writeFailure: 'FILE_CONFLICT' | 'RESULT_UNKNOWN' | null = null
  let acceptUnknown = false
  let writeGate: Promise<void> | null = null
  let readGate: Promise<void> | null = null
  let readFailure = false
  const runtime = createAppRuntime({
    instanceId: 'draft-cache-runtime',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      async execute(name, raw, options) {
        if (name === 'file.list')
          return { items: ['one.txt', 'two.txt'].map((path) => ({ name: path, path, directory: false })) }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          const key = `${input.workspaceId}:${input.path}`
          reads.push(key)
          if (readGate) await readGate
          if (readFailure) throw new CommandError('DISCONNECTED', 'Read failed')
          const text = contents.get(key) ?? `saved ${key}`
          return { ...input, text, size: text.length, sha256: sha(text) }
        }
        if (name === 'file.write') {
          const input = fileCommands['file.write'].input.parse(raw)
          const key = `${input.workspaceId}:${input.path}`
          writes.push({ key, requestId: options?.requestId, text: input.text, before: input.expectedSha256 })
          if (writeGate) await writeGate
          if (writeFailure === 'FILE_CONFLICT') throw new CommandError('FILE_CONFLICT', 'External change')
          if (!writeFailure || acceptUnknown) contents.set(key, input.text)
          if (writeFailure) throw new CommandError(writeFailure, 'Lost write result')
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
  const state = () => runtime.view.state.files.getSnapshot()
  const openFile = (instanceId: string, path: string) =>
    execute('fileWorkspace.openEntry', { instanceId, path, directory: false })
  const bind = async (instanceId: string, workspaceId: string) => {
    await execute('app.openPanel', { instanceId, panelId: 'files', workspaceId, binding: 'pinned' })
    await execute('fileWorkspace.refresh', { instanceId })
  }
  const discard = (instanceId: string) => {
    const entry = state().entries[instanceId]!
    const document = entry.document!
    return execute('fileWorkspace.discardAndReload', {
      instanceId,
      workspaceId: entry.workspaceId,
      path: document.path,
      expectedDraft: document.draft,
      expectedSha256: document.sha256,
    })
  }
  return {
    runtime,
    execute,
    state,
    bind,
    openFile,
    discard,
    contents,
    reads,
    writes,
    failWrite(value: typeof writeFailure, accepted = false) {
      writeFailure = value
      acceptUnknown = accepted
    },
    failRead(value: boolean) {
      readFailure = value
    },
    gateWrite(value: Promise<void> | null) {
      writeGate = value
    },
    gateRead(value: Promise<void> | null) {
      readGate = value
    },
  }
}

test('file drafts survive back, same-file reopen, another file, pane close, and workspace target changes', async () => {
  const f = draftFixture()
  try {
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'draft A one' })
    await f.execute('fileWorkspace.showBrowser', { instanceId: 'files' })
    await f.openFile('files', './one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('draft A one')
    expect(f.reads).toEqual(['a:one.txt'])
    await f.openFile('files', 'two.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'draft A two' })
    await f.openFile('files', 'one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('draft A one')
    await f.execute('app.closePanel', { instanceId: 'files' })
    await f.bind('files', 'a')
    await f.openFile('files', 'two.txt')
    expect(f.state().entries.files?.document?.draft).toBe('draft A two')
    await f.bind('files', 'b')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'draft B one' })
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('draft A one')
    await f.bind('files', 'b')
    await f.openFile('files', 'one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('draft B one')
    expect(f.writes).toHaveLength(0)
  } finally {
    f.runtime.dispose()
  }
})

test('multiple panes share one document, guard duplicate saves, and preserve edits made during acceptance', async () => {
  const f = draftFixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.bind('left', 'a')
    await f.openFile('left', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'left', text: 'submitted' })
    await f.bind('right', 'a')
    await f.openFile('right', 'one.txt')
    expect(f.state().entries.left?.document).toBe(f.state().entries.right?.document)
    f.gateWrite(gate.promise)
    const saving = f.execute('fileWorkspace.save', { instanceId: 'left' })
    await expect(f.execute('fileWorkspace.save', { instanceId: 'right' })).rejects.toMatchObject({ code: 'BUSY' })
    await f.execute('fileWorkspace.setText', { instanceId: 'right', text: 'newer' })
    gate.resolve()
    await saving
    expect(f.state().entries.left?.document).toBe(f.state().entries.right?.document)
    expect(f.state().entries.left?.document).toMatchObject({ baseline: 'submitted', draft: 'newer', pendingText: null })
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('a save settling after switching documents or workspace cannot overwrite the new target', async () => {
  const f = draftFixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'saved A one' })
    f.gateWrite(gate.promise)
    const saving = f.execute('fileWorkspace.save', { instanceId: 'files' })
    await f.bind('files', 'b')
    await f.openFile('files', 'two.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'keep B two' })
    gate.resolve()
    await saving
    expect(f.state().entries.files).toMatchObject({
      workspaceId: 'b',
      document: { path: 'two.txt', draft: 'keep B two' },
    })
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('saved A one')
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('unknown saves retain original baseline and pending content across navigation and cannot be replayed or discarded', async () => {
  const f = draftFixture()
  try {
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    const original = f.state().entries.files?.document
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'pending bytes' })
    f.failWrite('RESULT_UNKNOWN')
    await expect(f.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await f.openFile('files', 'two.txt')
    await f.execute('app.closePanel', { instanceId: 'files' })
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.reconcile', { instanceId: 'files' })
    expect(f.state().entries.files?.document).toMatchObject({
      status: 'unknown',
      baseline: original?.baseline,
      sha256: original?.sha256,
      draft: 'pending bytes',
      pendingText: 'pending bytes',
    })
    await expect(f.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({ code: 'BUSY' })
    await expect(f.discard('files')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]?.requestId).toBeString()
    f.contents.set('a:one.txt', 'pending bytes')
    await f.execute('fileWorkspace.reconcile', { instanceId: 'files' })
    expect(f.state().entries.files?.document).toMatchObject({
      status: 'succeeded',
      baseline: 'pending bytes',
      pendingText: null,
    })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.runtime.dispose()
  }
})

test('confirmed write rejection keeps the draft; explicit discard is target- and draft-checked and only reads', async () => {
  const f = draftFixture()
  try {
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'my draft' })
    f.failWrite('FILE_CONFLICT')
    await expect(f.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
      code: 'FILE_CONFLICT',
    })
    await f.openFile('files', 'two.txt')
    await f.openFile('files', 'one.txt')
    expect(f.state().entries.files?.document).toMatchObject({ status: 'failed', draft: 'my draft' })
    const old = f.state().entries.files!.document!
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'newer draft' })
    await expect(
      f.execute('fileWorkspace.discardAndReload', {
        instanceId: 'files',
        workspaceId: 'a',
        path: 'one.txt',
        expectedDraft: old.draft,
        expectedSha256: old.sha256,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(
      f.execute('fileWorkspace.discardAndReload', {
        instanceId: 'files',
        workspaceId: 'b',
        path: 'one.txt',
        expectedDraft: 'newer draft',
        expectedSha256: old.sha256,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    f.contents.set('a:one.txt', 'external current')
    await f.discard('files')
    expect(f.state().entries.files?.document).toMatchObject({
      baseline: 'external current',
      draft: 'external current',
      error: null,
    })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.runtime.dispose()
  }
})

test('failed discard reload preserves the draft and delayed reads never navigate back to an old file', async () => {
  const f = draftFixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'keep if read fails' })
    f.failRead(true)
    await expect(f.discard('files')).rejects.toMatchObject({ code: 'DISCONNECTED' })
    expect(f.state().entries.files?.document?.draft).toBe('keep if read fails')
    f.failRead(false)
    f.gateRead(gate.promise)
    const reading = f.openFile('files', 'two.txt')
    await f.openFile('files', 'one.txt')
    gate.resolve()
    await expect(reading).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.state().entries.files?.document?.path).toBe('one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('keep if read fails')
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('a full protected document cache reports BUSY and never evicts an unsaved draft', async () => {
  const f = draftFixture()
  try {
    await f.bind('files', 'a')
    for (let index = 0; index < MAX_CACHED_FILE_DOCUMENTS; index += 1) {
      await f.openFile('files', `${index}.txt`)
      await f.execute('fileWorkspace.setText', { instanceId: 'files', text: `draft ${index}` })
    }
    await expect(f.openFile('files', 'over-capacity.txt')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.state().entries.files?.error).toBe('BUSY')
    await f.openFile('files', '0.txt')
    expect(f.state().entries.files?.document?.draft).toBe('draft 0')
    expect(f.reads).toHaveLength(MAX_CACHED_FILE_DOCUMENTS)
    expect(f.writes).toHaveLength(0)
  } finally {
    f.runtime.dispose()
  }
})

test('a stale discard confirmation cannot clear a different document or attach its error to the new target', async () => {
  const f = draftFixture()
  try {
    await f.bind('files', 'a')
    await f.openFile('files', 'one.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'keep first' })
    const first = f.state().entries.files!.document!
    const confirmation = {
      instanceId: 'files',
      workspaceId: 'a',
      path: first.path,
      expectedDraft: first.draft,
      expectedSha256: first.sha256,
    }
    await f.openFile('files', 'two.txt')
    await f.execute('fileWorkspace.setText', { instanceId: 'files', text: 'keep second' })
    await expect(f.execute('fileWorkspace.discardAndReload', confirmation)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
    expect(f.state().entries.files).toMatchObject({
      error: null,
      document: { path: 'two.txt', draft: 'keep second', error: null },
    })
    await f.openFile('files', 'one.txt')
    expect(f.state().entries.files?.document?.draft).toBe('keep first')
    expect(f.writes).toHaveLength(0)
  } finally {
    f.runtime.dispose()
  }
})

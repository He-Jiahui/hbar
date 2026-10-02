import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { fileCommands } from '@hbar/contracts/commands/files'
import { gitCommands } from '@hbar/contracts/commands/git'
import { fileWorkspaceCommandSnapshots } from './fixtures/file-workspace-command-snapshots'
import { directoryCommands } from '@hbar/contracts/commands'
import type { FileWorkspacePreviewState } from '@hbar/app-runtime'
import { isSessionToolProtected } from '../packages/app-runtime/src/session-tool-retention'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const session = {
  id: 'a',
  workspaceId: 'w',
  title: 'Original Session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const deferred = () => Promise.withResolvers<void>()
async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (reason) {
    if (reason instanceof CommandError) return reason.code
    throw reason
  }
  throw new Error('Expected command rejection')
}
async function settle(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i += 1) await Promise.resolve()
  expect(predicate()).toBe(true)
}

async function fixture() {
  const contents = new Map<string, string>()
  const readGates = new Map<string, Promise<void>>()
  const diffGates = new Map<string, Promise<void>>()
  const failedReads = new Set<string>()
  const failedDiffs = new Set<string>()
  const reads: string[] = [],
    diffs: { path: string; cached: boolean; signal: AbortSignal | undefined }[] = []
  const writes: { path: string; text: string; before: string | null; requestId: string | undefined }[] = []
  const control = {
    writeGate: null as Promise<void> | null,
    unknown: false,
    sessionGate: null as Promise<void> | null,
    sessionReads: 0,
    diffLength: 0,
    cleanStatus: false,
  }
  const runtime = createAppRuntime({
    instanceId: 'preview-tabs',
    hostId: 'fixture',
    surfaces: { canRender: (kind) => kind === 'files' },
    sessionLaunchTargets: {
      async read(sessionId, execution) {
        execution?.signal?.throwIfAborted()
        return {
          sessionId,
          workspaceId: 'w',
          revision: 0,
          selection: { mode: 'shared-current' as const },
          locked: true,
          resolution: { status: 'ready' as const, branch: null },
          updatedAt: 0,
        }
      },
    },
    directory: {
      async execute(name, raw) {
        if (name === 'workspace.get') {
          const input = directoryCommands['workspace.get'].input.parse(raw)
          return { id: input.workspaceId, path: `/repo/${input.workspaceId}`, name: input.workspaceId, createdAt: 1 }
        }
        if (name === 'session.get') {
          control.sessionReads++
          await control.sessionGate
          return session
        }
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [], nextCursor: null }
        throw new Error(`Unexpected ${name}`)
      },
    },
    files: {
      async execute(name, raw, execution) {
        if (name === 'file.list')
          return { items: ['a.txt', 'b.txt', 'c.txt'].map((path) => ({ path, name: path, directory: false })) }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          const key = `${input.workspaceId}:${input.path}`
          const text = contents.get(key) ?? `Original ${key}`
          reads.push(key)
          await readGates.get(key)
          if (failedReads.has(key)) throw new CommandError('DISCONNECTED', 'Fixture read failure')
          return { ...input, text, size: text.length, sha256: sha(text) }
        }
        if (name === 'file.write') {
          const input = fileCommands['file.write'].input.parse(raw)
          writes.push({
            path: input.path,
            text: input.text,
            before: input.expectedSha256,
            requestId: execution?.requestId,
          })
          await control.writeGate
          contents.set(`${input.workspaceId}:${input.path}`, input.text)
          if (control.unknown) throw new CommandError('RESULT_UNKNOWN', 'Fixture lost write response')
          return {
            workspaceId: input.workspaceId,
            ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
            path: input.path,
            beforeSha256: input.expectedSha256,
            afterSha256: sha(input.text),
            size: input.text.length,
            created: false,
          }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
    git: {
      async execute(name, raw, execution) {
        if (name === 'sessionGit.status') {
          const input = gitCommands['sessionGit.status'].input.parse(raw)
          return {
            target: {
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
            },
            branch: 'fixture',
            head: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            isRepository: true,
            dirty: !control.cleanStatus,
            repositoryDirty: !control.cleanStatus,
            entries: control.cleanStatus
              ? []
              : Array.from({ length: 40 }, (_, i) => ({
                  kind: 'path' as const,
                  path: i < 3 ? `${String.fromCharCode(97 + i)}.txt` : `diff-${i}.txt`,
                  index: 'M',
                  worktree: 'M',
                })),
          }
        }
        if (name === 'sessionGit.diff') {
          const input = gitCommands['sessionGit.diff'].input.parse(raw)
          const path = input.paths[0]
          if (!path) throw new Error('Missing diff fixture target')
          const key = `${path}:${input.cached}`
          const text = control.diffLength
            ? 'd'.repeat(control.diffLength)
            : `${path} ${input.cached ? 'staged' : 'working'}`
          diffs.push({ path, cached: input.cached, signal: execution?.signal })
          await diffGates.get(key)
          if (failedDiffs.has(key)) throw new CommandError('DISCONNECTED', 'Fixture diff failure')
          return {
            target: {
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              expectedRevision: input.expectedRevision,
            },
            cached: input.cached,
            diff: control.cleanStatus ? '' : text,
            truncated: false,
          }
        }
        if (name === 'git.status') {
          const { cwd } = gitCommands['git.status'].input.parse(raw)
          return {
            cwd,
            root: cwd,
            branch: 'fixture',
            head: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            dirty: !control.cleanStatus,
            originUrl: null,
            entries: control.cleanStatus
              ? []
              : Array.from({ length: 40 }, (_, i) => ({
                  path: i < 3 ? `${String.fromCharCode(97 + i)}.txt` : `diff-${i}.txt`,
                  index: 'M',
                  worktree: 'M',
                })),
          }
        }
        if (name === 'git.diff') {
          const input = gitCommands['git.diff'].input.parse(raw)
          const path = input.paths[0]
          if (!path || !input.cwd) throw new Error('Missing diff fixture target')
          const key = `${path}:${input.cached}`
          const text = control.diffLength
            ? 'd'.repeat(control.diffLength)
            : `${path} ${input.cached ? 'staged' : 'working'}`
          diffs.push({ path, cached: input.cached, signal: execution?.signal })
          await diffGates.get(key)
          if (failedDiffs.has(key)) throw new CommandError('DISCONNECTED', 'Fixture diff failure')
          return { cwd: input.cwd, cached: input.cached, diff: control.cleanStatus ? '' : text, truncated: false }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  const commands = fileWorkspaceCommandSnapshots(runtime)
  await runtime.ready
  await commands.execute('app.setSession', { sessionId: 'a', workspaceId: 'w' })
  const bind = async (instanceId = 'files', workspaceId = 'w') => {
    await commands.execute('app.openPanel', {
      instanceId,
      panelId: 'files',
      workspaceId,
      sessionId: 'a',
      binding: 'pinned',
    })
    await commands.execute('fileWorkspace.refresh', { instanceId })
  }
  await bind()
  const entry = (instanceId = 'files') => {
    const value = runtime.view.state.files.getSnapshot().entries[instanceId]
    if (!value) throw new Error('Missing fixture Files entry')
    return value
  }
  const preview = (id: string, instanceId = 'files') => {
    const value = entry(instanceId).previews.find((item) => item.id === id)
    if (!value) throw new Error('Missing fixture preview')
    return value
  }
  const active = (instanceId = 'files') => {
    const id = entry(instanceId).activePreviewId
    if (!id) throw new Error('Missing active preview')
    return preview(id, instanceId)
  }
  const target = (value: FileWorkspacePreviewState, instanceId = 'files') => ({
    instanceId,
    workspaceId: entry(instanceId).workspaceId,
    previewId: value.id,
    sourceSessionId: entry(instanceId).sourceSessionId,
    sessionTarget: entry(instanceId).sessionTarget,
  })
  const open = async (path: string, instanceId = 'files') => {
    await commands.execute('fileWorkspace.openEntry', { instanceId, path, directory: false })
    return active(instanceId)
  }
  const changed = (instanceId = 'files') =>
    commands.execute('fileWorkspace.setBrowserMode', {
      instanceId,
      workspaceId: entry(instanceId).workspaceId,
      mode: 'changed',
      preservePreview: true,
    })
  const diff = async (path: string, cached = false, instanceId = 'files') => {
    await commands.execute('fileWorkspace.openChange', {
      instanceId,
      workspaceId: entry(instanceId).workspaceId,
      path,
      cached,
    })
    return active(instanceId)
  }
  const close = (ids: readonly string[], instanceId = 'files') =>
    commands.execute('fileWorkspace.closePreviews', {
      instanceId,
      workspaceId: entry(instanceId).workspaceId,
      previewIds: [...ids],
    })
  return {
    runtime,
    commands,
    contents,
    reads,
    diffs,
    writes,
    readGates,
    diffGates,
    failedReads,
    failedDiffs,
    control,
    bind,
    entry,
    preview,
    active,
    target,
    open,
    changed,
    diff,
    close,
  }
}

test('preview keys deduplicate canonical paths while text/staged/working diffs retain separate UUIDs', async () => {
  const f = await fixture()
  try {
    const text = await f.open('a.txt')
    expect((await f.open('./a.txt')).id).toBe(text.id)
    expect(f.reads).toHaveLength(2)
    await f.changed()
    const working = await f.diff('a.txt')
    const staged = await f.diff('a.txt', true)
    expect(new Set([text.id, working.id, staged.id]).size).toBe(3)
    expect((await f.diff('a.txt', false)).id).toBe(working.id)
    expect(f.diffs).toHaveLength(3)
    expect(f.entry().previews).toHaveLength(3)
    expect(f.entry()).toMatchObject({ view: 'diff', document: null, diff: { cached: false, text: 'a.txt working' } })
    await f.commands.execute('fileWorkspace.selectPreview', f.target(text))
    expect(f.reads).toHaveLength(3)
    expect(f.entry()).toMatchObject({ view: 'document', diff: null, document: { path: 'a.txt' } })
  } finally {
    f.runtime.dispose()
  }
})

test('dirty previews only select, share one canonical document across panes, and protect inactive owners', async () => {
  const f = await fixture()
  try {
    const a = await f.open('a.txt')
    await f.commands.execute('fileWorkspace.setText', { ...f.target(a), text: 'Unsaved shared A' })
    await f.open('b.txt')
    await f.commands.execute('fileWorkspace.selectPreview', f.target(a))
    await f.open('a.txt')
    expect(f.reads.filter((path) => path === 'w:a.txt')).toHaveLength(1)
    expect(await rejection(f.commands.execute('fileWorkspace.refreshPreview', f.target(a)))).toBe('FILE_DRAFT_PENDING')
    await f.bind('other')
    const other = await f.open('a.txt', 'other')
    const first = f.preview(a.id)
    if (first.kind !== 'document' || other.kind !== 'document') throw new Error('Expected documents')
    expect(first.document).toBe(other.document)
    await f.open('c.txt')
    expect(
      isSessionToolProtected('files', {
        files: f.runtime.view.state.files.getSnapshot(),
        agents: { entries: {}, catalog: { status: 'idle', models: [], error: null } },
        goals: { entries: {} },
        workflow: { entries: {} },
      }),
    ).toBe(true)
    expect(f.entry().document?.path).toBe('c.txt')
    expect(f.preview(a.id)).toMatchObject({ document: { draft: 'Unsaved shared A' } })
  } finally {
    f.runtime.dispose()
  }
})

test('stale preview edits reject while an already-dispatched save settles only the original canonical document', async () => {
  const f = await fixture(),
    gate = deferred()
  try {
    const a = await f.open('a.txt')
    await f.commands.execute('fileWorkspace.setText', { ...f.target(a), text: 'Submitted A' })
    f.control.writeGate = gate.promise
    const saving = f.commands.execute('fileWorkspace.save', f.target(a))
    await settle(() => f.writes.length === 1)
    expect(await f.close([a.id])).toEqual({ closed: [], blocked: [{ previewId: a.id, reason: 'submitting' }] })
    const b = await f.open('b.txt')
    await f.commands.execute('fileWorkspace.setText', { ...f.target(b), text: 'Keep B' })
    expect(await rejection(f.commands.execute('fileWorkspace.setText', { ...f.target(a), text: 'Wrong target' }))).toBe(
      'VERSION_CONFLICT',
    )
    gate.resolve()
    await saving
    expect(f.entry()).toMatchObject({ activePreviewId: b.id, document: { draft: 'Keep B' }, error: null })
    expect(f.preview(a.id)).toMatchObject({
      document: { baseline: 'Submitted A', draft: 'Submitted A', status: 'succeeded' },
    })
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('batch close is atomic for dirty/unknown documents and selection never replays an uncertain save', async () => {
  const f = await fixture()
  try {
    const a = await f.open('a.txt')
    await f.commands.execute('fileWorkspace.setText', { ...f.target(a), text: 'Uncertain A' })
    const b = await f.open('b.txt')
    const before = f.entry()
    expect(await f.close([a.id, b.id])).toEqual({ closed: [], blocked: [{ previewId: a.id, reason: 'dirty' }] })
    expect(f.entry()).toBe(before)
    await f.commands.execute('fileWorkspace.selectPreview', f.target(a))
    f.control.unknown = true
    expect(await rejection(f.commands.execute('fileWorkspace.save', f.target(a)))).toBe('RESULT_UNKNOWN')
    await f.commands.execute('fileWorkspace.selectPreview', f.target(b))
    const count = f.reads.length
    expect(await f.close([b.id, a.id])).toEqual({ closed: [], blocked: [{ previewId: a.id, reason: 'unknown' }] })
    await f.commands.execute('fileWorkspace.selectPreview', f.target(a))
    expect(f.reads).toHaveLength(count)
    await f.commands.execute('fileWorkspace.reconcile', f.target(a))
    expect(f.writes).toHaveLength(1)
    expect(await f.close([b.id, a.id])).toEqual({ closed: [a.id, b.id], blocked: [] })
    expect(f.entry()).toMatchObject({
      previews: [],
      activePreviewId: null,
      view: 'browser',
      document: null,
      diff: null,
    })
  } finally {
    f.runtime.dispose()
  }
})

test('close uses captured UUIDs, picks the original right then left neighbour and Back preserves refs', async () => {
  const f = await fixture()
  try {
    const a = await f.open('a.txt'),
      b = await f.open('b.txt'),
      c = await f.open('c.txt')
    await f.commands.execute('fileWorkspace.selectPreview', f.target(b))
    expect(await f.close([b.id, b.id])).toEqual({ closed: [b.id], blocked: [] })
    expect(f.entry().activePreviewId).toBe(c.id)
    const reopened = await f.open('b.txt')
    expect(reopened.id).not.toBe(b.id)
    const unchanged = f.entry()
    expect(await f.close([b.id])).toEqual({ closed: [], blocked: [] })
    expect(f.entry()).toBe(unchanged)
    expect(f.entry().activePreviewId).toBe(reopened.id)
    await f.close([reopened.id, c.id])
    expect(f.entry().activePreviewId).toBe(a.id)
    await f.commands.execute('fileWorkspace.showBrowser', f.target(a))
    expect(f.entry()).toMatchObject({ activePreviewId: null, view: 'browser', document: null, diff: null })
    expect(f.entry().previews.map((preview) => preview.id)).toEqual([a.id])
    await f.commands.execute('fileWorkspace.selectPreview', f.target(a))
    expect(f.entry().activePreviewId).toBe(a.id)
  } finally {
    f.runtime.dispose()
  }
})

test('closing loading document/diff previews fences late responses without recreating the old UUID', async () => {
  const f = await fixture(),
    textGate = deferred(),
    diffGate = deferred()
  try {
    f.readGates.set('w:a.txt', textGate.promise)
    const reading = rejection(
      f.commands.execute('fileWorkspace.openEntry', { instanceId: 'files', path: 'a.txt', directory: false }),
    )
    await settle(() => f.reads.length === 1)
    const old = f.active()
    await f.close([old.id])
    const b = await f.open('b.txt')
    textGate.resolve()
    expect(await reading).toBe('RESULT_UNKNOWN')
    expect(f.entry().activePreviewId).toBe(b.id)
    expect(f.entry().previews.some((preview) => preview.id === old.id)).toBe(false)
    await f.changed()
    f.diffGates.set('a.txt:false', diffGate.promise)
    const diffing = rejection(
      f.commands.execute('fileWorkspace.openChange', {
        instanceId: 'files',
        workspaceId: 'w',
        path: 'a.txt',
        cached: false,
      }),
    )
    await settle(() => f.diffs.length === 1)
    const oldDiff = f.active()
    await f.close([oldDiff.id])
    expect(f.diffs[0]?.signal?.aborted).toBe(true)
    f.diffGates.delete('a.txt:false')
    const newDiff = await f.diff('a.txt')
    diffGate.resolve()
    expect(await diffing).toBe('CANCELLED')
    expect(newDiff.id).not.toBe(oldDiff.id)
    expect(f.entry().activePreviewId).toBe(newDiff.id)
    expect(f.entry().previews.filter((preview) => preview.kind === 'diff')).toHaveLength(1)
  } finally {
    textGate.resolve()
    diffGate.resolve()
    f.runtime.dispose()
  }
})

test('clean preview refresh preserves successful text on failure and retries only its captured target', async () => {
  const f = await fixture()
  try {
    const a = await f.open('a.txt')
    f.failedReads.add('w:a.txt')
    expect(await rejection(f.commands.execute('fileWorkspace.selectPreview', f.target(a)))).toBe('DISCONNECTED')
    expect(f.preview(a.id)).toMatchObject({
      document: { draft: 'Original w:a.txt', status: 'failed', error: 'DISCONNECTED' },
    })
    f.failedReads.clear()
    f.contents.set('w:a.txt', 'Fresh A')
    await f.commands.execute('fileWorkspace.refreshPreview', f.target(a))
    expect(f.preview(a.id)).toMatchObject({ document: { draft: 'Fresh A', status: 'ready' } })
    await f.changed()
    const staged = await f.diff('a.txt', true)
    f.failedDiffs.add('a.txt:true')
    expect(await rejection(f.commands.execute('fileWorkspace.selectPreview', f.target(staged)))).toBe('DISCONNECTED')
    expect(f.preview(staged.id)).toMatchObject({
      diff: { text: 'a.txt staged', status: 'error', error: 'DISCONNECTED' },
    })
    f.failedDiffs.clear()
    f.control.cleanStatus = true
    await f.commands.execute('fileWorkspace.refreshChanges', {
      instanceId: 'files',
      workspaceId: 'w',
      preservePreview: true,
    })
    expect(f.entry().changes.items).toEqual([])
    await f.commands.execute('fileWorkspace.refreshPreview', f.target(staged))
    expect(f.preview(staged.id)).toMatchObject({ diff: { cached: true, text: '', status: 'ready' } })
    expect(f.diffs.every((request) => request.path === 'a.txt' && request.cached)).toBe(true)
  } finally {
    f.runtime.dispose()
  }
})

test('late diff completion updates only its still-open UUID and cannot select itself over another preview', async () => {
  const f = await fixture(),
    gate = deferred()
  try {
    await f.changed()
    f.diffGates.set('a.txt:false', gate.promise)
    const reading = f.diff('a.txt')
    await settle(() => f.diffs.length === 1)
    const a = f.active()
    const b = await f.diff('b.txt', true)
    gate.resolve()
    await reading
    expect(f.entry().activePreviewId).toBe(b.id)
    expect(f.preview(a.id)).toMatchObject({ diff: { status: 'ready', text: 'a.txt working' } })
    expect(f.preview(b.id)).toMatchObject({ diff: { status: 'ready', text: 'b.txt staged' } })
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('diff read concurrency is bounded and Back leaves independent reads alive without reactivating them', async () => {
  const f = await fixture(),
    gate = deferred()
  const pending: Promise<unknown>[] = []
  try {
    await f.changed()
    for (let i = 3; i < 11; i++) {
      f.diffGates.set(`diff-${i}.txt:false`, gate.promise)
      pending.push(
        f.commands.execute('fileWorkspace.openChange', {
          instanceId: 'files',
          workspaceId: 'w',
          path: `diff-${i}.txt`,
          cached: false,
        }),
      )
    }
    await settle(() => f.diffs.length === 8)
    expect(await rejection(f.diff('diff-11.txt'))).toBe('BUSY')
    expect(f.active()).toMatchObject({ diff: { status: 'error', error: 'BUSY' } })
    expect(f.diffs).toHaveLength(8)
    await f.commands.execute('fileWorkspace.showBrowser', f.target(f.active()))
    expect(
      f.entry().previews.filter((preview) => preview.kind === 'diff' && preview.diff.status === 'loading'),
    ).toHaveLength(8)
    expect(f.diffs.every((request) => request.signal?.aborted === false)).toBe(true)
    gate.resolve()
    expect(await Promise.all(pending)).toHaveLength(8)
    expect(
      f.entry().previews.filter((preview) => preview.kind === 'diff' && preview.diff.status === 'ready'),
    ).toHaveLength(8)
    expect(f.entry()).toMatchObject({ view: 'browser', activePreviewId: null })
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('reopening the same clean or dirty document preserves its per-preview Edit mode', async () => {
  const f = await fixture()
  try {
    const a = await f.open('a.txt')
    await f.commands.execute('fileWorkspace.setDocumentMode', { ...f.target(a), path: a.path, mode: 'edit' })
    expect((await f.open('./a.txt')).id).toBe(a.id)
    expect(f.entry().documentMode).toBe('edit')
    expect(f.reads.filter((path) => path === 'w:a.txt')).toHaveLength(2)
    await f.commands.execute('fileWorkspace.setText', { ...f.target(a), text: 'Original unsaved editing content' })
    await f.open('b.txt')
    expect((await f.open('a.txt')).id).toBe(a.id)
    expect(f.entry()).toMatchObject({ documentMode: 'edit', document: { draft: 'Original unsaved editing content' } })
    expect(f.reads.filter((path) => path === 'w:a.txt')).toHaveLength(2)
  } finally {
    f.runtime.dispose()
  }
})

test('navigator mode, refresh, folder and Back cannot cancel a still-open preview or steal later selection', async () => {
  const f = await fixture(),
    gate = deferred()
  try {
    await f.changed()
    f.diffGates.set('a.txt:false', gate.promise)
    const reading = f.commands.execute('fileWorkspace.openChange', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'a.txt',
      cached: false,
    })
    await settle(() => f.diffs.length === 1)
    const a = f.active()
    const assertReading = () => {
      expect(f.diffs[0]?.signal?.aborted).toBe(false)
      expect(f.preview(a.id)).toMatchObject({ diff: { status: 'loading' } })
    }
    await f.commands.execute('fileWorkspace.setBrowserMode', {
      instanceId: 'files',
      workspaceId: 'w',
      mode: 'all',
      preservePreview: true,
    })
    assertReading()
    await f.commands.execute('fileWorkspace.refresh', { instanceId: 'files', preservePreview: true })
    assertReading()
    await f.commands.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      workspaceId: 'w',
      path: 'folder',
      directory: true,
    })
    assertReading()
    expect(f.entry().activePreviewId).toBeNull()
    await f.changed()
    await f.commands.execute('fileWorkspace.refreshChanges', {
      instanceId: 'files',
      workspaceId: 'w',
      preservePreview: true,
    })
    assertReading()
    await f.commands.execute('fileWorkspace.showBrowser', { instanceId: 'files', workspaceId: 'w' })
    assertReading()
    const b = await f.open('b.txt')
    gate.resolve()
    await reading
    expect(f.preview(a.id)).toMatchObject({ diff: { status: 'ready', text: 'a.txt working' } })
    expect(f.entry()).toMatchObject({ activePreviewId: b.id, view: 'document', document: { path: 'b.txt' } })
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('repeated selections coalesce the same canonical clean read and never duplicate the preview', async () => {
  const f = await fixture(),
    gate = deferred()
  try {
    const a = await f.open('a.txt')
    f.readGates.set('w:a.txt', gate.promise)
    const first = f.commands.execute('fileWorkspace.selectPreview', f.target(a))
    const second = f.commands.execute('fileWorkspace.selectPreview', f.target(a))
    await settle(() => f.reads.length === 2)
    expect(f.entry().previews).toHaveLength(1)
    gate.resolve()
    await first
    await second
    expect(f.reads).toHaveLength(2)
    expect(f.entry().activePreviewId).toBe(a.id)
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('32 preview references reject a 33rd before issuing reads or changing the active target', async () => {
  const f = await fixture()
  try {
    for (let i = 0; i < 32; i++) await f.open(`file-${i}.txt`)
    const before = f.entry(),
      readCount = f.reads.length
    expect(await rejection(f.open('overflow.txt'))).toBe('BUSY')
    expect(f.entry().previews).toBe(before.previews)
    expect(f.entry().activePreviewId).toBe(before.activePreviewId)
    expect(f.reads).toHaveLength(readCount)
    const first = before.previews[0]
    if (!first) throw new Error('Missing capacity fixture')
    await f.close([first.id])
    await f.open('overflow.txt')
    expect(f.entry().previews).toHaveLength(32)
  } finally {
    f.runtime.dispose()
  }
})

test('diff text budget is global across panels and rejects excess data without silent eviction or truncation', async () => {
  const f = await fixture()
  try {
    f.control.diffLength = 500_000
    await f.changed()
    for (let i = 3; i < 11; i++) await f.diff(`diff-${i}.txt`)
    await f.bind('other')
    await f.changed('other')
    for (let i = 11; i < 19; i++) await f.diff(`diff-${i}.txt`, false, 'other')
    const before = f.entry().previews.map((preview) => preview.id)
    expect(await rejection(f.diff('diff-19.txt', false, 'other'))).toBe('BUSY')
    expect(f.entry().previews.map((preview) => preview.id)).toEqual(before)
    expect(f.active('other')).toMatchObject({ diff: { status: 'error', error: 'BUSY', text: '', truncated: false } })
    const closeId = f.entry().previews[0]?.id
    if (!closeId) throw new Error('Missing budget fixture')
    await f.close([closeId])
    await f.commands.execute('fileWorkspace.refreshPreview', f.target(f.active('other'), 'other'))
    expect(f.active('other')).toMatchObject({ diff: { status: 'ready', truncated: false } })
  } finally {
    f.runtime.dispose()
  }
})

test('Add to composer rejects a closed/reopened same-path preview after Host validation without changing the draft', async () => {
  const f = await fixture(),
    gate = deferred()
  try {
    const a = await f.open('a.txt')
    const source = f.runtime.view.state.workspaceTabs
      .getSnapshot()
      .items.find((tab) => tab.kind === 'session' && tab.sessionId === 'a')
    if (!source) throw new Error('Missing source Session tab')
    const target = {
      ...f.target(a),
      path: a.path,
      sourceSessionId: 'a',
      sourceTabInstanceKey: source.instanceKey,
      expectedRevision: 0,
    }
    f.control.sessionGate = gate.promise
    const reads = f.control.sessionReads
    const adding = rejection(f.commands.execute('fileWorkspace.addToComposer', target))
    await settle(() => f.control.sessionReads > reads)
    await f.close([a.id])
    const reopened = await f.open('a.txt')
    gate.resolve()
    expect(await adding).toBe('TARGET_CHANGED')
    expect(reopened.id).not.toBe(a.id)
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text ?? '').toBe('')
    f.control.sessionGate = null
    expect(
      await f.commands.execute('fileWorkspace.addToComposer', { ...target, previewId: reopened.id }),
    ).toMatchObject({ added: true, sessionId: 'a' })
    expect(f.runtime.view.state.drafts.getSnapshot().a?.mentions).toMatchObject([{ path: 'a.txt', workspaceId: 'w' }])
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

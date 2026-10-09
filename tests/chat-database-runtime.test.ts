import { afterEach, expect, test, spyOn } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { createChatDatabaseWorkspace, chatDatabaseViewKey, type ChatDatabaseClientJournal } from '@hbar/app-runtime'
import {
  DEFAULT_CHAT_DATABASE_POLICY,
  chatDatabaseOperationSchema,
  chatDatabaseStatisticsSchema,
  type ChatDatabaseOperation,
  type ChatDatabaseScope,
} from '@hbar/contracts/commands/chat-database'
import { settingsScopeSchema } from '@hbar/contracts/commands/settings'

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})
const global: ChatDatabaseScope = { kind: 'global' }
function operation(
  id: string,
  type: 'preview' | 'cleanup' = 'preview',
  status: ChatDatabaseOperation['status'] = 'completed',
) {
  return chatDatabaseOperationSchema.parse({
    schemaVersion: 1,
    operationId: id,
    type,
    kind: 'sessions',
    scope: global,
    trigger: 'manual',
    status,
    stage: status === 'completed' ? 'finished' : 'scanning',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: status === 'completed' ? Date.now() : null,
    previewId: type === 'cleanup' ? 'preview' : null,
    expiresAt: Date.now() + 300_000,
    policyRevisions: {},
    candidateCount: 1,
    totalCount: 1,
    processedCount: 0,
    deletedCount: 0,
    estimatedBytes: 50,
    reclaimedBytes: 0,
    reusableDatabaseBytes: 0,
    remainingBytes: null,
    targetBytes: null,
    skipped: [],
    cancellationRequested: false,
    error: null,
  })
}
function statistics(scope: ChatDatabaseScope) {
  return chatDatabaseStatisticsSchema.parse({
    schemaVersion: 1,
    scope,
    sampledAt: Date.now(),
    status: 'ready',
    complete: true,
    history: {
      sessionCount: 1,
      archivedCount: 1,
      messageCount: 1,
      contentBytes: 10,
      logicalBytes: 30,
      lastActivityAt: 1,
      freePageBytes: 0,
      revision: 1,
      complete: true,
    },
    disk: {
      databaseBytes: 1000,
      walBytes: 0,
      shmBytes: 0,
      logBytes: 100,
      attachmentBytes: 200,
      cacheBytes: 50,
      scopedLogBytes: 20,
      scopedAttachmentBytes: 30,
      cacheCategories: [],
      complete: true,
      issues: [],
    },
    totalBytes: scope.kind === 'global' ? 1350 : 80,
    totalKind: scope.kind === 'global' ? 'physical' : 'attributable',
    policy: DEFAULT_CHAT_DATABASE_POLICY,
    policyRevisions: {},
    error: null,
  })
}
const wait = async (condition: () => boolean) => {
  for (let tries = 0; tries < 100; tries++) {
    if (condition()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('Runtime did not settle')
}
function fixture(hook?: (id: string, input: unknown, options?: ExecuteOptions) => Promise<unknown>) {
  const calls: Array<{ id: string; input: unknown; options: ExecuteOptions | undefined }> = []
  let journal: ChatDatabaseClientJournal = { schemaVersion: 1, records: [] }
  const jobs = new Map<string, ChatDatabaseOperation>()
  const executor: CommandExecutor = {
    async execute(id, input, options) {
      calls.push({ id, input, options })
      if (hook) {
        const handled = await hook(id, input, options)
        if (handled !== undefined) return handled
      }
      const value = typeof input === 'object' && input !== null ? input : {}
      if (id === 'chatDatabase.statistics' && 'scope' in value)
        return statistics(settingsScopeSchema.parse(value.scope))
      if (id === 'chatDatabase.task')
        return {
          schemaVersion: 1,
          scope: 'scope' in value ? settingsScopeSchema.parse(value.scope) : global,
          explicit: true,
          autoEnabled: false,
          scheduleEnabled: true,
          capacityEnabled: false,
          lastDueAt: null,
          nextDueAt: null,
          lastRunAt: null,
          operation: null,
          error: null,
        }
      if (id === 'chatDatabase.history') return { items: [...jobs.values()], next: null }
      if (id === 'chatDatabase.receipt')
        return (
          jobs.get(String(options?.idempotencyKey ?? ('idempotencyKey' in value ? value.idempotencyKey : ''))) ?? null
        )
      if (id === 'chatDatabase.operation' && 'operationId' in value)
        return [...jobs.values()].find((item) => item.operationId === value.operationId)
      if (id === 'chatDatabase.preview') {
        const job = operation('preview')
        jobs.set(options?.idempotencyKey ?? '', job)
        return job
      }
      if (id === 'chatDatabase.cleanup') {
        const job = operation('cleanup', 'cleanup')
        jobs.set(options?.idempotencyKey ?? '', job)
        return job
      }
      if (id === 'chatDatabase.previewPage') return { items: [], next: null, operation: operation('preview') }
      throw new Error(`Unexpected test command ${id}`)
    },
  }
  const workspace = createChatDatabaseWorkspace(
    executor,
    (reason) => {
      throw reason
    },
    {
      read: () => journal,
      write(value) {
        journal = structuredClone(value)
      },
    },
  )
  disposers.push(workspace.dispose)
  workspace.actions.setConnected(true)
  const release = workspace.actions.acquire('page', global)
  const entry = () => workspace.reader.getSnapshot().entries[chatDatabaseViewKey('page', global)]
  return { workspace, release, entry, calls, jobs, journal: () => journal, executor }
}

test('visible connected pages use real statistics; hiding stops reads while retained jobs remain available', async () => {
  const f = fixture()
  await wait(() => f.entry()?.statistics !== null && !f.entry()?.loading)
  expect(f.entry()?.statistics?.totalBytes).toBe(1350)
  await f.workspace.actions.preview('page', global, 'sessions')
  await f.workspace.actions.refresh('page', global)
  expect(f.entry()?.preview?.operationId).toBe('preview')
  f.release()
  const count = f.calls.length
  await f.workspace.actions.refresh('page', global)
  expect(f.calls).toHaveLength(count)
  expect(f.journal().records[0]?.previewId).toBe('preview')
  expect(f.calls.filter((call) => call.id === 'chatDatabase.cancel')).toHaveLength(0)
})

test('a lost cleanup response is reconciled by its original actor key after recreation without another mutation', async () => {
  let lose = true
  const f = fixture(async (id, _input, options) => {
    if (id !== 'chatDatabase.cleanup') return undefined
    const job = operation('original-cleanup', 'cleanup')
    f.jobs.set(options?.idempotencyKey ?? '', job)
    if (lose) {
      lose = false
      throw new CommandError('DISCONNECTED', 'lost response')
    }
    return job
  })
  await wait(() => !f.entry()?.loading)
  await f.workspace.actions.preview('page', global, 'sessions')
  await f.workspace.actions.confirm('page', global, 'preview')
  expect(f.entry()?.unknown).toBe(true)
  const saved = f.journal()
  expect(saved.records[0]?.pending?.command).toBe('chatDatabase.cleanup')
  f.workspace.dispose()
  const restored = createChatDatabaseWorkspace(
    f.executor,
    (reason) => {
      throw reason
    },
    { read: () => saved, write() {} },
  )
  disposers.push(restored.dispose)
  restored.actions.setConnected(true)
  restored.actions.acquire('restored', global)
  const entry = () => restored.reader.getSnapshot().entries[chatDatabaseViewKey('restored', global)]
  await wait(() => entry()?.operation?.operationId === 'original-cleanup' && !entry()?.loading)
  expect(entry()).toMatchObject({ unknown: false, operation: { operationId: 'original-cleanup', status: 'completed' } })
  expect(f.calls.filter((call) => call.id === 'chatDatabase.cleanup')).toHaveLength(1)
  expect(f.calls.find((call) => call.id === 'chatDatabase.receipt')?.input).toEqual({
    idempotencyKey: saved.records[0]?.pending?.idempotencyKey,
  })
})

test('missing receipt keeps the pending original request, and retry uses the same request and idempotency identities', async () => {
  let lose = true
  const f = fixture(async (id) => {
    if (id === 'chatDatabase.preview' && lose) {
      lose = false
      throw new CommandError('TIMEOUT', 'not acknowledged')
    }
    return undefined
  })
  await wait(() => !f.entry()?.loading)
  await f.workspace.actions.preview('page', global, 'sessions')
  await f.workspace.actions.refresh('page', global)
  expect(f.entry()?.unknown).toBe(true)
  await f.workspace.actions.retryOriginal('page', global)
  expect(f.entry()?.unknown).toBe(false)
  const attempts = f.calls.filter((call) => call.id === 'chatDatabase.preview')
  expect(attempts).toHaveLength(2)
  expect(attempts[0]?.options?.idempotencyKey).toBe(attempts[1]?.options?.idempotencyKey)
  expect(attempts[0]?.options?.requestId).toBe(attempts[1]?.options?.requestId)
})

test('stale preview confirmation cannot redirect cleanup after a preview has been replaced', async () => {
  const f = fixture()
  await wait(() => !f.entry()?.loading)
  await f.workspace.actions.preview('page', global, 'sessions')
  await f.workspace.actions.confirm('page', global, 'a-different-preview')
  expect(f.calls.filter((call) => call.id === 'chatDatabase.cleanup')).toHaveLength(0)
  await f.workspace.actions.confirm('page', global, 'preview')
  await f.workspace.actions.confirm('page', global, 'preview')
  expect(f.calls.filter((call) => call.id === 'chatDatabase.cleanup')).toHaveLength(1)
})

test('a local journal write failure prevents dispatch, and a failed final journal write retains the original receipt identity', async () => {
  const f = fixture()
  await wait(() => !f.entry()?.loading)
  let writes = 0
  const port = {
    read: () => null,
    write() {
      if (++writes === 2) throw new Error('storage full after acknowledgement')
    },
  }
  const workspace = createChatDatabaseWorkspace(f.executor, () => undefined, port)
  disposers.push(workspace.dispose)
  workspace.actions.setConnected(true)
  workspace.actions.acquire('durability', global)
  await wait(() => !workspace.reader.getSnapshot().entries[chatDatabaseViewKey('durability', global)]?.loading)
  await workspace.actions.preview('durability', global, 'sessions')
  const entry = () => workspace.reader.getSnapshot().entries[chatDatabaseViewKey('durability', global)]
  expect(entry()).toMatchObject({ unknown: true, error: 'JOURNAL_WRITE_FAILED' })
  await workspace.actions.refresh('durability', global)
  expect(entry()).toMatchObject({ unknown: false, preview: { operationId: 'preview' } })
  expect(f.calls.filter((call) => call.id === 'chatDatabase.preview')).toHaveLength(1)
  const failing = createChatDatabaseWorkspace(f.executor, () => undefined, {
    read: () => null,
    write() {
      throw new Error('storage always full')
    },
  })
  disposers.push(failing.dispose)
  failing.actions.setConnected(true)
  await failing.actions.preview('failure', global, 'sessions')
  expect(f.calls.filter((call) => call.id === 'chatDatabase.preview')).toHaveLength(1)
  expect(failing.reader.getSnapshot().entries[chatDatabaseViewKey('failure', global)]?.error).toBe(
    'JOURNAL_WRITE_FAILED',
  )
})

test('a malformed durable journal blocks writes and never silently loses an unknown operation', async () => {
  let writes = 0
  const workspace = createChatDatabaseWorkspace(
    {
      execute() {
        writes++
        return Promise.reject(new Error('unexpected write'))
      },
    },
    () => undefined,
    { read: () => ({ schemaVersion: 99, records: [] }), write() {} },
  )
  disposers.push(workspace.dispose)
  workspace.actions.setConnected(true)
  await workspace.actions.preview('page', global, 'sessions')
  expect(writes).toBe(0)
  expect(workspace.reader.getSnapshot().entries[chatDatabaseViewKey('page', global)]?.error).toBe(
    'JOURNAL_RESTORE_FAILED',
  )
})

test('history pages handle empty, one and 50 records, reject 51 or duplicate identities, and keep the previous bounded page', async () => {
  let length = 0
  let duplicate = false
  const f = fixture(async (id) =>
    id === 'chatDatabase.history'
      ? {
          items: Array.from({ length }, (_, index) => operation(duplicate ? 'same' : `history-${index}`)),
          next: null,
        }
      : undefined,
  )
  await wait(() => !f.entry()?.loading)
  expect(f.entry()?.history).toHaveLength(0)
  for (const count of [1, 50]) {
    length = count
    await f.workspace.actions.historyPage('page', global, null)
    expect(f.entry()?.history).toHaveLength(count)
  }
  length = 51
  await f.workspace.actions.historyPage('page', global, null)
  expect(f.entry()?.error).toBe('INVALID_OUTPUT')
  expect(f.entry()?.history).toHaveLength(50)
  length = 2
  duplicate = true
  await f.workspace.actions.historyPage('page', global, null)
  expect(f.entry()?.history).toHaveLength(50)
})

test('scope changes cannot let a late statistics response replace the visible target', async () => {
  let release: (() => void) | undefined
  const f = fixture(async (id, input) => {
    if (
      id === 'chatDatabase.statistics' &&
      input &&
      typeof input === 'object' &&
      'scope' in input &&
      settingsScopeSchema.parse(input.scope).kind === 'global'
    )
      return new Promise<unknown>((resolve) => {
        release = () => resolve(statistics(global))
      })
    return undefined
  })
  await wait(() => release !== undefined)
  f.release()
  const other: ChatDatabaseScope = { kind: 'workspace', targetId: 'project' }
  f.workspace.actions.acquire('page', other)
  const target = () => f.workspace.reader.getSnapshot().entries[chatDatabaseViewKey('page', other)]
  await wait(() => target()?.statistics?.scope.kind === 'workspace' && !target()?.loading)
  release?.()
  await new Promise<void>((resolve) => setTimeout(resolve, 2))
  expect(target()?.statistics?.totalKind).toBe('attributable')
  expect(f.entry()?.statistics).toBeNull()
})

test('an acknowledgment from a disposed runtime cannot overwrite a newer runtime journal', async () => {
  let acknowledge: ((value: ChatDatabaseOperation) => void) | undefined
  let previewCount = 0
  const f = fixture(async (id, _input, options) => {
    if (id !== 'chatDatabase.preview') return undefined
    const job = operation(++previewCount === 1 ? 'old-preview' : 'new-preview')
    f.jobs.set(options?.idempotencyKey ?? '', job)
    if (previewCount === 1)
      return new Promise<ChatDatabaseOperation>((resolve) => {
        acknowledge = resolve
      })
    return job
  })
  await wait(() => !f.entry()?.loading)
  const first = f.workspace.actions.preview('page', global, 'sessions')
  await wait(() => acknowledge !== undefined)
  f.workspace.dispose()
  let saved = f.journal()
  const next = createChatDatabaseWorkspace(f.executor, () => undefined, {
    read: () => saved,
    write(value) {
      saved = structuredClone(value)
    },
  })
  disposers.push(next.dispose)
  next.actions.setConnected(true)
  next.actions.acquire('replacement', global)
  await wait(
    () =>
      next.reader.getSnapshot().entries[chatDatabaseViewKey('replacement', global)]?.preview?.operationId ===
      'old-preview',
  )
  await next.actions.preview('replacement', global, 'sessions')
  acknowledge?.(operation('old-preview'))
  await first
  expect(saved.records[0]?.previewId).toBe('new-preview')
  expect(saved.records[0]?.pending).toBeNull()
})

test('visiting many scopes keeps entries and journals bounded while allowing later completed operations', async () => {
  const f = fixture()
  await wait(() => !f.entry()?.loading)
  f.release()
  for (let index = 0; index < 40; index++) {
    const scope: ChatDatabaseScope = { kind: 'workspace', targetId: `workspace-${index}` }
    const release = f.workspace.actions.acquire('page', scope)
    await wait(() => !f.workspace.reader.getSnapshot().entries[chatDatabaseViewKey('page', scope)]?.loading)
    await f.workspace.actions.preview('page', scope, 'sessions')
    expect(f.journal().records.length).toBeLessThanOrEqual(16)
    release()
  }
  expect(Object.keys(f.workspace.reader.getSnapshot().entries)).toHaveLength(16)
  expect(f.calls.filter((call) => call.id === 'chatDatabase.preview')).toHaveLength(40)
})

test('cancellation keeps the original job and reports requested cancellation until a verified terminal state', async () => {
  const running = operation('preview', 'preview', 'running')
  const f = fixture(async (id, _input, options) => {
    if (id === 'chatDatabase.preview') {
      f.jobs.set(options?.idempotencyKey ?? '', running)
      return running
    }
    if (id === 'chatDatabase.cancel') {
      const requested = { ...running, status: 'cancelRequested', cancellationRequested: true }
      f.jobs.set('cancel-job', chatDatabaseOperationSchema.parse(requested))
      return requested
    }
    if (id === 'chatDatabase.operation') return f.jobs.get('cancel-job') ?? running
    return undefined
  })
  await wait(() => !f.entry()?.loading)
  await f.workspace.actions.preview('page', global, 'sessions')
  await f.workspace.actions.cancel('page', global, 'preview')
  expect(f.entry()?.preview).toMatchObject({
    operationId: 'preview',
    status: 'cancelRequested',
    cancellationRequested: true,
  })
  f.jobs.set('cancel-job', { ...running, status: 'cancelled', stage: 'finished', cancellationRequested: true })
  await f.workspace.actions.refresh('page', global)
  expect(f.entry()?.preview?.status).toBe('cancelled')
  expect(f.calls.filter((call) => call.id === 'chatDatabase.cancel')).toHaveLength(1)
})

test('30-second sampling runs only while a connected page is visible', async () => {
  const f = fixture()
  await wait(() => !f.entry()?.loading)
  const clock = spyOn(Date, 'now')
  const next = Date.now() + 31_000
  clock.mockReturnValue(next)
  try {
    const before = f.calls.filter((call) => call.id === 'chatDatabase.statistics').length
    await new Promise<void>((resolve) => setTimeout(resolve, 1100))
    expect(f.calls.filter((call) => call.id === 'chatDatabase.statistics')).toHaveLength(before + 1)
    f.workspace.actions.setConnected(false)
    clock.mockReturnValue(next + 31_000)
    await new Promise<void>((resolve) => setTimeout(resolve, 1100))
    expect(f.calls.filter((call) => call.id === 'chatDatabase.statistics')).toHaveLength(before + 1)
    f.release()
    f.workspace.actions.setConnected(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 1100))
    expect(f.calls.filter((call) => call.id === 'chatDatabase.statistics')).toHaveLength(before + 1)
  } finally {
    clock.mockRestore()
  }
})

test('a background refresh started before cursor navigation cannot replace the selected history page', async () => {
  let hold = false
  let finish: (() => void) | undefined
  const f = fixture(async (id, input) => {
    if (id === 'chatDatabase.statistics' && hold)
      return new Promise<unknown>((resolve) => {
        finish = () => resolve(statistics(global))
      })
    if (id === 'chatDatabase.history') {
      const next = input && typeof input === 'object' && 'after' in input && input.after !== null
      return {
        items: [operation(next ? 'selected-page' : 'first-page')],
        next: next ? null : { createdAt: 1, id: 'first-page' },
      }
    }
    return undefined
  })
  await wait(() => !f.entry()?.loading)
  const cursor = f.entry()?.historyNext
  if (!cursor) throw new Error('Missing fixture history cursor')
  hold = true
  const refresh = f.workspace.actions.refresh('page', global)
  await wait(() => finish !== undefined)
  await f.workspace.actions.historyPage('page', global, cursor)
  finish?.()
  await refresh
  expect(f.entry()?.history[0]?.operationId).toBe('selected-page')
})

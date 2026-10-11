import { expect, test } from 'bun:test'
import { CommandRegistry, type CommandExecutor } from '@hbar/commands'
import {
  sessionBranchTargetListInputSchema,
  sessionBranchTargetPageSchema,
  sessionBranchTargetSelectInputSchema,
  type SessionBranchTargetOperation,
  type SessionBranchTargetSelectInput,
} from '@hbar/contracts/commands/session-branch-target'
import { createSessionBranchTargetPicker } from '../packages/app-runtime/src/session-branch-target-picker'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState } from '@hbar/app-runtime'

const target = { sessionId: 'session-a', workspaceId: 'workspace-a' }
const oid = 'a'.repeat(40)
const request: SessionBranchTargetSelectInput = {
  ...target,
  expectedRevision: 0,
  choice: { kind: 'branch', ref: 'refs/heads/feature', expectedOid: oid },
}
function page(sessionId = target.sessionId, workspaceId = target.workspaceId, revision = 0) {
  return sessionBranchTargetPageSchema.parse({
    sessionId,
    workspaceId,
    revision,
    execution: { path: 'D:/project', kind: 'checkout', branch: 'main' },
    base: { name: 'main', ref: 'refs/heads/main', tipOid: oid },
    branches: [
      { name: 'main', ref: 'refs/heads/main', tipOid: oid, current: true, worktreePath: 'D:/project' },
      { name: 'feature', ref: 'refs/heads/feature', tipOid: oid, current: false, worktreePath: 'D:/worktree' },
    ],
    nextCursor: null,
    incomplete: false,
    pending: null,
  })
}
function receipt(
  input = request,
  status: SessionBranchTargetOperation['status'] = 'ready',
): SessionBranchTargetOperation {
  return {
    operationId: 'operation-a',
    request: input,
    status,
    revision: input.expectedRevision + Number(status === 'ready'),
    execution: status === 'ready' ? { path: 'D:/worktree', kind: 'worktree', branch: 'feature' } : null,
    error:
      status === 'unknown' || status === 'failed' ? { code: 'RESULT_UNKNOWN', message: 'Unconfirmed result' } : null,
  }
}
function fixture(host: CommandExecutor, busy = false) {
  const local = new CommandRegistry({ execution: 'client' })
  const navigation = createState<NavigationState>({ ...target, status: 'idle', error: null }, (error) => {
    throw error
  })
  const picker = createSessionBranchTargetPicker(local, {
    host,
    navigation: navigation.reader,
    busy: () => busy,
    onSubscriberError: (error) => {
      throw error
    },
    isDisposed: () => false,
  })
  return {
    local,
    navigation,
    picker,
    entry: () => picker.reader.getSnapshot().entries[target.sessionId]!,
    close: () => {
      picker.dispose()
      local.dispose()
      navigation.dispose()
    },
  }
}
async function expectCode(operation: Promise<unknown>, code: string) {
  let failure: unknown
  try {
    await operation
  } catch (error) {
    failure = error
  }
  expect(failure).toHaveProperty('code', code)
}

test('confirmed branch switches refresh the exact session directory and target revision', async () => {
  let selected = false
  const f = fixture({
    async execute(name, input) {
      if (name === 'sessionBranchTarget.list') {
        const parsed = sessionBranchTargetListInputSchema.parse(input)
        const value = page(parsed.sessionId, parsed.workspaceId, Number(selected))
        return selected ? { ...value, execution: receipt().execution } : value
      }
      selected = true
      return receipt(sessionBranchTargetSelectInputSchema.parse(input))
    },
  })
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    await f.local.execute('sessionBranchTargetPicker.select', request)
    expect(f.entry()).toMatchObject({
      phase: 'ready',
      page: { revision: 1, execution: { path: 'D:/worktree', branch: 'feature' } },
    })
    await expectCode(f.local.execute('sessionBranchTargetPicker.select', request), 'COMMAND_CONFLICT')
  } finally {
    f.close()
  }
})

test('late branch pages cannot replace a newly selected session', async () => {
  let release!: (value: unknown) => void
  const pending = new Promise<unknown>((resolve) => {
    release = resolve
  })
  const f = fixture({
    execute: async (_name, input) =>
      sessionBranchTargetListInputSchema.parse(input).sessionId === target.sessionId
        ? pending
        : page('session-b', 'workspace-b'),
  })
  try {
    const old = f.local.execute('sessionBranchTargetPicker.refresh', target)
    f.navigation.replace({ sessionId: 'session-b', workspaceId: 'workspace-b', status: 'idle', error: null })
    await f.local.execute('sessionBranchTargetPicker.refresh', { sessionId: 'session-b', workspaceId: 'workspace-b' })
    release(page())
    await old
    expect(f.picker.reader.getSnapshot().entries['session-b']?.page?.sessionId).toBe('session-b')
    expect(f.entry().page).toBeNull()
  } finally {
    f.close()
  }
})

test('malformed mutation acknowledgements stay unknown and reconcile the original key without resubmission', async () => {
  let selects = 0
  let key: string | undefined
  const f = fixture({
    async execute(name, input, options) {
      if (name === 'sessionBranchTarget.list') return page()
      if (name === 'sessionBranchTarget.select') {
        selects++
        key = options?.idempotencyKey
        return { incomplete: true }
      }
      expect(input).toEqual({ sessionId: target.sessionId, idempotencyKey: key })
      return receipt()
    },
  })
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    await expectCode(f.local.execute('sessionBranchTargetPicker.select', request), 'RESULT_UNKNOWN')
    expect(f.entry()).toMatchObject({ phase: 'unknown', idempotencyKey: key })
    await expectCode(f.local.execute('sessionBranchTargetPicker.select', request), 'BUSY')
    await f.local.execute('sessionBranchTargetPicker.reconcile', target)
    expect(f.entry().phase).toBe('ready')
    expect(selects).toBe(1)
  } finally {
    f.close()
  }
})

test('page reload recovers an owned operation and keeps another actor unmodifiable', async () => {
  const recovery = {
    ...page(),
    pending: { owned: true, operationId: 'operation-a', idempotencyKey: 'original-key', request },
  }
  let resolved = false
  const f = fixture({
    async execute(name, _input, options) {
      if (name === 'sessionBranchTarget.list') return resolved ? page() : recovery
      if (name === 'sessionBranchTarget.operation') return receipt(request, 'unknown')
      expect(options?.idempotencyKey).toBe('original-key')
      resolved = true
      return receipt()
    },
  })
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    expect(f.entry()).toMatchObject({ phase: 'unknown', idempotencyKey: 'original-key' })
    await f.local.execute('sessionBranchTargetPicker.reconcile', target)
    expect(f.entry().phase).toBe('ready')
  } finally {
    f.close()
  }
  const other = fixture({
    execute: async () => ({ ...page(), pending: { owned: false, operationId: 'other-operation' } }),
  })
  try {
    await other.local.execute('sessionBranchTargetPicker.refresh', target)
    expect(other.entry()).toMatchObject({ phase: 'unknown', error: 'OPERATION_OTHER_ACTOR', idempotencyKey: null })
    await expectCode(other.local.execute('sessionBranchTargetPicker.reconcile', target), 'INVALID_STATE')
  } finally {
    other.close()
  }
})

test('pagination caps the visible branch collection and retains the current base outside that page', async () => {
  let reads = 0
  const f = fixture({
    execute: async () => {
      const offset = reads++ * 50
      return {
        ...page(),
        branches: Array.from({ length: 50 }, (_, index) => ({
          name: `feature-${offset + index}`,
          ref: `refs/heads/feature-${offset + index}`,
          tipOid: oid,
          current: false,
          worktreePath: null,
        })),
        nextCursor: `cursor-${reads}`,
      }
    },
  })
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    for (let index = 0; index < 5; index++)
      await f.local.execute('sessionBranchTargetPicker.refresh', { ...target, more: true })
    expect(f.entry().branches).toHaveLength(200)
    expect(f.entry().page?.base?.name).toBe('main')
    expect(reads).toBe(4)
  } finally {
    f.close()
  }
})

test('active tasks and wrong-session pages cannot authorize branch mutations', async () => {
  let mutations = 0
  const f = fixture(
    {
      execute: async (name) => {
        if (name !== 'sessionBranchTarget.list') mutations++
        return page()
      },
    },
    true,
  )
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    await expectCode(f.local.execute('sessionBranchTargetPicker.select', request), 'BUSY')
    expect(mutations).toBe(0)
  } finally {
    f.close()
  }
  const wrong = fixture({ execute: async () => page('session-b') })
  try {
    await expectCode(wrong.local.execute('sessionBranchTargetPicker.refresh', target), 'INVALID_OUTPUT')
    expect(wrong.entry().page).toBeNull()
  } finally {
    wrong.close()
  }
})

test('recovering an older receipt cannot downgrade a newer execution target already read by the picker', async () => {
  let revision = 0
  const f = fixture({
    async execute(name) {
      if (name === 'sessionBranchTarget.list')
        return {
          ...page(target.sessionId, target.workspaceId, revision),
          execution: {
            path: revision === 2 ? 'D:/newer-worktree' : 'D:/project',
            kind: 'worktree',
            branch: revision === 2 ? 'newer' : 'main',
          },
        }
      if (name === 'sessionBranchTarget.select') return { malformed: true }
      return receipt()
    },
  })
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    await expectCode(f.local.execute('sessionBranchTargetPicker.select', request), 'RESULT_UNKNOWN')
    revision = 2
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    const observed: number[] = []
    const off = f.picker.reader.subscribe(() => {
      const current = f.entry().page
      if (current) observed.push(current.revision)
    })
    await f.local.execute('sessionBranchTargetPicker.reconcile', target)
    off()
    expect(observed.every((value) => value >= 2)).toBe(true)
    expect(f.entry().page?.execution.path).toBe('D:/newer-worktree')
  } finally {
    f.close()
  }
})

test('plain-directory pages stay ready without mutation requests and recover when the folder becomes Git', async () => {
  let plain = true
  const commands: string[] = []
  const f = fixture({
    async execute(name) {
      commands.push(name)
      if (name !== 'sessionBranchTarget.list') throw new Error('Unexpected plain-directory mutation')
      return plain
        ? {
            ...page(),
            repository: 'plain',
            execution: { kind: 'directory', path: 'D:/project', branch: null },
            base: null,
            branches: [],
          }
        : page()
    },
  })
  try {
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    expect(f.entry()).toMatchObject({
      phase: 'ready',
      error: null,
      branches: [],
      canLoadMore: false,
      atCapacity: false,
      page: { repository: 'plain', execution: { kind: 'directory', branch: null } },
    })
    await expectCode(f.local.execute('sessionBranchTargetPicker.select', request), 'CAPABILITY_UNAVAILABLE')
    await expectCode(f.local.execute('sessionBranchTargetPicker.reconcile', target), 'CAPABILITY_UNAVAILABLE')
    expect(commands).toEqual(['sessionBranchTarget.list'])
    expect(f.entry().phase).toBe('ready')
    plain = false
    await f.local.execute('sessionBranchTargetPicker.refresh', target)
    expect(f.entry()).toMatchObject({
      phase: 'ready',
      error: null,
      page: { execution: { kind: 'checkout', branch: 'main' } },
    })
    expect(f.entry().branches).toHaveLength(2)
    expect(f.entry().page?.repository ?? 'git').toBe('git')
  } finally {
    f.close()
  }
})

test('branch pages retain old Host compatibility and reject contradictory plain/Git facts', () => {
  const { repository: _repository, ...legacy } = page()
  const parsedLegacy = sessionBranchTargetPageSchema.parse(legacy)
  expect(parsedLegacy.repository ?? 'git').toBe('git')
  expect(Object.keys(parsedLegacy)).toEqual(Object.keys(legacy))
  const plain = {
    ...legacy,
    repository: 'plain',
    execution: { kind: 'directory', path: 'D:/project', branch: null },
    base: null,
    branches: [],
  }
  expect(sessionBranchTargetPageSchema.parse(plain).repository).toBe('plain')
  for (const value of [
    { ...plain, execution: legacy.execution },
    { ...plain, execution: { ...plain.execution, branch: 'invented' } },
    { ...plain, base: legacy.base },
    { ...plain, branches: legacy.branches },
    { ...plain, nextCursor: 'not-a-git-page' },
    { ...plain, incomplete: true },
    { ...plain, pending: { operationId: 'unconfirmed', owned: false } },
    { ...legacy, execution: plain.execution },
  ])
    expect(sessionBranchTargetPageSchema.safeParse(value).success).toBe(false)
})

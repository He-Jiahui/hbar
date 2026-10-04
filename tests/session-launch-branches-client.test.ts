import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import type { RpcParams } from '@hbar/contracts'
import type { SessionLaunchBranchesPage } from '@hbar/contracts/commands/session-launch-branches'
import { createSessionLaunchBranchesManager, createSessionLaunchBranchesReader } from '@hbar/client'

const oid = 'a'.repeat(40)
const creation = {
  workspaceId: 'workspace-a',
  name: 'feature/new',
  baseRef: 'refs/heads/main',
  expectedBaseOid: oid,
}
const created = {
  workspaceId: creation.workspaceId,
  name: creation.name,
  createdRef: `refs/heads/${creation.name}`,
  createdOid: oid,
  baseRef: creation.baseRef,
  baseOid: oid,
}

test('branch manager dispatches one captured creation and validates the exact returned ref and OID', async () => {
  const calls: RpcParams<'command.execute'>[] = []
  const manager = createSessionLaunchBranchesManager({
    async call(_method, request) {
      calls.push(request)
      return created
    },
  })
  expect(await manager.create(creation, { idempotencyKey: 'one-attempt', requestId: 'create-request' })).toEqual(
    created,
  )
  expect(calls).toHaveLength(1)
  expect(calls[0]).toEqual({
    protocol: 1,
    requestId: 'create-request',
    commandId: 'sessionLaunchBranches.create',
    commandVersion: 1,
    idempotencyKey: 'one-attempt',
    input: creation,
  })
  expect(calls[0]?.input).not.toHaveProperty('cwd')
  const mismatched = createSessionLaunchBranchesManager({
    async call() {
      return { ...created, workspaceId: 'workspace-b' }
    },
  })
  await expect(mismatched.create(creation, { idempotencyKey: 'bad-ack' })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
})

test('lost branch creation response stays unknown and never triggers an automatic second write', async () => {
  let calls = 0
  const manager = createSessionLaunchBranchesManager({
    async call() {
      calls++
      throw new HbarError('DISCONNECTED', 'lost fixture response')
    },
  })
  await expect(manager.create(creation, { idempotencyKey: 'original-attempt' })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
  expect(calls).toBe(1)
  const controller = new AbortController()
  controller.abort()
  await expect(
    manager.create(creation, { idempotencyKey: 'not-dispatched', signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(calls).toBe(1)
})

function page(workspaceId = 'workspace-a', name = 'main'): SessionLaunchBranchesPage {
  return {
    workspaceId,
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'branch', name: 'main', ref: 'refs/heads/main', oid },
    },
    branches: [
      {
        name,
        ref: `refs/heads/${name}`,
        tipOid: oid,
        current: name === 'main',
        availability: { sharedCurrent: { state: 'available' }, isolatedBase: { state: 'available' } },
      },
    ],
    nextCursor: null,
    incomplete: false,
  }
}
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

test('branch discovery is a fresh registered-workspace query with bounded defaults and no mutation surface', async () => {
  const calls: RpcParams<'command.execute'>[] = []
  const reader = createSessionLaunchBranchesReader({
    async call(method, input) {
      expect(method).toBe('command.execute')
      calls.push(input)
      return page('workspace-a', calls.length === 1 ? 'main' : 'feature/new')
    },
  })
  expect(Object.keys(reader)).toEqual(['list'])
  expect((await reader.list({ workspaceId: 'workspace-a' }, { requestId: 'branches-request' })).branches[0]?.name).toBe(
    'main',
  )
  expect((await reader.list({ workspaceId: 'workspace-a' })).branches[0]?.name).toBe('feature/new')
  expect(calls).toHaveLength(2)
  expect(calls[0]).toEqual({
    protocol: 1,
    requestId: 'branches-request',
    commandId: 'sessionLaunchBranches.list',
    commandVersion: 2,
    input: { workspaceId: 'workspace-a', search: '', limit: 25 },
  })
  expect(calls[1]).not.toHaveProperty('idempotencyKey')
  expect(calls[1]?.input).not.toHaveProperty('sessionId')
  expect(calls[1]?.input).not.toHaveProperty('cwd')
})

test('search, limit and opaque cursor travel unchanged to the same workspace', async () => {
  const input = { workspaceId: 'workspace-a', search: 'feature/中文', limit: 50, cursor: 'opaque-fixture-cursor' }
  const reader = createSessionLaunchBranchesReader({
    async call(_method, request) {
      expect(request.input).toEqual(input)
      return { ...page(), incomplete: true, nextCursor: 'next-page' }
    },
  })
  expect(await reader.list(input)).toMatchObject({
    workspaceId: 'workspace-a',
    incomplete: true,
    nextCursor: 'next-page',
  })
})

test('invalid bounds, empty workspace and pre-aborted queries never dispatch', async () => {
  let calls = 0
  const reader = createSessionLaunchBranchesReader({
    async call() {
      calls++
      return page()
    },
  })
  for (const input of [
    { workspaceId: '' },
    { workspaceId: 'workspace-a', limit: 0 },
    { workspaceId: 'workspace-a', limit: 51 },
    { workspaceId: 'workspace-a', search: 's'.repeat(257) },
    { workspaceId: 'workspace-a', cursor: '' },
  ])
    await expect(reader.list(input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const controller = new AbortController()
  controller.abort()
  await expect(reader.list({ workspaceId: 'workspace-a' }, { signal: controller.signal })).rejects.toMatchObject({
    code: 'CANCELLED',
  })
  expect(calls).toBe(0)
})

test('strict query replies reject wrong workspace, leaked paths, ref mismatch and excessive rows', async () => {
  const base = page()
  const branch = base.branches[0]
  if (!branch) throw new Error('fixture branch missing')
  const replies: unknown[] = [
    page('workspace-b'),
    { ...base, cwd: 'C:/private' },
    { ...base, branches: [{ ...branch, worktreePath: 'C:/private' }] },
    { ...base, branches: [{ ...branch, ref: 'refs/heads/another' }] },
    {
      ...base,
      repository: {
        kind: 'repository',
        head: base.repository.kind === 'repository' ? base.repository.head : undefined,
      },
    },
    {
      ...base,
      branches: [
        {
          ...branch,
          availability: {
            sharedCurrent: { state: 'available' },
            isolatedBase: { state: 'disabled', reason: 'repository-root-required' },
          },
        },
      ],
    },
    {
      ...base,
      repository: {
        kind: 'repository',
        workspaceScope: 'repository-subdirectory',
        head: base.repository.kind === 'repository' ? base.repository.head : undefined,
      },
    },
    {
      ...base,
      repository: {
        kind: 'repository',
        workspaceScope: 'unknown',
        head: base.repository.kind === 'repository' ? base.repository.head : undefined,
      },
    },
    {
      ...base,
      branches: Array.from({ length: 51 }, (_, index) => ({
        ...branch,
        name: `branch-${index}`,
        ref: `refs/heads/branch-${index}`,
      })),
    },
    { ...base, repository: { kind: 'not-repository' } },
  ]
  const reader = createSessionLaunchBranchesReader({
    async call() {
      return replies.shift()
    },
  })
  const replyCount = replies.length
  for (let index = 0; index < replyCount; index++)
    await expect(reader.list({ workspaceId: 'workspace-a' })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
})

test('empty, detached and unborn facts remain distinct rather than selecting a fake branch', async () => {
  const replies: SessionLaunchBranchesPage[] = [
    {
      workspaceId: 'workspace-a',
      repository: { kind: 'not-repository' },
      branches: [],
      nextCursor: null,
      incomplete: false,
    },
    {
      ...page(),
      repository: { kind: 'repository', workspaceScope: 'repository-root', head: { kind: 'detached', oid } },
      branches: [],
    },
    {
      ...page(),
      repository: {
        kind: 'repository',
        workspaceScope: 'repository-root',
        head: { kind: 'unborn', ref: 'refs/heads/main', name: 'main' },
      },
      branches: [],
    },
  ]
  const expected = replies.map((reply) => reply.repository)
  const reader = createSessionLaunchBranchesReader({
    async call() {
      return replies.shift()
    },
  })
  for (const repository of expected) {
    const result = await reader.list({ workspaceId: 'workspace-a' })
    expect(result.repository).toEqual(repository)
    expect(result.branches).toEqual([])
  }
})

test('checked-out branch can be an isolated base without claiming shared switching is available', async () => {
  const base = page()
  const branch = base.branches[0]
  if (!branch) throw new Error('fixture branch missing')
  const reader = createSessionLaunchBranchesReader({
    async call() {
      return {
        ...base,
        branches: [
          {
            ...branch,
            availability: {
              sharedCurrent: { state: 'disabled', reason: 'checked-out-elsewhere' },
              isolatedBase: { state: 'available' },
            },
          },
        ],
      }
    },
  })
  expect((await reader.list({ workspaceId: 'workspace-a' })).branches[0]?.availability).toEqual({
    sharedCurrent: { state: 'disabled', reason: 'checked-out-elsewhere' },
    isolatedBase: { state: 'available' },
  })
})

test('local cancellation consumes a late transport rejection and does not send a remote cancellation command', async () => {
  const pending = deferred()
  const calls: RpcParams<'command.execute'>[] = []
  const reader = createSessionLaunchBranchesReader({
    call(_method, request) {
      calls.push(request)
      return pending.promise
    },
  })
  const controller = new AbortController()
  const request = reader.list({ workspaceId: 'workspace-a' }, { signal: controller.signal })
  controller.abort()
  await expect(request).rejects.toMatchObject({ code: 'CANCELLED' })
  pending.reject(new HbarError('DISCONNECTED', 'late fixture rejection'))
  await Promise.resolve()
  expect(calls).toHaveLength(1)
  expect(calls[0]?.commandId).toBe('sessionLaunchBranches.list')
})

test('abort during dispatch is observed even before the query listener attaches', async () => {
  const controller = new AbortController()
  const reader = createSessionLaunchBranchesReader({
    call() {
      controller.abort()
      return Promise.resolve(page())
    },
  })
  await expect(reader.list({ workspaceId: 'workspace-a' }, { signal: controller.signal })).rejects.toMatchObject({
    code: 'CANCELLED',
  })
})

test('out-of-order workspace queries remain associated with their original owners', async () => {
  const a = deferred()
  const b = deferred()
  const reader = createSessionLaunchBranchesReader({
    call(_method, input) {
      return input.requestId === 'a' ? a.promise : b.promise
    },
  })
  const first = reader.list({ workspaceId: 'workspace-a' }, { requestId: 'a' })
  const second = reader.list({ workspaceId: 'workspace-b' }, { requestId: 'b' })
  b.resolve(page('workspace-b', 'branch-b'))
  expect(await second).toMatchObject({ workspaceId: 'workspace-b', branches: [{ name: 'branch-b' }] })
  a.resolve(page('workspace-a', 'branch-a'))
  expect(await first).toMatchObject({ workspaceId: 'workspace-a', branches: [{ name: 'branch-a' }] })
})

test('a changed caller input cannot retarget the identity of an already dispatched query', async () => {
  const first = deferred()
  const second = deferred()
  let calls = 0
  const reader = createSessionLaunchBranchesReader({
    call() {
      return calls++ === 0 ? first.promise : second.promise
    },
  })
  const input = { workspaceId: 'workspace-a' }
  const original = reader.list(input)
  input.workspaceId = 'workspace-b'
  first.resolve(page('workspace-a'))
  expect(await original).toMatchObject({ workspaceId: 'workspace-a' })

  input.workspaceId = 'workspace-a'
  const forged = reader.list(input)
  input.workspaceId = 'workspace-b'
  second.resolve(page('workspace-b'))
  await expect(forged).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
})

test('Host failures never become an empty successful non-repository page or a retry with another workspace', async () => {
  for (const code of [
    'GIT_TIMEOUT',
    'GIT_OUTPUT_LIMIT',
    'NOT_FOUND',
    'UNAUTHORIZED',
    'INVALID_CURSOR',
    'DISCONNECTED',
  ]) {
    let calls = 0
    const reader = createSessionLaunchBranchesReader({
      async call() {
        calls++
        throw new HbarError(code, 'fixture query failure')
      },
    })
    await expect(reader.list({ workspaceId: 'workspace-a' })).rejects.toMatchObject({ code })
    expect(calls).toBe(1)
  }
})

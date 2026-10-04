import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { describeCommand } from '@hbar/commands'
import { HbarClient, createWorkspaceSessionCommandClient, type ClientTransport } from '@hbar/client'
import { HbarError, type WireNotification } from '@hbar/contracts'
import {
  workspaceDisplayNamesCommands,
  type WorkspaceDisplayNamesApplyInput,
} from '@hbar/contracts/commands/workspace-display-names'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

const PREFIX = 'hbar-workspace-display-names-host-'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function removeOwnedRoot(root: string): Promise<void> {
  const parent = await realpath(tmpdir())
  const target = await realpath(root)
  if (resolve(dirname(target)) !== resolve(parent) || !basename(target).startsWith(PREFIX) || target === parent)
    throw new Error('Refusing cleanup outside this test-owned temporary root')
  await rm(target, { recursive: true, force: true })
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), PREFIX))
  cleanups.push(() => removeOwnedRoot(root))
  const options = { home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() }
  const kernel = await Kernel.create(options)
  let kernelClosed = false
  const closeKernel = async () => {
    if (kernelClosed) return
    kernelClosed = true
    await kernel.close()
  }
  cleanups.push(closeKernel)
  const host = await startServer(kernel, { port: 0 })
  let hostClosed = false
  const closeHost = async () => {
    if (hostClosed) return
    hostClosed = true
    await host.close()
  }
  cleanups.push(closeHost)
  const firstDevice = await host.auth.createDevice('display names first')
  const secondDevice = await host.auth.createDevice('display names second')
  const baseUrl = `http://127.0.0.1:${host.server.port}`
  const firstClient = new HbarClient(baseUrl, firstDevice.token)
  const secondClient = new HbarClient(baseUrl, secondDevice.token)
  cleanups.push(async () => {
    firstClient.disconnect()
    secondClient.disconnect()
  })
  await Promise.all([firstClient.connect(), secondClient.connect()])
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  return {
    root,
    options,
    kernel,
    host,
    baseUrl,
    workspace,
    firstDevice,
    secondDevice,
    firstClient,
    secondClient,
    first: createWorkspaceSessionCommandClient(firstClient),
    second: createWorkspaceSessionCommandClient(secondClient),
    stop: async () => {
      firstClient.disconnect()
      secondClient.disconnect()
      await closeHost()
      await closeKernel()
    },
  }
}

function rename(
  workspaceId: string,
  expectedRevision = 0,
  expectedDisplayName: string | null = null,
  displayName: string | null = 'Alpha — 工作项目',
): WorkspaceDisplayNamesApplyInput {
  return { expectedRevision, workspaceId, expectedDisplayName, displayName }
}

async function failureCode(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unexpected'
  }
}

async function until(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 2_000
  while (!check()) {
    if (performance.now() >= deadline) throw new Error('Timed out waiting for the exact Host invalidation')
    await Bun.sleep(5)
  }
}

test('display-name commands remain API-only and require actor-scoped idempotency', () => {
  for (const [id, definition] of Object.entries(workspaceDisplayNamesCommands)) {
    const metadata = describeCommand(definition).metadata
    expect(metadata).toMatchObject({
      id,
      execution: 'host',
      category: 'workspace.display-names',
      scope: 'global',
      surfaces: ['api'],
      visibility: 'internal',
    })
    expect(metadata.kind).toBe(id.endsWith('.apply') ? 'command' : 'query')
    expect(metadata.stateEffect).toBe(id.endsWith('.apply') ? 'persistent' : 'none')
    if (id.endsWith('.apply')) expect(metadata.idempotency).toBe('required')
  }
})

test('two real clients observe alias invalidations then query exact names while legacy hide receipts and identities coexist', async () => {
  const { root, kernel, workspace, first, second, firstClient, secondClient } = await fixture()
  const secondPath = join(root, 'second-project')
  await mkdir(secondPath)
  const other = await first.execute('workspace.create', { path: secondPath })
  const beforeWorkspaces = await kernel.storage.call('workspaces')
  const beforeSessions = await kernel.storage.call('sessions')
  const hiddenRequest = {
    expectedRevision: 0,
    change: { kind: 'setHidden' as const, workspaceId: workspace.id, expectedHidden: false, hidden: true },
  }
  const hiddenReceipt = await first.execute('workspaceOrganization.apply', hiddenRequest, {
    idempotencyKey: 'hide-original',
  })
  const notifications: WireNotification[] = []
  const off = secondClient.onEvent((event) => notifications.push(event))
  cleanups.push(async () => off())
  const changes = () =>
    notifications.filter((event) => event.method === 'host.changed' && event.params.kind === 'workspace-display-names')
  expect(await first.execute('workspaceDisplayNames.get', {})).toEqual({ schemaVersion: 1, revision: 0, entries: [] })
  const request = rename(workspace.id)
  const displayName = request.displayName
  if (displayName === null) throw new Error('The rename fixture must request a non-null alias')
  const receipt = await first.execute('workspaceDisplayNames.apply', request, { idempotencyKey: 'alias-A' })
  await until(() => changes().length >= 1)
  expect(receipt).toMatchObject({ revision: 1, changed: true, request })
  expect(await second.execute('workspaceDisplayNames.get', {})).toEqual({
    schemaVersion: 1,
    revision: 1,
    entries: [{ workspaceId: workspace.id, displayName }],
  })
  expect(
    await failureCode(second.execute('workspaceDisplayNames.apply', rename(other.id), { idempotencyKey: 'stale' })),
  ).toBe('COMMAND_CONFLICT')
  await second.execute('workspaceDisplayNames.apply', rename(other.id, 1), { idempotencyKey: 'same-name-different-ID' })
  expect((await first.execute('workspaceDisplayNames.get', {})).entries).toEqual([
    { workspaceId: workspace.id, displayName },
    { workspaceId: other.id, displayName },
  ])
  const reset = rename(workspace.id, 2, request.displayName, null)
  await first.execute('workspaceDisplayNames.apply', reset, { idempotencyKey: 'reset-A' })
  await until(() => changes().length >= 3)
  expect(await second.execute('workspaceDisplayNames.get', {})).toEqual({
    schemaVersion: 1,
    revision: 3,
    entries: [{ workspaceId: other.id, displayName }],
  })
  expect(await first.execute('workspaceDisplayNames.apply', request, { idempotencyKey: 'alias-A' })).toEqual(receipt)
  expect((await second.execute('workspaceDisplayNames.get', {})).revision).toBe(3)
  expect(await first.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 1,
    hiddenWorkspaceIds: [workspace.id],
  })
  expect(
    await first.execute('workspaceOrganization.receipt', { idempotencyKey: 'hide-original', request: hiddenRequest }),
  ).toEqual(hiddenReceipt)
  expect(await kernel.storage.call('workspaces')).toEqual(beforeWorkspaces)
  expect(await kernel.storage.call('sessions')).toEqual(beforeSessions)
  expect(kernel.active.size).toBe(0)
  for (const event of changes())
    expect({ method: event.method, params: event.params }).toEqual({
      method: 'host.changed',
      params: { kind: 'workspace-display-names' },
    })
  expect((await firstClient.call('command.catalog', { category: 'workspace.display-names', limit: 10 })).items).toEqual(
    [],
  )
  expect(
    (await firstClient.call('command.describe', { commandId: 'workspaceDisplayNames.apply' })).metadata.idempotency,
  ).toBe('required')
})

test('a dropped real WS ACK is recovered only by read-only exact receipt, with same-key actor isolation', async () => {
  const { firstClient, firstDevice, first, second, workspace } = await fixture()
  let writes = 0
  const calls: string[] = []
  const lossy: ClientTransport = {
    async call(method, params) {
      const result = await firstClient.call(method, params)
      if (method === 'command.execute' && 'commandId' in params) {
        calls.push(params.commandId)
        if (params.commandId === 'workspaceDisplayNames.apply') {
          writes++
          throw new HbarError('DISCONNECTED', 'Injected discarded reply after real Host commit')
        }
      }
      return result
    },
  }
  const commands = createWorkspaceSessionCommandClient(lossy)
  const request = rename(workspace.id)
  expect(await failureCode(commands.execute('workspaceDisplayNames.apply', request))).toBe('INVALID_INPUT')
  expect(writes).toBe(0)
  expect(
    await failureCode(commands.execute('workspaceDisplayNames.apply', request, { idempotencyKey: 'shared-key' })),
  ).toBe('RESULT_UNKNOWN')
  const lookup = { idempotencyKey: 'shared-key', request }
  const receipt = await commands.execute('workspaceDisplayNames.receipt', lookup)
  expect(receipt).toMatchObject({ revision: 1, changed: true, request })
  // A client-supplied actorId cannot impersonate the actor authenticated on the second socket.
  expect(await second.execute('workspaceDisplayNames.receipt', lookup, { actorId: firstDevice.device.id })).toBeNull()
  expect(
    await failureCode(
      first.execute('workspaceDisplayNames.receipt', {
        ...lookup,
        request: { ...request, displayName: 'Wrong result' },
      }),
    ),
  ).toBe('IDEMPOTENCY_CONFLICT')
  expect(
    await commands.execute('workspaceDisplayNames.receipt', { ...lookup, idempotencyKey: 'never-sent' }),
  ).toBeNull()
  const otherActorRequest = rename(workspace.id, 1, request.displayName, 'Second actor')
  const otherReceipt = await second.execute('workspaceDisplayNames.apply', otherActorRequest, {
    idempotencyKey: 'shared-key',
  })
  expect(otherReceipt).toMatchObject({ revision: 2, request: otherActorRequest })
  expect(otherReceipt.commitId).not.toBe(receipt?.commitId)
  expect(await commands.execute('workspaceDisplayNames.receipt', lookup)).toEqual(receipt)
  expect((await first.execute('workspaceDisplayNames.get', {})).entries).toEqual([
    { workspaceId: workspace.id, displayName: 'Second actor' },
  ])
  expect(writes).toBe(1)
  expect(calls).toEqual([
    'workspaceDisplayNames.apply',
    'workspaceDisplayNames.receipt',
    'workspaceDisplayNames.receipt',
    'workspaceDisplayNames.receipt',
  ])
})

test('alias and legacy hidden receipt survive a new Kernel/Host on the same isolated data root', async () => {
  const data = await fixture()
  const request = rename(data.workspace.id)
  const displayName = request.displayName
  if (displayName === null) throw new Error('The restart fixture must persist a non-null alias')
  const receipt = await data.first.execute('workspaceDisplayNames.apply', request, { idempotencyKey: 'restart-alias' })
  const hidden = {
    expectedRevision: 0,
    change: { kind: 'setHidden' as const, workspaceId: data.workspace.id, expectedHidden: false, hidden: true },
  }
  const hiddenReceipt = await data.first.execute('workspaceOrganization.apply', hidden, {
    idempotencyKey: 'restart-hidden',
  })
  const originalIdentity = data.kernel.instanceId
  await data.stop()
  const reopened = await Kernel.create(data.options)
  cleanups.push(() => reopened.close())
  const host = await startServer(reopened, { port: 0 })
  cleanups.push(() => host.close())
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, data.firstDevice.token)
  cleanups.push(async () => client.disconnect())
  await client.connect()
  const commands = createWorkspaceSessionCommandClient(client)
  expect(reopened.instanceId).not.toBe(originalIdentity)
  expect(await commands.execute('workspaceDisplayNames.get', {})).toEqual({
    schemaVersion: 1,
    revision: 1,
    entries: [{ workspaceId: data.workspace.id, displayName }],
  })
  expect(await commands.execute('workspaceDisplayNames.receipt', { idempotencyKey: 'restart-alias', request })).toEqual(
    receipt,
  )
  expect(await commands.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 1,
    hiddenWorkspaceIds: [data.workspace.id],
  })
  expect(
    await commands.execute('workspaceOrganization.receipt', { idempotencyKey: 'restart-hidden', request: hidden }),
  ).toEqual(hiddenReceipt)
  const independent = await fixture()
  expect(await independent.first.execute('workspaceDisplayNames.get', {})).toEqual({
    schemaVersion: 1,
    revision: 0,
    entries: [],
  })
  expect(reopened.active.size).toBe(0)
})

test('unauthenticated and revoked clients cannot read, recover or mutate display names', async () => {
  const { baseUrl, firstClient, secondClient, secondDevice, workspace, first } = await fixture()
  const anonymous = new HbarClient(baseUrl)
  cleanups.push(async () => anonymous.disconnect())
  expect(await failureCode(anonymous.connect())).toBe('UNAUTHORIZED')
  await firstClient.call('device.revoke', { id: secondDevice.device.id })
  const revoked = createWorkspaceSessionCommandClient(secondClient)
  const request = rename(workspace.id)
  for (const operation of [
    () => revoked.execute('workspaceDisplayNames.get', {}),
    () => revoked.execute('workspaceDisplayNames.receipt', { idempotencyKey: 'denied', request }),
    () => revoked.execute('workspaceDisplayNames.apply', request, { idempotencyKey: 'denied' }),
  ]) {
    const code = await failureCode(operation())
    if (code === undefined) throw new Error('A revoked actor unexpectedly completed a display-name operation')
    expect(['UNAUTHORIZED', 'DISCONNECTED', 'RESULT_UNKNOWN']).toContain(code)
  }
  expect(await first.execute('workspaceDisplayNames.get', {})).toEqual({ schemaVersion: 1, revision: 0, entries: [] })
})

test('local alias reads and commits report p95/max under the bounded interactive test ceiling', async () => {
  const { first, workspace, kernel } = await fixture()
  const reads: number[] = []
  const writes: number[] = []
  for (let index = 0; index < 40; index++) {
    const started = performance.now()
    const state = await first.execute('workspaceDisplayNames.get', {})
    reads.push(performance.now() - started)
    const before = index % 2 === 0 ? null : 'Latency alias'
    const next = before === null ? 'Latency alias' : null
    const writing = performance.now()
    const receipt = await first.execute(
      'workspaceDisplayNames.apply',
      rename(workspace.id, state.revision, before, next),
      { idempotencyKey: `latency-${index}` },
    )
    writes.push(performance.now() - writing)
    expect(receipt.revision).toBe(index + 1)
  }
  const summarize = (samples: number[]) => {
    const sorted = [...samples].sort((left, right) => left - right)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
    const max = sorted.at(-1)
    if (p95 === undefined || max === undefined) throw new Error('Missing latency samples')
    return { samples: samples.length, p95, max }
  }
  const result = { reads: summarize(reads), writes: summarize(writes) }
  expect(result.reads.p95).toBeLessThan(1_000)
  expect(result.writes.p95).toBeLessThan(1_000)
  expect(kernel.active.size).toBe(0)
  console.info('workspace-display-names latency (ms)', JSON.stringify(result))
})

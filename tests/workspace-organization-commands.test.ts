import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeCommand } from '@hbar/commands'
import { HbarClient, createWorkspaceSessionCommandClient, type ClientTransport } from '@hbar/client'
import { HbarError, type WireNotification } from '@hbar/contracts'
import {
  WORKSPACE_ORGANIZATION_MAX_HIDDEN,
  workspaceOrganizationCommands,
  workspaceOrganizationSnapshotSchema,
  type WorkspaceOrganizationApplyInput,
} from '@hbar/contracts/commands/workspace-organization'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-organization-host-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const options = { home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() }
  const kernel = await Kernel.create(options)
  cleanups.push(() => kernel.close())
  const host = await startServer(kernel, { port: 0 })
  cleanups.push(() => host.close())
  const firstDevice = await host.auth.createDevice('organization first')
  const secondDevice = await host.auth.createDevice('organization second')
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
  }
}

function hide(workspaceId: string, expectedRevision = 0): WorkspaceOrganizationApplyInput {
  return { expectedRevision, change: { kind: 'setHidden', workspaceId, expectedHidden: false, hidden: true } }
}

async function failureCode(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unexpected'
  }
}

test('organization contract bounds IDs, versions, Unicode bytes and keeps commands off visible catalogs', () => {
  const empty = { schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] }
  expect(workspaceOrganizationSnapshotSchema.safeParse(empty).success).toBeTrue()
  for (const candidate of [
    { ...empty, schemaVersion: 2 },
    { ...empty, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...empty, hiddenWorkspaceIds: ['same', 'same'] },
    { ...empty, hiddenWorkspaceIds: ['x'.repeat(161)] },
    { ...empty, hiddenWorkspaceIds: Array.from({ length: WORKSPACE_ORGANIZATION_MAX_HIDDEN + 1 }, (_, i) => `${i}`) },
    { ...empty, hiddenWorkspaceIds: Array.from({ length: 1_000 }, (_, i) => `${i}${'界'.repeat(150)}`) },
    { ...empty, preferences: {} },
  ])
    expect(workspaceOrganizationSnapshotSchema.safeParse(candidate).success).toBeFalse()
  expect(
    workspaceOrganizationSnapshotSchema.safeParse({
      ...empty,
      hiddenWorkspaceIds: Array.from({ length: WORKSPACE_ORGANIZATION_MAX_HIDDEN }, (_, i) => `${i}`),
    }).success,
  ).toBeTrue()
  for (const definition of Object.values(workspaceOrganizationCommands)) {
    expect(describeCommand(definition).metadata).toMatchObject({
      execution: 'host',
      category: 'workspace.organization',
      surfaces: ['api'],
      visibility: 'internal',
    })
  }
})

test('two real Host clients share hide/restore state without modifying directory, sessions or runs', async () => {
  const fixtureData = await fixture()
  const { root, kernel, workspace, first, second, secondClient } = fixtureData
  const secondPath = join(root, 'second-project')
  await mkdir(secondPath)
  const secondWorkspace = await first.execute('workspace.create', { path: secondPath })
  const beforeWorkspaces = await kernel.storage.call('workspaces')
  const beforeSessions = await kernel.storage.call('sessions')
  const notifications: WireNotification[] = []
  const off = secondClient.onEvent((event) => notifications.push(event))
  cleanups.push(async () => off())
  expect(await first.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 0,
    hiddenWorkspaceIds: [],
  })
  const request = hide(workspace.id)
  const receipt = await first.execute('workspaceOrganization.apply', request, { idempotencyKey: 'hide-one' })
  expect(receipt).toMatchObject({ revision: 1, changed: true, request })
  expect(await second.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 1,
    hiddenWorkspaceIds: [workspace.id],
  })
  expect(
    await failureCode(
      second.execute('workspaceOrganization.apply', hide(secondWorkspace.id), { idempotencyKey: 'stale-hide' }),
    ),
  ).toBe('COMMAND_CONFLICT')
  await second.execute('workspaceOrganization.apply', hide(secondWorkspace.id, 1), { idempotencyKey: 'hide-two' })
  expect((await first.execute('workspaceOrganization.get', {})).hiddenWorkspaceIds).toEqual([
    workspace.id,
    secondWorkspace.id,
  ])
  const restore = { expectedRevision: 2, change: { kind: 'restoreHidden' as const } }
  const restored = await first.execute('workspaceOrganization.apply', restore, { idempotencyKey: 'restore-all' })
  expect(restored).toMatchObject({ revision: 3, changed: true })
  expect(await second.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 3,
    hiddenWorkspaceIds: [],
  })
  expect(await first.execute('workspaceOrganization.apply', request, { idempotencyKey: 'hide-one' })).toEqual(receipt)
  expect((await second.execute('workspaceOrganization.get', {})).hiddenWorkspaceIds).toEqual([])
  expect(await kernel.storage.call('workspaces')).toEqual(beforeWorkspaces)
  expect(await kernel.storage.call('sessions')).toEqual(beforeSessions)
  expect(kernel.active.size).toBe(0)
  const organizationEvents = notifications.filter(
    (event) => event.method === 'host.changed' && event.params.kind === 'workspace-organization',
  )
  expect(organizationEvents.length).toBeGreaterThanOrEqual(3)
  for (const event of organizationEvents)
    expect({ method: event.method, params: event.params }).toEqual({
      method: 'host.changed',
      params: { kind: 'workspace-organization' },
    })
  const catalog = await firstClientCatalog(fixtureData.firstClient)
  expect(catalog.items).toEqual([])
  expect(
    (await fixtureData.firstClient.call('command.describe', { commandId: 'workspaceOrganization.apply' })).metadata
      .idempotency,
  ).toBe('required')
})

function firstClientCatalog(client: HbarClient) {
  return client.call('command.catalog', { category: 'workspace.organization', limit: 10 })
}

test('lost real WS acknowledgement is reconciled by exact read-only actor-scoped receipt', async () => {
  const { firstClient, second, first, workspace, firstDevice } = await fixture()
  let writes = 0
  const lossy: ClientTransport = {
    async call(method, params) {
      const result = await firstClient.call(method, params)
      if (method === 'command.execute' && 'commandId' in params && params.commandId === 'workspaceOrganization.apply') {
        writes++
        throw new HbarError('DISCONNECTED', 'Injected lost acknowledgement after real Host commit')
      }
      return result
    },
  }
  const commands = createWorkspaceSessionCommandClient(lossy)
  const request = hide(workspace.id)
  expect(await failureCode(commands.execute('workspaceOrganization.apply', request))).toBe('INVALID_INPUT')
  expect(writes).toBe(0)
  expect(
    await failureCode(commands.execute('workspaceOrganization.apply', request, { idempotencyKey: 'lost-ack' })),
  ).toBe('RESULT_UNKNOWN')
  const receipt = await commands.execute('workspaceOrganization.receipt', { idempotencyKey: 'lost-ack', request })
  expect(receipt).toMatchObject({ revision: 1, changed: true, request })
  expect(writes).toBe(1)
  expect(
    await second.execute(
      'workspaceOrganization.receipt',
      { idempotencyKey: 'lost-ack', request },
      { actorId: firstDevice.device.id },
    ),
  ).toBeNull()
  expect(
    await failureCode(
      first.execute('workspaceOrganization.receipt', { idempotencyKey: 'lost-ack', request: hide('wrong-workspace') }),
    ),
  ).toBe('IDEMPOTENCY_CONFLICT')
  expect(await commands.execute('workspaceOrganization.receipt', { idempotencyKey: 'never-sent', request })).toBeNull()
  expect(writes).toBe(1)
  expect((await first.execute('workspaceOrganization.get', {})).revision).toBe(1)
})

test('organization survives real Kernel/Host identity and port changes while other data roots remain isolated', async () => {
  const { options, kernel, host, first, workspace, firstDevice, firstClient, secondClient } = await fixture()
  const request = hide(workspace.id)
  const receipt = await first.execute('workspaceOrganization.apply', request, { idempotencyKey: 'restart-hide' })
  const previousId = kernel.instanceId
  const previousPort = host.server.port
  firstClient.disconnect()
  secondClient.disconnect()
  await host.close()
  await kernel.close()
  // Replace the first fixture's already-closed connection/Host/Kernel cleanup callbacks.
  cleanups.splice(1)
  const reopened = await Kernel.create(options)
  cleanups.push(() => reopened.close())
  const newHost = await startServer(reopened, { port: 0 })
  cleanups.push(() => newHost.close())
  const client = new HbarClient(`http://127.0.0.1:${newHost.server.port}`, firstDevice.token)
  cleanups.push(async () => client.disconnect())
  await client.connect()
  const recovered = createWorkspaceSessionCommandClient(client)
  expect(reopened.instanceId).not.toBe(previousId)
  expect(newHost.server.port).not.toBe(previousPort)
  expect(await recovered.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 1,
    hiddenWorkspaceIds: [workspace.id],
  })
  expect(await recovered.execute('workspaceOrganization.receipt', { idempotencyKey: 'restart-hide', request })).toEqual(
    receipt,
  )
  expect(await recovered.execute('workspaceOrganization.apply', request, { idempotencyKey: 'restart-hide' })).toEqual(
    receipt,
  )
  const independent = await fixture()
  expect(await independent.first.execute('workspaceOrganization.get', {})).toEqual({
    schemaVersion: 1,
    revision: 0,
    hiddenWorkspaceIds: [],
  })
})

test('unauthenticated and revoked clients cannot read or mutate workspace organization', async () => {
  const { baseUrl, firstClient, secondClient, secondDevice, workspace, first } = await fixture()
  const unauthenticated = new HbarClient(baseUrl)
  cleanups.push(async () => unauthenticated.disconnect())
  expect(await failureCode(unauthenticated.connect())).toBe('UNAUTHORIZED')
  await firstClient.call('device.revoke', { id: secondDevice.device.id })
  expect(
    await failureCode(
      createWorkspaceSessionCommandClient(secondClient).execute('workspaceOrganization.apply', hide(workspace.id), {
        idempotencyKey: 'revoked',
      }),
    ),
  ).toBeDefined()
  expect((await first.execute('workspaceOrganization.get', {})).revision).toBe(0)
})

test('local organization reads and commits stay within the explicit interactive latency budget', async () => {
  const { first, workspace, kernel } = await fixture()
  const reads: number[] = []
  const writes: number[] = []
  for (let index = 0; index < 40; index++) {
    const readStart = performance.now()
    const snapshot = await first.execute('workspaceOrganization.get', {})
    reads.push(performance.now() - readStart)
    const expectedHidden = index % 2 === 1
    const writeStart = performance.now()
    const receipt = await first.execute(
      'workspaceOrganization.apply',
      {
        expectedRevision: snapshot.revision,
        change: { kind: 'setHidden', workspaceId: workspace.id, expectedHidden, hidden: !expectedHidden },
      },
      { idempotencyKey: `latency-${index}` },
    )
    writes.push(performance.now() - writeStart)
    expect(receipt.revision).toBe(index + 1)
  }
  const summarize = (samples: number[]) => {
    const sorted = [...samples].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
    const max = sorted.at(-1)
    if (p95 === undefined || max === undefined) throw new Error('Latency samples missing')
    return { samples: samples.length, p95, max }
  }
  const result = { reads: summarize(reads), writes: summarize(writes) }
  // Test ceiling tolerates loaded CI; the documented local interactive target is p95 <100ms.
  expect(result.reads.p95).toBeLessThan(1_000)
  expect(result.writes.p95).toBeLessThan(1_000)
  expect(kernel.active.size).toBe(0)
  console.info('workspace-organization latency (ms)', JSON.stringify(result))
})

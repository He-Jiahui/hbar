import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeCommand } from '@hbar/commands'
import { HbarClient, createSessionLaunchTargetPreparationManager, createSessionLaunchTargetReader } from '@hbar/client'
import { Kernel, MemorySecrets, createSessionLaunchTargetCommands } from '@hbar/kernel'
import { sessionLaunchTargetCommands } from '@hbar/contracts/commands/session-launch-target'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-launch-target-host-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  cleanups.push(() => kernel.close())
  const host = await startServer(kernel, { port: 0 })
  cleanups.push(() => host.close())
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
  })
  await client.pair(host.pairing.code, 'session launch target test')
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Host fixture workspace missing')
  const session = await kernel.createSession(workspace.id, 'launch target')
  return { root, kernel, host, client, workspace, session }
}

function execute(client: HbarClient, commandId: string, input: unknown, idempotencyKey?: string) {
  return client.call('command.execute', {
    protocol: 1,
    requestId: crypto.randomUUID(),
    commandId,
    commandVersion: 3,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    input,
  })
}

test('public Host command validates a revisioned selection, supports receipt reconciliation, and exposes no path', async () => {
  const f = await fixture()
  for (const definition of Object.values(sessionLaunchTargetCommands)) {
    expect(describeCommand(definition).metadata).toMatchObject({
      version: 3,
      execution: 'host',
      scope: 'session',
      owner: 'hbar.session-launch-target',
      visibility: 'internal',
      surfaces: ['api'],
    })
  }

  const targetReader = createSessionLaunchTargetReader(f.client)
  expect(await targetReader.read(f.session.id)).toMatchObject({
    sessionId: f.session.id,
    workspaceId: f.workspace.id,
    revision: 0,
    selection: { mode: 'shared-current' },
    locked: false,
  })
  const request = {
    sessionId: f.session.id,
    expectedRevision: 0,
    selection: { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: 'refs/heads/main' } },
  }
  const receipt = await execute(f.client, 'sessionLaunchTarget.set', request, 'select-launch-target')
  expect(receipt).toMatchObject({ request, revision: 1, changed: true })
  expect(
    await execute(f.client, 'sessionLaunchTarget.receipt', {
      sessionId: f.session.id,
      idempotencyKey: 'select-launch-target',
    }),
  ).toEqual(receipt)
  expect(await targetReader.read(f.session.id)).toMatchObject({
    revision: 1,
    selection: request.selection,
    locked: false,
  })

  const invalidPath = await f.client
    .call('command.execute', {
      protocol: 1,
      requestId: crypto.randomUUID(),
      commandId: 'sessionLaunchTarget.set',
      commandVersion: 3,
      idempotencyKey: 'untrusted-path',
      input: {
        sessionId: f.session.id,
        expectedRevision: 1,
        selection: { mode: 'isolated-worktree', path: 'D:/untrusted', branch: { kind: 'existing', name: 'main' } },
      },
    })
    .then(
      () => null,
      (error: unknown) => error,
    )
  expect(invalidPath).toMatchObject({ code: 'INVALID_INPUT' })
  const oldVersion = await f.client
    .call('command.execute', {
      protocol: 1,
      requestId: crypto.randomUUID(),
      commandId: 'sessionLaunchTarget.get',
      commandVersion: 1,
      input: { sessionId: f.session.id },
    })
    .then(
      () => null,
      (error: unknown) => error,
    )
  expect(oldVersion).toMatchObject({ code: 'VERSION_MISMATCH' })
})

test('typed Client preparation manager drives the additive Host API without accepting a Run', async () => {
  const f = await fixture()
  const manager = createSessionLaunchTargetPreparationManager(f.client)
  expect(await manager.readTarget(f.session.id)).toMatchObject({ revision: 0, selection: { mode: 'shared-current' } })

  const selectionInput = {
    sessionId: f.session.id,
    expectedRevision: 0,
    selection: { mode: 'shared-current' as const },
  }
  const selectionReceipt = await manager.setSelection(selectionInput, { idempotencyKey: 'typed-select-shared' })
  expect(selectionReceipt).toMatchObject({ request: selectionInput, changed: false, revision: 0 })
  expect(
    await manager.readSelectionReceipt({ sessionId: f.session.id, idempotencyKey: 'typed-select-shared' }),
  ).toEqual(selectionReceipt)

  const startInput = { sessionId: f.session.id, expectedRevision: 0 }
  const startReceipt = await manager.startPreparation(startInput, { idempotencyKey: 'typed-prepare-shared' })
  expect(startReceipt).toMatchObject({ sessionId: f.session.id, workspaceId: f.workspace.id, targetRevision: 0 })
  expect(Object.keys(startReceipt).sort()).toEqual(['operationId', 'sessionId', 'targetRevision', 'workspaceId'])
  const identity = {
    sessionId: f.session.id,
    expectedRevision: 0,
    operationId: startReceipt.operationId,
  }
  let snapshot = await manager.readPreparation(identity)
  const deadline = Date.now() + 5_000
  while (snapshot.status !== 'ready' && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
    snapshot = await manager.readPreparation(identity)
  }
  expect(snapshot).toMatchObject({ schemaVersion: 1, status: 'ready', targetRevision: 0 })
  expect(snapshot).not.toHaveProperty('targetPath')
  expect(snapshot).not.toHaveProperty('selection')
  expect(await manager.cancelPreparation(identity, { idempotencyKey: 'typed-cancel-ready' })).toMatchObject({
    status: 'ready',
  })
  expect(await manager.reconcilePreparation(identity, { idempotencyKey: 'typed-reconcile-ready' })).toMatchObject({
    status: 'ready',
  })
  expect(await manager.readTarget(f.session.id)).toMatchObject({ resolution: { status: 'ready' }, locked: false })
  const db = new Database(f.kernel.options.layout.database, { strict: true })
  try {
    expect(
      db.query<{ count: number }, [string]>('SELECT COUNT(*) AS count FROM runs WHERE sessionId=?').get(f.session.id)
        ?.count,
    ).toBe(0)
  } finally {
    db.close()
  }
})

test('target mutation during an active async preparation is a typed precommit BUSY rejection', async () => {
  const f = await fixture()
  await f.kernel.storage.call('startSessionLaunchTargetPreparation', {
    actorId: 'test-actor',
    idempotencyKey: 'seed-active-preparation',
    sessionId: f.session.id,
    expectedRevision: 0,
  })
  const request = {
    sessionId: f.session.id,
    expectedRevision: 0,
    selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/fenced' } },
  }
  const error = await execute(f.client, 'sessionLaunchTarget.set', request, 'blocked-target-change').then(
    () => null,
    (failure: unknown) => failure,
  )
  expect(error).toMatchObject({ code: 'BUSY' })
  expect(await createSessionLaunchTargetReader(f.client).read(f.session.id)).toMatchObject({
    revision: 0,
    selection: { mode: 'shared-current' },
  })
  expect(
    await execute(f.client, 'sessionLaunchTarget.receipt', {
      sessionId: f.session.id,
      idempotencyKey: 'blocked-target-change',
    }),
  ).toBeNull()
})

test('launch target catalog forwards internal authorization descriptors and every registry filter', async () => {
  const f = await fixture()
  const service = createSessionLaunchTargetCommands(f.kernel, () => {})
  try {
    expect(service.list().items).toHaveLength(0)
    expect(service.list({ includeInternal: false }).items).toHaveLength(0)
    const all = service.list({ includeInternal: true })
    const ids = Object.keys(sessionLaunchTargetCommands).sort()
    expect(all.items.map((item) => item.metadata.id)).toEqual(ids)
    expect(all.items).toHaveLength(10)
    expect(all.items.find((item) => item.metadata.id === 'sessionLaunchTarget.set')?.metadata).toMatchObject({
      visibility: 'internal',
      scope: 'session',
      stateEffect: 'persistent',
      idempotency: 'required',
    })
    const first = service.list({ includeInternal: true, limit: 2 })
    expect(first.items.map((item) => item.metadata.id)).toEqual(ids.slice(0, 2))
    expect(first.nextCursor).toBe(ids[1])
    if (first.nextCursor === undefined) throw new Error('LAUNCH_TARGET_CATALOG_CURSOR_MISSING')
    expect(
      service.list({ includeInternal: true, after: first.nextCursor, limit: 2 }).items.map((item) => item.metadata.id),
    ).toEqual(ids.slice(2, 4))
    expect(service.list({ includeInternal: true, category: 'workspace', surface: 'api' }).items).toHaveLength(10)
    expect(
      service.list({ includeInternal: true, category: 'workspace.session-launch-target', surface: 'api' }).items,
    ).toHaveLength(10)
    expect(service.list({ includeInternal: true, category: 'unknown' }).items).toHaveLength(0)
    expect(service.list({ includeInternal: true, surface: 'cli' }).items).toHaveLength(0)
    expect(() => service.list({ includeInternal: true, limit: 501 })).toThrow()
    const manager = createSessionLaunchTargetPreparationManager(f.client)
    expect(await manager.readTarget(f.session.id)).toMatchObject({ revision: 0 })
    const request = {
      sessionId: f.session.id,
      expectedRevision: 0,
      selection: { mode: 'isolated-worktree' as const, branch: { kind: 'new' as const, name: 'catalog-target' } },
    }
    const receipt = await manager.setSelection(request, { idempotencyKey: 'catalog-target-selection' })
    expect(receipt).toMatchObject({ request, revision: 1, changed: true })
    expect(await manager.readTarget(f.session.id)).toMatchObject({ revision: 1, selection: request.selection })
    expect(
      await manager.readSelectionReceipt({ sessionId: f.session.id, idempotencyKey: 'catalog-target-selection' }),
    ).toEqual(receipt)
    expect(service.list().items).toHaveLength(0)
  } finally {
    service.dispose()
  }
})

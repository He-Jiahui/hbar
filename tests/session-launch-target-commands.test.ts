import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeCommand } from '@hbar/commands'
import { HbarClient, createSessionLaunchTargetReader } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
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

function execute(
  client: HbarClient,
  commandId: string,
  input: unknown,
  idempotencyKey?: string,
) {
  return client.call('command.execute', {
    protocol: 1,
    requestId: crypto.randomUUID(),
    commandId,
    commandVersion: 1,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    input,
  })
}

test('public Host command validates a revisioned selection, supports receipt reconciliation, and exposes no path', async () => {
  const f = await fixture()
  for (const definition of Object.values(sessionLaunchTargetCommands)) {
    expect(describeCommand(definition).metadata).toMatchObject({
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
    selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/launch', startPoint: 'main' } },
  }
  const receipt = await execute(f.client, 'sessionLaunchTarget.set', request, 'select-launch-target')
  expect(receipt).toMatchObject({ request, revision: 1, changed: true })
  expect(await execute(f.client, 'sessionLaunchTarget.receipt', {
    sessionId: f.session.id,
    idempotencyKey: 'select-launch-target',
  })).toEqual(receipt)
  expect(await targetReader.read(f.session.id)).toMatchObject({
    revision: 1,
    selection: request.selection,
    locked: false,
  })

  const invalidPath = await f.client.call('command.execute', {
    protocol: 1,
    requestId: crypto.randomUUID(),
    commandId: 'sessionLaunchTarget.set',
    commandVersion: 1,
    idempotencyKey: 'untrusted-path',
    input: {
      sessionId: f.session.id,
      expectedRevision: 1,
      selection: { mode: 'isolated-worktree', path: 'D:/untrusted', branch: { kind: 'existing', name: 'main' } },
    },
  }).then(() => null, (error: unknown) => error)
  expect(invalidPath).toMatchObject({ code: 'INVALID_INPUT' })
})

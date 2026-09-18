import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, registerSurfaceClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'
import { parseCli } from '../apps/cli/src/args.ts'
import { runSurfaceRelayCommand } from '../apps/cli/src/commands.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-surface-relay-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const url = `http://127.0.0.1:${host.server.port}`
  const caller = new HbarClient(url)
  await caller.pair(host.pairing.code, 'surface caller')
  const targets: HbarClient[] = []
  const target = async (name: string) => {
    const device = await host.auth.createDevice(name)
    const client = new HbarClient(url, device.token)
    await client.connect()
    targets.push(client)
    return client
  }
  cleanups.push(async () => {
    caller.disconnect()
    for (const client of targets) client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  return { caller, target }
}

test('Host relays surface commands to one client generation with retry and replacement semantics', async () => {
  const { caller, target } = await fixture()
  const firstClient = await target('first GUI')
  let firstCalls = 0
  let releaseSlow: (value: unknown) => void = () => undefined
  const slow = new Promise<unknown>((resolve) => {
    releaseSlow = resolve
  })
  const first = await registerSurfaceClient(firstClient, {
    clientId: 'gui-main',
    generation: 1,
    commands: ['app.openPanel'],
    async execute(_commandId, input) {
      firstCalls++
      return (input as { panelId?: string }).panelId === 'slow' ? slow : { generation: 1, input }
    },
  })
  expect(await caller.call('surface.list', {})).toEqual({
    items: [{ clientId: 'gui-main', generation: 1, commands: ['app.openPanel'] }],
  })
  const cliOutput: unknown[] = []
  await runSurfaceRelayCommand(
    parseCli([
      'exec',
      'app.openPanel',
      'files',
      '--client',
      'gui-main',
      '--invocation-id',
      'cli-open',
      '--session',
      's1',
    ]),
    caller,
    (value) => cliOutput.push(value),
  )
  expect(cliOutput).toEqual([{ generation: 1, input: { panelId: 'files', sessionId: 's1', binding: 'followActive' } }])
  const request = {
    clientId: 'gui-main',
    invocationId: 'open-files',
    commandId: 'app.openPanel',
    input: { panelId: 'files' },
    timeoutMs: 1_000,
  }
  const accepted = await caller.call('surface.invoke', request)
  expect(accepted).toEqual({ generation: 1, input: { panelId: 'files' } })
  expect(await caller.call('surface.invoke', request)).toEqual(accepted)
  expect(firstCalls).toBe(2)
  await expect(caller.call('surface.invoke', { ...request, input: { panelId: 'other' } })).rejects.toThrow(
    'already used',
  )
  await expect(
    caller.call('surface.invoke', {
      ...request,
      invocationId: 'unsupported',
      commandId: 'app.openWindow',
      input: { windowId: 'w', page: { kind: 'status', params: {} } },
    }),
  ).rejects.toThrow('did not publish')

  const secondClient = await target('replacement GUI')
  const pending = caller.call('surface.invoke', {
    ...request,
    invocationId: 'slow-open',
    input: { panelId: 'slow' },
    timeoutMs: 2_000,
  })
  const pendingOutcome = pending.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  for (let attempt = 0; attempt < 100 && firstCalls < 3; attempt++) await Bun.sleep(5)
  expect(firstCalls).toBe(3)
  const second = await registerSurfaceClient(secondClient, {
    clientId: 'gui-main',
    generation: 2,
    commands: ['app.openPanel'],
    async execute(_commandId, input) {
      return { generation: 2, input }
    },
  })
  const interrupted = await pendingOutcome
  if (!('error' in interrupted)) throw new Error('Expected replaced invocation to fail')
  expect(interrupted.error).toBeInstanceOf(Error)
  expect((interrupted.error as Error).message).toContain('generation was replaced')
  releaseSlow({ generation: 1 })
  await first.dispose()
  expect(await caller.call('surface.list', {})).toEqual({
    items: [{ clientId: 'gui-main', generation: 2, commands: ['app.openPanel'] }],
  })
  expect(
    await caller.call('surface.invoke', {
      ...request,
      invocationId: 'after-replacement',
      input: { panelId: 'status' },
    }),
  ).toEqual({ generation: 2, input: { panelId: 'status' } })
  await second.dispose()
  await expect(caller.call('surface.invoke', { ...request, invocationId: 'after-close' })).rejects.toThrow(
    'not connected',
  )
})

test('surface relay reports a bounded target timeout', async () => {
  const { caller, target } = await fixture()
  const client = await target('slow GUI')
  const registration = await registerSurfaceClient(client, {
    clientId: 'gui-slow',
    generation: 1,
    commands: ['app.openPanel'],
    execute: () => new Promise(() => undefined),
  })
  await expect(
    caller.call('surface.invoke', {
      clientId: 'gui-slow',
      invocationId: 'timeout',
      commandId: 'app.openPanel',
      input: { panelId: 'files' },
      timeoutMs: 100,
    }),
  ).rejects.toThrow('timed out')
  await registration.dispose()
})

test('surface relay fails an in-flight invocation when its exact target disconnects', async () => {
  const { caller, target } = await fixture()
  const client = await target('disconnecting GUI')
  await registerSurfaceClient(client, {
    clientId: 'gui-disconnect',
    generation: 1,
    commands: ['app.openPanel'],
    execute: () => new Promise(() => undefined),
  })
  const outcome = caller
    .call('surface.invoke', {
      clientId: 'gui-disconnect',
      invocationId: 'disconnect',
      commandId: 'app.openPanel',
      input: { panelId: 'files' },
      timeoutMs: 5_000,
    })
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )
  await Bun.sleep(20)
  client.disconnect()
  const interrupted = await outcome
  if (!('error' in interrupted)) throw new Error('Expected disconnected invocation to fail')
  expect((interrupted.error as Error).message).toContain('disconnected')
})

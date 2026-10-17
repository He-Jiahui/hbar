import { expect, test } from 'bun:test'
import { IpcPeer, procedure, runtimeDomainError } from '@hbar/runtime'
import { nodeRegistryStateMethods } from '@hbar/contracts/node-registry'
import { runtimeNodeManagementMethods } from '../apps/host/src/runtime-node-link-contract'
import { create } from '../apps/host/src/runtime-node-link-process'
function deferred() {
  let release: () => void = () => {
    throw new Error('Deferred missing')
  }
  const promise = new Promise<void>((done) => {
    release = done
  })
  return { promise, release }
}
async function rejectedCode(operation: Promise<unknown>) {
  try {
    await operation
    return null
  } catch (error) {
    return runtimeDomainError(error)?.code ?? 'UNCLASSIFIED'
  }
}
function fixture(held = false) {
  const owner = { unitId: 'node-link', generation: 1, incarnation: 'extra-node' },
    remote = { unitId: 'base', generation: 1, incarnation: 'extra-parent' }
  let receiver: IpcPeer | undefined,
    preparing = false,
    entered = 0
  const host = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => receiver?.receive(frame) } })
  const child = new IpcPeer({ owner, remote, transport: { send: (frame) => host.receive(frame) } })
  receiver = child
  const gate = deferred(),
    started = deferred(),
    definition = nodeRegistryStateMethods['identity.ensure']
  host.register(
    'nodeLink.registry.identity.ensure',
    procedure(definition.input, definition.output, async (input) => {
      entered++
      started.release()
      if (held) await gate.promise
      return input
    }),
  )
  const service = create({ peer: child, configuration: {}, preparing: () => preparing, purpose: 'startup' })
  return {
    host,
    child,
    service,
    gate,
    started,
    get entered() {
      return entered
    },
    setPreparing(value: boolean) {
      preparing = value
    },
    async close() {
      gate.release()
      try {
        await service.dispose()
      } finally {
        child.close()
        host.close()
      }
    },
  }
}
test('simultaneous activate rejects the second initializer before another identity acquisition', async () => {
  const f = fixture(true),
    first = f.service.activate('default')
  let second: Promise<string | null> | undefined
  try {
    await f.started.promise
    second = rejectedCode(f.service.activate('default'))
    // Releasing the real handler lets an unfixed duplicate settle too, avoiding a deadlocked RED fixture.
    f.gate.release()
    expect(await second).toBe('RUNTIME_LIFECYCLE')
    await first
    expect(f.entered).toBe(1)
    if (!f.service.idle) throw new Error('Actual idle missing')
    expect((await f.service.idle()).eligible).toBe(true)
  } finally {
    f.gate.release()
    await first.catch(() => {})
    if (second) await second
    await f.close()
  }
})
for (const retirement of ['dispose', 'drain'] as const)
  test(`${retirement} while activating prevents late identity reply from reopening admission`, async () => {
    const f = fixture(true),
      activation = rejectedCode(f.service.activate('default'))
    try {
      await f.started.promise
      if (retirement === 'dispose') await f.service.dispose()
      else await f.service.drain()
      if (!f.service.idle) throw new Error('Actual idle missing')
      expect((await f.service.idle()).resources).toBeGreaterThan(0)
      f.gate.release()
      expect(await activation).toBe('RUNTIME_LIFECYCLE')
      expect(
        await rejectedCode(
          f.host.call('nodeLink.invite', { name: 'no-late-admission' }, runtimeNodeManagementMethods.invite.output),
        ),
      ).toBe('NODE_LINK_UNAVAILABLE')
      expect((await f.service.idle()).eligible).toBe(false)
      expect((await f.service.idle()).resources).toBe(0)
      expect(await rejectedCode(f.service.activate('default'))).toBe('RUNTIME_LIFECYCLE')
    } finally {
      f.gate.release()
      await activation
      await f.close()
    }
  })
test('draining an uninitialized owner permanently prevents initialization', async () => {
  const f = fixture()
  try {
    await f.service.drain()
    expect(await rejectedCode(f.service.activate('default'))).toBe('RUNTIME_LIFECYCLE')
    expect(f.entered).toBe(0)
    if (!f.service.idle) throw new Error('Actual idle missing')
    expect((await f.service.idle()).eligible).toBe(false)
  } finally {
    await f.close()
  }
})

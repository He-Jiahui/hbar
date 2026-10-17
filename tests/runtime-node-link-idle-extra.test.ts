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
test('real service eligibility preserves preparation, unsupported role, drained admission and terminal dispose boundaries', async () => {
  const f = fixture()
  try {
    if (!f.service.idle) throw new Error('Actual idle missing')
    expect((await f.service.idle()).eligible).toBe(false)
    await f.service.activate('draining')
    expect((await f.service.idle()).eligible).toBe(false)
    expect(f.entered).toBe(0)
    await f.service.activate('default')
    expect((await f.service.idle()).eligible).toBe(true)
    f.setPreparing(true)
    expect((await f.service.idle()).eligible).toBe(false)
    f.setPreparing(false)
    expect((await f.service.idle()).eligible).toBe(true)
    await f.service.drain()
    expect(
      await rejectedCode(
        f.host.call('nodeLink.invite', { name: 'rejected-after-drain' }, runtimeNodeManagementMethods.invite.output),
      ),
    ).toBe('NODE_LINK_UNAVAILABLE')
    expect((await f.service.idle()).eligible).toBe(true)
    expect(await rejectedCode(f.service.activate('default'))).toBe('RUNTIME_LIFECYCLE')
    await f.service.dispose()
    expect((await f.service.idle()).eligible).toBe(false)
    expect(await rejectedCode(f.service.activate('default'))).toBe('RUNTIME_LIFECYCLE')
  } finally {
    await f.close()
  }
})
test('actual identity IPC retains physicalStateCalls until the real handler replies', async () => {
  const f = fixture(true),
    activation = f.service.activate('default')
  try {
    await f.started.promise
    if (!f.service.idle) throw new Error('Actual idle missing')
    const pending = await f.service.idle()
    expect(pending.eligible).toBe(false)
    expect(pending.resources).toBeGreaterThan(0)
    expect(f.entered).toBe(1)
    f.gate.release()
    await activation
    expect(await f.service.idle()).toMatchObject({ eligible: true, requests: 0, runs: 0, resources: 0 })
  } finally {
    f.gate.release()
    await activation.catch(() => {})
    await f.close()
  }
})

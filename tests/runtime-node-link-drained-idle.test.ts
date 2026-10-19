import { expect, test } from 'bun:test'
import { IpcPeer, procedure } from '@hbar/runtime'
import { nodeRegistryStateMethods } from '@hbar/contracts/node-registry'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import {
  NODE_LINK_RUNTIME_FINGERPRINT,
  runtimeNodeManagementMethods,
} from '../apps/host/src/runtime-node-link-contract'
import { create } from '../apps/host/src/runtime-node-link-process'
test('quiet real NodeLink service remains idle eligible after lifecycle drain', async () => {
  const parent = { unitId: 'base', generation: 1, incarnation: 'parent' },
    owner = { unitId: 'node-link', generation: 1, incarnation: 'node' }
  let receiver: IpcPeer | undefined
  const host = new IpcPeer({ owner: parent, remote: owner, transport: { send: (frame) => receiver?.receive(frame) } })
  const child = new IpcPeer({ owner, remote: parent, transport: { send: (frame) => host.receive(frame) } })
  receiver = child
  // Actual generated registry identity is validated, returned locally, never logged or persisted.
  const definition = nodeRegistryStateMethods['identity.ensure']
  host.register(
    'nodeLink.registry.identity.ensure',
    procedure(definition.input, definition.output, (input) => input),
  )
  const service = create({ peer: child, configuration: {}, preparing: () => false, purpose: 'startup' })
  try {
    await service.prepare({
      descriptor: {
        id: 'node-link',
        kind: 'resources',
        isolation: 'process',
        dependencies: [],
        required: true,
        reloadable: true,
        contractFingerprint: NODE_LINK_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
      },
      configuration: {},
    })
    if (!service.idle) throw new Error('Missing actual idle endpoint')
    expect((await service.idle()).eligible).toBe(false)
    await service.activate('draining')
    expect((await service.idle()).eligible).toBe(false)
    await service.activate('default')
    if (!service.idle) throw new Error('Missing actual idle endpoint')
    expect(await service.idle()).toMatchObject({ eligible: true, requests: 0, runs: 0, resources: 0 })
    expect(await service.drain()).toEqual({ requests: 0, runs: 0, resources: 0 })
    expect(await service.idle()).toMatchObject({ eligible: true, requests: 0, runs: 0, resources: 0 })
    let rejected = false
    try {
      await host.call('nodeLink.invite', { name: 'must-not-admit' }, runtimeNodeManagementMethods.invite.output)
    } catch {
      rejected = true
    }
    expect(rejected).toBe(true)
    await service.dispose()
    expect((await service.idle()).eligible).toBe(false)
  } finally {
    try {
      await service.dispose()
    } finally {
      child.close()
      host.close()
    }
  }
})

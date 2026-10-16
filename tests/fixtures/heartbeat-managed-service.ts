import type { RuntimeProcessContext } from '@hbar/runtime'
import { procedure } from '@hbar/runtime'
import { z } from 'zod'
export function create(context: RuntimeProcessContext) {
  context.peer.register(
    'fixture.blockChild',
    procedure(z.unknown(), z.undefined(), () => {
      setTimeout(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 9000), 100)
    }),
  )
  context.peer.register(
    'fixture.wait',
    procedure(z.unknown(), z.undefined(), async () => {
      await Bun.sleep(7000)
    }),
  )
  return {
    prepare: async (input: { descriptor: { contractFingerprint: string; storageSchema: number } }) => ({
      contractFingerprint: input.descriptor.contractFingerprint,
      storageSchema: input.descriptor.storageSchema,
      capabilities: [],
    }),
    activate: async () => {
      if (context.configuration.mode !== 'ack') return
      // Fixture-only intercept of inbound ACK delivery after activation; no payload retention.
      setTimeout(() => {
        const listeners = process.listeners('message')
        process.removeAllListeners('message')
        process.on('message', (frame: unknown) => {
          const deliver = () => {
            for (const listener of listeners) Reflect.apply(listener, process, [frame])
          }
          if (frame && typeof frame === 'object' && 'kind' in frame && frame.kind === 'ack') setTimeout(deliver, 2500)
          else deliver()
        })
      }, 500)
    },
    drain: async () => ({ requests: 0, runs: 0, resources: 0 }),
    dispose: async () => {},
  }
}

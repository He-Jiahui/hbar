import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { z } from 'zod'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const settings = z
    .strictObject({ disposeDelayMs: z.number().int().min(0).max(500).default(0) })
    .parse(context.configuration)
  let requests = 0
  context.peer.register(
    'fixture.callback',
    procedure(z.undefined(), z.undefined(), async () => {
      requests++
      try {
        await context.peer.call('fixture.parent', undefined, z.undefined())
      } finally {
        requests--
      }
    }),
  )
  context.peer.register(
    'fixture.echo',
    procedure(z.string(), z.string(), (value) => value),
  )
  return {
    prepare(input) {
      return Promise.resolve({
        contractFingerprint: input.descriptor.contractFingerprint,
        storageSchema: input.descriptor.storageSchema,
        capabilities: ['fixture.callback', 'fixture.echo'],
      })
    },
    activate() {
      return Promise.resolve()
    },
    drain() {
      return Promise.resolve({ requests, runs: 0, resources: 0 })
    },
    idle() {
      return { eligible: true, requests, runs: 0, resources: 0 }
    },
    async dispose() {
      if (settings.disposeDelayMs) await Bun.sleep(settings.disposeDelayMs)
    },
  }
}

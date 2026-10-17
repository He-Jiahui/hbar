import { type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { z } from 'zod'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  let probes = 0
  return {
    prepare(input) {
      return Promise.resolve({
        contractFingerprint: input.descriptor.contractFingerprint,
        storageSchema: input.descriptor.storageSchema,
        capabilities: [],
      })
    },
    activate() {
      return Promise.resolve()
    },
    drain() {
      return Promise.resolve({ requests: 0, runs: 0, resources: 0 })
    },
    async idle() {
      probes++
      await context.peer.notify('fixture.probeSample', probes)
      if (probes === 1) await context.peer.call('fixture.probeGate', undefined, z.undefined())
      return { eligible: true, requests: 0, runs: 0, resources: 0 }
    },
    dispose() {
      return Promise.resolve()
    },
  }
}

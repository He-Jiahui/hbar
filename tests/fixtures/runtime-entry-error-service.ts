import { HbarError } from '@hbar/contracts/errors'
import type { RuntimeProcessContext, RuntimeProcessService } from '@hbar/runtime'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  context.peer.register('fixture.domainError', {
    invoke: () => Promise.reject(new HbarError('FIXTURE_DOMAIN_ERROR', 'Public error survived runtime IPC')),
  })
  return {
    prepare(input) {
      return Promise.resolve({
        contractFingerprint: input.descriptor.contractFingerprint,
        storageSchema: input.descriptor.storageSchema,
        capabilities: ['fixture.domainError'],
      })
    },
    activate: () => Promise.resolve(),
    drain: () => Promise.resolve({ requests: 0, runs: 0, resources: 0 }),
    dispose: () => Promise.resolve(),
  }
}

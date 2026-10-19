import { z } from 'zod'
import { type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  return {
    async prepare() {
      return { contractFingerprint: 'a'.repeat(64), storageSchema: 1, capabilities: [] }
    },
    async activate() {
      for (let index = 0; index < 2; index++) {
        void context.peer
          .call('fixture.hold', { secret: 'TIMEOUT_INPUT_CANARY' }, z.unknown(), {
            timeoutMs: 80,
            requestId: `TIMEOUT_REQUEST_ID_CANARY-${index}`,
          })
          .catch(() => {})
      }
    },
    async drain() {
      return { runs: 0, requests: 0, resources: 0 }
    },
    async dispose() {},
  }
}

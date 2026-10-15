import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import type { RuntimeProcessContext, RuntimeProcessService } from '@hbar/runtime'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const mode = z.enum(['dispose-channel', 'uncaught']).parse(context.configuration.mode)
  return {
    async prepare() {
      return { contractFingerprint: 'a'.repeat(64), storageSchema: 1, capabilities: [] }
    },
    async activate() {
      if (mode === 'uncaught')
        setTimeout(() => {
          throw new Error('STOP_ERROR_MESSAGE_CANARY')
        }, 30)
    },
    async drain() {
      return { runs: 0, requests: 0, resources: 0 }
    },
    async dispose() {
      if (mode === 'dispose-channel') context.peer.close(new HbarError('IPC_PROTOCOL', 'STOP_ERROR_MESSAGE_CANARY'))
    },
  }
}

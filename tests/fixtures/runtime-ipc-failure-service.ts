import { z } from 'zod'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { create as createService } from './runtime-service'

/** The production entry/peer remain real; only this child-originated frame is intentionally invalid. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const service = createService(context)
  context.peer.register(
    'fixture.invalidChannelFrame',
    procedure(z.undefined(), z.undefined(), () => {
      if (!process.send) throw new Error('Expected the real Bun IPC channel')
      process.send({ kind: 'fixture-invalid-frame' })
    }),
  )
  return service
}

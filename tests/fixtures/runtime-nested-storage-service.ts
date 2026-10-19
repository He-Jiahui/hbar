import { z } from 'zod'
import { RuntimeValuePort, procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const values = new RuntimeValuePort(context.peer, { prefix: 'kernel.plugins' })
  const controller = new AbortController()
  let pending: Promise<PromiseSettledResult<number>[]> = Promise.resolve([])
  let outgoingPeak = 0,
    incomingPeak = 0,
    queuedPeak = 0
  const sample = () => {
    const state = context.peer.snapshot()
    outgoingPeak = Math.max(outgoingPeak, state.inFlight)
    incomingPeak = Math.max(incomingPeak, state.incoming)
    queuedPeak = Math.max(queuedPeak, state.queued)
  }
  let timer: ReturnType<typeof setInterval> | undefined
  const off = context.peer.onEvent('fixture.cancel', z.undefined(), () => controller.abort())
  context.peer.register(
    'fixture.begin',
    procedure(z.undefined(), z.undefined(), () => {
      timer = setInterval(sample, 1)
      pending = Promise.allSettled(
        Array.from({ length: 30 }, (_, index) =>
          values.call<number>(
            'invoke',
            [
              index,
              async () => {
                sample()
                const rows = await context.peer.call(
                  'kernel.storage',
                  { method: 'workspaces', args: [] },
                  z.array(z.unknown()),
                  { signal: controller.signal },
                )
                sample()
                if (rows.length !== 1) throw new Error('Real Storage fixture workspace missing')
                return index
              },
            ],
            { signal: controller.signal },
          ),
        ),
      )
    }),
  )
  context.peer.register(
    'fixture.result',
    procedure(
      z.undefined(),
      z.strictObject({
        fulfilled: z.number().int(),
        rejected: z.number().int(),
        values: z.array(z.number()),
        outgoingPeak: z.number().int(),
        incomingPeak: z.number().int(),
        queuedPeak: z.number().int(),
      }),
      async () => {
        const outcomes = await pending
        clearInterval(timer)
        sample()
        return {
          fulfilled: outcomes.filter((item) => item.status === 'fulfilled').length,
          rejected: outcomes.filter((item) => item.status === 'rejected').length,
          values: outcomes.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : [])),
          outgoingPeak,
          incomingPeak,
          queuedPeak,
        }
      },
    ),
  )
  context.peer.register(
    'fixture.state',
    procedure(z.undefined(), z.unknown(), () => context.peer.snapshot()),
  )
  return {
    async prepare() {
      return { contractFingerprint: 'a'.repeat(64), storageSchema: 1, capabilities: [] }
    },
    async activate() {},
    async drain() {
      return { runs: 0, requests: 0, resources: 0 }
    },
    async dispose() {
      controller.abort()
      clearInterval(timer)
      off()
      values.dispose()
    },
  }
}

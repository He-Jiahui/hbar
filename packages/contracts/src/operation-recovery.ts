import { z } from 'zod'
import { recoveryChainSchema, runRecoverySchema } from './runtime'
import type { SessionEvent } from './index'

const recordSchema = z.object({
  predecessorRunId: z.string(),
  recoveryId: z.string(),
  chain: recoveryChainSchema,
  run: z
    .object({ id: z.string(), sessionId: z.string(), requestId: z.string(), recovery: runRecoverySchema })
    .nullable(),
})
/** Extend only a validated continuation; manual rounds retain the same bounded recovery lineage. */
export function admitOperationRecovery(event: SessionEvent, ids: Set<string>): void {
  if (event.type !== 'run.recoveryQueued' && event.type !== 'run.recoveryPlanned') return
  const parsed = recordSchema.safeParse(event.data)
  if (!parsed.success || !parsed.data.run) return
  const { run, chain, predecessorRunId, recoveryId } = parsed.data
  if (!ids.has(predecessorRunId) && !ids.has(chain.rootRunId)) return
  if (
    ids.size >= 33 ||
    run.sessionId !== event.sessionId ||
    chain.sessionId !== event.sessionId ||
    run.recovery.predecessorRunId !== predecessorRunId ||
    run.recovery.rootRunId !== chain.rootRunId ||
    run.recovery.chainId !== chain.chainId ||
    run.recovery.recoveryId !== recoveryId ||
    run.requestId !== recoveryId
  )
    return
  ids.add(run.id)
}

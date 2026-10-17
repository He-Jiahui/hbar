import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeUnitSnapshot } from '@hbar/contracts/runtime'
import { kernelPluginQuiescenceSchema } from '@hbar/kernel/runtime-idle'
import type { ManagedIdleSnapshot } from '@hbar/runtime'

export interface RuntimePluginQuiescenceSource {
  readonly unitIds: readonly string[]
  readonly units: () => readonly RuntimeUnitSnapshot[]
  readonly probe: (owner: RuntimeOwner) => Promise<ManagedIdleSnapshot>
  /** Only Manager's exact physical + cleanup receipt qualifies a sleeping owner. */
  readonly retired: (owner: RuntimeOwner) => boolean
  readonly metadataOwner: (unitId: string) => RuntimeOwner | null
  /** Invalidation is meaningful: null can never be treated as an empty queue. */
  readonly queuedRuns: () => boolean | null
}

interface Selected {
  readonly owner: RuntimeOwner
  readonly sleeping: boolean
}

function sameOwner(left: RuntimeOwner, right: RuntimeOwner): boolean {
  return left.unitId === right.unitId && left.generation === right.generation && left.incarnation === right.incarnation
}

/** Pure parent proof. It never acquires demand or starts a sleeping plugin.
 * Live probes read actual counters; sleeping claims require retained exact receipts.
 */
export async function readRuntimePluginQuiescence(source: RuntimePluginQuiescenceSource) {
  if (source.unitIds.length > 128 || new Set(source.unitIds).size !== source.unitIds.length)
    throw new HbarError('RUNTIME_CAPACITY', 'Plugin quiescence coverage exceeds its bound')
  const select = (): Selected[] | null => {
    const units = source.units()
    const selected: Selected[] = []
    for (const unitId of source.unitIds) {
      const unit = units.find((value) => value.descriptor.id === unitId)
      if (
        !unit ||
        unit.idle?.checkpointPending ||
        unit.queuedArtifactId ||
        unit.generations.some((value) => value.role === 'candidate')
      )
        return null
      if (unit.idle?.phase === 'sleeping') {
        const owner = source.metadataOwner(unitId)
        if (!owner || owner.unitId !== unitId || !source.retired(owner)) return null
        selected.push({ owner, sleeping: true })
      } else {
        const current = unit.generations.find((value) => value.role === 'default' && value.phase === 'serving')
        if (!current || current.unitId !== unitId || (unit.idle && unit.idle.phase !== 'active')) return null
        selected.push({
          owner: { unitId, generation: current.generation, incarnation: current.incarnation },
          sleeping: false,
        })
      }
    }
    return selected
  }
  const before = select()
  if (!before)
    return kernelPluginQuiescenceSchema.parse({ coverage: 'unsupported', owners: [], queuedRuns: source.queuedRuns() })
  const proofs: Array<{ owner: RuntimeOwner; eligible: boolean; requests: number; runs: number; resources: number }> =
    []
  // At most one probe at a time: a counter query must not create a startup burst.
  for (const selected of before) {
    if (selected.sleeping) {
      proofs.push({ owner: selected.owner, eligible: true, requests: 0, runs: 0, resources: 0 })
      continue
    }
    let snapshot: ManagedIdleSnapshot
    try {
      snapshot = await source.probe(selected.owner)
    } catch {
      return kernelPluginQuiescenceSchema.parse({
        coverage: 'unsupported',
        owners: [],
        queuedRuns: source.queuedRuns(),
      })
    }
    if (!sameOwner(snapshot.owner, selected.owner) || !snapshot.child || !snapshot.parent)
      return kernelPluginQuiescenceSchema.parse({
        coverage: 'unsupported',
        owners: [],
        queuedRuns: source.queuedRuns(),
      })
    proofs.push({
      owner: selected.owner,
      eligible: snapshot.eligible,
      requests:
        snapshot.child.requests +
        snapshot.parent.inFlight +
        snapshot.parent.incoming +
        snapshot.parent.queued +
        snapshot.parent.incomingQueued,
      runs: Math.max(snapshot.runs, snapshot.child.runs),
      resources: snapshot.resources + snapshot.child.resources + Number(snapshot.parent.bufferedBytes > 0),
    })
  }
  const after = select()
  if (
    !after ||
    after.length !== before.length ||
    after.some((value, index) => {
      const previous = before[index]
      return !previous || previous.sleeping !== value.sleeping || !sameOwner(previous.owner, value.owner)
    })
  )
    return kernelPluginQuiescenceSchema.parse({ coverage: 'unsupported', owners: [], queuedRuns: source.queuedRuns() })
  return kernelPluginQuiescenceSchema.parse({ coverage: 'complete', owners: proofs, queuedRuns: source.queuedRuns() })
}

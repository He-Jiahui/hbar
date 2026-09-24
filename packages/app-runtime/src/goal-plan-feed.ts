import { goalPlanChangeSchema } from '@hbar/contracts/commands/goals'
import type { GoalPlanChange, GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import type { GoalPlanWorkspacePort } from './types'

type Watch = {
  sessionId: string
  loading: boolean
  reset: boolean
  versions: { goal: number; plan: number }
  latest: Map<GoalPlanChange['kind'], GoalPlanChange>
  close(): void
}

/** Two bounded entity facts bridge subscription/snapshot races; stream tokens never enter this feed. */
export class GoalPlanFeed {
  private watches = new Map<string, Watch>()
  constructor(
    private readonly port: GoalPlanWorkspacePort | undefined,
    private readonly deliver: (id: string, change: GoalPlanChange) => void,
    private readonly reset: (id: string) => void,
  ) {}

  open(id: string, sessionId: string) {
    const prior = this.watches.get(id)
    this.close(id)
    if (!this.port?.snapshot || !this.port.watch) return
    const current: Watch = {
      sessionId,
      loading: true,
      reset: false,
      versions: { goal: -1, plan: -1 },
      latest: prior?.sessionId === sessionId ? new Map(prior.latest) : new Map<GoalPlanChange['kind'], GoalPlanChange>(),
      close: () => {},
    }
    this.watches.set(id, current)
    current.close = this.port.watch(sessionId, (update) => {
      if (this.watches.get(id) !== current) return
      if (update.kind === 'reset') {
        if (current.loading) current.reset = true
        else this.reset(id)
        return
      }
      const parsed = goalPlanChangeSchema.safeParse(update)
      if (!parsed.success) return
      const change = parsed.data
      if (
        change.sessionId !== sessionId ||
        (change.kind === 'goal' && change.goal && change.goal.threadId !== sessionId) ||
        (change.kind === 'plan' && change.plan && change.plan.sessionId !== sessionId)
      )
        return
      const previous = current.latest.get(change.kind)
      if (change.seq <= current.versions[change.kind] || (previous && change.seq <= previous.seq)) return
      current.latest.set(change.kind, change)
      if (current.loading) return
      current.versions[change.kind] = change.seq
      this.deliver(id, change)
    })
  }

  finish(id: string, snapshot: GoalPlanSnapshot) {
    const current = this.watches.get(id)
    if (!current || current.sessionId !== snapshot.sessionId) return
    current.versions = { goal: snapshot.goalSeq, plan: snapshot.planSeq }
    current.loading = false
    for (const change of current.latest.values()) {
      if (change.seq <= current.versions[change.kind]) continue
      current.versions[change.kind] = change.seq
      this.deliver(id, change)
    }
    if (current.reset) this.reset(id)
  }

  version(id: string) {
    return this.watches.get(id)?.versions.goal ?? -1
  }
  close(id: string) {
    const watch = this.watches.get(id)
    this.watches.delete(id)
    watch?.close()
  }
  dispose() {
    for (const id of this.watches.keys()) this.close(id)
  }
}

import { HbarError } from '@hbar/contracts'
import {
  EXECUTION_SLOT_LIMITS,
  executionActivityIdentitySchema,
  executionSlotsSnapshotSchema,
  type ExecutionActivityIdentity,
  type ExecutionActivityLease,
  type ExecutionSlotsSnapshot,
} from '@hbar/contracts/execution-slots'

interface Execution {
  readonly id: string
  readonly activities: Map<string, ExecutionActivityLease>
}
export interface ExecutionSlotsOptions {
  readonly capacity?: number
  readonly maxExecutions?: number
  readonly maxActivities?: number
  readonly maxPerExecution?: number
}

function limit(value: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new HbarError('INVALID_INPUT', `${label} requires an integer from 1 to ${maximum}`)
  return value
}

/** Shared capacity counts executions, with independent activity references for parallel model/tool work.
 * The caller authenticates execution IDs and releases references only after actual work settles.
 * Suspension is reserved for a confirmed wait; it does not cancel work or release Session ownership.
 */
export class ExecutionSlots {
  private capacity: number
  private revision = 0
  private readonly maxExecutions: number
  private readonly maxActivities: number
  private readonly maxPerExecution: number
  private readonly executions = new Map<string, Execution>()
  private readonly activities = new Map<string, ExecutionActivityLease>()
  private readonly active = new Set<string>()
  private readonly queue = new Map<string, Execution>()
  private readonly ready = new Set<string>()

  constructor(options: ExecutionSlotsOptions = {}) {
    this.capacity = limit(
      options.capacity ?? EXECUTION_SLOT_LIMITS.capacity,
      EXECUTION_SLOT_LIMITS.executions,
      'Execution capacity',
    )
    this.maxExecutions = limit(
      options.maxExecutions ?? EXECUTION_SLOT_LIMITS.executions,
      EXECUTION_SLOT_LIMITS.executions,
      'Execution count',
    )
    this.maxActivities = limit(
      options.maxActivities ?? EXECUTION_SLOT_LIMITS.activities,
      EXECUTION_SLOT_LIMITS.activities,
      'Activity count',
    )
    this.maxPerExecution = limit(
      options.maxPerExecution ?? EXECUTION_SLOT_LIMITS.perExecution,
      EXECUTION_SLOT_LIMITS.perExecution,
      'Activities per execution',
    )
  }

  reserve(raw: ExecutionActivityIdentity): Readonly<ExecutionActivityLease> {
    const input = executionActivityIdentitySchema.parse(raw)
    const prior = this.executions.get(input.executionId)
    const existing = prior?.activities.get(input.activityId)
    if (existing) return { ...existing }
    if (
      this.activities.size >= this.maxActivities ||
      (prior?.activities.size ?? 0) >= this.maxPerExecution ||
      (!prior && this.executions.size >= this.maxExecutions)
    )
      throw new HbarError(
        'EXECUTION_ACTIVITY_CAPACITY',
        'Execution activity capacity is full; retain the queued task until capacity is available',
      )
    const execution = prior ?? { id: input.executionId, activities: new Map<string, ExecutionActivityLease>() }
    const activity: ExecutionActivityLease = {
      ...input,
      id: crypto.randomUUID(),
      state: this.active.has(input.executionId) ? 'active' : 'queued',
    }
    execution.activities.set(input.activityId, activity)
    this.executions.set(execution.id, execution)
    this.activities.set(activity.id, activity)
    this.reconcile(execution)
    this.pump()
    this.revision++
    return { ...activity }
  }

  get(executionId: string, id: string): Readonly<ExecutionActivityLease> | null {
    const activity = this.activities.get(id)
    if (!activity) return null
    this.assertOwner(activity, executionId)
    return { ...activity }
  }

  suspend(executionId: string, id: string): Readonly<ExecutionActivityLease> {
    const { activity, execution } = this.require(executionId, id)
    if (activity.state === 'suspended') return { ...activity }
    activity.state = 'suspended'
    this.reconcile(execution)
    this.pump()
    this.revision++
    return { ...activity }
  }

  resume(executionId: string, id: string): Readonly<ExecutionActivityLease> {
    const { activity, execution } = this.require(executionId, id)
    if (activity.state !== 'suspended') return { ...activity }
    activity.state = this.active.has(executionId) ? 'active' : 'queued'
    this.reconcile(execution)
    this.pump()
    this.revision++
    return { ...activity }
  }

  release(executionId: string, id: string): boolean {
    const activity = this.activities.get(id)
    if (!activity) return false
    this.assertOwner(activity, executionId)
    const execution = this.executions.get(executionId)
    if (!execution) throw new HbarError('EXECUTION_ACTIVITY_STATE', 'The activity has no owning execution')
    execution.activities.delete(activity.activityId)
    this.activities.delete(id)
    this.reconcile(execution)
    this.pump()
    this.revision++
    return true
  }

  /** Owner-exit cleanup only, after the caller has confirmed physical termination. */
  releaseExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId)
    if (!execution) return false
    for (const activity of execution.activities.values()) this.activities.delete(activity.id)
    execution.activities.clear()
    this.reconcile(execution)
    this.pump()
    this.revision++
    return true
  }

  setCapacity(value: number): void {
    const capacity = limit(value, EXECUTION_SLOT_LIMITS.executions, 'Execution capacity')
    if (capacity === this.capacity) return
    this.capacity = capacity
    this.pump()
    this.revision++
  }

  /** Bounded notifications can be lost safely: reserve/get return the current admission state. */
  takeReady(): readonly string[] {
    const values = [...this.ready]
    this.ready.clear()
    return values
  }

  snapshot(): ExecutionSlotsSnapshot {
    let activeActivities = 0,
      queuedActivities = 0,
      suspendedActivities = 0
    for (const activity of this.activities.values()) {
      if (activity.state === 'active') activeActivities++
      else if (activity.state === 'queued') queuedActivities++
      else suspendedActivities++
    }
    return executionSlotsSnapshotSchema.parse({
      revision: this.revision,
      capacity: this.capacity,
      activeExecutions: this.active.size,
      queuedExecutions: this.queue.size,
      suspendedExecutions: this.executions.size - this.active.size - this.queue.size,
      activeActivities,
      queuedActivities,
      suspendedActivities,
    })
  }

  private assertOwner(activity: ExecutionActivityLease, executionId: string): void {
    if (activity.executionId !== executionId)
      throw new HbarError('EXECUTION_ACTIVITY_OWNER', 'The activity belongs to another execution')
  }
  private require(executionId: string, id: string) {
    const activity = this.activities.get(id)
    if (!activity) throw new HbarError('EXECUTION_ACTIVITY_NOT_FOUND', 'The original activity has already settled')
    this.assertOwner(activity, executionId)
    const execution = this.executions.get(executionId)
    if (!execution) throw new HbarError('EXECUTION_ACTIVITY_STATE', 'The activity has no owning execution')
    return { activity, execution }
  }
  private reconcile(execution: Execution): void {
    if ([...execution.activities.values()].some((activity) => activity.state === 'active')) {
      this.active.add(execution.id)
      this.queue.delete(execution.id)
      return
    }
    this.active.delete(execution.id)
    this.ready.delete(execution.id)
    if ([...execution.activities.values()].some((activity) => activity.state === 'queued')) {
      this.queue.set(execution.id, execution)
    } else {
      this.queue.delete(execution.id)
      if (!execution.activities.size) this.executions.delete(execution.id)
    }
  }
  private pump(): void {
    while (this.active.size < this.capacity) {
      const next = this.queue.entries().next().value
      if (!next) return
      const [id, execution] = next
      this.queue.delete(id)
      for (const activity of execution.activities.values()) if (activity.state === 'queued') activity.state = 'active'
      this.active.add(id)
      this.ready.add(id)
    }
  }
}

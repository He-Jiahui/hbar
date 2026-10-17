import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import { executionOwnershipSchema, type ExecutionOwnership } from '@hbar/contracts/runtime'
import type { IpcCallTicket } from './ipc'

interface Binding {
  ticket?: { suspendDeadline(): () => void }
  resume?: () => void
}
interface Scope {
  readonly key: string
  readonly execution: string
  readonly bindings: Set<Binding>
  waiting: number
}
const callIdSchema = z.string().min(1).max(160)
/** Local original-call bindings. The business owner must validate a human wait before suspending it. */
export class ExecutionDeadlines {
  private readonly scopes = new Map<string, Scope>()
  private readonly executions = new Map<string, { scopes: number; callbacks: number }>()
  private callbacks = 0

  async execute<Result>(
    execution: ExecutionOwnership,
    callId: string,
    dispatch: () => IpcCallTicket<Result>,
  ): Promise<Result> {
    const scope = this.scope(execution, callId)
    const owned = this.executions.get(scope.execution)
    if (!owned) throw new HbarError('RUNTIME_DEADLINE_STATE', 'The deadline owner is unavailable')
    if (this.callbacks >= 8192 || owned.callbacks >= 64) {
      this.clean(scope)
      throw new HbarError('BUSY', 'Execution callback deadline capacity is full')
    }
    const binding: Binding = {}
    scope.bindings.add(binding)
    this.callbacks++
    owned.callbacks++
    let ticket: IpcCallTicket<Result> | undefined
    try {
      ticket = dispatch()
      void ticket.result.catch(() => {})
      binding.ticket = ticket
      if (scope.waiting) binding.resume = ticket.suspendDeadline()
      return await ticket.settled
    } finally {
      // Logical failure never releases the original physical callback's bookkeeping early.
      try {
        await ticket?.settled.catch(() => {})
      } finally {
        binding.resume?.()
        scope.bindings.delete(binding)
        this.callbacks--
        owned.callbacks--
        this.clean(scope)
      }
    }
  }

  suspend(execution: ExecutionOwnership, callId: string): () => void {
    const scope = this.scope(execution, callId)
    if (scope.waiting >= 64) throw new HbarError('BUSY', 'Execution wait deadline capacity is full')
    scope.waiting++
    try {
      if (scope.waiting === 1)
        for (const binding of scope.bindings) if (binding.ticket) binding.resume = binding.ticket.suspendDeadline()
    } catch (error) {
      scope.waiting--
      if (!scope.waiting)
        for (const binding of scope.bindings) {
          binding.resume?.()
          delete binding.resume
        }
      this.clean(scope)
      throw error
    }
    let active = true
    return () => {
      if (!active) return
      active = false
      scope.waiting--
      if (!scope.waiting)
        for (const binding of scope.bindings) {
          binding.resume?.()
          delete binding.resume
        }
      this.clean(scope)
    }
  }
  snapshot() {
    return { scopes: this.scopes.size, executions: this.executions.size, callbacks: this.callbacks }
  }

  private scope(execution: ExecutionOwnership, callId: string): Scope {
    const identity = JSON.stringify(executionOwnershipSchema.parse(execution))
    const key = JSON.stringify([identity, callIdSchema.parse(callId)])
    const existing = this.scopes.get(key)
    if (existing) return existing
    const owned = this.executions.get(identity) ?? { scopes: 0, callbacks: 0 }
    if (this.scopes.size >= 4096 || owned.scopes >= 64)
      throw new HbarError('BUSY', 'Execution deadline scope capacity is full')
    const scope: Scope = { key, execution: identity, bindings: new Set(), waiting: 0 }
    this.scopes.set(key, scope)
    owned.scopes++
    this.executions.set(identity, owned)
    return scope
  }
  private clean(scope: Scope): void {
    if (scope.waiting || scope.bindings.size || this.scopes.get(scope.key) !== scope) return
    this.scopes.delete(scope.key)
    const owned = this.executions.get(scope.execution)
    if (owned && --owned.scopes === 0) this.executions.delete(scope.execution)
  }
}

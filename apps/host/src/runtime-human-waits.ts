import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import type { Approval } from '@hbar/contracts'
import type { UserInputState } from '@hbar/contracts/user-input-state'
import { executionHumanWaitSchema, type ExecutionHumanWait } from '@hbar/contracts/execution-waits'
import {
  executionOwnershipSchema,
  runtimeOwnerSchema,
  type ExecutionOwnership,
  type RuntimeOwner,
} from '@hbar/contracts/runtime'
import { procedure, type IpcPeer, type RuntimeCoordinator } from '@hbar/runtime'

interface DeadlineControl {
  suspendDeadline(): () => void
}
interface Wait {
  readonly input: ExecutionHumanWait
  readonly key: string
  readonly signature: string
  readonly ready: Promise<boolean>
  active: boolean
}
interface Binding {
  readonly execution: ExecutionOwnership
  readonly key: string
  readonly callId: string
  readonly control: DeadlineControl
  readonly resumptions: Map<string, () => void>
}
const executionKey = (execution: ExecutionOwnership) => JSON.stringify(executionOwnershipSchema.parse(execution))
const ownerKey = (owner: RuntimeOwner) => JSON.stringify(runtimeOwnerSchema.parse(owner))

/** Host-owned correlation only changes deadlines; physical leases and IPC capacity remain held. */
export class RuntimeHumanWaits {
  private readonly waits = new Map<string, Wait>()
  private readonly bindings = new Set<Binding>()
  private readonly executionWaits = new Map<string, Set<Wait>>()
  private readonly executionBindings = new Map<string, Set<Binding>>()
  constructor(
    private readonly options: {
      readonly decisions: {
        question(sessionId: string, requestId: string): Promise<UserInputState | null>
        approval(id: string): Promise<Approval>
      }
      readonly coordinator: Pick<RuntimeCoordinator, 'assertCanWrite'>
    },
  ) {}

  attachKernel(peer: IpcPeer, owner: RuntimeOwner): () => void {
    if (ownerKey(peer.remote) !== ownerKey(owner))
      throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Human waits require the authenticated Kernel incarnation')
    const disposers = [
      peer.register(
        'execution.humanWait.begin',
        procedure(executionHumanWaitSchema, z.boolean(), (input) => this.begin(owner, input)),
      ),
      peer.register(
        'execution.humanWait.end',
        procedure(executionHumanWaitSchema, z.undefined(), (input) => this.end(owner, input)),
      ),
    ]
    return () => {
      for (const dispose of disposers) dispose()
      this.exited(owner)
    }
  }

  track(execution: ExecutionOwnership, callId: string, control: DeadlineControl): () => void {
    const parsed = executionOwnershipSchema.parse(execution)
    const key = executionKey(parsed)
    const owned = this.executionBindings.get(key) ?? new Set<Binding>()
    if (this.bindings.size >= 8192 || owned.size >= 64)
      throw new HbarError('BUSY', 'Human-wait callback capacity is full')
    const binding: Binding = { execution: parsed, key, callId, control, resumptions: new Map() }
    this.bindings.add(binding)
    owned.add(binding)
    this.executionBindings.set(key, owned)
    try {
      for (const wait of this.executionWaits.get(key) ?? []) if (wait.active) this.pause(binding, wait)
    } catch (error) {
      this.untrack(binding)
      throw error
    }
    return () => this.untrack(binding)
  }

  async begin(owner: RuntimeOwner, raw: ExecutionHumanWait): Promise<boolean> {
    const input = executionHumanWaitSchema.parse(raw)
    this.assertOwner(owner, input)
    this.options.coordinator.assertCanWrite(owner, input.execution)
    const signature = JSON.stringify(input)
    const prior = this.waits.get(input.waitId)
    if (prior) {
      if (prior.signature !== signature)
        throw new HbarError('EXECUTION_WAIT_CONFLICT', 'The wait identity already belongs to another decision')
      return prior.ready
    }
    const key = executionKey(input.execution)
    const owned = this.executionWaits.get(key) ?? new Set<Wait>()
    if (this.waits.size >= 4096 || owned.size >= 64) throw new HbarError('BUSY', 'Human-wait capacity is full')
    const ready = Promise.withResolvers<boolean>()
    void ready.promise.catch(() => undefined)
    const wait: Wait = { input, key, signature, ready: ready.promise, active: false }
    this.waits.set(input.waitId, wait)
    owned.add(wait)
    this.executionWaits.set(key, owned)
    try {
      const pending = await this.pending(input)
      this.options.coordinator.assertCanWrite(owner, input.execution)
      if (!pending || this.waits.get(input.waitId) !== wait) {
        this.close(wait)
        ready.resolve(false)
        return false
      }
      wait.active = true
      for (const binding of this.executionBindings.get(key) ?? []) this.pause(binding, wait)
      ready.resolve(true)
      return true
    } catch (error) {
      this.close(wait)
      ready.reject(error)
      throw error
    }
  }

  end(owner: RuntimeOwner, raw: ExecutionHumanWait): void {
    const input = executionHumanWaitSchema.parse(raw)
    this.assertOwner(owner, input)
    const wait = this.waits.get(input.waitId)
    if (!wait) return
    if (wait.signature !== JSON.stringify(input))
      throw new HbarError('EXECUTION_WAIT_CONFLICT', 'A different decision cannot close this wait')
    this.close(wait)
  }

  release(execution: ExecutionOwnership): void {
    for (const wait of this.executionWaits.get(executionKey(execution)) ?? []) this.close(wait)
  }
  exited(owner: RuntimeOwner): void {
    for (const wait of this.waits.values())
      if (ownerKey(wait.input.execution.owner) === ownerKey(owner)) this.close(wait)
    for (const binding of this.bindings)
      if (ownerKey(binding.execution.owner) === ownerKey(owner)) this.untrack(binding)
  }
  snapshot() {
    return {
      waits: this.waits.size,
      active: [...this.waits.values()].filter((wait) => wait.active).length,
      callbacks: this.bindings.size,
    }
  }

  private assertOwner(owner: RuntimeOwner, input: ExecutionHumanWait): void {
    if (ownerKey(owner) !== ownerKey(input.execution.owner))
      throw new HbarError('EXECUTION_OWNER_MISMATCH', 'A human wait cannot borrow another executor claim')
  }
  private async pending(input: ExecutionHumanWait): Promise<boolean> {
    const { execution, decision, callId } = input
    if (decision.kind === 'questionnaire') {
      const state = await this.options.decisions.question(execution.sessionId, decision.id)
      return (
        !!state &&
        state.revision === decision.revision &&
        state.settlement === null &&
        state.request.requestId === decision.id &&
        state.request.isBlocking &&
        state.request.sessionId === execution.sessionId &&
        state.request.runId === execution.runId &&
        state.request.callId === callId
      )
    }
    const approval = await this.options.decisions.approval(decision.id)
    return (
      decision.revision === 1 &&
      approval.id === decision.id &&
      approval.status === 'pending' &&
      approval.sessionId === execution.sessionId &&
      approval.runId === execution.runId &&
      approval.callId === callId &&
      (decision.kind === 'plan_exit' ? approval.tool === 'exit_plan_mode' : approval.tool !== 'exit_plan_mode')
    )
  }
  private pause(binding: Binding, wait: Wait): void {
    if (binding.callId !== wait.input.callId || binding.key !== wait.key || binding.resumptions.has(wait.input.waitId))
      return
    binding.resumptions.set(wait.input.waitId, binding.control.suspendDeadline())
  }
  private close(wait: Wait): void {
    if (this.waits.get(wait.input.waitId) !== wait) return
    this.waits.delete(wait.input.waitId)
    const owned = this.executionWaits.get(wait.key)
    owned?.delete(wait)
    if (owned?.size === 0) this.executionWaits.delete(wait.key)
    for (const binding of this.executionBindings.get(wait.key) ?? []) {
      binding.resumptions.get(wait.input.waitId)?.()
      binding.resumptions.delete(wait.input.waitId)
    }
  }
  private untrack(binding: Binding): void {
    if (!this.bindings.delete(binding)) return
    const owned = this.executionBindings.get(binding.key)
    owned?.delete(binding)
    if (owned?.size === 0) this.executionBindings.delete(binding.key)
    for (const resume of binding.resumptions.values()) resume()
    binding.resumptions.clear()
  }
}

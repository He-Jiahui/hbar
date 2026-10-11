import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { CommandRegistry } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { HbarError, type LiveStream, type SessionEvent, type WireNotification } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { KernelControllerPort, KernelControllerCapabilities, KernelClientScopePort } from '@hbar/kernel/controller'
import { RUNTIME_APPLICATION_METHODS, type RuntimeApplicationTargets } from '@hbar/kernel/runtime-application'
import { runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'
import { runtimeDomainError, type ManagedProcess, type RuntimeCoordinator, type RuntimeValuePort } from '@hbar/runtime'
import type { PathLayout, StoragePort } from '@hbar/storage'

export type RuntimeKernelState = z.output<typeof runtimeKernelStateSchema>
export interface RuntimeKernelEndpoint {
  readonly owner: RuntimeOwner
  readonly process: Pick<ManagedProcess, 'call' | 'snapshot'>
  readonly application: RuntimeValuePort
  readonly state: RuntimeKernelState
}
export interface RuntimeKernelFacadeOptions {
  readonly instanceId: string
  readonly layout: PathLayout
  readonly demo: boolean
  readonly storage: StoragePort
  readonly coordinator: RuntimeCoordinator
  readonly current: () => RuntimeKernelEndpoint
  readonly endpoints: () => readonly RuntimeKernelEndpoint[]
  readonly resolve: (target: string, method: string, args: readonly unknown[], captured?: RuntimeKernelEndpoint) => RuntimeKernelEndpoint | Promise<RuntimeKernelEndpoint>
  readonly maintain: <Result>(action: () => Promise<Result>) => Promise<Result>
  readonly cancel?: (runId: string) => Promise<void>
  readonly openScope?: (id: string) => Promise<KernelClientScopePort>
  readonly resourceSessions?: () => readonly string[]
}
type Methods<Target extends keyof RuntimeApplicationTargets> = Extract<(typeof RUNTIME_APPLICATION_METHODS)[Target][number], keyof RuntimeApplicationTargets[Target]>
type ApplicationMethods<Target extends keyof RuntimeApplicationTargets> = Pick<RuntimeApplicationTargets[Target], Methods<Target>>

/** Stable listener facade. Its synchronous members are projections; every executable use case remains in its captured owner. */
export class RuntimeKernelFacade {
  readonly api: KernelControllerPort
  readonly streams = new Map<string, LiveStream>()
  private readonly context = new AsyncLocalStorage<RuntimeKernelEndpoint>()
  private readonly listeners = new Set<(event: WireNotification) => unknown>()
  private readonly cursors = new Map<string, number>()
  private readonly settledRuns = new Set<string>()
  private recovered = 0
  constructor(private readonly options: RuntimeKernelFacadeOptions) {
    const directory = new CommandRegistry({ execution: 'host' })
    for (const definition of Object.values(directoryCommands))
      directory.register<z.ZodType, z.ZodType>(definition, () => { throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Directory execution belongs to its Kernel owner') })
    const mode = { ...this.methods('mode'),
      effectiveMode: (run: Parameters<KernelControllerCapabilities['mode']['effectiveMode']>[0]) => {
        const captured = options.endpoints().flatMap(endpoint => endpoint.state.modes).find(value => value.runId === run.id)
        return captured?.mode ?? run.input.mode ?? 'default'
      },
      commitExit: <Result extends { modeEvent: SessionEvent | null }>(sessionId: string, commit: () => Promise<Result>) =>
        this.call<Result>('mode', 'commitExit', [sessionId, commit]),
    }
    const query = { ...this.methods('workspaceQuery'), dispose() {} }
    const capabilities: KernelControllerCapabilities = {
      mode, goal: this.methods('goal'), plan: this.methods('plan'), budget: this.methods('budget'),
      workflow: this.methods('workflow'), agent: this.methods('agent'), browser: this.methods('browser'),
      computer: this.methods('computer'), git: this.methods('git'), execution: { ...this.methods('execution'), workspaceQuery: query },
    }
    const self = this
    this.api = {
      ...this.methods('kernel'), instanceId: options.instanceId, options: { layout: options.layout, demo: options.demo }, storage: options.storage,
      ...(options.cancel ? { cancel: options.cancel } : {}),
      get recovered() { return self.recovered },
      active: { get size() { return options.coordinator.snapshot().sessions }, has: sessionId => options.coordinator.executionForSession(sessionId) !== null },
      streams: this.streams,
      permissionMode: () => this.selected().state.permission,
      changed: kind => this.publish({ method: 'host.changed', params: { kind } }),
      subscribe: listener => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } },
      assertIdle: () => this.assertIdle(),
      chatDatabaseIsIdle: () => this.idle(),
      chatDatabaseSessionProtection: sessionId => options.endpoints().flatMap(endpoint => endpoint.state.protection).find(value => value.sessionId === sessionId)?.reason ??
        (options.resourceSessions?.().includes(sessionId) ? 'active' : null),
      maintainChatDatabase: action => options.maintain(action),
      notifyChatDatabaseDeleted: (sessionIds, revision) => this.publish({ method: 'chatDatabase.deleted', params: { schemaVersion: 1, sessionIds, revision } }),
      pendingUserInput: requestId => options.endpoints().flatMap(endpoint => endpoint.state.userInputs).find(value => value.requestId === requestId) ?? null,
      tools: { list: () => this.selected().state.tools.map(name => ({ name })) },
      plugins: { ...this.methods('plugins'), list: () => this.selected().state.plugins,
        protectedResourceRoots: () => [...new Set(options.endpoints().flatMap(endpoint => endpoint.state.protectedRoots))],
        get: capability => capabilities[capability],
        openScope: async (_kind, id) => {
          if (options.openScope) return options.openScope(id)
          if (this.selected().state.plugins.some(plugin => plugin.runtimeScope === 'client'))
            throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Client plugins need a declared owned scope lifecycle')
          return { dispose: async () => {} }
        },
      },
      directoryQueries: { ...this.methods('directory'), describe: id => directory.describe(id), list: () => directory.list({ limit: 500 }) },
      schemaCallbacks: this.methods('schema'), sandboxProfiles: this.methods('sandbox'), workspaceSandboxes: this.methods('workspaceSandbox'),
      sessionLaunchTargets: this.methods('launchTarget'), sessionBranchTargets: this.methods('branchTarget'),
    }
  }
  pin<Result>(endpoint: RuntimeKernelEndpoint, operation: () => Result): Result { return this.context.run(endpoint, operation) }
  projection(): RuntimeKernelState {
    return runtimeKernelStateSchema.parse({ ...this.selected().state, recovered: this.recovered, idle: this.idle(),
      active: this.options.endpoints().flatMap(endpoint => endpoint.state.active),
      modes: this.options.endpoints().flatMap(endpoint => endpoint.state.modes),
      userInputs: this.options.endpoints().flatMap(endpoint => endpoint.state.userInputs),
      protection: this.options.endpoints().flatMap(endpoint => endpoint.state.protection),
    })
  }
  setRecovered(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new HbarError('INVALID_INPUT', 'Invalid recovered Run count')
    this.recovered = count
  }
  receive(owner: RuntimeOwner, event: WireNotification): void {
    const endpoint = this.options.endpoints().find(value => value.owner.incarnation === owner.incarnation)
    if (!endpoint || !['serving', 'draining'].includes(endpoint.process.snapshot().phase)) return
    this.recordSettlement(event)
    if (event.method === 'stream.update' && this.settledRuns.has(event.params.runId)) return
    if (!this.applyCursor(event)) return
    if (event.method === 'stream.update') {
      const delta = event.params
      const previous = this.streams.get(delta.id)
      if (previous && (previous.runId !== delta.runId || previous.sessionId !== delta.sessionId || previous.version >= delta.version)) return
      if (delta.operation === 'reset' || ((!previous || previous.text.length === delta.textOffset) && (!previous || previous.thinking.length === delta.thinkingOffset))) {
        if (!previous && delta.operation === 'append' && (delta.textOffset || delta.thinkingOffset)) return
        this.streams.set(delta.id, { id: delta.id, sessionId: delta.sessionId, runId: delta.runId,
          text: delta.operation === 'reset' ? delta.text : `${previous?.text ?? ''}${delta.text}`,
          thinking: delta.operation === 'reset' ? delta.thinking : `${previous?.thinking ?? ''}${delta.thinking}`,
          offset: delta.textOffset + delta.text.length, version: delta.version,
        })
      } else this.streams.delete(delta.id)
    }
    if (event.method === 'session.event' && event.params.type === 'run.settled')
      for (const [id, stream] of this.streams) if (stream.runId === event.params.runId) this.streams.delete(id)
    this.publish(event)
  }
  cursor(sessionId: string): number { return this.cursors.get(sessionId) ?? 0 }
  replay(event: WireNotification): void {
    this.recordSettlement(event)
    if (!this.applyCursor(event)) return
    if (event.method === 'session.event' && event.params.type === 'run.settled')
      for (const [id, stream] of this.streams) if (stream.runId === event.params.runId) this.streams.delete(id)
    this.publish(event)
  }
  dispose(): void { this.listeners.clear(); this.streams.clear(); this.cursors.clear(); this.settledRuns.clear() }
  private recordSettlement(event: WireNotification): void {
    if (event.method !== 'session.event' || event.params.type !== 'run.settled' || !event.params.runId) return
    if (this.settledRuns.size >= 4_096) this.settledRuns.delete(this.settledRuns.values().next().value!)
    this.settledRuns.add(event.params.runId)
    for (const [id, stream] of this.streams) if (stream.runId === event.params.runId) this.streams.delete(id)
  }
  private applyCursor(event: WireNotification): boolean {
    if (event.method !== 'session.event') return true
    const previous = this.cursor(event.params.sessionId)
    if (event.params.seq <= previous) return false
    if (!this.cursors.has(event.params.sessionId) && this.cursors.size >= 4_096) this.cursors.delete(this.cursors.keys().next().value!)
    this.cursors.set(event.params.sessionId, event.params.seq)
    return true
  }
  private selected(): RuntimeKernelEndpoint { return this.context.getStore() ?? this.options.current() }
  private idle(): boolean {
    return this.options.coordinator.snapshot().sessions === 0 && this.options.coordinator.snapshot().physicalTools === 0 &&
      this.options.endpoints().every(endpoint => endpoint.state.idle)
  }
  private assertIdle(): void { if (!this.idle()) throw new HbarError('BUSY', 'Wait for all runtime generations to settle') }
  private publish(event: WireNotification): void {
    for (const listener of [...this.listeners]) {
      try { void Promise.resolve(listener(event)).catch(() => { console.error('[hbar runtime] listener observer failed') }) }
      catch { console.error('[hbar runtime] listener observer failed') }
    }
  }
  private async call<Result>(target: string, method: string, args: readonly unknown[]): Promise<Result> {
    const endpoint = await this.options.resolve(target, method, args, this.context.getStore())
    if (!['serving', 'draining'].includes(endpoint.process.snapshot().phase))
      throw new HbarError('RUNTIME_RECOVERING', 'The requested Kernel owner is recovering')
    try { return await this.pin(endpoint, () => endpoint.application.call<Result>(`${target}.${method}`, args, { timeoutMs: 120_000 })) }
    catch (error) { const known = runtimeDomainError(error); if (known) throw new HbarError(known.code, known.message); throw error }
  }
  private methods<Target extends keyof RuntimeApplicationTargets>(target: Target): ApplicationMethods<Target> {
    const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
    for (const method of RUNTIME_APPLICATION_METHODS[target]) methods[method] = (...args) => this.call(target, method, args)
    // Each key comes from the declared public catalog; owner-side argument/result descriptions are validated by RuntimeValuePort.
    return methods as ApplicationMethods<Target>
  }
}

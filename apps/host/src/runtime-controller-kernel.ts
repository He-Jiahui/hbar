import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import { CommandRegistry } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { HbarError, type LiveStream, type SessionEvent } from '@hbar/contracts'
import { workspaceFoldersSchema } from '@hbar/contracts/commands/workspace-folders'
import type { KernelControllerPort, KernelControllerCapabilities } from '@hbar/kernel/controller'
import { RUNTIME_APPLICATION_METHODS, type RuntimeApplicationTargets } from '@hbar/kernel/runtime-application'
import { callStorageRpc, type PathLayout, type StoragePort } from '@hbar/storage'
import { runtimeDomainError, type RuntimeValuePort } from '@hbar/runtime'
import type { RuntimeControllerScope } from './runtime-controller-contract'

type Methods<Target extends keyof RuntimeApplicationTargets> = Extract<
  (typeof RUNTIME_APPLICATION_METHODS)[Target][number],
  keyof RuntimeApplicationTargets[Target]
>
type ApplicationMethods<Target extends keyof RuntimeApplicationTargets> = Pick<
  RuntimeApplicationTargets[Target],
  Methods<Target>
>

/** Controller-local descriptions and projections. Executable use cases use authenticated, request-scoped named ports. */
export class RuntimeControllerKernel {
  readonly api: KernelControllerPort
  private readonly scope = new AsyncLocalStorage<RuntimeControllerScope>()
  constructor(
    private readonly values: Pick<RuntimeValuePort, 'call'>,
    layout: PathLayout,
    demo: boolean,
    instanceId: string,
    noLocalExec = false,
  ) {
    const directory = new CommandRegistry({ execution: 'host' })
    for (const definition of Object.values(directoryCommands))
      directory.register<z.ZodType, z.ZodType>(definition, () => {
        throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Directory queries use their Kernel owner')
      })
    const storage: StoragePort = {
      call: (method, ...args) =>
        callStorageRpc({ execute: (input) => this.call('storage.call', [input]) }, method, args),
      close: async () => {},
    }
    const mode = {
      ...this.methods('mode'),
      effectiveMode: (run: Parameters<KernelControllerCapabilities['mode']['effectiveMode']>[0]) =>
        this.current().kernel.modes.find((value) => value.runId === run.id)?.mode ?? run.input.mode ?? 'default',
      commitExit: <Result extends { modeEvent: SessionEvent | null }>(
        sessionId: string,
        commit: () => Promise<Result>,
      ) => this.call<Result>('mode.commitExit', [sessionId, commit]),
    }
    const capabilities: KernelControllerCapabilities = {
      mode,
      goal: this.methods('goal'),
      plan: this.methods('plan'),
      budget: this.methods('budget'),
      workflow: this.methods('workflow'),
      agent: this.methods('agent'),
      browser: this.methods('browser'),
      computer: this.methods('computer'),
      git: this.methods('git'),
      execution: { ...this.methods('execution'), workspaceQuery: { ...this.methods('workspaceQuery'), dispose() {} } },
    }
    const self = this
    this.api = {
      ...this.methods('kernel'),
      createNodeWorkspace: (input) => this.call('kernel.createNodeWorkspace', [input]),
      instanceId,
      options: {
        layout,
        demo,
        noLocalExec,
        nodeWorkspaceInspection: {
          verifyWorkspaceFolders: async (nodeId, folders, signal) =>
            workspaceFoldersSchema.parse(
              await this.call('workspace.verifyFolders', [nodeId, folders], { signal, timeoutMs: 45_000 }),
            ),
        },
      },
      storage,
      storageHealth: () => {
        this.current()
        return { ready: true }
      },
      get recovered() {
        return self.current().kernel.recovered
      },
      active: {
        get size() {
          return self.current().kernel.active.length
        },
        has: (id) => this.current().kernel.active.some((value) => value.sessionId === id),
      },
      get streams() {
        return new Map<string, LiveStream>(self.current().streams.map((stream) => [stream.id, stream]))
      },
      permissionMode: () => this.current().kernel.permission,
      changed: (kind) => {
        void this.call('kernel.changed', [kind]).catch(() => {
          console.error('[hbar controller] change observer failed')
        })
      },
      subscribe: () => {
        throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Connection subscriptions belong to the stable listener')
      },
      assertIdle: () => {
        if (!this.current().kernel.idle) throw new HbarError('BUSY', 'Wait for runtime tasks to settle')
      },
      chatDatabaseIsIdle: () => this.current().kernel.idle,
      chatDatabaseSessionProtection: (id) =>
        this.current().kernel.protection.find((value) => value.sessionId === id)?.reason ?? null,
      maintainChatDatabase: (action) => this.call('kernel.maintain', [action]),
      notifyChatDatabaseDeleted: (ids, revision) => {
        void this.call('kernel.deleted', [ids, revision]).catch(() => {
          console.error('[hbar controller] deletion observer failed')
        })
      },
      pendingUserInput: (id) => this.current().kernel.userInputs.find((value) => value.requestId === id) ?? null,
      tools: { list: () => this.current().kernel.tools.map((name) => ({ name })) },
      plugins: {
        ...this.methods('plugins'),
        list: () => this.current().kernel.plugins,
        protectedResourceRoots: () => this.current().kernel.protectedRoots,
        get: (capability) => capabilities[capability],
        openScope: () => {
          throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Native connection scopes belong to the stable listener')
        },
      },
      directoryQueries: {
        ...this.methods('directory'),
        describe: (id) => directory.describe(id),
        list: () => directory.list({ limit: 500 }),
      },
      schemaCallbacks: this.methods('schema'),
      sandboxProfiles: this.methods('sandbox'),
      workspaceSandboxes: this.methods('workspaceSandbox'),
      sessionLaunchTargets: this.methods('launchTarget'),
      sessionBranchTargets: this.methods('branchTarget'),
    }
  }
  pin<Result>(scope: RuntimeControllerScope, operation: () => Result): Result {
    return this.scope.run(scope, operation)
  }
  current(): RuntimeControllerScope {
    const scope = this.scope.getStore()
    if (!scope)
      throw new HbarError('CONTROLLER_INVOCATION_EXPIRED', 'Controller use cases require an admitted request scope')
    return scope
  }
  async call<Result>(
    method: string,
    args: readonly unknown[],
    options: import('@hbar/runtime').IpcCallOptions = {},
  ): Promise<Result> {
    try {
      return await this.values.call<Result>(method, [this.current().invocationId, ...args], {
        timeoutMs: 130_000,
        ...options,
      })
    } catch (error) {
      const domain = runtimeDomainError(error)
      if (domain) throw new HbarError(domain.code, domain.message)
      throw error
    }
  }
  private methods<Target extends keyof RuntimeApplicationTargets>(target: Target): ApplicationMethods<Target> {
    const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
    for (const method of RUNTIME_APPLICATION_METHODS[target])
      methods[method] = (...args) => this.call(`${target}.${method}`, args)
    // The public catalog fixes every callable key; values are validated at both application port boundaries.
    return methods as ApplicationMethods<Target>
  }
}

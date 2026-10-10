import { z } from 'zod'
import { HbarError, runSchema } from '@hbar/contracts'
import { executionOwnershipSchema, type ExecutionOwnership } from '@hbar/contracts/runtime'
import { Kernel } from '@hbar/kernel'
import { KERNEL_RUNTIME_FINGERPRINT, runtimeKernelConfigurationSchema, runtimeKernelSubmitSchema, runtimeKernelRunSchema,
  runtimeKernelRunsSchema, runtimeKernelSessionSchema, runtimeKernelStateSchema, runtimeKernelRecoverySchema } from '@hbar/kernel/runtime-port'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import { RUNTIME_APPLICATION_METHODS, RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import { createPathLayout, callStorageRpc, STORAGE_SCHEMA_VERSION, runtimeRecoveryRecordSchema, type StoragePort } from '@hbar/storage'
import { RuntimeCoordinatorClient, RuntimeValuePort, procedure, runtimeDomainError, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { RuntimeDriverAdapter } from './runtime-driver-adapter'

/** The candidate validates its ports; construction and every production action wait until activation. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const configuration = runtimeKernelConfigurationSchema.parse(context.configuration)
  const layout = createPathLayout(configuration.dataRoot, configuration.cacheRoot, configuration.pointerFile, configuration)
  const coordinator = new RuntimeCoordinatorClient(context.peer)
  const leases = new Map<string, ExecutionOwnership>()
  const driver = new RuntimeDriverAdapter(context.peer, runId => leases.get(runId))
  let kernel: Kernel | undefined
  let role: 'default' | 'draining' = 'draining'
  const domain = async <Result>(action: () => Promise<Result>): Promise<Result> => {
    try { return await action() } catch (error) {
      const known = runtimeDomainError(error)
      if (known) throw new HbarError(known.code, known.message)
      throw error
    }
  }
  const application = (): Kernel => {
    if (context.preparing() || !kernel) throw new HbarError('RUNTIME_PREPARING', 'Kernel preflight cannot invoke production')
    return kernel
  }
  const values = new RuntimeValuePort(context.peer, { prefix: 'kernel.application', controlMethods: RUNTIME_APPLICATION_CONTROLS })
  const capabilities = new Set(['goal', 'plan', 'mode', 'budget', 'workflow', 'agent', 'browser', 'computer', 'execution', 'git'])
  for (const [target, methods] of Object.entries(RUNTIME_APPLICATION_METHODS))
    for (const method of methods) values.register(`${target}.${method}`, args => {
      const value = application()
      const object: unknown = target === 'kernel' ? value : target === 'plugins' ? value.plugins :
        target === 'directory' ? value.directoryQueries : target === 'schema' ? value.schemaCallbacks :
        target === 'sandbox' ? value.sandboxProfiles : target === 'workspaceSandbox' ? value.workspaceSandboxes :
        target === 'launchTarget' ? value.sessionLaunchTargets : target === 'branchTarget' ? value.sessionBranchTargets :
        target === 'workspaceQuery' ? value.plugins.get<import('@hbar/plugin-sdk').ExecutionProvider>('execution').workspaceQuery :
        capabilities.has(target) ? value.plugins.get(target) : undefined
      if (!object || typeof object !== 'object' || !(method in object))
        throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Declared application capability is unavailable in this generation')
      const implementation: unknown = Reflect.get(object, method)
      if (typeof implementation !== 'function') throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Declared application method is not callable')
      return Reflect.apply(implementation, object, args)
    })
  const storage: StoragePort = {
    call: (method, ...args) => domain(() => callStorageRpc({ execute: input => context.peer.call('kernel.storage', input, z.unknown()) }, method, args)),
    close: async () => {},
  }
  context.peer.register('kernel.state', procedure(z.undefined(), runtimeKernelStateSchema, () => {
    const value = application()
    return { instanceId: value.instanceId, permission: value.permissionMode(), recovered: value.recovered,
      active: [...value.active.values()].map(active => ({ sessionId: active.run.sessionId, runId: active.run.id })),
      tools: value.tools.list().map(tool => tool.name), plugins: value.plugins.list() }
  }))
  context.peer.register('kernel.submit', procedure(runtimeKernelSubmitSchema, runSchema, (input, call) => application().submit(
    input.sessionId, input.requestId, input.input, input.modelId, input.command, call.signal, input.expectedLaunchTargetRevision)))
  context.peer.register('kernel.cancel', procedure(runtimeKernelRunSchema, z.undefined(), input => application().cancel(input.runId)))
  context.peer.register('kernel.fence', procedure(runtimeKernelRunsSchema, z.undefined(), input => application().fenceRuns(input.runIds)))
  context.peer.register('kernel.wake', procedure(runtimeKernelSessionSchema, z.undefined(), input => { if (role === 'default') application().wake(input.sessionId) }))
  context.peer.register('kernel.recover', procedure(runtimeKernelRunsSchema, runtimeKernelRecoverySchema, input => application().recoverRuns(input.runIds)))
  context.peer.register('kernel.recovery.resume', procedure(runtimeKernelRunSchema, runtimeRecoveryRecordSchema, input => application().resumeRecovery(input.runId)))
  context.peer.register('kernel.resume', procedure(z.undefined(), z.undefined(), async () => {
    if (role !== 'default') throw new HbarError('RUNTIME_NOT_DEFAULT', 'A draining Kernel cannot resume scheduling')
    await application().activate()
  }))
  context.peer.register('kernel.permission.set', procedure(z.strictObject({ mode: z.enum(['ask', 'allow', 'deny', 'sandbox']) }), z.strictObject({ mode: z.enum(['ask', 'allow', 'deny', 'sandbox']) }), input => application().setPermissionMode(input.mode)))
  return {
    async prepare() { return { contractFingerprint: KERNEL_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION,
      capabilities: ['kernel.state', 'kernel.submit', 'kernel.cancel', 'kernel.fence', 'kernel.wake', 'kernel.recover', 'kernel.recovery.resume', 'kernel.resume'] } },
    async activate(selected) {
      role = selected
      kernel = await Kernel.create({ layout, demo: configuration.demo, instanceId: configuration.instanceId, lifecycle: 'managed',
        onFatal: () => process.exit(76),
        secrets: {
          get: id => domain(() => context.peer.call('kernel.secret.get', { id }, z.string().nullable())),
          set: (id, value) => domain(() => context.peer.call('kernel.secret.set', { id, value }, z.undefined())),
          delete: id => domain(() => context.peer.call('kernel.secret.delete', { id }, z.undefined())),
        },
        profile: { createStorage: async () => storage, replacements: { 'driver.pi': definePlugin({
          manifest: { id: 'driver.pi', name: 'Managed Pi harness', description: 'Version-bound named driver port',
            version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', required: true, provides: { driver: '1.0.0' }, permissions: ['network'] },
          apply: owner => provide(owner, 'driver', driver),
        }) } },
        execution: {
          claim: async sessionId => {
            const next = await storage.call('nextQueuedRun', sessionId)
            if (!next) return null
            const lease = await domain(() => coordinator.claim(sessionId, next.id))
            if (!lease) return null
            leases.set(lease.runId, executionOwnershipSchema.parse(lease))
            return { run: await storage.call('run', lease.runId), lease }
          },
          canIdle: sessionId => domain(() => coordinator.canIdle(sessionId)),
          reserveTool: (lease, callId) => domain(() => coordinator.reserveTool(lease, callId)),
          releaseTool: id => domain(() => coordinator.releaseTool(id)),
          withResource: (key, execution, operation, signal) => domain(() => coordinator.withResource(key, operation, {
            ...(execution ? { execution } : {}), ...(signal ? { signal } : {}),
          })),
          release: async lease => { await domain(() => coordinator.release(lease)); leases.delete(lease.runId) },
          interrupted: async lease => { await domain(() => coordinator.stopped(lease.runId)); leases.delete(lease.runId) },
          call: (lease, method, ...args) => domain(() => callStorageRpc({ execute: input => context.peer.call('kernel.storage', input, z.unknown()) }, method, args, lease)),
        },
      })
      // The stable composition activates all selected bindings before explicitly opening this scheduling gate.
    },
    async drain() { role = 'draining'; kernel?.beginDrain(); return { runs: kernel?.active.size ?? 0, requests: 0, resources: 0 } },
    async dispose() { role = 'draining'; kernel?.beginDrain(); await kernel?.close(); driver.dispose(); values.dispose() },
  }
}

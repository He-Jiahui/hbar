import { z } from 'zod'
import { commandCatalogPageSchema, commandDescriptorSchema } from '@hbar/commands'
import { pathToFileURL } from 'node:url'
import { HbarError, runSchema } from '@hbar/contracts'
import { executionOwnershipSchema, type ExecutionOwnership } from '@hbar/contracts/runtime'
import { nodeExecutionTargetSchema } from '@hbar/contracts/node-execution-target'
import { nodeWorkspaceMountManifestSchema } from '@hbar/contracts/node-workspace-mount-plan'
import { workspaceFoldersSchema } from '@hbar/contracts/commands/workspace-folders'
import { nodeManagedWorktreeSchema, nodeWorktreeRemoveSchema } from '@hbar/contracts/node-worktree'
import type { NodeWorkspaceInspectionPort } from '@hbar/kernel/node-workspace-inspection'
import { Kernel, type KernelProfile, type NodeIntentRecoveryPort, type NodeWorktreePort } from '@hbar/kernel'
import { createDiagnosticScope, protectDiagnosticSink } from '@hbar/kernel/diagnostic-scope'
import {
  KERNEL_RUNTIME_FINGERPRINT,
  runtimeKernelConfigurationSchema,
  runtimeKernelSubmitSchema,
  runtimeKernelRunSchema,
  runtimeKernelRunsSchema,
  runtimeKernelSessionSchema,
  runtimeKernelStateSchema,
  runtimeKernelRecoverySchema,
  runtimeKernelNodeIntentRecoverySchema,
  runtimeKernelNodeWorkspaceInspectionSchema,
  runtimeKernelNodeWorkspaceMountManifestSchema,
  runtimeKernelVerifyWorkspaceFoldersSchema,
  runtimeKernelNodeWorktreeSchema,
  runtimeKernelCancelSchema,
  runtimeKernelCommandCatalogSchema,
  runtimeKernelCommandDescribeSchema,
} from '@hbar/kernel/runtime-port'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import { RUNTIME_APPLICATION_METHODS, RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import {
  createPathLayout,
  callStorageRpc,
  STORAGE_SCHEMA_VERSION,
  runtimeRecoveryRecordSchema,
  type StoragePort,
} from '@hbar/storage'
import {
  RuntimeCoordinatorClient,
  RuntimeValuePort,
  RuntimeNotificationDelivery,
  procedure,
  runtimeDomainError,
  type RuntimeProcessContext,
  type RuntimeProcessService,
} from '@hbar/runtime'
import { RuntimeDriverAdapter } from './runtime-driver-adapter'
import { RuntimePluginAdapter } from './runtime-plugin-adapter'

/** Managed candidates construct their actual Kernel with read-only ports; execution waits for explicit activation. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  const configuration = runtimeKernelConfigurationSchema.parse(context.configuration)
  const layout = createPathLayout(
    configuration.dataRoot,
    configuration.cacheRoot,
    configuration.pointerFile,
    configuration,
  )
  const coordinator = new RuntimeCoordinatorClient(context.peer)
  const diagnosticScope = createDiagnosticScope()
  const leases = new Map<string, ExecutionOwnership>()
  const driver = new RuntimeDriverAdapter(context.peer, (runId) => leases.get(runId))
  const plugins = new RuntimePluginAdapter(context.peer, () => {
    if (!kernel) throw new HbarError('RUNTIME_PREPARING', 'Plugin adapters need their constructed local Kernel')
    return kernel
  })
  let kernel: Kernel | undefined
  let driverIsolation: 'managed' | 'legacy' = 'managed'
  let role: 'default' | 'draining' = 'draining'
  let unsubscribe: (() => void) | undefined
  const notifications = new RuntimeNotificationDelivery({
    send: (event) => context.peer.notify('kernel.notification', event),
    sendBatch: (events) => context.peer.notify('kernel.notifications.batch', events),
    diagnostic: (code) => {
      console.error(`[hbar kernel] invalid observer event (${code})`)
    },
    failed: (code, snapshot) => {
      console.error(`[hbar kernel] event delivery failed (${code}) ${JSON.stringify(snapshot)}`)
      process.exit(76)
    },
  })
  const domain = async <Result>(action: () => Promise<Result>): Promise<Result> => {
    try {
      return await action()
    } catch (error) {
      const known = runtimeDomainError(error)
      if (known) throw new HbarError(known.code, known.message)
      throw error
    }
  }
  const application = (): Kernel => {
    if (context.preparing() || !kernel)
      throw new HbarError('RUNTIME_PREPARING', 'Kernel preflight cannot invoke production')
    return kernel
  }
  const values = new RuntimeValuePort(context.peer, {
    prefix: 'kernel.application',
    controlMethods: RUNTIME_APPLICATION_CONTROLS,
  })
  const capabilities = new Set([
    'goal',
    'plan',
    'mode',
    'budget',
    'workflow',
    'agent',
    'browser',
    'computer',
    'execution',
    'git',
  ])
  for (const [target, methods] of Object.entries(RUNTIME_APPLICATION_METHODS))
    for (const method of methods)
      values.register(`${target}.${method}`, (args) => {
        const value = application()
        const object: unknown =
          target === 'kernel'
            ? value
            : target === 'plugins'
              ? value.plugins
              : target === 'directory'
                ? value.directoryQueries
                : target === 'schema'
                  ? value.schemaCallbacks
                  : target === 'sandbox'
                    ? value.sandboxProfiles
                    : target === 'workspaceSandbox'
                      ? value.workspaceSandboxes
                      : target === 'launchTarget'
                        ? value.sessionLaunchTargets
                        : target === 'branchTarget'
                          ? value.sessionBranchTargets
                          : target === 'workspaceQuery'
                            ? value.plugins.get<import('@hbar/plugin-sdk').ExecutionProvider>('execution')
                                .workspaceQuery
                            : capabilities.has(target)
                              ? value.plugins.get(target)
                              : undefined
        if (!object || typeof object !== 'object' || !(method in object))
          throw new HbarError(
            'RUNTIME_METHOD_UNAVAILABLE',
            'Declared application capability is unavailable in this generation',
          )
        const implementation: unknown = Reflect.get(object, method)
        if (typeof implementation !== 'function')
          throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Declared application method is not callable')
        return Reflect.apply(implementation, object, args)
      })
  let readOnly = false
  const storage: StoragePort = {
    call: (method, ...args) =>
      domain(() =>
        callStorageRpc(
          {
            execute: (input) => {
              const diagnostic = diagnosticScope.current()
              return context.peer.call(readOnly ? 'kernel.preflight.read' : 'kernel.storage', { ...input, ...(diagnostic ? { diagnostic } : {}) }, z.unknown())
            },
          },
          method,
          args,
        ),
      ),
    close: async () => {},
  }
  const construct = async (lifecycle: 'candidate' | 'managed', profile?: KernelProfile): Promise<Kernel> => {
    const profileReplacements = profile?.replacements ?? {}
    const managedPlugins = configuration.isolatedPlugins
      ? await plugins.load(Object.keys(profileReplacements))
      : []
    return Kernel.create({
      layout,
      demo: configuration.demo,
      noLocalExec: configuration.noLocalExec,
      instanceId: configuration.instanceId,
      lifecycle,
      sessionCommands: {
        list: (query, identity) => context.peer.call('kernel.commands.list',
          runtimeKernelCommandCatalogSchema.parse({ sessionId: identity.sessionId, runId: identity.runId, callId: identity.callId, query }),
          commandCatalogPageSchema, { signal: identity.signal, timeoutMs: 15_000 }),
        describe: (commandId, identity) => context.peer.call('kernel.commands.describe',
          runtimeKernelCommandDescribeSchema.parse({ sessionId: identity.sessionId, runId: identity.runId, callId: identity.callId, commandId }),
          commandDescriptorSchema, { signal: identity.signal, timeoutMs: 15_000 }),
      },
      nodeIntentRecovery: {
        reconcileRun: (runId, signal) => context.peer.call(
          'kernel.nodeIntentRecovery.reconcileRun',
          { runId },
          runtimeKernelNodeIntentRecoverySchema,
          { signal, timeoutMs: 65_000 },
        ),
      } satisfies NodeIntentRecoveryPort,
      nodeWorkspaceInspection: {
        captureExecutionTarget: (request, signal) => context.peer.call(
          'kernel.nodeWorkspaceInspection.captureExecutionTarget',
          runtimeKernelNodeWorkspaceInspectionSchema.parse(request),
          nodeExecutionTargetSchema,
          { signal, timeoutMs: 20_000 },
        ),
        resolveWorkspaceMountManifest: async (request, folders, primary, signal) =>
          nodeWorkspaceMountManifestSchema.parse(await context.peer.call(
            'kernel.nodeWorkspaceInspection.resolveWorkspaceMountManifest',
            runtimeKernelNodeWorkspaceMountManifestSchema.parse({ request, folders, primary }),
            z.unknown(),
            { signal, timeoutMs: 45_000 },
          )),
        verifyWorkspaceFolders: async (nodeId, folders, signal) =>
          workspaceFoldersSchema.parse(await context.peer.call(
            'kernel.nodeWorkspaceInspection.verifyWorkspaceFolders',
            runtimeKernelVerifyWorkspaceFoldersSchema.parse({ nodeId, folders }),
            z.unknown(),
            { signal, timeoutMs: 45_000 },
          )),
      } satisfies NodeWorkspaceInspectionPort,
      nodeWorktrees: {
        create: async (nodeId, request, signal) => nodeManagedWorktreeSchema.parse(await context.peer.call(
          'kernel.nodeWorktree.call',
          runtimeKernelNodeWorktreeSchema.parse({ nodeId, method: 'worktree.create', input: request }),
          z.unknown(),
          { signal, timeoutMs: 160_000 },
        )),
        get: async (nodeId, request, signal) => {
          const result = await context.peer.call(
            'kernel.nodeWorktree.call',
            runtimeKernelNodeWorktreeSchema.parse({ nodeId, method: 'worktree.get', input: request }),
            z.unknown(),
            { signal, timeoutMs: 20_000 },
          )
          return result === null ? null : nodeManagedWorktreeSchema.parse(result)
        },
        remove: async (nodeId, request, signal) => {
          const result = await context.peer.call(
            'kernel.nodeWorktree.call',
            runtimeKernelNodeWorktreeSchema.parse({ nodeId, method: 'worktree.remove', input: request }),
            z.unknown(),
            { signal, timeoutMs: 160_000 },
          )
          nodeWorktreeRemoveSchema.parse(request)
          if (!z.object({ accepted: z.literal(true) }).safeParse(result).success)
            throw new HbarError('NODE_WORKTREE_INVALID', 'Node did not confirm managed worktree removal')
        },
      } satisfies NodeWorktreePort,
      onFatal: () => process.exit(76),
      ...(configuration.diagnosticsEnabled ? {
        diagnostics: protectDiagnosticSink({ emit: event => { void context.peer.notify('runtime.diagnostic', event).catch(() => {}) } }, diagnosticScope),
        diagnosticScope,
        diagnosticFullCoverage: configuration.diagnosticsFullCoverage ?? false,
      } : {}),
      secrets: {
        get: (id) => domain(() => context.peer.call('kernel.secret.get', { id }, z.string().nullable())),
        set: (id, value) => domain(() => context.peer.call('kernel.secret.set', { id, value }, z.undefined())),
        delete: (id) => domain(() => context.peer.call('kernel.secret.delete', { id }, z.undefined())),
      },
      profile: {
        ...profile,
        managedPlugins: [...(profile?.managedPlugins ?? []), ...managedPlugins],
        createStorage: async () => storage,
        replacements: {
          ...profileReplacements,
          'driver.pi':
            profile?.replacements?.['driver.pi'] ??
            definePlugin({
              manifest: {
                id: 'driver.pi',
                name: 'Managed Pi harness',
                description: 'Version-bound named driver port',
                version: '1.0.0',
                apiVersion: '^1.0.0',
                scope: 'host',
                required: true,
                provides: { driver: '1.0.0' },
                permissions: ['network'],
              },
              apply: (owner) => provide(owner, 'driver', driver),
            }),
        },
      },
      execution: {
        claim: async (sessionId) => {
          const next = await storage.call('nextQueuedRun', sessionId)
          if (!next) return null
          const lease = await domain(() => coordinator.claim(sessionId, next.id)).catch(() => {
            // The stable coordinator records failed claim delivery and reconciles the durable receipt.
            // A failed admission has no executor to abort and must not crash unrelated Sessions.
            throw new HbarError(
              'EXECUTION_RECONCILIATION_REQUIRED',
              'The execution claim requires durable receipt reconciliation',
            )
          })
          if (!lease) return null
          leases.set(lease.runId, executionOwnershipSchema.parse(lease))
          return { run: await storage.call('run', lease.runId), lease }
        },
        canIdle: (sessionId) => domain(() => coordinator.canIdle(sessionId)),
        reserveTool: (lease, callId) => domain(() => coordinator.reserveTool(lease, callId)),
        releaseTool: (id) => domain(() => coordinator.releaseTool(id)),
        withResource: (key, execution, operation, signal) =>
          domain(() =>
            coordinator.withResource(key, operation, {
              ...(execution ? { execution } : {}),
              ...(signal ? { signal } : {}),
            }),
          ),
        release: async (lease) => {
          await domain(() => coordinator.release(lease))
          leases.delete(lease.runId)
        },
        interrupted: async (lease) => {
          await domain(() => coordinator.stopped(lease.runId))
          leases.delete(lease.runId)
        },
        call: (lease, method, ...args) =>
          domain(() =>
            callStorageRpc(
              { execute: (input) => context.peer.call('kernel.storage', input, z.unknown()) },
              method,
              args,
              lease,
            ),
          ),
      },
    })
  }
  context.peer.register(
    'kernel.state',
    procedure(z.undefined(), runtimeKernelStateSchema, async () => {
      const value = application()
      return {
        instanceId: value.instanceId,
        permission: value.permissionMode(),
        recovered: value.recovered,
        driverIsolation,
        ...(await value.runtimeView()),
        active: [...value.active.values()].map((active) => ({ sessionId: active.run.sessionId, runId: active.run.id })),
        tools: value.tools.list().map((tool) => tool.name),
        plugins: plugins.projectInfo(value.plugins.list()),
        notificationDelivery: notifications.snapshot(),
      }
    }),
  )
  context.peer.register(
    'kernel.submit',
    procedure(runtimeKernelSubmitSchema, runSchema, (input, call) =>
      application().submit(
        input.sessionId,
        input.requestId,
        input.input,
        input.modelId,
        input.command,
        call.signal,
        input.expectedLaunchTargetRevision,
      ),
    ),
  )
  context.peer.register(
    'kernel.cancel',
    procedure(runtimeKernelCancelSchema, z.undefined(), (input) => application().cancel(input.runId, input.persisted)),
  )
  context.peer.register(
    'kernel.fence',
    procedure(runtimeKernelRunsSchema, z.undefined(), (input) => application().fenceRuns(input.runIds)),
  )
  context.peer.register(
    'kernel.wake',
    procedure(runtimeKernelSessionSchema, z.undefined(), (input) => {
      if (role === 'default') application().wake(input.sessionId)
    }),
  )
  context.peer.register(
    'kernel.session.refresh',
    procedure(runtimeKernelSessionSchema, z.undefined(), (input) =>
      application().refreshSessionProjection(input.sessionId),
    ),
  )
  context.peer.register(
    'kernel.plugins.refresh',
    procedure(z.undefined(), z.undefined(), () => plugins.refresh()),
  )
  context.peer.register(
    'kernel.recover',
    procedure(runtimeKernelRunsSchema, runtimeKernelRecoverySchema, (input) => application().recoverRuns(input.runIds)),
  )
  context.peer.register(
    'kernel.recovery.resume',
    procedure(runtimeKernelRunSchema, runtimeRecoveryRecordSchema, (input) =>
      application().resumeRecovery(input.runId),
    ),
  )
  context.peer.register(
    'kernel.resume',
    procedure(z.undefined(), z.undefined(), async () => {
      if (role !== 'default') throw new HbarError('RUNTIME_NOT_DEFAULT', 'A draining Kernel cannot resume scheduling')
      await application().activate()
    }),
  )
  context.peer.register(
    'kernel.permission.set',
    procedure(
      z.strictObject({ mode: z.enum(['ask', 'allow', 'deny', 'sandbox']) }),
      z.strictObject({ mode: z.enum(['ask', 'allow', 'deny', 'sandbox']) }),
      (input) => application().setPermissionMode(input.mode),
    ),
  )
  return {
    async prepare() {
      if (configuration.profileModule && context.purpose === 'candidate')
        throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Custom Kernel profiles require an explicit restart')
      if (configuration.isolatedPlugins && !configuration.profileModule) {
        readOnly = true
        try {
          kernel = await construct('candidate')
        } catch (error) {
          if (
            context.purpose === 'candidate' ||
            !(error instanceof HbarError) ||
            error.code !== 'RUNTIME_RESTART_REQUIRED'
          )
            throw error
          // Existing custom plugins retain their managed owner at initial startup and recovery.
          // A replacement candidate reports its missing lifecycle contract before any route switches.
        } finally {
          readOnly = false
        }
      }
      return {
        contractFingerprint: KERNEL_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: [
          'kernel.state',
          'kernel.submit',
          'kernel.cancel',
          'kernel.fence',
          'kernel.wake',
          'kernel.recover',
          'kernel.recovery.resume',
          'kernel.resume',
          'kernel.session.refresh',
        ],
      }
    },
    async activate(selected) {
      role = selected
      let profile: KernelProfile | undefined
      if (configuration.profileModule) {
        const imported: unknown = await import(pathToFileURL(configuration.profileModule).href)
        if (
          !imported ||
          typeof imported !== 'object' ||
          !('default' in imported) ||
          !imported.default ||
          typeof imported.default !== 'object'
        )
          throw new HbarError('INVALID_PROFILE', 'The owned profile must export its Kernel configuration')
        // This explicitly selected local module is trusted executable code. It remains in its owner, never on IPC.
        profile = imported.default as KernelProfile
        if (profile.createStorage)
          throw new HbarError(
            'RUNTIME_RESTART_REQUIRED',
            'Custom storage needs a declared single-writer lifecycle adapter',
          )
        if (profile.replacements?.['driver.pi']) driverIsolation = 'legacy'
      }
      if (kernel) {
        await kernel.completePreparation()
        await plugins.refresh()
      } else kernel = await construct('managed', profile)
      if (configuration.isolatedPlugins) plugins.publishMetadata()
      unsubscribe = kernel.subscribe((event) => notifications.publish(event))
      // The stable composition activates all selected bindings before explicitly opening this scheduling gate.
    },
    async drain() {
      role = 'draining'
      kernel?.beginDrain()
      return { runs: kernel?.active.size ?? 0, requests: 0, resources: 0 }
    },
    async dispose() {
      role = 'draining'
      kernel?.beginDrain()
      unsubscribe?.()
      notifications.dispose()
      await kernel?.close()
      plugins.dispose()
      driver.dispose()
      values.dispose()
    },
  }
}

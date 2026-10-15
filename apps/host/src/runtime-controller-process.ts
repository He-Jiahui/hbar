import { z } from 'zod'
import { HbarError, rpcRequestSchema, rpcSchemas } from '@hbar/contracts'
import { createPathLayout, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { CommandRegistry } from '@hbar/commands'
import { chatDatabaseCommands } from '@hbar/contracts/commands/chat-database'
import {
  procedure,
  RuntimeValuePort,
  runtimeDomainError,
  type RuntimeProcessContext,
  type RuntimeProcessService,
} from '@hbar/runtime'
import { RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import {
  CONTROLLER_RUNTIME_FINGERPRINT,
  runtimeControllerConfigurationSchema,
  runtimeControllerScopeSchema,
  runtimeControllerCatalogSchema,
  runtimeControllerDispatchSchema,
  runtimeControllerRequestSchema,
  isRuntimeControllerControl,
} from './runtime-controller-contract'
import { RuntimeControllerKernel } from './runtime-controller-kernel'
import { createControllerApplication } from './controller-application'
import { ownsControllerRpc, invokeControllerRpc } from './controller-rpc'
import { RUNTIME_CONTROLLER_SERVICES } from './runtime-controller-services'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  let requests = 0
  let defaultOwner = false
  let backgroundStarted = false
  const configuration = runtimeControllerConfigurationSchema.safeParse(context.configuration)
  if (!configuration.success && !z.strictObject({}).safeParse(context.configuration).success)
    throw new HbarError('INVALID_INPUT', 'Controller configuration must satisfy its declared lifecycle contract')
  const values = new RuntimeValuePort(context.peer, {
    prefix: 'controller.application',
    controlMethods: [...RUNTIME_APPLICATION_CONTROLS, 'service'],
  })
  const kernel = configuration.success
    ? new RuntimeControllerKernel(
        values,
        createPathLayout(configuration.data.dataRoot, configuration.data.cacheRoot, configuration.data.pointerFile, {
          settingsRoot: configuration.data.settingsRoot,
          sessionsRoot: configuration.data.sessionsRoot,
          skillsRoot: configuration.data.skillsRoot,
          identityRoot: configuration.data.identityRoot,
        }),
        configuration.data.demo,
        configuration.data.instanceId,
        configuration.data.noLocalExec,
      )
    : null
  const maintenance = new CommandRegistry({ execution: 'host' })
  for (const definition of Object.values(chatDatabaseCommands))
    maintenance.register<z.ZodType, z.ZodType>(definition, () => {
      throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Maintenance executes in its independent owner')
    })
  const application = kernel
    ? createControllerApplication(kernel.api, {
        background: false,
        maintenance: {
          dispatch: (input, actorId) => kernel.call('maintenance.dispatch', [input, actorId]),
          describe: (id) => maintenance.describe(id),
          list: () => maintenance.list({ limit: 500 }),
          dispose() {},
        },
        manualGitQuery: (input, signal) => kernel.call('git.manualQuery', [input], { signal, timeoutMs: 130_000 }),
        publishFresh: (event) => {
          void context.peer.notify('controller.notification', event).catch(() => {
            console.error('[hbar controller] notification delivery failed')
          })
        },
      })
    : null
  values.register('service', async (args) => {
    if (context.preparing() || !kernel || !application)
      throw new HbarError('RUNTIME_PREPARING', 'Controller services are not activated')
    const scope = runtimeControllerScopeSchema.parse(args[0]),
      service = z.string().parse(args[1]),
      method = z.string().parse(args[2]),
      input = z.array(z.unknown()).max(32).parse(args[3])
    return kernel.pin(scope, async () => {
      if (service === 'commands' && method === 'prepare')
        return (await application.commandRouter.prepare(input[0])).invocation
      if (service === 'commands' && method === 'dispatch') {
        const invocation = rpcSchemas['command.execute'].parse(input[0])
        const dispatch = application.commandDispatchers.get(invocation.commandId)
        if (!dispatch) throw new HbarError('COMMAND_NOT_FOUND', 'Command is absent from this Controller owner')
        return dispatch(invocation, z.string().min(1).max(160).parse(input[1]))
      }
      const declared: unknown = Reflect.get(RUNTIME_CONTROLLER_SERVICES, service)
      if (!Array.isArray(declared) || !declared.includes(method))
        throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Controller service method is not public')
      const target: unknown = Reflect.get(application, service)
      if (!target || typeof target !== 'object')
        throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Controller service is absent')
      const callable: unknown = Reflect.get(target, method)
      if (typeof callable !== 'function')
        throw new HbarError('RUNTIME_METHOD_UNAVAILABLE', 'Controller service method is absent')
      const result: unknown = Reflect.apply(callable, target, input)
      return await result
    })
  })
  context.peer.register(
    'controller.catalog',
    procedure(z.undefined(), runtimeControllerCatalogSchema, () =>
      application
        ? [
            {
              service: 'commands',
              revision: application.commandServices.reduce((total, value) => total + value.service.list().revision, 0),
              // The stable listener needs hidden descriptors to authorize direct internal workspace commands.
              items: application.commandServices.flatMap(
                (value) => value.service.list({ includeInternal: true }).items,
              ),
            },
          ]
        : [],
    ),
  )
  context.peer.register(
    'controller.resume',
    procedure(z.undefined(), z.undefined(), async () => {
      if (!defaultOwner || !kernel || !application || context.preparing())
        throw new HbarError('RUNTIME_NOT_DEFAULT', 'Only the activated Controller schedules background work')
      if (backgroundStarted) return
      const scope = await context.peer.call('controller.background.scope', undefined, runtimeControllerScopeSchema)
      await kernel.pin(scope, async () => {
        application.sessionSearchCommands.start()
        await application.scheduleController.start()
      })
      backgroundStarted = true
    }),
  )
  context.peer.register(
    'controller.pause',
    procedure(z.undefined(), z.undefined(), async () => {
      await application?.scheduleController.close()
      await application?.sessionSearchCommands.pause()
      backgroundStarted = false
    }),
  )
  const dispatch = async (
    input: z.infer<typeof runtimeControllerDispatchSchema>,
    control: boolean,
  ): Promise<string> => {
    if (context.preparing())
      throw new HbarError('RUNTIME_PREPARING', 'Controller preflight cannot invoke production requests')
    let id: string | number | null = null
    requests++
    try {
      const envelope = rpcRequestSchema.parse(JSON.parse(input.payload))
      id = envelope.id
      if (!Object.hasOwn(rpcSchemas, envelope.method))
        throw new HbarError('METHOD_NOT_FOUND', 'RPC method is not registered')
      const request = runtimeControllerRequestSchema.parse(envelope)
      if (control && !isRuntimeControllerControl(request))
        throw new HbarError('INVALID_INPUT', 'Reserved capacity only accepts control requests')
      const scope =
        kernel && application
          ? await context.peer.call(
              'controller.authorize',
              { invocationId: input.invocationId, request },
              runtimeControllerScopeSchema.nullable(),
            )
          : null
      const result =
        scope && kernel && application && ownsControllerRpc(request, application)
          ? await kernel.pin(scope, () => invokeControllerRpc(request, scope, application, kernel.api))
          : await context.peer.call('controller.invoke', { invocationId: input.invocationId, request }, z.unknown(), {
              timeoutMs: 120_000,
            })
      return JSON.stringify({ jsonrpc: '2.0', id, result })
    } catch (error) {
      const domain = runtimeDomainError(error)
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          data: domain?.code ?? 'INVALID_REQUEST',
          message: domain?.message ?? 'Request does not satisfy the RPC contract',
        },
      })
    } finally {
      requests--
    }
  }
  context.peer.register(
    'controller.handle',
    procedure(runtimeControllerDispatchSchema, z.string().max(33_554_432), (input) => dispatch(input, false)),
  )
  context.peer.register(
    'controller.control',
    procedure(runtimeControllerDispatchSchema, z.string().max(33_554_432), (input) => dispatch(input, true)),
  )
  return {
    async prepare() {
      return {
        contractFingerprint: CONTROLLER_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['controller.handle', 'controller.control'],
      }
    },
    async activate(role) {
      defaultOwner = role === 'default'
    },
    async drain() {
      defaultOwner = false
      await application?.scheduleController.close()
      await application?.sessionSearchCommands.pause()
      backgroundStarted = false
      return { requests, runs: 0, resources: 0 }
    },
    async dispose() {
      defaultOwner = false
      await application?.dispose()
      maintenance.dispose()
      values.dispose()
    },
  }
}

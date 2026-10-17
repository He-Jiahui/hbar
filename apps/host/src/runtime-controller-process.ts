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
import {
  earliestRuntimeDue,
  runtimeControllerIdleCheckpointSchema,
  type RuntimeBackgroundCheckpoint,
} from './runtime-background-idle'
import {
  scheduleIdleManifestSchema,
  scheduleWakeReplySchema,
  type ScheduleTransferAck,
} from './runtime-schedule-idle-contract'
import {
  controllerScheduleInitializeSchema,
  controllerScheduleTransferSchema,
  controllerScheduleStatusSchema,
  controllerScheduleControlMethods,
} from './runtime-controller-schedule-contract'

export function create(context: RuntimeProcessContext): RuntimeProcessService {
  let requests = 0
  let defaultOwner = false
  let backgroundStarted = false
  let serviceRequests = 0
  let transitions = 0
  let schedulePhase: 'open' | 'restored' | 'quiescing' | 'quiesced' | 'committed' | 'unknown' = 'open'
  let scheduleAck: ScheduleTransferAck | null = null
  const assertScheduleAdmission = () => {
    if (schedulePhase !== 'open')
      throw new HbarError('RUNTIME_IDLE_FENCED', 'Controller schedule transfer owns admission')
  }
  const sameAck = (ack: ScheduleTransferAck) =>
    scheduleAck !== null && JSON.stringify(scheduleAck) === JSON.stringify(ack)
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
    assertScheduleAdmission()
    if (context.preparing() || !kernel || !application)
      throw new HbarError('RUNTIME_PREPARING', 'Controller services are not activated')
    const scope = runtimeControllerScopeSchema.parse(args[0]),
      service = z.string().parse(args[1]),
      method = z.string().parse(args[2]),
      input = z.array(z.unknown()).max(32).parse(args[3])
    serviceRequests++
    try {
      return await kernel.pin(scope, async () => {
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
    } finally {
      serviceRequests--
    }
  })
  const checkpoint = () => {
    const search = application?.sessionSearchCommands.idleSnapshot() ?? null
    const schedule = application?.scheduleController.idleSnapshot() ?? null
    const result: RuntimeBackgroundCheckpoint<{ search: typeof search; schedule: typeof schedule }> = {
      schemaVersion: 1,
      unitId: 'controller',
      coverage: 'incomplete',
      alarmsTransferRequired: kernel !== null,
      requiredDomains: [
        'enabledSchedules/full-page-nextDue-and-revisions',
        'scheduleRuntime/pendingDueAt',
        'activeScheduleOccurrences/original-occurrence-run',
        'searchIndexStep/continuation',
      ],
      nextDueAt: earliestRuntimeDue([search?.nextDueAt ?? null, schedule?.nextDueAt ?? null]),
      state: { search, schedule },
    }
    return result
  }
  context.peer.register(
    'controller.idleCheckpoint',
    procedure(z.undefined(), runtimeControllerIdleCheckpointSchema, () =>
      runtimeControllerIdleCheckpointSchema.parse(checkpoint()),
    ),
  )
  const readSchedule = async () => {
    if (!kernel || !application || !defaultOwner || context.preparing())
      throw new HbarError('RUNTIME_NOT_DEFAULT', 'Only the activated Controller owns the schedule checkpoint')
    const scope = await context.peer.call('controller.background.scope', undefined, runtimeControllerScopeSchema)
    return kernel.pin(scope, () => application.scheduleCheckpoint.read())
  }
  const physicalQuiet = () => {
    const counts = values.idleCounts()
    return (
      requests === 0 &&
      serviceRequests === 0 &&
      transitions === 0 &&
      counts.incoming === 0 &&
      counts.outgoing === 0 &&
      counts.callbacks === 0 &&
      (kernel?.idleSnapshot().physicalCalls ?? 0) === 0
    )
  }
  const matchesSource = (manifest: Awaited<ReturnType<typeof readSchedule>>, ack: ScheduleTransferAck) =>
    manifest.snapshot.coverage === 'complete' &&
    manifest.snapshot.database.id === ack.databaseId &&
    manifest.snapshot.database.sourceRevision === ack.sourceRevision
  const resumeBackgroundTimer = async () => {
    if (!kernel || !application) throw new HbarError('RUNTIME_NOT_DEFAULT', 'Controller absent')
    const scope = await context.peer.call('controller.background.scope', undefined, runtimeControllerScopeSchema)
    await kernel.pin(scope, async () => {
      const search = await application.sessionSearchCommands.checkpoint()
      application.scheduleController.resumeTimer()
      application.sessionSearchCommands.resumeInspectionTimer(search.complete)
    })
  }
  context.peer.register(
    'controller.schedule.initialize',
    procedure(controllerScheduleInitializeSchema, controllerScheduleStatusSchema, async (input) => {
      if (backgroundStarted || transitions !== 0 || schedulePhase !== 'open')
        throw new HbarError('RUNTIME_IDLE_FENCED', 'Controller background initialization already began')
      if (input.mode === 'idle-wake') {
        scheduleAck = input.ack
        schedulePhase = 'restored'
        try {
          await application?.scheduleController.pause()
          await application?.sessionSearchCommands.pause()
        } catch (error) {
          schedulePhase = 'unknown'
          throw error
        }
      }
      return { phase: schedulePhase }
    }),
  )
  context.peer.register(
    'controller.schedule.preview',
    procedure(z.undefined(), scheduleIdleManifestSchema, readSchedule),
  )
  context.peer.register(
    'controller.schedule.quiesce',
    procedure(controllerScheduleTransferSchema, scheduleIdleManifestSchema, async ({ ack }) => {
      assertScheduleAdmission()
      scheduleAck = ack
      schedulePhase = 'quiescing'
      // Seal first. Unknown physical work cannot be awaited by a cancelled logical Promise.
      // A known busy attempt does not stop any timer; the parent may offer again later.
      if (!physicalQuiet()) {
        schedulePhase = 'open'
        scheduleAck = null
        throw new HbarError('BUSY', 'Controller physical work has not settled')
      }
      try {
        await application?.scheduleController.pause()
        await application?.sessionSearchCommands.pause()
        const manifest = await readSchedule()
        if (!physicalQuiet() || !matchesSource(manifest, ack)) {
          await resumeBackgroundTimer()
          schedulePhase = 'open'
          scheduleAck = null
          throw new HbarError('SCHEDULE_CHECKPOINT_CHANGED', 'Controller checkpoint changed after quiescence')
        }
        schedulePhase = 'quiesced'
        return manifest
      } catch (error) {
        if (schedulePhase !== 'open') schedulePhase = 'unknown'
        throw error
      }
    }),
  )
  context.peer.register(
    'controller.schedule.commit',
    procedure(controllerScheduleTransferSchema, controllerScheduleStatusSchema, ({ ack }) => {
      if (!sameAck(ack) || schedulePhase !== 'quiesced')
        throw new HbarError('RUNTIME_IDLE_FENCED', 'Schedule commit does not match quiesced transfer')
      schedulePhase = 'committed'
      return { phase: schedulePhase }
    }),
  )
  context.peer.register(
    'controller.schedule.abort',
    procedure(controllerScheduleTransferSchema, controllerScheduleStatusSchema, async ({ ack }) => {
      if (!sameAck(ack) || schedulePhase !== 'quiesced')
        throw new HbarError('RUNTIME_IDLE_FENCED', 'Only a known quiesced transfer may abort')
      try {
        await resumeBackgroundTimer()
      } catch (error) {
        schedulePhase = 'unknown'
        throw error
      }
      scheduleAck = null
      schedulePhase = 'open'
      return { phase: schedulePhase }
    }),
  )
  context.peer.register(
    'controller.schedule.wake',
    procedure(controllerScheduleTransferSchema, scheduleWakeReplySchema, async ({ ack }) => {
      if (!sameAck(ack) || !['restored', 'committed'].includes(schedulePhase))
        throw new HbarError('RUNTIME_IDLE_FENCED', 'Wake must match the committed transfer')
      try {
        const before = await readSchedule()
        if (before.snapshot.coverage !== 'complete' || before.snapshot.database.id !== ack.databaseId)
          throw new HbarError('SCHEDULE_CHECKPOINT_CHANGED', 'Wake database checkpoint is incomplete')
        const changed = !matchesSource(before, ack)
        if (changed) {
          await resumeBackgroundTimer()
          scheduleAck = null
          schedulePhase = 'open'
          backgroundStarted = true
          return { kind: 'changed', manifest: before }
        }
        if (!kernel || !application) throw new HbarError('RUNTIME_NOT_DEFAULT', 'Controller absent')
        const scope = await context.peer.call('controller.background.scope', undefined, runtimeControllerScopeSchema)
        await kernel.pin(scope, async () => {
          await application.scheduleController.wakeDue()
          const search = await application.sessionSearchCommands.wakeStep()
          application.sessionSearchCommands.resumeInspectionTimer(search.complete)
        })
        const manifest = await readSchedule()
        scheduleAck = null
        schedulePhase = 'open'
        backgroundStarted = true
        return { kind: 'settled', manifest }
      } catch (error) {
        schedulePhase = 'unknown'
        throw error
      }
    }),
  )
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
      assertScheduleAdmission()
      if (!defaultOwner || !kernel || !application || context.preparing())
        throw new HbarError('RUNTIME_NOT_DEFAULT', 'Only the activated Controller schedules background work')
      if (backgroundStarted) return
      transitions++
      try {
        const scope = await context.peer.call('controller.background.scope', undefined, runtimeControllerScopeSchema)
        await kernel.pin(scope, async () => {
          application.sessionSearchCommands.start()
          await application.scheduleController.start()
        })
        backgroundStarted = true
      } finally {
        transitions--
      }
    }),
  )
  context.peer.register(
    'controller.pause',
    procedure(z.undefined(), z.undefined(), async () => {
      assertScheduleAdmission()
      transitions++
      try {
        await application?.scheduleController.pause()
        await application?.sessionSearchCommands.pause()
        backgroundStarted = false
      } finally {
        transitions--
      }
    }),
  )
  const dispatch = async (
    input: z.infer<typeof runtimeControllerDispatchSchema>,
    control: boolean,
  ): Promise<string> => {
    assertScheduleAdmission()
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
  const idle = () => {
    const state = checkpoint()
    const search = state.state.search
    const schedule = state.state.schedule
    const port = values.idleCounts()
    const resources =
      port.callbacks +
      port.incoming +
      port.outgoing +
      (kernel?.idleSnapshot().physicalCalls ?? 0) +
      transitions +
      Number(search?.timer === true) +
      Number(search?.background === true) +
      Number(search?.pendingStep === true) +
      Number(schedule?.timer === true) +
      Number(schedule?.ticking === true)
    // Committed transfer now covers both schedule and a bounded durable search continuation alarm.
    return {
      eligible: !state.alarmsTransferRequired || schedulePhase === 'committed',
      requests: requests + serviceRequests,
      runs: 0,
      resources,
    }
  }
  return {
    idle,
    async prepare() {
      return {
        contractFingerprint: CONTROLLER_RUNTIME_FINGERPRINT,
        storageSchema: STORAGE_SCHEMA_VERSION,
        capabilities: ['controller.handle', 'controller.control', ...controllerScheduleControlMethods],
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
      const state = idle()
      return { requests: state.requests, runs: state.runs, resources: state.resources }
    },
    async dispose() {
      defaultOwner = false
      await application?.dispose()
      maintenance.dispose()
      values.dispose()
    },
  }
}

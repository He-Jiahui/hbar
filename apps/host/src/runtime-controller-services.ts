import type { CommandDescriptor } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import type { ControllerApplication, ControllerCommandService } from './controller-application'

/** Methods used by stable connection, media and scheduling adapters; private registries remain in the owner. */
export const RUNTIME_CONTROLLER_SERVICES = {
  browserCommands: ['execute'],
  computerCommands: ['execute'],
  configurationCommands: ['execute'],
  extensionCommands: ['execute'],
  gitCommands: ['execute'],
  workspaceSessionCommands: ['execute'],
  goalPlanCommands: ['execute'],
  interactionCommands: ['execute'],
  budgetCommands: ['execute', 'getReceipt'],
  runCommands: [
    'execute',
    'getReceipt',
    'getQueuedEditTextReceipt',
    'getQueuedRemoveReceipt',
    'getQueuedRunGuideReceipt',
  ],
  resourceCommands: ['readMedia'],
  notificationService: ['publishSource'],
} as const
type Services = keyof typeof RUNTIME_CONTROLLER_SERVICES
type RemoteServices = {
  [Service in Services]: Pick<
    ControllerApplication[Service],
    Extract<(typeof RUNTIME_CONTROLLER_SERVICES)[Service][number], keyof ControllerApplication[Service]>
  >
}
export interface ControllerServerApplication extends RemoteServices {
  readonly commandServices: ControllerCommandService[]
  readonly commandDispatchers: Map<string, (value: unknown, actorId: string) => Promise<unknown>>
  readonly commandDescribers: Map<string, () => CommandDescriptor>
  readonly scheduleController: { start(): Promise<void>; close(): Promise<void> }
  dispose(): Promise<void>
}
export interface RuntimeControllerServicesOptions {
  readonly catalog: () => { revision: number; items: readonly CommandDescriptor[] }
  readonly call: <Result>(service: string, method: string, args: readonly unknown[]) => Promise<Result>
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
}

export function createRuntimeControllerServices(
  options: RuntimeControllerServicesOptions,
): ControllerServerApplication {
  const services: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {}
  for (const [service, methods] of Object.entries(RUNTIME_CONTROLLER_SERVICES)) {
    const declared: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
    for (const method of methods) declared[method] = (...args) => options.call(service, method, args)
    services[service] = declared
  }
  // Every exposed member comes from the typed service catalog; transport arguments/results use bounded named descriptions.
  const remote = services as RemoteServices
  const service = {
    dispatch: (value: unknown, actorId: string) => options.call('commands', 'dispatch', [value, actorId]),
    describe(id: string) {
      const descriptor = options.catalog().items.find((value) => value.metadata.id === id)
      if (!descriptor)
        throw new HbarError('COMMAND_NOT_FOUND', 'Command is absent from the activated Controller catalog')
      return descriptor
    },
    list: () => options.catalog(),
  }
  const commandIds = options.catalog().items.map((value) => value.metadata.id)
  const commandDispatchers = new Map(commandIds.map((id) => [id, service.dispatch]))
  const commandDescribers = new Map(commandIds.map((id) => [id, () => service.describe(id)]))
  return {
    ...remote,
    commandServices: [{ commandIds, service }],
    commandDispatchers,
    commandDescribers,
    scheduleController: { start: options.start, close: options.stop },
    dispose: options.stop,
  }
}

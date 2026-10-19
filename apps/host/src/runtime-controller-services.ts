import type {
  CommandDescriptor,
  CommandInvocation,
  CommandExecutionExpectation,
  CommandPreparedOptions,
  CommandExecutionTicket,
} from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import type { ControllerApplication, ControllerCommandService } from './controller-application'

/** Methods used by stable connection, media and scheduling adapters; private registries remain in the owner. */
export const RUNTIME_CONTROLLER_SERVICES = {
  settingsCommands: ['execute'],
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
  resolveCommand?(id: string): ControllerCommandService['service'] | null
  dispose(): Promise<void>
}
export interface RuntimeControllerServicesOptions {
  readonly catalog: () => { revision: number; items: readonly CommandDescriptor[] }
  readonly call: <Result>(
    service: string,
    method: string,
    args: readonly unknown[],
    options?: CommandPreparedOptions,
  ) => Promise<Result>
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
  readonly tracked?:
    | ((
        value: unknown,
        actorId: string,
        expectation: CommandExecutionExpectation,
        options?: CommandPreparedOptions,
      ) => CommandExecutionTicket)
    | undefined
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
  const allDescriptors = () => options.catalog().items
  const publicCatalog = () => {
    const catalog = options.catalog()
    return { ...catalog, items: catalog.items.filter((value) => value.metadata.visibility !== 'internal') }
  }
  const service = {
    prepare: (value: unknown) => options.call<CommandInvocation>('commands', 'prepare', [value]),
    dispatch: (value: unknown, actorId: string) => options.call('commands', 'dispatch', [value, actorId]),
    dispatchPrepared: (
      value: unknown,
      actorId: string,
      expectation: CommandExecutionExpectation,
      executeOptions?: CommandPreparedOptions,
    ) => options.call('commands', 'dispatchPrepared', [value, actorId, expectation], executeOptions),
    dispatchPreparedTracked: (
      value: unknown,
      actorId: string,
      expectation: CommandExecutionExpectation,
      executeOptions?: CommandPreparedOptions,
    ) => {
      if (!options.tracked)
        throw new HbarError('CAPABILITY_UNAVAILABLE', 'The Controller transport has no physical command tracking')
      return options.tracked(value, actorId, expectation, executeOptions)
    },
    describe(id: string) {
      const descriptor = allDescriptors().find((value) => value.metadata.id === id)
      if (!descriptor)
        throw new HbarError('COMMAND_NOT_FOUND', 'Command is absent from the activated Controller catalog')
      return descriptor
    },
    list: (filter?: { readonly includeInternal?: boolean }) =>
      filter?.includeInternal ? options.catalog() : publicCatalog(),
  }
  // The listener is composed before the first Controller has published its catalog.
  // This initial routing index may be empty; resolveCommand and every catalog read
  // still consult the real owner, so recovery is never presented as an empty catalog.
  const initialCommandIds = (): string[] => {
    try {
      return allDescriptors().map((value) => value.metadata.id)
    } catch (error) {
      if (error instanceof HbarError && error.code === 'RUNTIME_RECOVERING') return []
      throw error
    }
  }
  const commandIds = initialCommandIds()
  const commandDispatchers = new Map(commandIds.map((id) => [id, service.dispatch]))
  const commandDescribers = new Map(commandIds.map((id) => [id, () => service.describe(id)]))
  return {
    ...remote,
    commandServices: [{ commandIds, service }],
    commandDispatchers,
    commandDescribers,
    resolveCommand: (id) => (allDescriptors().some((value) => value.metadata.id === id) ? service : null),
    scheduleController: { start: options.start, close: options.stop },
    dispose: options.stop,
  }
}

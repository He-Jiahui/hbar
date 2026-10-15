import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import type { Device, HostInfo, PluginInfo } from '@hbar/contracts'
import { systemCommands } from '@hbar/contracts/commands/system'
import type { StorageLocationApply, StorageLocationSnapshot } from '@hbar/contracts/commands/storage-locations'
import type { RuntimeSnapshot, RuntimeReload, RuntimeDelta, RuntimeWatchResult } from '@hbar/contracts/runtime'
export interface RuntimeSystemPort {
  attachCommandRouting?(port: import('@hbar/commands').CommandRoutingPort): () => void
  readonly maintenance?: import('./runtime-maintenance-contract').RuntimeMaintenancePort
  authenticationAvailable?(): boolean
  subscribe?(listener: (delta: RuntimeDelta) => void): () => void
  watch?(cursor?: number): RuntimeWatchResult
  snapshot(): RuntimeSnapshot
  reload(artifactSetId: string, unitIds: readonly string[]): { operationId: string }
  getReload(operationId: string): RuntimeReload
  cancelReload(operationId: string): RuntimeReload
}

export interface SystemPaths {
  dataRoot: string
  cacheRoot: string
  database: string
  sessions: string
  skills: string
  plugins: string
  diagnostics: string
  settings: string
  artifacts: string
  pointerFile: string
  cacheBytes: number
  restartRequired: boolean
}

export interface SystemCommandDependencies {
  hostInfo(): HostInfo
  diagnose(): Promise<{
    database: Record<string, number>
    recoveredRuns: number
    plugins: PluginInfo[]
    tools: string[]
    streams: number
  }>
  paths(): Promise<SystemPaths>
  validatePaths(dataRoot: string, cacheRoot: string): Promise<{ dataRoot: string; cacheRoot: string; valid: true }>
  setPaths(dataRoot: string, cacheRoot: string): Promise<SystemPaths>
  storageLocations(): Promise<StorageLocationSnapshot>
  applyStorageLocations(input: StorageLocationApply): Promise<StorageLocationSnapshot>
  devices(): Promise<Device[]>
  revokeDevice(id: string): Promise<{ revoked: boolean }>
  createPairing(access?: import('@hbar/contracts/device').DeviceAccess): { code: string; expiresAt: number }
  restart?(): boolean | Promise<boolean>
  runtime?: RuntimeSystemPort
}

export function createSystemCommands(dependencies: SystemCommandDependencies) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value> | Value): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const runtime = (): RuntimeSystemPort => {
    if (!dependencies.runtime) throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Start the managed Host entry to install runtime unit management')
    return dependencies.runtime
  }
  registry.register(systemCommands['system.runtime.get'], () => translate(() => runtime().snapshot()))
  registry.register(systemCommands['system.runtime.reload'], input => translate(() => runtime().reload(input.artifactSetId, input.unitIds)))
  registry.register(systemCommands['system.runtime.reload.get'], input => translate(() => runtime().getReload(input.operationId)))
  registry.register(systemCommands['system.runtime.reload.cancel'], input => translate(() => runtime().cancelReload(input.operationId)))

  registry.register(systemCommands['system.diagnose'], async () => ({
    host: dependencies.hostInfo(),
    ...(await dependencies.diagnose()),
  }))
  registry.register(systemCommands['system.paths.get'], () => translate(() => dependencies.paths()))
  registry.register(systemCommands['system.storage.get'], () => translate(() => dependencies.storageLocations()))
  registry.register(
    systemCommands['system.storage.apply'],
    (input) => translate(() => dependencies.applyStorageLocations(input)),
    { durable: true },
  )
  registry.register(
    systemCommands['system.paths.validate'],
    ({ dataRoot, cacheRoot }) => translate(() => dependencies.validatePaths(dataRoot, cacheRoot)),
    { durable: true },
  )
  registry.register(
    systemCommands['system.paths.set'],
    ({ dataRoot, cacheRoot }) => translate(() => dependencies.setPaths(dataRoot, cacheRoot)),
    { durable: true },
  )
  registry.register(systemCommands['system.restart'], async () => {
    const accepted = (await dependencies.restart?.()) ?? false
    return { accepted, restartRequired: !accepted }
  })
  registry.register(systemCommands['device.list'], () => translate(() => dependencies.devices()))
  registry.register(systemCommands['device.revoke'], ({ id }) => translate(() => dependencies.revokeDevice(id)), {
    durable: true,
  })
  registry.register(systemCommands['pairing.create'], (access) => translate(() => dependencies.createPairing(access)), {
    durable: true,
  })

  return {
    ...createCommandClient(systemCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

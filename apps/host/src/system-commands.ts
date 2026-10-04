import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import type { Device, HostInfo, PluginInfo } from '@hbar/contracts'
import { systemCommands } from '@hbar/contracts/commands/system'

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
  devices(): Promise<Device[]>
  revokeDevice(id: string): Promise<{ revoked: boolean }>
  createPairing(): { code: string; expiresAt: number }
  restart?(): boolean | Promise<boolean>
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

  registry.register(systemCommands['system.diagnose'], async () => ({
    host: dependencies.hostInfo(),
    ...(await dependencies.diagnose()),
  }))
  registry.register(systemCommands['system.paths.get'], () => translate(() => dependencies.paths()))
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
  registry.register(systemCommands['pairing.create'], () => translate(() => dependencies.createPairing()), {
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

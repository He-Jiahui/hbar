import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import type { PluginInfo } from '@hbar/contracts'
import { extensionCommands, type SkillDescriptor } from '@hbar/contracts/commands/extensions'
import type { SkillInspectionService } from './skill-inspection.ts'
import type { SkillImportService } from '@hbar/kernel/skill-import'

export interface ExtensionCommandDependencies {
  list(): PluginInfo[]
  set(id: string, enabled: boolean, config?: Record<string, unknown>): Promise<PluginInfo[]>
  install(path: string, projectId?: string): Promise<PluginInfo[]>
  remove(id: string): Promise<PluginInfo[]>
  resolve(id?: string): { order: string[]; enabled: string[] }
  graph(): {
    nodes: { id: string; version: string; enabled: boolean }[]
    edges: { from: string; to: string; kind: string; range: string }[]
  }
  lock(): Promise<{ version: 1; plugins: Record<string, unknown> }>
  doctor(): { ok: boolean; errors: string[]; order?: string[] }
  skills(signal?: AbortSignal): Promise<SkillDescriptor[]>
  skillInspection?: SkillInspectionService
  skillImport?: SkillImportService
}

export function createExtensionCommands(dependencies: ExtensionCommandDependencies) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value> | Value): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(extensionCommands['plugin.list'], () => dependencies.list())
  registry.register(
    extensionCommands['plugin.inspect'],
    ({ id }) => dependencies.list().find((item) => item.id === id) ?? null,
  )
  registry.register(
    extensionCommands['plugin.set'],
    ({ id, enabled, config }) => translate(() => dependencies.set(id, enabled, config)),
    { durable: true },
  )
  registry.register(
    extensionCommands['plugin.install'],
    ({ path, projectId }) => translate(() => dependencies.install(path, projectId)),
    { durable: true },
  )
  registry.register(extensionCommands['plugin.scan'], () => dependencies.list())
  registry.register(extensionCommands['plugin.remove'], ({ id }) => translate(() => dependencies.remove(id)), {
    durable: true,
  })
  registry.register(extensionCommands['plugin.enable'], ({ id }) => translate(() => dependencies.set(id, true)), {
    durable: true,
  })
  registry.register(extensionCommands['plugin.disable'], ({ id }) => translate(() => dependencies.set(id, false)), {
    durable: true,
  })
  registry.register(extensionCommands['plugin.resolve'], ({ id }) => translate(() => dependencies.resolve(id)))
  registry.register(extensionCommands['plugin.graph'], () => dependencies.graph())
  registry.register(extensionCommands['plugin.lock'], () => translate(() => dependencies.lock()))
  registry.register(extensionCommands['plugin.doctor'], () => dependencies.doctor())
  registry.register(extensionCommands['skill.list'], (_input, context) =>
    translate(() => dependencies.skills(context.signal)),
  )
  const imports = () => {
    if (!dependencies.skillImport)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Skill import is unavailable on this Host')
    return dependencies.skillImport
  }
  registry.register(extensionCommands['skill.import.preview'], (input, context) =>
    translate(() => imports().preview(input, context.signal)),
  )
  registry.register(
    extensionCommands['skill.import.start'],
    (input, context) => translate(() => imports().start(input, context.actorId ?? 'local')),
    { durable: true },
  )
  registry.register(extensionCommands['skill.import.get'], ({ operationId }, context) =>
    translate(() => imports().get(operationId, context.actorId ?? 'local')),
  )
  registry.register(extensionCommands['skill.import.latest'], (_input, context) =>
    translate(() => imports().latest(context.actorId ?? 'local')),
  )
  registry.register(
    extensionCommands['skill.import.cancel'],
    ({ operationId }, context) => translate(() => imports().cancel(operationId, context.actorId ?? 'local')),
    { durable: true },
  )
  registry.register(extensionCommands['skill.inspect'], ({ id }, context) => {
    const inspection = dependencies.skillInspection
    if (!inspection) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Skill inspection is unavailable on this Host')
    return translate(() => inspection.inspect(id, context.signal))
  })
  registry.register(extensionCommands['skill.file.read'], ({ id, path }, context) => {
    const inspection = dependencies.skillInspection
    if (!inspection) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Skill file reads are unavailable on this Host')
    return translate(() => inspection.readFile(id, path, context.signal))
  })

  return {
    ...createCommandClient(extensionCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

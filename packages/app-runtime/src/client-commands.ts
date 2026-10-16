import { createCommandRouter, type CommandRegistry, type TrackedCommandRoutingPort } from '@hbar/commands'
import { surfaceCommands } from '@hbar/contracts/commands/surfaces'

/** Publishes actual registered handlers while keeping internal commands and registries private. */
export function createApplicationClientCommands(
  local: CommandRegistry,
  platform: CommandRegistry,
  hasPlatform: boolean,
): {
  readonly commands: readonly string[]
  readonly routing: TrackedCommandRoutingPort
} {
  const definitions = new Map(
    Object.values(surfaceCommands)
      .filter(
        (definition) =>
          definition.metadata.visibility !== 'internal' &&
          (definition.metadata.execution !== 'platform' || hasPlatform),
      )
      .map((definition) => [definition.metadata.id, definition]),
  )
  const registryFor = (id: string) => (definitions.get(id)?.metadata.execution === 'platform' ? platform : local)
  const routing = createCommandRouter({
    catalogs: () => [
      {
        revision: local.list().revision + platform.list().revision,
        items: [...definitions.keys()].map((id) => registryFor(id).describe(id)),
      },
    ],
    resolve(id) {
      if (!definitions.has(id)) return undefined
      const registry = registryFor(id)
      return {
        describe: () => registry.describe(id),
        prepare: (value) => registry.prepare(value),
        dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
        dispatchPrepared: registry.dispatchPrepared.bind(registry),
        dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
      }
    },
  })
  return Object.freeze({ commands: Object.freeze([...definitions.keys()].sort()), routing: Object.freeze(routing) })
}

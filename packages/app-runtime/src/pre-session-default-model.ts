import { CommandError, type CommandExecutor } from '@hbar/commands'
import { thinkingLevelSchema } from '@hbar/contracts'
import { modelCommands } from '@hbar/contracts/commands/models'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { encodePath } from '@hbar/schema-core'

const field = (name: string) => encodePath([{ kind: 'field', name }])

/** Resolve real inherited settings, never guess from catalog order or create a Session. */
export async function readPreSessionDefaultModel(
  settings: CommandExecutor,
  models: CommandExecutor,
  workspaceId: string | null,
  signal: AbortSignal,
) {
  const controller = new AbortController()
  const scope = workspaceId ? { kind: 'workspace' as const, targetId: workspaceId } : { kind: 'global' as const }
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let removeAbort = () => {}
  const stopped = new Promise<never>((_resolve, reject) => {
    const abort = () => reject(new CommandError(signal.aborted ? 'CANCELLED' : 'TIMEOUT', 'Default model read stopped'))
    controller.signal.addEventListener('abort', abort, { once: true })
    removeAbort = () => controller.signal.removeEventListener('abort', abort)
    if (controller.signal.aborted) abort()
  })
  try {
    if (signal.aborted) throw new CommandError('CANCELLED', 'Default model read was cancelled before dispatch')
    const snapshot = settingsCommands['settings.get'].output.parse(
      await Promise.race([settings.execute('settings.get', { scope }, { signal: controller.signal }), stopped]),
    )
    if (JSON.stringify(snapshot.scope) !== JSON.stringify(scope))
      throw new CommandError('INVALID_OUTPUT', 'Default model settings belong to another scope')
    const modelId = snapshot.resolution.reports[field('provider.model')]?.effectiveValue
    if (modelId === null) return null
    if (typeof modelId !== 'string') throw new CommandError('INVALID_OUTPUT', 'Default model settings are missing')
    const catalog = modelCommands['model.list'].output.parse(
      await Promise.race([models.execute('model.list', {}, { signal: controller.signal }), stopped]),
    )
    if (new Set(catalog.map((model) => model.id)).size !== catalog.length)
      throw new CommandError('INVALID_OUTPUT', 'Default model catalog contains duplicate IDs')
    const model = catalog.find((item) => item.id === modelId)
    if (!model) throw new CommandError('MODEL_NOT_FOUND', 'Default model is no longer available')
    const level = thinkingLevelSchema.safeParse(
      snapshot.resolution.reports[field('provider.thinkingLevel')]?.effectiveValue,
    )
    const thinkingLevel =
      level.success && model.thinkingLevels.includes(level.data) ? level.data : model.defaultThinkingLevel
    if (!model.thinkingLevels.includes(thinkingLevel))
      throw new CommandError('INVALID_OUTPUT', 'Default thinking level is not supported')
    return { modelId: model.id, thinkingLevel }
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', cancel)
    removeAbort()
  }
}

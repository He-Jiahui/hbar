import { CommandRegistry, CommandError, createCommandClient, type ExecuteOptions } from '@hbar/commands'
import { applicationCommands, navigationCommands } from '@hbar/contracts/commands'
import { createState } from './state'
import { createDirectoryModule } from './directory'
import { registerNavigationCommands } from './navigation'
import type { NavigationState, RuntimeOptions } from './types'
export type { StateReader } from './state'
export type { DirectoryState, NavigationState, RuntimeOptions } from './types'
export { SessionSelectionError } from './navigation'

export function createAppRuntime(options: RuntimeOptions) {
  if (!options.instanceId || !options.hostId)
    throw new CommandError('INVALID_INPUT', 'Runtime and Host identities are required')
  const onSubscriberError = (error: unknown): void => {
    try {
      options.onSubscriberError?.(error)
    } catch {
      /* An observer cannot change command success or block other observers. */
    }
  }
  const navigation = createState<NavigationState>(
    { workspaceId: null, sessionId: null, status: 'idle', error: null },
    onSubscriberError,
  )

  const local = new CommandRegistry({ execution: 'client' })
  let disposed = false
  const directory = createDirectoryModule(
    options,
    navigation.reader,
    (id) => {
      const current = navigation.reader.getSnapshot()
      if (current.sessionId === id) navigation.replace({ ...current, sessionId: null, status: 'idle', error: null })
    },
    onSubscriberError,
  )
  const remote = directory.registry
  registerNavigationCommands(local, directory.queries, navigation, () => disposed)
  const executor = {
    execute(name: string, input: unknown, execution?: ExecuteOptions) {
      return Object.hasOwn(navigationCommands, name)
        ? local.execute(name, input, execution)
        : remote.execute(name, input, execution)
    },
  }
  const view = Object.freeze({
    instanceId: options.instanceId,
    hostId: options.hostId,
    state: Object.freeze({ navigation: navigation.reader, directory: directory.reader }),
    commands: Object.freeze(createCommandClient(applicationCommands, executor)),
    async executeText(source: string, execution?: ExecuteOptions): Promise<unknown> {
      const name = source.trim().split(/\s/, 1)[0] ?? ''
      return Object.hasOwn(navigationCommands, name)
        ? local.executeText(source, execution)
        : remote.executeText(source, execution)
    },
  })
  return {
    view,
    dispose() {
      if (disposed) return
      disposed = true

      local.dispose()
      directory.dispose()
      navigation.dispose()
    },
  }
}

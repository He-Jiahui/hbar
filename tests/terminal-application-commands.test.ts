import { expect, test } from 'bun:test'
import {
  TERMINAL_APPLICATION_ALIASES,
  createTerminalApplicationCommands,
  isTerminalApplicationCommand,
} from '../packages/terminal/src/index.ts'
import { createAppRuntime } from '@hbar/app-runtime'

test('terminal UI aliases execute the same typed application commands as direct invocation', async () => {
  const effects: string[] = []
  const application = createTerminalApplicationCommands({
    clearTranscript() {
      effects.push('clear')
    },
    async closeTerminal() {
      await Promise.resolve()
      effects.push('close')
    },
  })
  expect(TERMINAL_APPLICATION_ALIASES).toEqual({
    clear: 'app.clearTranscript',
    quit: 'app.closeTerminal',
    q: 'app.closeTerminal',
  })
  expect(isTerminalApplicationCommand('app.clearTranscript')).toBe(true)
  expect(isTerminalApplicationCommand('app.missing')).toBe(false)
  const clearCommand = TERMINAL_APPLICATION_ALIASES.clear
  if (!clearCommand) throw new Error('Clear command alias is missing')
  await expect(application.commands.execute(clearCommand, {})).resolves.toEqual({
    cleared: true,
  })
  await expect(application.commands.execute('app.closeTerminal', {})).resolves.toEqual({ closed: true })
  expect(effects).toEqual(['clear', 'close'])
  application.dispose()
  await expect(application.commands.execute('app.clearTranscript', {})).rejects.toHaveProperty('code', 'DISPOSED')
})

test('non-terminal runtimes reject terminal application commands as unavailable', async () => {
  const runtime = createAppRuntime({
    instanceId: 'headless',
    hostId: 'host',
    directory: { execute: () => Promise.resolve(null) },
  })
  await expect(runtime.view.commands.execute('app.clearTranscript', {})).rejects.toHaveProperty(
    'code',
    'CAPABILITY_UNAVAILABLE',
  )
  runtime.dispose()
})

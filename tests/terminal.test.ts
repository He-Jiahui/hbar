import { expect, test } from 'bun:test'
import { BUILTIN_TERMINAL_COMMANDS, CommandRegistry, parseTerminalInput } from '../packages/terminal/src/index.ts'

test('terminal parser preserves quoted arguments and distinguishes messages', () => {
  expect(parseTerminalInput('  explain this code  ')).toEqual({ kind: 'message', text: 'explain this code' })
  expect(parseTerminalInput('/export "D:\\Reports\\session one.jsonl"')).toEqual({
    kind: 'command',
    invocation: {
      command: 'export',
      args: ['D:\\Reports\\session one.jsonl'],
      source: '/export "D:\\Reports\\session one.jsonl"',
    },
  })
  expect(() => parseTerminalInput('/switch "unfinished')).toThrow('Unclosed')
})

test('command registry resolves aliases, completes commands and disposes registrations', async () => {
  const registry = new CommandRegistry<string[]>()
  const quit = BUILTIN_TERMINAL_COMMANDS.find((command) => command.id === 'quit')!
  const dispose = registry.register(quit, (invocation, calls) => {
    calls.push(invocation.command)
  })
  const calls: string[] = []
  expect(await registry.execute({ command: 'q', args: [], source: '/q' }, calls)).toBe(true)
  expect(calls).toEqual(['quit'])
  expect(registry.complete('qu')).toMatchObject([{ value: '/quit' }])
  dispose()
  expect(await registry.execute({ command: 'quit', args: [], source: '/quit' }, calls)).toBe(false)
})

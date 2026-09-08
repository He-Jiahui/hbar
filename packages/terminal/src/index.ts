import type { TerminalCommand, TerminalKeybinding } from '@hbar/contracts'
export type {
  TerminalCommand,
  TerminalCommandGroup,
  TerminalCommandResult,
  TerminalContribution,
  TerminalEvent,
  TerminalKeybinding,
  TerminalSnapshot,
} from '@hbar/contracts'

export interface CommandInvocation {
  command: string
  args: string[]
  source: string
}

export type TerminalInput = { kind: 'message'; text: string } | { kind: 'command'; invocation: CommandInvocation }

export interface CompletionCandidate {
  value: string
  label: string
  description?: string | undefined
  kind: 'command' | 'argument' | 'session' | 'model' | 'plugin' | 'skill'
}

export interface ApprovalPrompt {
  id: string
  tool: string
  summary: string
  args: Record<string, unknown>
}

export type TerminalCommandHandler<Context> = (invocation: CommandInvocation, context: Context) => void | Promise<void>

interface RegisteredCommand<Context> {
  command: TerminalCommand
  handler: TerminalCommandHandler<Context>
}

export class CommandRegistry<Context> {
  private readonly registrations = new Map<string, RegisteredCommand<Context>>()
  private readonly aliases = new Map<string, string>()

  register(command: TerminalCommand, handler: TerminalCommandHandler<Context>): () => void {
    const id = normalizeName(command.id)
    if (!id || this.registrations.has(id) || this.aliases.has(id))
      throw new Error(`Terminal command is already registered: ${command.id}`)
    const aliases = (command.aliases ?? []).map(normalizeName)
    for (const alias of aliases) {
      if (!alias || this.registrations.has(alias) || this.aliases.has(alias))
        throw new Error(`Terminal command alias is already registered: ${alias}`)
    }
    this.registrations.set(id, { command: { ...command, id }, handler })
    for (const alias of aliases) this.aliases.set(alias, id)
    return () => {
      this.registrations.delete(id)
      for (const alias of aliases) if (this.aliases.get(alias) === id) this.aliases.delete(alias)
    }
  }

  list(): TerminalCommand[] {
    return [...this.registrations.values()].map(({ command }) => command).sort((a, b) => a.id.localeCompare(b.id))
  }

  complete(prefix: string): CompletionCandidate[] {
    const normalized = normalizeName(prefix)
    return this.list()
      .filter(
        (command) =>
          command.id.startsWith(normalized) || command.aliases?.some((alias) => alias.startsWith(normalized)),
      )
      .map((command) => ({
        value: `/${command.id}`,
        label: command.usage,
        description: command.description,
        kind: 'command',
      }))
  }

  async execute(invocation: CommandInvocation, context: Context): Promise<boolean> {
    const requested = normalizeName(invocation.command)
    const id = this.aliases.get(requested) ?? requested
    const registration = this.registrations.get(id)
    if (!registration) return false
    await registration.handler({ ...invocation, command: id }, context)
    return true
  }
}

function normalizeName(value: string) {
  return value.trim().replace(/^\/+/, '').toLowerCase()
}

function tokenize(source: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | undefined
  const value = source.trim()
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!
    if (character === '\\' && quote !== "'" && ['\\', '"', "'", ' '].includes(value[index + 1] ?? '')) {
      token += value[++index]!
    } else if (quote) {
      if (character === quote) quote = undefined
      else token += character
    } else if (character === '"' || character === "'") quote = character
    else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token)
        token = ''
      }
    } else token += character
  }
  if (quote) throw new Error(`Unclosed ${quote} quote`)
  if (token) tokens.push(token)
  return tokens
}

export function parseTerminalInput(source: string): TerminalInput {
  const value = source.trim()
  if (value.startsWith('//')) return { kind: 'message', text: value.slice(1) }
  if (!value.startsWith('/')) return { kind: 'message', text: value }
  const [command = '', ...args] = tokenize(value.slice(1))
  return { kind: 'command', invocation: { command: normalizeName(command), args, source: value } }
}

export const BUILTIN_TERMINAL_COMMANDS = [
  { id: 'help', title: 'Help', description: 'List keyboard and slash commands', usage: '/help', group: 'system' },
  { id: 'new', title: 'New session', description: 'Create and select a session', usage: '/new', group: 'session' },
  { id: 'sessions', title: 'Sessions', description: 'List project sessions', usage: '/sessions', group: 'session' },
  {
    id: 'switch',
    title: 'Switch session',
    description: 'Select a session',
    usage: '/switch <id|name>',
    aliases: ['resume'],
    group: 'session',
  },
  { id: 'fork', title: 'Fork session', description: 'Fork the current session', usage: '/fork', group: 'session' },
  {
    id: 'archive',
    title: 'Archive session',
    description: 'Archive the current session',
    usage: '/archive',
    group: 'session',
  },
  { id: 'model', title: 'Model', description: 'List or select a model', usage: '/model [id|name]', group: 'model' },
  {
    id: 'thinking',
    title: 'Thinking',
    description: 'Set the reasoning level',
    usage: '/thinking <level>',
    group: 'model',
  },
  { id: 'compact', title: 'Compact', description: 'Compact the current context', usage: '/compact', group: 'run' },
  {
    id: 'approve',
    title: 'Approve',
    description: 'Approve a pending tool call',
    usage: '/approve [approval-id]',
    group: 'run',
  },
  { id: 'deny', title: 'Deny', description: 'Deny a pending tool call', usage: '/deny [approval-id]', group: 'run' },
  { id: 'stop', title: 'Stop', description: 'Cancel the current session run', usage: '/stop', group: 'run' },
  { id: 'retry', title: 'Retry', description: 'Repeat the last message', usage: '/retry', group: 'run' },
  {
    id: 'export',
    title: 'Export',
    description: 'Export canonical session JSONL',
    usage: '/export [path]',
    group: 'session',
  },
  {
    id: 'plugins',
    title: 'Plugins',
    description: 'Inspect and manage plugins',
    usage: '/plugins [action]',
    group: 'extensions',
  },
  { id: 'skills', title: 'Skills', description: 'List global skills', usage: '/skills', group: 'extensions' },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Inspect or change settings',
    usage: '/settings [approval <mode>]',
    group: 'system',
  },
  { id: 'paths', title: 'Paths', description: 'Show active data and cache paths', usage: '/paths', group: 'system' },
  { id: 'diagnose', title: 'Diagnose', description: 'Run Host diagnostics', usage: '/diagnose', group: 'system' },
  { id: 'clear', title: 'Clear', description: 'Clear the visible transcript', usage: '/clear', group: 'system' },
  { id: 'quit', title: 'Quit', description: 'Close the terminal UI', usage: '/quit', aliases: ['q'], group: 'system' },
] as const satisfies readonly TerminalCommand[]

export const DEFAULT_KEYBINDINGS = [
  { key: 'ctrl+c', command: 'run.cancel-or-clear' },
  { key: 'ctrl+l', command: 'view.clear' },
  { key: 'ctrl+p', command: 'session.next' },
] as const satisfies readonly TerminalKeybinding[]

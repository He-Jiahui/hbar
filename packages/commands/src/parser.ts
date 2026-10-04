import { CommandError, type CommandArgument, type CommandMetadata } from './protocol'

export const MAX_COMMAND_TEXT_LENGTH = 65_536
export const MAX_COMMAND_ARGUMENTS = 128

/** REPL grammar: quotes group text; backslash escapes a quote, preserving Windows paths. No shell expansion. */
export function tokenizeCommand(source: string): string[] {
  if (source.length > MAX_COMMAND_TEXT_LENGTH)
    throw new CommandError('INPUT_TOO_LARGE', 'Command text exceeds the limit')
  const tokens: string[] = []
  let token = '',
    started = false
  let quote: '"' | "'" | undefined
  const push = (): void => {
    if (!started) return
    tokens.push(token)
    if (tokens.length > MAX_COMMAND_ARGUMENTS) throw new CommandError('INPUT_TOO_LARGE', 'Too many command arguments')
    token = ''
    started = false
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    const next = source[index + 1]
    if (character === undefined) break
    if (character === '\\' && quote !== "'" && next === '"') {
      token += next
      started = true
      index++
    } else if (quote !== undefined) {
      if (character === quote) quote = undefined
      else token += character
    } else if (character === '"' || character === "'") {
      quote = character
      started = true
    } else if (/\s/.test(character)) push()
    else {
      token += character
      started = true
    }
  }
  if (quote !== undefined) throw new CommandError('INVALID_SYNTAX', 'Unclosed quote')
  push()
  return tokens
}

function convert(value: string, argument: CommandArgument): unknown {
  switch (argument.type) {
    case 'string':
      return value
    case 'number': {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value)))
        throw new CommandError('INVALID_INPUT', 'Expected a finite number', [
          { path: [argument.field], code: 'invalid_number' },
        ])
      return Number(value)
    }
    case 'boolean':
      if (value === 'true') return true
      if (value === 'false') return false
      throw new CommandError('INVALID_INPUT', 'Expected true or false', [
        { path: [argument.field], code: 'invalid_boolean' },
      ])
    case 'json':
      try {
        return JSON.parse(value) as unknown
      } catch {
        throw new CommandError('INVALID_INPUT', 'Expected JSON', [{ path: [argument.field], code: 'invalid_json' }])
      }
  }
}

/** Already-tokenized argv must never be joined and tokenized a second time. */
export function parseArguments(metadata: CommandMetadata, argv: readonly string[]): Record<string, unknown> {
  if (
    argv.length > MAX_COMMAND_ARGUMENTS ||
    argv.reduce((sum, arg) => sum + arg.length + 1, 0) > MAX_COMMAND_TEXT_LENGTH
  )
    throw new CommandError('INPUT_TOO_LARGE', 'Command arguments exceed the limit')
  const values = new Map<string, unknown>()
  const positions = metadata.cli.arguments
    .filter((arg) => arg.position !== undefined)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  let positional = 0,
    literal = false
  const assign = (argument: CommandArgument, value: string): void => {
    if (values.has(argument.field)) throw new CommandError('INVALID_SYNTAX', 'Argument supplied more than once')
    values.set(argument.field, convert(value, argument))
  }
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (token === undefined) break
    if (!literal && token === '--') {
      if (metadata.cli.remainder !== undefined) {
        values.set(metadata.cli.remainder, argv.slice(index + 1).join(' '))
        break
      }
      literal = true
      continue
    }
    if (!literal && token.startsWith('--')) {
      const separator = token.indexOf('=')
      const flag = token.slice(2, separator < 0 ? undefined : separator)
      const argument = metadata.cli.arguments.find((arg) => arg.flag === flag)
      if (!argument) throw new CommandError('INVALID_SYNTAX', 'Unknown command flag')
      let value = separator < 0 ? undefined : token.slice(separator + 1)
      if (value === undefined && argument.type === 'boolean') value = 'true'
      if (value === undefined) {
        value = argv[++index]
        if (value === undefined || value.startsWith('--'))
          throw new CommandError(
            'INVALID_SYNTAX',
            'Missing flag value; use --flag=value for a literal beginning with --',
          )
      }
      assign(argument, value)
    } else {
      const argument = positions[positional++]
      if (!argument) throw new CommandError('INVALID_SYNTAX', 'Unexpected positional argument')
      assign(argument, token)
    }
  }
  return Object.fromEntries(values)
}

import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { CLI_OPTIONS } from './cli-options'
import type { CliArgs } from './args'

export type PublicServiceEntry =
  { readonly kind: 'application' } | { readonly kind: 'workspace' | 'node'; readonly argv: readonly string[] }

/** Locate the command through parser tokens, never through option values that happen to be named serve/node. */
export function publicServiceEntry(argv: readonly string[]): PublicServiceEntry {
  const parsed = parseArgs({
    args: [...argv],
    options: CLI_OPTIONS,
    allowPositionals: true,
    strict: false,
    tokens: true,
  })
  const command = parsed.tokens.find((token) => token.kind === 'positional')
  if (parsed.values.help || !command || command.kind !== 'positional') return { kind: 'application' }
  if (command.value === 'serve') {
    if (parsed.values['connect-only']) throw new Error('--connect-only cannot be used with serve')
    if (parsed.values.role !== undefined && parsed.values.role !== 'conversation' && parsed.values.role !== 'workspace')
      throw new Error('Invalid --role: use conversation or workspace')
    if (parsed.values.role !== 'workspace') return { kind: 'application' }
    if (Boolean(parsed.values.cert) !== Boolean(parsed.values.key))
      throw new Error('Configure both TLS certificate and key')
    if (parsed.values['public-host'] && (!parsed.values.listen || !parsed.values.cert || !parsed.values.key))
      throw new Error('--public-host requires --listen, --cert and --key for the workspace console')
    return { kind: 'workspace', argv: argv.filter((_value, index) => index !== command.index) }
  }
  return command.value === 'node'
    ? { kind: 'node', argv: argv.filter((_value, index) => index !== command.index) }
    : { kind: 'application' }
}

export function conversationHostArguments(args: CliArgs): readonly string[] {
  if (args.role !== undefined && args.role !== 'conversation') throw new Error('Host role must be conversation')
  if (args.join || args.code || args.fingerprint || args.listen || args.publicHost || args.stdio)
    throw new Error('Node link and console options require --role workspace')
  if (Boolean(args.cert) !== Boolean(args.key)) throw new Error('Configure both TLS certificate and key')
  const port = args.port === undefined ? undefined : Number(args.port)
  if (port !== undefined && (!/^\d+$/.test(args.port ?? '') || !Number.isInteger(port) || port < 0 || port > 65535))
    throw new Error('Invalid --port: use an integer from 0 to 65535')
  return [
    '--supervisor',
    '--service',
    ...(args.role ? ['--role', args.role] : []),
    ...(args.home ? ['--home', args.home] : []),
    ...(args.dataRoot ? ['--data-root', args.dataRoot] : []),
    ...(args.cacheRoot ? ['--cache-root', args.cacheRoot] : []),
    ...(args.host ? ['--host', args.host] : []),
    ...(args.port ? ['--port', args.port] : []),
    ...(args.cert && args.key ? ['--cert', resolve(args.cert), '--key', resolve(args.key)] : []),
    ...(args.project || args.workspace ? ['--workspace', resolve(args.project ?? args.workspace ?? '')] : []),
    ...(args.profile ? ['--profile', resolve(args.profile)] : []),
    ...(args.demo ? ['--demo'] : []),
    ...(args.noLocalExec ? ['--no-local-exec'] : []),
  ]
}

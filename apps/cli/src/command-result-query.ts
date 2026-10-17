import { CommandError, parseArguments, validationError } from '@hbar/commands'
import { createCommandResultClient, type ClientTransport } from '@hbar/client'
import { commandResultCommands } from '@hbar/contracts/commands/command-results'
import type { CommandReceiptReadInput, CommandResultReadInput } from '@hbar/contracts/command-receipt-read'
import type { CliArgs } from './args'

type QueryArgs = Pick<
  CliArgs,
  'commandArgs' | 'operationKey' | 'channel' | 'offset' | 'limit' | 'expectedSha256' | 'requestId'
>
export type PreparedCommandResultQuery =
  | { commandId: 'command.receipt.get'; input: CommandReceiptReadInput }
  | { commandId: 'command.result.read'; input: CommandResultReadInput }

export function isCommandResultQuery(value: string | undefined): value is keyof typeof commandResultCommands {
  return value !== undefined && Object.hasOwn(commandResultCommands, value)
}

/** The CLI resolves its selected Session; the authenticated transport supplies the actor. */
export function prepareCommandResultQuery(args: QueryArgs, sessionId: string): PreparedCommandResultQuery {
  const commandId = args.commandArgs[0]
  if (!isCommandResultQuery(commandId)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown command receipt query')
  const argv = [...args.commandArgs.slice(1), '--session', sessionId]
  for (const [flag, value] of [
    ['operation-key', args.operationKey],
    ['channel', args.channel],
    ['offset', args.offset],
    ['limit', args.limit],
    ['expected-sha256', args.expectedSha256],
  ] as const)
    if (value !== undefined) argv.push(`--${flag}`, value)
  const input = parseArguments(commandResultCommands[commandId].metadata, argv)
  if (commandId === 'command.receipt.get') {
    const parsed = commandResultCommands[commandId].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    return { commandId, input: parsed.data }
  }
  const parsed = commandResultCommands[commandId].input.safeParse(input)
  if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
  return { commandId, input: parsed.data }
}

export async function runCommandResultQuery(
  args: QueryArgs,
  client: ClientTransport,
  sessionId: string,
  output: (value: unknown) => void,
): Promise<void> {
  const query = prepareCommandResultQuery(args, sessionId)
  const commands = createCommandResultClient(client)
  output(
    await commands.execute(query.commandId, query.input, args.requestId ? { requestId: args.requestId } : undefined),
  )
}

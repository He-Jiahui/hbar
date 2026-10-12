import { CommandError, parseArguments, validationError } from '@hbar/commands'
import { createNodeCommandClient, type HbarClient } from '@hbar/client'
import { nodeCommands } from '@hbar/contracts/commands/nodes'
import type { CliArgs } from './args'
import { readFile } from 'node:fs/promises'

export function isNodeManagementCommand(value: string | undefined): value is keyof typeof nodeCommands {
  return Boolean(value && Object.hasOwn(nodeCommands, value))
}
export async function runNodeManagementCommand(
  args: CliArgs,
  client: HbarClient,
  output: (value: unknown) => void = (value) => console.log(JSON.stringify(value, null, 2)),
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isNodeManagementCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown node management command')
  const definition = nodeCommands[action]
  const argv = [...args.commandArgs.slice(1)]
  for (const [flag, value] of [
    ['name', args.name],
    ['after', args.after],
    ['limit', args.limit],
  ] as const)
    if (value !== undefined) argv.push('--' + flag, value)
  if ((args.inputJson || args.inputFile) && argv.length)
    throw new CommandError('INVALID_SYNTAX', 'Use JSON input or individual node command arguments')
  if (args.inputJson && args.inputFile) throw new CommandError('INVALID_SYNTAX', 'Choose one node command input source')
  const raw: unknown = args.inputJson
    ? JSON.parse(args.inputJson)
    : args.inputFile
      ? JSON.parse(await readFile(args.inputFile, 'utf8'))
      : parseArguments(definition.metadata, argv)
  const input = definition.input.safeParse(raw)
  if (!input.success) throw validationError('INVALID_INPUT', input.error)
  output(await createNodeCommandClient(client).execute(action, input.data))
}

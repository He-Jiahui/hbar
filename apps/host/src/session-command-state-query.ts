import { z } from 'zod'
import { describeCommand, type CommandDefinition } from '@hbar/commands'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { commandResultCommands } from '@hbar/contracts/commands/command-results'
import { SESSION_COMMAND_STATE_QUERY_IDS, SESSION_COMMAND_RECEIPT_QUERY_IDS } from '@hbar/kernel/session-command-port'

const commandId = z.enum([...SESSION_COMMAND_STATE_QUERY_IDS, ...SESSION_COMMAND_RECEIPT_QUERY_IDS] as const)
type StateQueryId = z.output<typeof commandId>
const definitions = {
  'goal.get': goalPlanCommands['goal.get'],
  'goal.snapshot': goalPlanCommands['goal.snapshot'],
  'goal.history': goalPlanCommands['goal.history'],
  'plan.get': goalPlanCommands['plan.get'],
  'session.getBudget': budgetCommands['session.getBudget'],
  'mode.get': configurationCommands['mode.get'],
  ...commandResultCommands,
} satisfies Record<StateQueryId, CommandDefinition>
const aliases = {
  'goal.get': ['get_goal'],
  'goal.snapshot': ['get_goal', 'get_plan'],
  'goal.history': ['get_goal'],
  'plan.get': ['get_plan'],
  'session.getBudget': ['get_budget'],
  'mode.get': [],
  'command.receipt.get': [],
  'command.result.read': [],
} satisfies Record<StateQueryId, string[]>

/** Only reviewed session queries use this rule; command metadata alone grants no admission. */
export function sessionStateQueryCommand(id: string) {
  const parsed = commandId.safeParse(id)
  if (!parsed.success) return undefined
  const descriptor = describeCommand(definitions[parsed.data])
  return { metadata: descriptor.metadata, descriptor, aliases: aliases[parsed.data] }
}

/** An omitted target means the source Session. An explicit target still needs current device authorization. */
export function bindSessionStateQueryInput(sessionId: string, input: Record<string, unknown>) {
  return input.sessionId === undefined ? { ...input, sessionId } : { ...input }
}

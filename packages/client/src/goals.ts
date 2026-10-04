import { createCommandClient, COMMAND_PROTOCOL_VERSION, type ExecuteOptions } from '@hbar/commands'
import { goalPlanCommands, goalPlanChangeSchema } from '@hbar/contracts/commands/goals'
import type { GoalPlanChange } from '@hbar/contracts/commands/goals'
import type { GoalHistoryInput } from '@hbar/contracts/commands/goal-history'
import type { WireNotification } from '@hbar/contracts'
import type { ConnectionStatus } from './index'
import type { ClientTransport } from './transport'

export function createGoalPlanCommandClient(client: ClientTransport) {
  const commands = createCommandClient(goalPlanCommands, {
    execute(commandId, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        input,
      })
    },
  })
  return {
    ...commands,
    snapshot: (sessionId: string, options?: ExecuteOptions) =>
      commands.execute('goal.snapshot', { sessionId }, options),
    history: (input: GoalHistoryInput) => commands.execute('goal.history', input),
    watch(sessionId: string, listener: (change: GoalPlanChange | { kind: 'reset' }) => void) {
      const events = client as ClientTransport & {
        onEvent?: (listener: (event: WireNotification) => void) => () => void
        onStatus?: (listener: (status: ConnectionStatus) => void) => () => void
      }
      const offEvent = events.onEvent?.((event) => {
        let change: unknown
        if (event.method === 'goal.updated' && event.params.sessionId === sessionId)
          change = { kind: 'goal', sessionId, seq: event.params.seq, goal: event.params.goal }
        else if (event.method === 'goal.cleared' && event.params.sessionId === sessionId)
          change = { kind: 'goal', sessionId, seq: event.params.seq, goal: null }
        else if (event.method === 'plan.updated' && event.params.sessionId === sessionId)
          change = { kind: 'plan', sessionId, seq: event.params.seq, plan: event.params }
        else if (event.method === 'plan.cleared' && event.params.sessionId === sessionId)
          change = { kind: 'plan', sessionId, seq: event.params.seq, plan: null }
        else return
        const parsed = goalPlanChangeSchema.safeParse(change)
        listener(parsed.success ? parsed.data : { kind: 'reset' })
      })
      const offStatus = events.onStatus?.((status) => {
        if (status === 'connected') listener({ kind: 'reset' })
      })
      return () => {
        offEvent?.()
        offStatus?.()
      }
    },
  }
}

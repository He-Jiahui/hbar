import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { agentCommands, agentProfileIdSchema } from '@hbar/contracts/commands/agents'
import type { AgentService } from '@hbar/plugin-sdk'

export function createAgentCommands(service: AgentService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(agentCommands['agent.profiles.list'], () => [...agentProfileIdSchema.options])
  registry.register(agentCommands['agent.policy.get'], ({ parentSessionId }) =>
    translate(() => service.policy(parentSessionId)),
  )
  registry.register(
    agentCommands['agent.policy.set'],
    (input, context) =>
      translate(() => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and key are required')
        return service.setPolicy(input, { actorId: context.actorId, idempotencyKey: context.idempotencyKey })
      }),
    { durable: true },
  )
  registry.register(
    agentCommands['agent.create'],
    (input, context) =>
      translate(() => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        return service.create(input, {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
        })
      }),
    { durable: true },
  )
  registry.register(agentCommands['agent.result.get'], ({ parentSessionId, agentId }) =>
    translate(() => service.result(parentSessionId, agentId)),
  )
  registry.register(
    agentCommands['agent.patch.apply'],
    ({ parentSessionId, agentId, planRevision }, context) =>
      translate(() => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        return service.applyPatch(parentSessionId, agentId, planRevision, {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
        })
      }),
    { durable: true },
  )
  registry.register(agentCommands['agent.list'], ({ parentSessionId, after, limit }) =>
    translate(() => service.list(parentSessionId, after, limit)),
  )
  registry.register(
    agentCommands['agent.cancel'],
    ({ parentSessionId, agentId }) => translate(() => service.cancel(parentSessionId, agentId)),
    { durable: true },
  )
  return {
    ...createCommandClient(agentCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

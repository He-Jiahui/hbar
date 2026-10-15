import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { computerCommands } from '@hbar/contracts/commands/computer'
import type { ComputerUseService } from '@hbar/plugin-sdk'

export function createComputerCommands(service: ComputerUseService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const translateExternal = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await translate(operation)
    } catch (error) {
      if (error instanceof CommandError && ['COMPUTER_ABORTED', 'COMPUTER_TIMEOUT'].includes(error.code))
        throw new CommandError('RESULT_UNKNOWN', 'Computer action may have completed; inspect computer state')
      throw error
    }
  }
  registry.register(computerCommands['computer.status'], (input, context) =>
    translate(() => service.status(input.sessionId, context.signal)),
  )
  registry.register(computerCommands['computer.screenshot'], (input, context) =>
    translate(() => service.screenshot(input.sessionId, input.appId, context.signal)),
  )
  registry.register(
    computerCommands['computer.click'],
    (input, context) =>
      translateExternal(() => service.click(input.sessionId, input.x, input.y, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.doubleClick'],
    (input, context) =>
      translateExternal(() => service.doubleClick(input.sessionId, input.x, input.y, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.type'],
    (input, context) => translateExternal(() => service.type(input.sessionId, input.text, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.key'],
    (input, context) => translateExternal(() => service.key(input.sessionId, input.key, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.scroll'],
    (input, context) =>
      translateExternal(() => service.scroll(input.sessionId, input.deltaX, input.deltaY, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.move'],
    (input, context) =>
      translateExternal(() => service.move(input.sessionId, input.x, input.y, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.wait'],
    (input, context) =>
      translateExternal(() => service.wait(input.sessionId, input.milliseconds, input.appId, context.signal)),
    { durable: true },
  )
  registry.register(
    computerCommands['computer.launch'],
    (input, context) => translateExternal(() => service.launch(input.sessionId, input.appId, context.signal)),
    { durable: true },
  )
  return {
    ...createCommandClient(computerCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

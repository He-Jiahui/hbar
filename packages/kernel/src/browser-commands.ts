import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { browserCommands } from '@hbar/contracts/commands/browser'
import type { BrowserUseService } from '@hbar/plugin-sdk'

export function createBrowserCommands(service: BrowserUseService) {
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
      if (error instanceof CommandError && ['BROWSER_ABORTED', 'BROWSER_TIMEOUT'].includes(error.code))
        throw new CommandError('RESULT_UNKNOWN', 'Browser action may have completed; inspect browser state')
      throw error
    }
  }
  registry.register(browserCommands['browser.status'], (input, context) =>
    translate(() => service.status(input.sessionId, context.signal)),
  )
  registry.register(
    browserCommands['browser.navigate'],
    (input, context) =>
      translateExternal(() =>
        service.navigate(input.sessionId, input.url, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(browserCommands['browser.snapshot'], (input, context) =>
    translate(() => service.snapshot(input.sessionId, input.contextId, input.pageId, context.signal)),
  )
  registry.register(
    browserCommands['browser.click'],
    (input, context) =>
      translateExternal(() =>
        service.click(input.sessionId, input.selector, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(
    browserCommands['browser.type'],
    (input, context) =>
      translateExternal(() =>
        service.type(input.sessionId, input.selector, input.text, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(
    browserCommands['browser.press'],
    (input, context) =>
      translateExternal(() =>
        service.press(input.sessionId, input.key, input.selector, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(browserCommands['browser.screenshot'], (input, context) =>
    translate(() => service.screenshot(input.sessionId, input.fullPage, input.contextId, input.pageId, context.signal)),
  )
  registry.register(
    browserCommands['browser.evaluate'],
    (input, context) =>
      translateExternal(() =>
        service.evaluate(input.sessionId, input.expression, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(browserCommands['browser.close'], (input, context) =>
    translate(() => service.close(input.sessionId, input.contextId, input.pageId, context.signal)),
  )
  registry.register(browserCommands['browser.history'], (input, context) =>
    translate(() => service.history(input.sessionId, input.contextId, context.signal)),
  )
  return {
    ...createCommandClient(browserCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

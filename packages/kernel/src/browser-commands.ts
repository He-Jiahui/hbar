import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { browserCommands } from '@hbar/contracts/commands/browser'
import type { BrowserUseService } from '@hbar/plugin-sdk'

export function createBrowserCommands(service: BrowserUseService | (() => BrowserUseService)) {
  const registry = new CommandRegistry({ execution: 'host' })
  const browser = (): BrowserUseService => (typeof service === 'function' ? service() : service)
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
    translate(() => browser().status(input.sessionId, context.signal)),
  )
  registry.register(
    browserCommands['browser.navigate'],
    (input, context) =>
      translateExternal(() =>
        browser().navigate(input.sessionId, input.url, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(browserCommands['browser.snapshot'], (input, context) =>
    translate(() => browser().snapshot(input.sessionId, input.contextId, input.pageId, context.signal)),
  )
  registry.register(
    browserCommands['browser.click'],
    (input, context) =>
      translateExternal(() =>
        browser().click(input.sessionId, input.selector, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(
    browserCommands['browser.type'],
    (input, context) =>
      translateExternal(() =>
        browser().type(input.sessionId, input.selector, input.text, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(
    browserCommands['browser.press'],
    (input, context) =>
      translateExternal(() =>
        browser().press(input.sessionId, input.key, input.selector, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(browserCommands['browser.screenshot'], (input, context) =>
    translate(() =>
      browser().screenshot(input.sessionId, input.fullPage, input.contextId, input.pageId, context.signal),
    ),
  )
  registry.register(
    browserCommands['browser.evaluate'],
    (input, context) =>
      translateExternal(() =>
        browser().evaluate(input.sessionId, input.expression, input.contextId, input.pageId, context.signal),
      ),
    { durable: true },
  )
  registry.register(browserCommands['browser.close'], (input, context) =>
    translate(() => browser().close(input.sessionId, input.contextId, input.pageId, context.signal)),
  )
  registry.register(browserCommands['browser.history'], (input, context) =>
    translate(() => browser().history(input.sessionId, input.contextId, context.signal)),
  )
  return {
    ...createCommandClient(browserCommands, registry),
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

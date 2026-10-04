import type { HbarClient } from './index'

export interface SurfaceClientOptions {
  clientId: string
  generation: number
  commands: readonly string[]
  execute(commandId: string, input: unknown): Promise<unknown>
}

export async function registerSurfaceClient(client: HbarClient, options: SurfaceClientOptions) {
  await client.call('surface.register', {
    clientId: options.clientId,
    generation: options.generation,
    commands: [...new Set(options.commands)],
  })
  let disposed = false
  const unsubscribe = client.onEvent((event) => {
    if (
      disposed ||
      event.method !== 'surface.invoke' ||
      event.params.generation !== options.generation ||
      !options.commands.includes(event.params.commandId)
    )
      return
    void (async () => {
      try {
        const result = await options.execute(event.params.commandId, event.params.input)
        await client.call('surface.resolve', {
          clientId: options.clientId,
          generation: options.generation,
          relayId: event.params.relayId,
          ok: true,
          result,
        })
      } catch (error) {
        await client.call('surface.resolve', {
          clientId: options.clientId,
          generation: options.generation,
          relayId: event.params.relayId,
          ok: false,
          error: {
            code:
              error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
                ? error.code
                : 'EXECUTION_FAILED',
            message: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
          },
        })
      }
    })().catch(() => undefined)
  })
  return {
    async dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      await client
        .call('surface.unregister', { clientId: options.clientId, generation: options.generation })
        .catch(() => undefined)
    },
  }
}

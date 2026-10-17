import { registerCommandClient, type HbarClient } from '@hbar/client'
import type { createAppRuntime } from '@hbar/app-runtime'

type AppRuntime = ReturnType<typeof createAppRuntime>

/** Publish after restoration; the same actual endpoint survives transport reconnects until this runtime closes. */
export function publishRuntimeCommands(
  client: HbarClient,
  runtime: AppRuntime,
): {
  readonly runtime: AppRuntime
  readonly ready: Promise<void>
  dispose(): Promise<void>
} {
  let disposed = false
  let closing: Promise<void> | undefined
  const publication = runtime.ready.then(() => {
    if (disposed) return undefined
    return registerCommandClient(client, {
      clientId: `web:${runtime.view.instanceId}`,
      generation: 1,
      commands: runtime.clientCommands.commands,
      routing: runtime.clientCommands.routing,
    })
  })
  const ready = publication.then(() => undefined)
  // RPC failures already enter the Client's bounded diagnostics. Consumers can still inspect this readiness promise.
  void ready.catch(() => undefined)
  function dispose(): Promise<void> {
    if (closing) return closing
    disposed = true
    closing = publication.then(
      (registration) => registration?.dispose(),
      () => undefined,
    )
    void closing.catch(() => undefined)
    runtime.dispose()
    return closing
  }
  return {
    runtime: {
      ...runtime,
      dispose() {
        void dispose()
      },
    },
    ready,
    dispose,
  }
}

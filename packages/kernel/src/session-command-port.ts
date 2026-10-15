import type { CommandCatalogPage, CommandCatalogQuery, CommandDescriptor } from '@hbar/commands'

/** Execution identity comes from the tool gateway; it is absent from model-facing parameters. */
export interface SessionCommandContext {
  readonly sessionId: string
  readonly runId: string
  readonly callId: string
  readonly signal: AbortSignal
}

/** Stable Host discovery. No command handler or permission grant is exposed by these reads. */
export interface SessionCommandDiscoveryPort {
  list(query: CommandCatalogQuery, context: SessionCommandContext): Promise<CommandCatalogPage>
  describe(commandId: string, context: SessionCommandContext): Promise<CommandDescriptor>
}

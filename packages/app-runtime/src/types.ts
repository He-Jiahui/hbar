import type { CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'

export interface RuntimeOptions {
  readonly instanceId: string
  readonly hostId: string
  readonly directory: CommandExecutor
  readonly onSubscriberError?: (error: unknown) => void
}
export interface NavigationState {
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'error'
  readonly error: { readonly code: string; readonly candidates: readonly string[] } | null
}
export interface DirectoryState {
  readonly workspaces: Readonly<Record<string, Readonly<Workspace>>>
  readonly sessions: Readonly<Record<string, Readonly<Session>>>
}

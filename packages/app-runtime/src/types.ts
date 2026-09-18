import type { CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'
import type { BudgetReceipt, SetBudgetInput } from '@hbar/contracts/commands/budget'
import type { PromptAttachment } from '@hbar/contracts/commands/draft'
import type { RunAccepted } from '@hbar/contracts/commands/run'
import type {
  Approval,
  LiveStream,
  Message,
  Run,
  SessionBudget,
  SessionEvent,
  SessionSnapshot,
  StreamDelta,
  Usage,
  UserInputRequest,
} from '@hbar/contracts'
import type { FormState } from '@hbar/schema-core'

export interface BudgetCommandPort {
  execute(id: 'session.getBudget', input: { sessionId: string }): Promise<SessionBudget | null>
  execute(
    id: 'session.setBudget',
    input: SetBudgetInput,
    options: { idempotencyKey: string; requestId?: string },
  ): Promise<BudgetReceipt>
  getReceipt(sessionId: string, idempotencyKey: string): Promise<BudgetReceipt | null>
}

export interface BudgetFormState {
  readonly commandId: 'session.setBudget'
  readonly formId: string
  readonly sessionId: string
  readonly form: FormState
  readonly receipt: BudgetReceipt | null
  readonly pendingKey: string | null
}
export type BudgetFormsState = Readonly<Record<string, BudgetFormState>>

export interface RuntimeOptions {
  readonly instanceId: string
  readonly hostId: string
  readonly directory: CommandExecutor
  readonly timeline?: SessionTimelinePort
  readonly run?: RunCommandPort
  readonly budget?: BudgetCommandPort
  readonly surfaces?: SurfaceCapabilityPort
  readonly platform?: PlatformPort
  readonly onSubscriberError?: (error: unknown) => void
}
export interface RunCommandPort extends CommandExecutor {
  getReceipt(
    sessionId: string,
    idempotencyKey: string,
    commandId?: 'run.submit' | 'run.retry',
  ): Promise<RunAccepted | null>
}

export interface SessionDraftState {
  readonly sessionId: string
  readonly text: string
  readonly attachments: readonly Readonly<PromptAttachment>[]
  readonly revision: number
  readonly status: 'idle' | 'submitting' | 'unknown' | 'failed'
  readonly error: string | null
  readonly lastOperationId: string | null
}
export type DraftsState = Readonly<Record<string, SessionDraftState>>
export type SessionTimelineUpdate =
  | { readonly kind: 'event'; readonly event: SessionEvent }
  | { readonly kind: 'stream'; readonly stream: StreamDelta }
  | { readonly kind: 'reset' }

export interface SessionTimelinePort {
  snapshot(sessionId: string, before?: number, limit?: number): Promise<SessionSnapshot>
  watch(
    sessionId: string,
    cursor: number,
    onUpdate: (update: SessionTimelineUpdate) => void,
  ): Promise<() => void | Promise<void>>
}

export interface SessionTimelineState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly messages: readonly Readonly<Message>[]
  readonly runs: readonly Readonly<Run>[]
  readonly approvals: readonly Readonly<Approval>[]
  readonly userInputs: readonly Readonly<UserInputRequest>[]
  readonly usage: Readonly<Usage>
  readonly streams: Readonly<Record<string, Readonly<LiveStream>>>
  readonly events: readonly Readonly<SessionEvent>[]
  readonly cursor: number
  readonly hasOlder: boolean
  readonly error: string | null
}
export interface SurfaceCapabilityPort {
  canRender(panelId: string): boolean
}
export interface PlatformPort {
  openWindow(window: WindowSurface): Promise<void>
  closeWindow(windowId: string): Promise<void>
}
export interface PanelSurface {
  readonly instanceId: string
  readonly panelId: string
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly binding: 'followActive' | 'pinned'
  readonly params: Readonly<Record<string, unknown>>
}
export interface WindowSurface {
  readonly windowId: string
  readonly page: { readonly kind: string; readonly params: Readonly<Record<string, unknown>> }
}
export interface SurfaceState {
  readonly panels: Readonly<Record<string, PanelSurface>>
  readonly windows: Readonly<Record<string, WindowSurface>>
  readonly focusedPanelId: string | null
  readonly focusedWindowId: string | null
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

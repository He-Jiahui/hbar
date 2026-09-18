import type { CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'
import type { BudgetReceipt, SetBudgetInput } from '@hbar/contracts/commands/budget'
import type { SessionBudget } from '@hbar/contracts'
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
  readonly budget?: BudgetCommandPort
  readonly surfaces?: SurfaceCapabilityPort
  readonly platform?: PlatformPort
  readonly onSubscriberError?: (error: unknown) => void
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

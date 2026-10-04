import { createStore } from 'zustand/vanilla'
import { uniqueHbarAppUiAgentApprovalItems, type HbarAppUiAgentApprovalPermissionContent } from 'hbar-app-ui/catalog'

type PermissionContent = HbarAppUiAgentApprovalPermissionContent | undefined
type Decision = 'approved' | 'rejected'

export interface PermissionPreviewState {
  readonly content: PermissionContent
  readonly selections: ReadonlyMap<string, boolean>
  readonly decision: Decision | undefined
  readonly remainingSeconds: number
  readonly deadline: number
  readonly replace: (content: PermissionContent) => void
  readonly changeScope: (requestId: string, scopeId: string, checked: boolean) => void
  readonly decide: (requestId: string, decision: Decision) => void
  readonly tick: (now: number) => void
}

function scopesFor(state: PermissionPreviewState) {
  return uniqueHbarAppUiAgentApprovalItems(state.content?.scopes ?? [])
    .filter((scope) => scope.id.trim().length > 0)
    .map((scope) => ({
      ...scope,
      checked: state.selections.get(scope.id) ?? scope.checked,
    }))
}

function pending(state: PermissionPreviewState, requestId: string): boolean {
  return Boolean(
    requestId.trim() &&
    state.content &&
    state.content.requestId === requestId &&
    state.content.state === 'pending' &&
    !state.content.busy &&
    !state.decision,
  )
}

/** Demo-only host confirmation: no external permission or API operation is executed. */
export function createPermissionPreviewStore(content: PermissionContent, durationSeconds = 2700) {
  const duration = Math.max(0, Math.floor(Number.isFinite(durationSeconds) ? durationSeconds : 0))
  return createStore<PermissionPreviewState>((set, get) => ({
    content,
    selections: new Map(),
    decision: undefined,
    remainingSeconds: duration,
    deadline: Date.now() + duration * 1000,
    replace(next) {
      const current = get()
      if (current.content === next) return
      if (next?.requestId !== current.content?.requestId) {
        set({
          content: next,
          selections: new Map(),
          decision: undefined,
          remainingSeconds: duration,
          deadline: Date.now() + duration * 1000,
        })
        return
      }
      const previousScopes = uniqueHbarAppUiAgentApprovalItems(current.content?.scopes ?? []).filter(
        (scope) => scope.id.trim().length > 0,
      )
      const nextScopes = uniqueHbarAppUiAgentApprovalItems(next?.scopes ?? []).filter(
        (scope) => scope.id.trim().length > 0,
      )
      const previousById = new Map(previousScopes.map((scope) => [scope.id, scope]))
      const nextById = new Map(nextScopes.map((scope) => [scope.id, scope]))
      const selections = new Map(
        [...current.selections].filter(([id]) => {
          const previous = previousById.get(id)
          const updated = nextById.get(id)
          return previous !== undefined && updated !== undefined && previous.checked === updated.checked
        }),
      )
      const authorityChanged = next?.state !== current.content?.state || next?.busy !== current.content?.busy
      set({ content: next, selections, decision: authorityChanged ? undefined : current.decision })
    },
    changeScope(requestId, scopeId, checked) {
      const current = get()
      if (!scopeId.trim() || !pending(current, requestId) || !scopesFor(current).some((scope) => scope.id === scopeId))
        return
      const selections = new Map(current.selections)
      selections.set(scopeId, checked)
      set({ selections })
    },
    decide(requestId, decision) {
      const current = get()
      if (
        !pending(current, requestId) ||
        (decision === 'approved' && !scopesFor(current).some((scope) => scope.checked))
      )
        return
      set({ decision })
    },
    tick(now) {
      const current = get()
      if (!current.content || current.content.state !== 'pending' || current.decision || !Number.isFinite(now)) return
      const remainingSeconds = Math.max(0, Math.min(duration, Math.ceil((current.deadline - now) / 1000)))
      if (remainingSeconds !== current.remainingSeconds) set({ remainingSeconds })
    },
  }))
}

export function projectPermissionPreviewContent(state: PermissionPreviewState): PermissionContent {
  if (!state.content) return undefined
  // The preview owns time formatting as well as the timer; reusable UI only renders expiry.
  const minutes = String(Math.floor(state.remainingSeconds / 60)).padStart(2, '0')
  const seconds = String(state.remainingSeconds % 60).padStart(2, '0')
  return {
    ...state.content,
    state: state.content.state === 'pending' ? (state.decision ?? 'pending') : state.content.state,
    scopes: scopesFor(state),
    expiry: `${minutes}:${seconds}`,
    onScopeChange: state.changeScope,
    onDecision: state.decide,
  }
}

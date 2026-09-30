import { createStore, type StoreApi } from 'zustand/vanilla'
import type { HbarAppUiAuthContent } from 'hbar-app-ui/catalog'

export type AuthenticationPreviewPhase = 'text' | 'recovery' | 'verified'
export type AuthenticationPreviewMode = Exclude<AuthenticationPreviewPhase, 'verified'>
export type AuthenticationPreviewPasskeyPhase = 'choose' | 'request'
export type AuthenticationPreviewInvitationPhase = 'form' | 'success'
export type AuthenticationPreviewResetPhase = 'form' | 'success'
export type AuthenticationPreviewApprovalPhase = 'pending' | 'approved' | 'blocked'

export interface AuthenticationPreviewDrafts {
  readonly code: string
  readonly recoveryCode: string
  readonly signUpName: string
  readonly signUpEmail: string
  readonly signUpPassword: string
  readonly signUpVisible: boolean
  readonly signUpAgreed: boolean
  readonly enterpriseEmail: string
  readonly passkeySelectedId: string
  readonly passkeyPhase: AuthenticationPreviewPasskeyPhase
  readonly accountSelectedId: string
  readonly workspaceSelectedId: string
  readonly workspaceQuery: string
  readonly invitationName: string
  readonly invitationPassword: string
  readonly invitationVisible: boolean
  readonly invitationPhase: AuthenticationPreviewInvitationPhase
  readonly resetPassword: string
  readonly resetConfirmation: string
  readonly resetVisible: boolean
  readonly resetSignOutOther: boolean
  readonly resetPhase: AuthenticationPreviewResetPhase
  readonly approvalPhase: AuthenticationPreviewApprovalPhase
}

export type AuthenticationPreviewDraftKey = keyof AuthenticationPreviewDrafts

export interface AuthenticationPreviewSeed extends AuthenticationPreviewDrafts {
  readonly phase: AuthenticationPreviewPhase
  readonly seconds: number
}

export interface AuthenticationPreviewStoreState extends AuthenticationPreviewDrafts {
  readonly phase: AuthenticationPreviewPhase
  readonly busy: boolean
  readonly seconds: number
  readonly enterpriseBusy: boolean
  readonly pendingVerification: string | null
  readonly pendingEnterprise: string | null
  readonly setDraft: <K extends AuthenticationPreviewDraftKey>(key: K, value: AuthenticationPreviewDrafts[K]) => void
  readonly startVerification: () => string | null
  readonly completeVerification: (ticket: string) => boolean
  readonly cancelVerification: (ticket: string) => boolean
  readonly changeMode: (mode: AuthenticationPreviewMode) => void
  readonly startEnterprise: () => string | null
  readonly completeEnterprise: (ticket: string) => boolean
  readonly cancelEnterprise: (ticket: string) => boolean
  readonly tickSeconds: () => void
  readonly clearOwner: () => void
}

export type AuthenticationPreviewStoreApi = StoreApi<AuthenticationPreviewStoreState>

let nextStoreId = 0

export function createAuthenticationPreviewSeed(content: HbarAppUiAuthContent): AuthenticationPreviewSeed {
  return {
    code: content.code?.code ?? '',
    recoveryCode: content.code?.referenceFlow?.recoveryCode ?? '',
    signUpName: content.signUp?.referenceFlow?.name ?? content.signUp?.initialName ?? '',
    signUpEmail: content.signUp?.referenceFlow?.email ?? content.signUp?.initialEmail ?? '',
    signUpPassword: content.signUp?.referenceFlow?.password ?? '',
    signUpVisible: content.signUp?.referenceFlow?.visible ?? false,
    signUpAgreed: content.signUp?.referenceFlow?.agreed ?? false,
    enterpriseEmail: content.enterprise?.referenceFlow?.email ?? content.enterprise?.email ?? '',
    passkeySelectedId: content.passkey?.referenceFlow?.selectedId ?? content.passkey?.initialPasskeyId ?? '',
    passkeyPhase: content.passkey?.referenceFlow?.phase ?? 'choose',
    accountSelectedId: content.account?.referenceFlow?.selectedId ?? content.account?.initialAccountId ?? '',
    workspaceSelectedId: content.workspace?.referenceFlow?.selectedId ?? content.workspace?.initialWorkspaceId ?? '',
    workspaceQuery: content.workspace?.referenceFlow?.query ?? '',
    invitationName: content.invitation?.referenceFlow?.fullName ?? '',
    invitationPassword: content.invitation?.referenceFlow?.password ?? '',
    invitationVisible: content.invitation?.referenceFlow?.passwordVisible ?? false,
    invitationPhase: content.invitation?.referenceFlow?.phase ?? 'form',
    resetPassword: content.passwordReset?.referenceFlow?.password ?? content.passwordReset?.initialPassword ?? '',
    resetConfirmation: content.passwordReset?.referenceFlow?.confirmation ?? '',
    resetVisible: content.passwordReset?.referenceFlow?.passwordVisible ?? false,
    resetSignOutOther: content.passwordReset?.referenceFlow?.signOutOther ?? true,
    resetPhase: content.passwordReset?.referenceFlow?.phase ?? 'form',
    approvalPhase: content.approval?.referenceFlow?.phase ?? 'pending',
    phase: content.code?.referenceFlow?.phase ?? 'text',
    seconds: content.code?.resend?.seconds ?? 0,
  }
}

/** Each owner gets isolated in-memory drafts and unique tickets for its local demo timers. */
export function createAuthenticationPreviewStore(content: HbarAppUiAuthContent): AuthenticationPreviewStoreApi {
  const storeId = ++nextStoreId
  let ticketSequence = 0
  const seed = createAuthenticationPreviewSeed(content)
  const initialState = {
    ...seed,
    busy: false,
    enterpriseBusy: false,
    pendingVerification: null,
    pendingEnterprise: null,
  } as const

  function nextTicket(kind: 'verification' | 'enterprise'): string {
    ticketSequence += 1
    return `authentication-preview:${storeId}:${kind}:${ticketSequence}`
  }

  return createStore<AuthenticationPreviewStoreState>((set, get) => ({
    ...initialState,
    setDraft: (key, value) => set({ [key]: value } as Pick<AuthenticationPreviewStoreState, typeof key>),
    startVerification: () => {
      const state = get()
      if (state.busy || state.pendingVerification !== null) return null
      const ticket = nextTicket('verification')
      set({ busy: true, pendingVerification: ticket })
      return ticket
    },
    completeVerification: (ticket) => {
      if (get().pendingVerification !== ticket || ticket.length === 0) return false
      set({ busy: false, pendingVerification: null, phase: 'verified' })
      return true
    },
    cancelVerification: (ticket) => {
      if (get().pendingVerification !== ticket || ticket.length === 0) return false
      set({ busy: false, pendingVerification: null })
      return true
    },
    changeMode: (mode) => set({ phase: mode, code: '', recoveryCode: '', busy: false, pendingVerification: null }),
    startEnterprise: () => {
      const state = get()
      if (state.enterpriseBusy || state.pendingEnterprise !== null) return null
      const ticket = nextTicket('enterprise')
      set({ enterpriseBusy: true, pendingEnterprise: ticket })
      return ticket
    },
    completeEnterprise: (ticket) => {
      if (get().pendingEnterprise !== ticket || ticket.length === 0) return false
      set({ enterpriseBusy: false, pendingEnterprise: null })
      return true
    },
    cancelEnterprise: (ticket) => {
      if (get().pendingEnterprise !== ticket || ticket.length === 0) return false
      set({ enterpriseBusy: false, pendingEnterprise: null })
      return true
    },
    tickSeconds: () => set((state) => ({ seconds: Math.max(0, state.seconds - 1) })),
    clearOwner: () =>
      set({
        code: '',
        recoveryCode: '',
        signUpPassword: '',
        signUpVisible: false,
        invitationPassword: '',
        invitationVisible: false,
        resetPassword: '',
        resetConfirmation: '',
        resetVisible: false,
        busy: false,
        enterpriseBusy: false,
        pendingVerification: null,
        pendingEnterprise: null,
      }),
  }))
}

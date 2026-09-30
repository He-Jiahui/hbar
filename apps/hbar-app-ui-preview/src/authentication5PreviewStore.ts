import { createStore } from 'zustand/vanilla'
import type { LumenAuthMagicLinkContent } from '@lumen/app-ui'

export interface Authentication5Seed {
  readonly email: string
  readonly phase: 'sent' | 'form'
  readonly seconds: number
  readonly resendAfterSeconds: number
}

export interface Authentication5Request {
  readonly requestId: string
  readonly kind: 'send-link' | 'resend' | 'open-mail' | 'password-sign-in'
  readonly email: string
  readonly outcome: 'mail-and-navigation-unverified'
}

export interface Authentication5State {
  readonly email: string
  readonly phase: Authentication5Seed['phase']
  readonly seconds: number
  readonly invalidEmail: boolean
  readonly setEmail: (email: string) => void
  readonly differentEmail: () => void
  readonly tick: () => void
  readonly send: () => Authentication5Request | null
  readonly resend: () => Authentication5Request | null
  readonly navigate: (intent: 'open-mail' | 'password-sign-in') => Authentication5Request
}

function countdown(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
}

export function createAuthentication5Seed(content: LumenAuthMagicLinkContent): Authentication5Seed {
  return {
    email: content.referenceFlow?.email ?? content.email,
    phase: content.referenceFlow?.phase ?? 'sent',
    seconds: countdown(content.referenceFlow?.seconds ?? content.resendAfterSeconds),
    resendAfterSeconds: countdown(content.resendAfterSeconds),
  }
}

let nextOwner = 0

/** In-memory preview projection: the sent panel is not a mail-service confirmation. */
export function createAuthentication5PreviewStore(seed: Authentication5Seed) {
  const owner = ++nextOwner
  let sequence = 0
  return createStore<Authentication5State>((set, get) => {
    function request(kind: Authentication5Request['kind']): Authentication5Request {
      return {
        requestId: `authentication5:${owner}:${++sequence}`,
        kind,
        email: get().email.trim(),
        outcome: 'mail-and-navigation-unverified',
      }
    }
    return {
      email: seed.email,
      phase: seed.phase,
      seconds: countdown(seed.seconds),
      invalidEmail: false,
      setEmail: (email) => set({ email, invalidEmail: false }),
      differentEmail: () => set({ phase: 'form', invalidEmail: false }),
      tick: () => {
        const state = get()
        if (state.phase === 'sent' && state.seconds > 0) set({ seconds: state.seconds - 1 })
      },
      send: () => {
        const state = get()
        if (state.phase !== 'form') return null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) {
          set({ invalidEmail: true })
          return null
        }
        const result = request('send-link')
        set({ phase: 'sent', email: result.email, invalidEmail: false, seconds: countdown(seed.resendAfterSeconds) })
        return result
      },
      resend: () => {
        const state = get()
        if (state.phase !== 'sent' || state.seconds > 0) return null
        set({ seconds: countdown(seed.resendAfterSeconds) })
        return request('resend')
      },
      navigate: request,
    }
  })
}

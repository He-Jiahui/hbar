import { describe, expect, test } from 'bun:test'
import {
  createAuthenticationPreviewSeed,
  createAuthenticationPreviewStore,
} from '../apps/hbar-app-ui-preview/src/authenticationPreviewStore'
import { HBAR_APP_UI_AUTHENTICATION_FIXTURES } from './fixtures/hbar-app-ui-authentication-fixtures'

describe('Authentication preview store', () => {
  test('creates a serializable state seed without host copy or callbacks', () => {
    const seed = createAuthenticationPreviewSeed(HBAR_APP_UI_AUTHENTICATION_FIXTURES)

    expect(seed).toMatchObject({
      phase: HBAR_APP_UI_AUTHENTICATION_FIXTURES.code?.referenceFlow?.phase ?? 'text',
      seconds: HBAR_APP_UI_AUTHENTICATION_FIXTURES.code?.resend?.seconds ?? 0,
    })
    expect(JSON.parse(JSON.stringify(seed))).toEqual(seed)
    expect(Object.keys(seed)).not.toContain('onCodeChange')
  })

  test('seeds drafts from content and changes only the requested draft', () => {
    const store = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const initialSignUpName = store.getState().signUpName

    expect(store.getState()).toMatchObject({
      code: HBAR_APP_UI_AUTHENTICATION_FIXTURES.code?.code,
      signUpName: HBAR_APP_UI_AUTHENTICATION_FIXTURES.signUp?.initialName,
      enterpriseEmail: HBAR_APP_UI_AUTHENTICATION_FIXTURES.enterprise?.email,
      pendingVerification: null,
      pendingEnterprise: null,
    })
    store.getState().setDraft('workspaceQuery', '  engineering  ')
    expect(store.getState().workspaceQuery).toBe('  engineering  ')
    expect(store.getState().signUpName).toBe(initialSignUpName)
  })

  test('deduplicates verification, rejects stale and foreign tickets, and completes once', () => {
    const first = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const second = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const ticket = first.getState().startVerification()
    const otherTicket = second.getState().startVerification()

    expect(ticket).not.toBeNull()
    expect(ticket).not.toBe(otherTicket)
    expect(first.getState().startVerification()).toBeNull()
    expect(second.getState().completeVerification(ticket ?? '')).toBe(false)
    expect(first.getState().completeVerification('stale-ticket')).toBe(false)
    expect(first.getState().completeVerification(ticket ?? '')).toBe(true)
    expect(first.getState()).toMatchObject({ phase: 'verified', busy: false, pendingVerification: null })
    expect(first.getState().completeVerification(ticket ?? '')).toBe(false)
  })

  test('mode changes cancel pending verification and clear both code drafts', () => {
    const store = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const ticket = store.getState().startVerification()
    store.getState().changeMode('recovery')

    expect(store.getState()).toMatchObject({
      phase: 'recovery',
      code: '',
      recoveryCode: '',
      busy: false,
      pendingVerification: null,
    })
    expect(store.getState().completeVerification(ticket ?? '')).toBe(false)
    expect(store.getState().cancelVerification(ticket ?? '')).toBe(false)
  })

  test('enterprise tickets are owner-scoped, deduplicated, and cancellable', () => {
    const store = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const other = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const ticket = store.getState().startEnterprise()

    expect(ticket).not.toBeNull()
    expect(store.getState().startEnterprise()).toBeNull()
    expect(other.getState().completeEnterprise(ticket ?? '')).toBe(false)
    expect(store.getState().cancelEnterprise(ticket ?? '')).toBe(true)
    expect(store.getState()).toMatchObject({ enterpriseBusy: false, pendingEnterprise: null })
    expect(store.getState().completeEnterprise(ticket ?? '')).toBe(false)
  })

  test('owner cleanup cancels work, clears secrets, preserves other drafts, and leaves the store reusable', () => {
    const store = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const other = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    const verificationTicket = store.getState().startVerification()
    const enterpriseTicket = store.getState().startEnterprise()
    const initialSeconds = store.getState().seconds
    store.getState().setDraft('signUpName', 'Mina updated')
    store.getState().setDraft('approvalPhase', 'approved')
    store.getState().setDraft('code', '319507')
    store.getState().setDraft('recoveryCode', 'M4K2-Q7P9')
    store.getState().setDraft('signUpPassword', 'private-sign-up')
    store.getState().setDraft('signUpVisible', true)
    store.getState().setDraft('invitationPassword', 'private-invitation')
    store.getState().setDraft('invitationVisible', true)
    store.getState().setDraft('resetPassword', 'private-reset')
    store.getState().setDraft('resetConfirmation', 'private-reset-confirmation')
    store.getState().setDraft('resetVisible', true)
    store.getState().tickSeconds()
    store.getState().clearOwner()

    expect(store.getState()).toMatchObject({
      code: '',
      recoveryCode: '',
      signUpPassword: '',
      signUpVisible: false,
      invitationPassword: '',
      invitationVisible: false,
      resetPassword: '',
      resetConfirmation: '',
      resetVisible: false,
      signUpName: 'Mina updated',
      approvalPhase: 'approved',
      busy: false,
      enterpriseBusy: false,
      seconds: Math.max(0, initialSeconds - 1),
      pendingVerification: null,
      pendingEnterprise: null,
    })
    expect(store.getState().completeVerification(verificationTicket ?? '')).toBe(false)
    expect(store.getState().completeEnterprise(enterpriseTicket ?? '')).toBe(false)
    expect(other.getState()).toMatchObject({ pendingVerification: null, pendingEnterprise: null })

    const nextTicket = store.getState().startVerification()
    expect(nextTicket).not.toBeNull()
    expect(nextTicket).not.toBe(verificationTicket)
    expect(store.getState().completeVerification(nextTicket ?? '')).toBe(true)
  })

  test('countdown cannot become negative', () => {
    const store = createAuthenticationPreviewStore(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    store.setState({ seconds: 1 })
    store.getState().tickSeconds()
    store.getState().tickSeconds()

    expect(store.getState().seconds).toBe(0)
  })
})

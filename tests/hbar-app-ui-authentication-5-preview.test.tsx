import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant, HbarAppUiAuthenticationProvider } from '../packages/hbar-app-ui/src/catalog'
import { HBAR_APP_UI_AUTHENTICATION_FIXTURES } from './fixtures/hbar-app-ui-authentication-fixtures'
import {
  createAuthentication5PreviewStore,
  createAuthentication5Seed,
} from '../apps/hbar-app-ui-preview/src/authentication5PreviewStore'

const content = HBAR_APP_UI_AUTHENTICATION_FIXTURES.magicLink
if (!content) throw new Error('Expected host magic-link content')
const seed = createAuthentication5Seed(content)

describe('Host-owned magic-link preview', () => {
  test('keeps drafts, validates email, and starts a bounded preview countdown', () => {
    const store = createAuthentication5PreviewStore(seed)
    const state = () => store.getState()
    expect(state().resend()).toBeNull()
    state().differentEmail()
    expect(state().email).toBe(seed.email)
    state().setEmail('invalid')
    expect(state().send()).toBeNull()
    expect(state().invalidEmail).toBe(true)
    state().tick()
    expect(state().seconds).toBe(seed.seconds)
    state().setEmail('  new@example.test  ')
    const request = state().send()
    expect(request?.email).toBe('new@example.test')
    expect(request?.outcome).toBe('mail-and-navigation-unverified')
    expect(state().phase).toBe('sent')
    expect(state().invalidEmail).toBe(false)
    expect(state().send()).toBeNull()
    for (let i = 0; i <= seed.resendAfterSeconds; i += 1) state().tick()
    expect(state().seconds).toBe(0)
    expect(state().resend()?.kind).toBe('resend')
    expect(state().seconds).toBe(seed.resendAfterSeconds)
  })

  test('isolates owner/request IDs and excludes localized copy from draft identity', () => {
    const first = createAuthentication5PreviewStore(seed)
    const second = createAuthentication5PreviewStore(seed)
    const a = first.getState().navigate('open-mail')
    const b = second.getState().navigate('open-mail')
    expect(a.requestId).not.toBe(b.requestId)
    first.getState().differentEmail()
    first.getState().setEmail('one@example.test')
    expect(second.getState().email).toBe(seed.email)
    expect(
      createAuthentication5Seed({ ...content, labels: { ...content.labels, title: 'Prüfen Sie Ihren Posteingang' } }),
    ).toEqual(seed)
    expect(createAuthentication5Seed({ ...content, resendAfterSeconds: Number.NaN }).seconds).toBe(0)
  })

  test('projects controlled error relationships, unique instance IDs and Host-authored long copy', () => {
    const store = createAuthentication5PreviewStore(seed)
    store.getState().differentEmail()
    store.getState().setEmail('invalid')
    store.getState().send()
    const state = store.getState()
    const controlled = {
      ...content,
      labels: {
        ...content.labels,
        formTitle: 'Ein langer lokalisierter Titel für die Anmeldung mit einem E-Mail-Link',
      },
      referenceFlow: {
        ...state,
        onEmailChange: state.setEmail,
        onSend: state.send,
        onResend: state.resend,
        onDifferentEmail: state.differentEmail,
        onNavigate: state.navigate,
      },
    }
    const component = getHbarAppUiVariant('authentication', 5).component
    const markup = renderToStaticMarkup(
      createElement(HbarAppUiAuthenticationProvider, {
        content: { ...HBAR_APP_UI_AUTHENTICATION_FIXTURES, magicLink: controlled },
        children: createElement('section', {}, createElement(component), createElement(component)),
      }),
    )
    expect(markup).toContain(controlled.labels.formTitle)
    expect(markup).toMatch(/<form\b[^>]*\bnovalidate=""/i)
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain(content.labels.formInvalidEmail)
    const ids = Array.from(markup.matchAll(/ id="([^"]+)"/g), (match) => match[1])
    expect(ids.length).toBe(4)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of Array.from(markup.matchAll(/aria-describedby="([^"]+)"/g), (match) => match[1])) {
      expect(ids).toContain(id)
    }
  })
})

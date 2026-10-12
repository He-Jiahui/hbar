import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAuthentication, type LumenAuthContent, type LumenAuthTwoStepContent, type LumenAuthTwoStepReferenceFlow } from '@lumen/app-ui/catalog'

const twoStepContent: LumenAuthTwoStepContent = {
  labels: {
    brand: 'Northwind',
    step: (current, total) => `Step ${current} of ${total}`,
    title: 'Sign in to Northwind',
    description: 'Start with the email your workspace was created with.',
    emailLabel: 'Work email',
    emailPlaceholder: 'name@company.com',
    continueLabel: 'Continue',
    continuing: 'Continuing',
    magicLink: 'Email me a sign-in link',
    needAccount: 'Need an account?',
    createAccount: 'Create one',
    matchedAccount: 'Matched account',
    back: 'Back',
    forgotPassword: 'Forgot password?',
    invalidEmail: 'Enter a valid email address.',
    securityNote: 'Signing in from a new device adds a one-time code step.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    signIn: 'Sign in',
    signingIn: 'Signing in',
    useAnother: 'Use another email',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  initialEmail: 'legacy@example.invalid',
  account: {
    initials: 'NW',
    name: 'Northwind Member',
    organization: 'Northwind Operations',
  },
}

function createFlow(overrides: Partial<LumenAuthTwoStepReferenceFlow> = {}): LumenAuthTwoStepReferenceFlow {
  return {
    phase: 'email',
    email: 'host@example.invalid',
    password: '',
    passwordVisible: false,
    invalidEmail: false,
    onEmailChange: () => undefined,
    onPasswordChange: () => undefined,
    onPasswordVisibleChange: () => undefined,
    onContinueRequest: () => undefined,
    onSignInRequest: () => undefined,
    onBack: () => undefined,
    onNavigationRequest: () => undefined,
    ...overrides,
  }
}

function createElementForFlow(flow: LumenAuthTwoStepReferenceFlow, content: LumenAuthTwoStepContent = twoStepContent) {
  const authContent: LumenAuthContent = {
    twoStep: { ...content, referenceFlow: flow },
  }
  return createElement(LumenAuthentication, {
    variant: 4,
    variantId: 'authentication-four-test',
    content: authContent,
  })
}

function renderFlow(flow: LumenAuthTwoStepReferenceFlow, content: LumenAuthTwoStepContent = twoStepContent): string {
  return renderToStaticMarkup(createElementForFlow(flow, content))
}

function renderLegacy(): string {
  const content: LumenAuthContent = { twoStep: twoStepContent }
  return renderToStaticMarkup(
    createElement(LumenAuthentication, {
      variant: 4,
      variantId: 'authentication-four-test',
      content,
    }),
  )
}

describe('Authentication 4 controlled reference view', () => {
  test('projects all four host phases into their email or password step and pending feedback', () => {
    const email = renderFlow(createFlow())
    expect(email).toContain('data-auth4-phase="email"')
    expect(email).toContain('Step 1 of 2')
    expect(email).toContain('type="email"')
    expect(email).toContain('autoComplete="email"')
    expect(email).toContain('aria-invalid="false"')
    expect(email).toContain('noValidate=""')
    expect(email).not.toContain('required=""')
    expect(email).not.toContain('minlength=')

    const emailPending = renderFlow(createFlow({ phase: 'email-pending' }))
    expect(emailPending).toContain('data-auth4-phase="email-pending"')
    expect(emailPending).toContain('Step 1 of 2')
    expect(emailPending).toContain('>Continuing<')
    expect(emailPending).toContain('aria-busy="true"')
    expect(emailPending).toContain('disabled=""')

    const password = renderFlow(createFlow({ phase: 'password', password: 'draft-secret' }))
    expect(password).toContain('data-auth4-phase="password"')
    expect(password).toContain('Step 2 of 2')
    expect(password).toContain(twoStepContent.account.name)
    expect(password).toContain(twoStepContent.account.organization)
    expect(password).toContain(`<p title="${twoStepContent.account.name}">${twoStepContent.account.name}</p>`)
    expect(password).toContain(
      `<p title="${twoStepContent.account.organization}">${twoStepContent.account.organization}</p>`,
    )
    expect(password).toContain('type="password"')
    expect(password).toContain('autoComplete="current-password"')
    expect(password).toContain('value="draft-secret"')
    expect(password).not.toContain('required=""')
    expect(password).not.toContain('minlength=')

    const signInPending = renderFlow(createFlow({ phase: 'sign-in-pending' }))
    expect(signInPending).toContain('data-auth4-phase="sign-in-pending"')
    expect(signInPending).toContain('>Signing in<')
    expect(signInPending).toContain('aria-busy="true"')
    expect(signInPending).toContain('disabled=""')
  })

  test('projects host drafts, password reveal, and the associated email error relationship', () => {
    const invalidEmail = renderFlow(createFlow({ email: 'bad-address', invalidEmail: true }))
    const invalidInput = invalidEmail.match(/<input\b[^>]*data-auth4-field="email"[^>]*>/)?.[0]
    expect(invalidInput).toContain('value="bad-address"')
    expect(invalidInput).toContain('aria-invalid="true"')
    const describedBy = invalidInput?.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeDefined()
    expect(invalidEmail).toContain(`id="${describedBy}" role="alert"`)
    expect(invalidEmail).toContain(twoStepContent.labels.invalidEmail)

    const visiblePassword = renderFlow(
      createFlow({ phase: 'password', password: 'visible-draft', passwordVisible: true }),
    )
    const passwordInput = visiblePassword.match(/<input\b[^>]*data-auth4-field="password"[^>]*>/)?.[0]
    expect(passwordInput).toContain('type="text"')
    expect(passwordInput).toContain('autoComplete="current-password"')
    expect(passwordInput).toContain('value="visible-draft"')
    expect(visiblePassword).toContain(`aria-label="${twoStepContent.labels.hidePassword}"`)
  })

  test('generates independent field and error IDs when two instances share the same variant ID', () => {
    const first = createElementForFlow(createFlow({ invalidEmail: true }))
    const second = createElementForFlow(createFlow({ phase: 'password' }))
    const markup = renderToStaticMarkup(createElement('div', null, first, second))
    const ids = Array.from(markup.matchAll(/\sid="([^"]+)"/g), (match) => match[1] ?? '')
    const labelTargets = Array.from(markup.matchAll(/\sfor="([^"]+)"/g), (match) => match[1] ?? '')

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(ids.length)
    expect(labelTargets).toHaveLength(2)
    for (const target of labelTargets) expect(ids).toContain(target)
  })

  test('renders long non-default locale copy from the host and leaves the legacy API on email step one', () => {
    const localizedContent: LumenAuthTwoStepContent = {
      ...twoStepContent,
      labels: {
        ...twoStepContent.labels,
        title: 'Melden Sie sich bei Ihrem internationalen Northwind-Arbeitsbereich an',
        description:
          'Beginnen Sie mit der geschäftlichen E-Mail-Adresse, die bei der Einrichtung Ihrer Organisation verwendet wurde.',
        magicLink: 'Senden Sie einen sicheren Anmeldelink an Ihre geschäftliche E-Mail-Adresse',
        needAccount: 'Noch kein Konto für diesen internationalen Arbeitsbereich?',
        createAccount: 'Ein neues Organisationskonto erstellen',
      },
      account: {
        initials: 'DW',
        name: 'Dana Whitfield mit einem langen lokalisierten Namen',
        organization: 'Northwind Operations für internationale Arbeitsbereiche',
      },
    }
    const localized = renderFlow(createFlow({ phase: 'password', email: 'dana@example.invalid' }), localizedContent)
    expect(localized).toContain(localizedContent.account.name)
    expect(localized).toContain(localizedContent.account.organization)
    expect(localized).toContain(localizedContent.labels.needAccount)
    expect(localized).toContain(localizedContent.labels.createAccount)
    expect(localized).not.toContain(twoStepContent.account.name)

    const localizedEmail = renderFlow(createFlow({ phase: 'email', email: 'dana@example.invalid' }), localizedContent)
    expect(localizedEmail).toContain(localizedContent.labels.title)
    expect(localizedEmail).toContain(localizedContent.labels.description)
    expect(localizedEmail).toContain(localizedContent.labels.magicLink)
    expect(localizedEmail).not.toContain(twoStepContent.labels.title)

    const legacy = renderLegacy()
    expect(legacy).toContain('Step 1 of 2')
    expect(legacy).toContain(`value="${twoStepContent.initialEmail}"`)
    expect(legacy).toContain('type="email"')
    expect(legacy).not.toContain('type="password"')
    expect(legacy).not.toContain('data-auth4-phase=')
  })
})

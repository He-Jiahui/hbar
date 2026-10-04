import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant, HbarAppUiAuthenticationProvider } from '../packages/hbar-app-ui/src/catalog'
import { HBAR_APP_UI_AUTHENTICATION_FIXTURES } from './fixtures/hbar-app-ui-authentication-fixtures'

function renderTwoInstances(variant: number, content: typeof HBAR_APP_UI_AUTHENTICATION_FIXTURES): string {
  const component = getHbarAppUiVariant('authentication', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiAuthenticationProvider, {
      content,
      children: createElement(
        Fragment,
        null,
        createElement(component, { key: 'first' }),
        createElement(component, { key: 'second' }),
      ),
    }),
  )
}

function attributeValues(markup: string, attribute: 'id' | 'for'): string[] {
  return [...markup.matchAll(new RegExp(`\\s${attribute}="([^"]+)"`, 'g'))].flatMap((match) =>
    match[1] ? [match[1]] : [],
  )
}

describe('hbar-app-ui authentication instance IDs', () => {
  test('keeps controlled recovery, sign-up, enterprise, and password-reset IDs unique between instances', () => {
    const base = HBAR_APP_UI_AUTHENTICATION_FIXTURES
    const code = base.code
    if (!code?.referenceFlow) throw new Error('Expected the recovery-code reference fixture')
    const recoveryContent: typeof base = {
      ...base,
      code: { ...code, referenceFlow: { ...code.referenceFlow, phase: 'recovery' } },
    }

    for (const [variant, content] of [
      [6, recoveryContent],
      [7, base],
      [8, base],
      [13, base],
    ] as const) {
      const markup = renderTwoInstances(variant, content)
      const ids = attributeValues(markup, 'id')
      const labelTargets = attributeValues(markup, 'for')

      expect(ids.length).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length)
      expect(new Set(labelTargets).size).toBe(labelTargets.length)
      for (const labelTarget of labelTargets) {
        expect(ids).toContain(labelTarget)
      }
    }
  })
})

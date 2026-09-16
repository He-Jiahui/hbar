import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Check } from 'lucide-react'
import { HbarAppUiIcon, type HbarAppUiIconTier } from '../packages/hbar-app-ui/src/icon'

test('icons share five semantic tiers while preserving accessibility and control classes', () => {
  const tiers: readonly HbarAppUiIconTier[] = ['xs', 'sm', 'md', 'lg', 'xl']
  for (const tier of tiers) {
    const markup = renderToStaticMarkup(createElement(HbarAppUiIcon, { icon: Check, tier, className: 'is-complete' }))
    expect(markup).toContain(`var(--hbar-app-ui-icon-${tier})`)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('is-complete')
  }
  const named = renderToStaticMarkup(createElement(HbarAppUiIcon, { icon: Check, 'aria-label': 'Completed' }))
  expect(named).toContain('aria-label="Completed"')
  expect(named).not.toContain('aria-hidden="true"')
})

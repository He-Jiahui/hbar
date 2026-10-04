import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenUsage01, LumenUsageCompact, LumenUsageOverview, LumenUsageProvider } from '@lumen/app-ui'
import { HbarAppUiCompactUsage, HbarAppUiUsageOverview } from '../packages/hbar-app-ui/src/ai-usage'
import { HbarAppUiUsageProvider } from '../packages/hbar-app-ui/src/index'
import { USAGE_FIXTURES } from './fixtures/hbar-app-ui-usage-fixtures'

test('usage compatibility exports are canonical Lumen components', () => {
  expect(HbarAppUiUsageProvider).toBe(LumenUsageProvider)
  expect(HbarAppUiUsageOverview).toBe(LumenUsageOverview)
  expect(HbarAppUiCompactUsage).toBe(LumenUsageCompact)
})

test('the canonical Lumen entry renders usage controls and host content', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenUsageProvider, {
      content: USAGE_FIXTURES,
      children: createElement(LumenUsage01),
    }),
  )

  expect(markup).toContain('data-lumen-component="usage"')
  expect(markup).toContain('hbar-app-ui-usage-variant-1')
  expect(markup).toContain('data-lumen-variant=')
  expect(markup).toContain('Token usage')
})

test('the legacy usage implementation files and stylesheet are retired', async () => {
  const retired = ['UsageContent.ts', 'UsageSurfaces.tsx', 'UsageSurfaces.css']

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/ai-usage/${file}`).exists()).toBe(false)
  }
})

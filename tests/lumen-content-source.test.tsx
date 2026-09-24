import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAnalytics, LumenAnalyticsProvider } from '@lumen/app-ui'
import {
  HBAR_APP_UI_ANALYTICS_FIXTURES,
  createHbarAppUiAnalyticsLocalizedFixtures,
} from './fixtures/hbar-app-ui-analytics-fixtures'

test('Lumen content roots preserve explicit content precedence and the missing-provider empty state', () => {
  const props = { variant: 1, variantId: 'analytics-1' }
  const localized = createHbarAppUiAnalyticsLocalizedFixtures()
  const explicit = renderToStaticMarkup(<LumenAnalytics {...props} content={localized} />)
  expect(explicit).toContain('指标趋势')
  const inherited = renderToStaticMarkup(
    <LumenAnalyticsProvider content={localized}>
      <LumenAnalytics {...props} />
    </LumenAnalyticsProvider>,
  )
  expect(inherited).toContain('指标趋势')
  const overridden = renderToStaticMarkup(
    <LumenAnalyticsProvider content={HBAR_APP_UI_ANALYTICS_FIXTURES}>
      <LumenAnalytics {...props} content={localized} />
    </LumenAnalyticsProvider>,
  )
  expect(overridden).toContain('指标趋势')
  expect(overridden).not.toContain('Metric strip')
  const empty = renderToStaticMarkup(<LumenAnalytics {...props} />)
  expect(empty).toContain('data-lumen-component="analytics"')
  expect(empty).not.toContain('指标趋势')
})

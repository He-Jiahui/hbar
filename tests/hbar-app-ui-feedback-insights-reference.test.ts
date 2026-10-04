import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFeedbackProvider,
  selectHbarAppUiFeedbackInsightsReferencePeriod,
  uniqueHbarAppUiFeedbackInsightsReferencePeriods,
  type HbarAppUiFeedbackContent,
} from '../packages/hbar-app-ui/src/index'
import { createFeedbackInsightsPreviewStore } from '../apps/hbar-app-ui-preview/src/feedbackInsightsPreviewStore'
import {
  HBAR_APP_UI_FEEDBACK_FIXTURES,
  createHbarAppUiFeedbackLocalizedFixtures,
  createHbarAppUiFeedbackOverflowFixtures,
} from './fixtures/hbar-app-ui-feedback-fixtures'

const content = HBAR_APP_UI_FEEDBACK_FIXTURES.referenceInsights
if (!content) throw new Error('Expected Feedback 6 reference fixture')

function render(input: HbarAppUiFeedbackContent = HBAR_APP_UI_FEEDBACK_FIXTURES): string {
  const component = getHbarAppUiVariant('feedback', 6).component
  return renderToStaticMarkup(
    createElement(HbarAppUiFeedbackProvider, {
      content: input,
      children: createElement(component),
    }),
  )
}

describe('source-owned feedback insights', () => {
  test('renders the reference hierarchy with host-owned data and three chart regions', () => {
    const markup = render()
    expect(content.periods.map((period) => period.id)).toEqual(['30d', '90d', '12m'])
    expect(markup).toContain('data-hbar-app-ui-region="periods"')
    expect(markup).toContain('Feedback insights')
    expect(markup).toContain('412')
    expect(markup).toContain('Sentiment')
    expect(markup).toContain('Top themes')
    expect(markup).toContain('Responses per day, last 20 days')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(markup).toMatch(/aria-pressed="true"[^>]*>30 days<\/button>/)
    expect(markup).toMatch(/aria-pressed="false"[^>]*>90 days<\/button>/)
  })

  test('period selection updates all period-owned data through the host store', () => {
    const store = createFeedbackInsightsPreviewStore(content)
    expect(store.getState().selectedPeriodId).toBe('30d')
    store.getState().selectPeriod(content.reportId, '90d')
    expect(store.getState().selectedPeriodId).toBe('90d')
    store.getState().selectPeriod('another-report', '30d')
    store.getState().selectPeriod(content.reportId, 'missing')
    expect(store.getState().selectedPeriodId).toBe('90d')

    const period90 = content.periods.find((period) => period.id === store.getState().selectedPeriodId)
    expect(period90?.metrics.find((metric) => metric.id === 'responses')?.value).toBe('1,187')
    expect(period90?.sentiment.map((item) => item.value)).toEqual(['58%', '26%', '16%'])
    expect(period90?.metrics.find((metric) => metric.id === 'rating')).toMatchObject({
      change: '0.1',
      changeDirection: 'down',
      detail: 'Out of 5, against previous period',
    })
    expect(period90?.themes.every((theme) => !/[↗↘→]/.test(theme.changeLabel))).toBe(true)
    expect(
      render({
        ...HBAR_APP_UI_FEEDBACK_FIXTURES,
        referenceInsights: { ...content, selectedPeriodId: store.getState().selectedPeriodId },
      }),
    ).toMatch(/aria-pressed="true"[^>]*>90 days<\/button>/)
    const period12 = content.periods.find((period) => period.id === '12m')
    expect(period12?.metrics.find((metric) => metric.id === 'responses')?.value).toBe('4,630')
    expect(period12?.metrics.find((metric) => metric.id === 'rating')).toMatchObject({
      change: '0.4',
      changeDirection: 'up',
      detail: 'Out of 5, against previous period',
    })
    expect(period12?.sentiment.map((item) => item.value)).toEqual(['55%', '27%', '18%'])
    expect(period12?.volume.map((point) => point.value)).toEqual([
      31, 41, 36, 52, 47, 60, 53, 50, 66, 59, 71, 64, 76, 67, 81, 90, 78, 86, 100, 93,
    ])
    expect(
      content.periods.every(
        (period) =>
          period.volume.map((point) => point.value).join(',') ===
          period12?.volume.map((point) => point.value).join(','),
      ),
    ).toBe(true)

    store.getState().reset({ ...content, initialPeriodId: 'missing' })
    expect(store.getState().selectedPeriodId).toBe('30d')
  })

  test('deduplicates periods, falls back for stale selection, and renders an empty state', () => {
    const duplicate = [content.periods[0]!, { ...content.periods[0]!, label: 'Duplicate' }, content.periods[1]!]
    expect(uniqueHbarAppUiFeedbackInsightsReferencePeriods(duplicate).map((period) => period.label)).toEqual([
      '30 days',
      '90 days',
    ])
    expect(selectHbarAppUiFeedbackInsightsReferencePeriod(duplicate, 'stale')?.id).toBe('30d')
    expect(selectHbarAppUiFeedbackInsightsReferencePeriod([], '30d')).toBeUndefined()
    expect(
      render({
        ...HBAR_APP_UI_FEEDBACK_FIXTURES,
        referenceInsights: { ...content, periods: [], selectedPeriodId: undefined },
      }),
    ).toContain(content.labels.empty)
  })

  test('keeps translated long labels and over-capacity theme rows in host data', () => {
    const localized = render(createHbarAppUiFeedbackLocalizedFixtures())
    expect(localized).toContain('Feedback-Analysen für international verteilte Supportteams')
    expect(localized).toContain('12 months — Rückmeldungen des internationalen Supportteams')
    expect(localized).toContain('Rückmeldungen des internationalen Supportteams')

    const overflow = createHbarAppUiFeedbackOverflowFixtures().referenceInsights
    expect(overflow?.periods[0]?.themes).toHaveLength(22)
    expect(render(createHbarAppUiFeedbackOverflowFixtures())).toContain('Additional theme 14')
  })
})

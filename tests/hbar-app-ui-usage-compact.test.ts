import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiCompactUsage } from '../packages/hbar-app-ui/src/ai-usage'
import { usageCompactFixture } from './fixtures/hbar-app-ui-usage-compact-fixtures'
import { USAGE_FIXTURES } from './fixtures/hbar-app-ui-usage-fixtures'

test('compact widget preserves source section order, inline allowance and one primary progress control', () => {
  const content = usageCompactFixture(null, () => {})
  const html = renderToStaticMarkup(createElement(HbarAppUiCompactUsage, content))
  expect(html.indexOf('>Details')).toBeLessThan(html.indexOf('Assistant messages</p>'))
  expect(html.indexOf('Assistant messages</p>')).toBeLessThan(html.indexOf('Agent runs'))
  expect(html.indexOf('Agent runs')).toBeLessThan(html.indexOf('Unlimited messages'))
  expect(html).toContain('1,842<span>/ 2,000</span>')
  expect(html).toContain('aria-valuenow="92"')
  expect((html.match(/role="progressbar"/g) ?? []).length).toBe(1)
  expect(html).not.toContain('role="img"')
  expect((html.match(/data-meter-id=/g) ?? []).length).toBe(3)
  expect(html).toContain('inline-size:38%')
  expect(html).toContain('inline-size:43%')
  expect(html).toContain('inline-size:60%')
})

test('independent actions bind the original card and do not fabricate a UI success state', () => {
  const events: unknown[] = []
  const old = usageCompactFixture(null, (...args) => events.push(args), 'team-a')
  const next = usageCompactFixture(null, (...args) => events.push(args), 'team-b')
  const before = renderToStaticMarkup(createElement(HbarAppUiCompactUsage, old))
  old.widget!.details.onInvoke()
  next.action!.onInvoke()
  old.action!.onInvoke()
  expect(events).toEqual([
    ['details', 'team-a'],
    ['upgrade', 'team-b'],
    ['upgrade', 'team-a'],
  ])
  expect(renderToStaticMarkup(createElement(HbarAppUiCompactUsage, old))).toBe(before)
})

test('empty, one, normal, boundary and one-over collections remain content-grown and do not silently drop values', () => {
  const content = usageCompactFixture(null, () => {})
  for (const count of [0, 1, 3, 6, 7]) {
    const meters = Array.from({ length: count }, (_, index) => ({
      ...content.widget!.meters[0]!,
      id: `meter-${index}`,
    }))
    const html = renderToStaticMarkup(
      createElement(HbarAppUiCompactUsage, {
        ...content,
        widget: { ...content.widget!, meters },
      }),
    )
    expect((html.match(/data-meter-id=/g) ?? []).length).toBe(count)
    if (!count) expect(html).toContain('No additional usage meters')
  }
  for (const count of [0, 1, 12, 31, 32]) {
    const sparkline = Array.from({ length: count }, (_, index) => ({ id: `sample-${index}`, value: 0.5 }))
    const html = renderToStaticMarkup(createElement(HbarAppUiCompactUsage, { ...content, sparkline }))
    expect((html.match(/block-size:50%/g) ?? []).length).toBe(count)
    if (!count) expect(html).toContain('No usage trend available')
  }
})

test('duplicate metric and trend IDs update in stable order while malformed visual proportions stay finite', () => {
  const content = usageCompactFixture(null, () => {})
  const html = renderToStaticMarkup(
    createElement(HbarAppUiCompactUsage, {
      ...content,
      progress: NaN,
      sparkline: [
        { id: 'first', value: -1 },
        { id: 'second', value: Infinity },
        { id: 'first', value: 2 },
      ],
      widget: {
        ...content.widget!,
        meters: [
          { id: 'first', label: 'Old', value: 'Old', progress: -1 },
          { id: 'second', label: 'Second', value: 'Second', progress: NaN },
          { id: 'first', label: 'Updated', value: 'Updated', progress: 101 },
        ],
      },
    }),
  )
  expect((html.match(/data-meter-id=/g) ?? []).length).toBe(2)
  expect(html.indexOf('>Updated')).toBeLessThan(html.indexOf('>Second'))
  expect(html).not.toContain('>Old')
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
  expect(html).toContain('block-size:100%')
  expect(html).toContain('block-size:0%')
  expect(html).toContain('aria-valuenow="0"')
})

test('long non-default copy, disabled actions and legacy inline/default surfaces retain their contracts', () => {
  const localized = renderToStaticMarkup(
    createElement(
      HbarAppUiCompactUsage,
      usageCompactFixture('localized', () => {}),
    ),
  )
  expect(localized).toContain('Nutzung des Teamkontingents')
  expect(localized).toContain('Unbegrenzte Assistentennachrichten')
  expect(localized).not.toContain('Upgrade')
  const disabled = renderToStaticMarkup(
    createElement(
      HbarAppUiCompactUsage,
      usageCompactFixture('disabled', () => {}),
    ),
  )
  expect((disabled.match(/disabled=""/g) ?? []).length).toBe(2)
  const inline = renderToStaticMarkup(
    createElement(HbarAppUiCompactUsage, { ...usageCompactFixture(null, () => {}), density: 'inline' }),
  )
  expect(inline).toContain('hbar-app-ui-inline-usage')
  expect(inline).not.toContain('lumen-usage-compact-widget')
  const legacy = renderToStaticMarkup(createElement(HbarAppUiCompactUsage, USAGE_FIXTURES.compact))
  expect(legacy).toContain('hbar-app-ui-sparkline')
})

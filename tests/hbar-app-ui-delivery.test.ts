import { describe, expect, test } from 'bun:test'
import { assessDeliveryCoverage, readDeliveryRows } from '../scripts/verify-hbar-app-ui-delivery'

const variants = [{ id: 'hbar-app-ui-forms-1', category: 'forms', variant: 1 }] as const
const markdown =
  '| hbar-app-ui-forms-1 | [hbar-app-ui-forms-1](../forms.tsx) | 功能与布局通过 | content-grown | Source submit remains request-only |'
const source = {
  sourceUrl: 'https://reference.invalid/docs/app-ui',
  generatedAt: '2026-10-02T00:00:00Z',
  sourceDirectoryHash: 'captured-catalog',
  categories: ['forms'],
  categoryCounts: { forms: 1 },
  variants: [
    {
      ...variants[0],
      sourceId: 'forms-1',
      url: 'https://reference.invalid/docs/app-ui/forms/forms-1',
      title: 'forms-1',
      description: 'A captured form',
      sourceStatus: 200,
      sourceHash: 'captured-card',
    },
  ],
}

describe('delivery coverage evidence', () => {
  test('retains limits and provenance without upgrading coverage to strict or remote acceptance', () => {
    const report = assessDeliveryCoverage(variants, markdown, source)
    expect(report.scope).toEqual({ categories: 1, localIds: 1, sourceIds: 1, deliveryRows: 1 })
    expect(report.provenance.hash).toBe('captured-catalog')
    expect(report.categories[0]?.variants[0]?.delivery?.limits).toContain('request-only')
    expect(report.freshStrictAcceptance).toBe(false)
    expect(report.remoteBusinessDelivered).toBe(false)
    expect(report.interactionReplayInThisRun).toBe(false)
  })

  test('rejects missing, duplicate and extra source IDs instead of guessing a mapping', () => {
    expect(() => assessDeliveryCoverage(variants, markdown, { ...source, variants: [] })).toThrow('Source count')
    expect(() =>
      assessDeliveryCoverage(
        [...variants, { ...variants[0], id: 'hbar-app-ui-forms-2', variant: 2 }],
        `${markdown}\n${markdown.replaceAll('forms-1', 'forms-2')}`,
        { ...source, variants: [source.variants[0], source.variants[0]] },
      ),
    ).toThrow('Duplicate source ID')
    expect(() =>
      assessDeliveryCoverage(variants, markdown, { ...source, variants: [{ ...source.variants[0], id: 'unknown' }] }),
    ).toThrow('Unexpected source ID')
  })

  test('rejects stale category/number/URL metadata and unavailable source cards', () => {
    for (const changes of [
      { category: 'onboarding' },
      { variant: 2 },
      { sourceId: 'forms-2' },
      { url: 'https://elsewhere.invalid/docs/app-ui/forms/forms-1' },
      { description: '' },
      { sourceStatus: 403 },
    ]) {
      expect(() =>
        assessDeliveryCoverage(variants, markdown, { ...source, variants: [{ ...source.variants[0], ...changes }] }),
      ).toThrow()
    }
    expect(() => assessDeliveryCoverage(variants, markdown, { ...source, categoryCounts: { forms: 2 } })).toThrow(
      'Category count',
    )
    expect(() => assessDeliveryCoverage(variants, markdown, { ...source, categories: [] })).toThrow('Source categories')
  })

  test('requires complete unique rows and preserves historical strict limitations', () => {
    expect(() => assessDeliveryCoverage(variants, '', source)).toThrow('missing or extra row')
    expect(() => assessDeliveryCoverage(variants, `${markdown}\n${markdown}`, source)).toThrow('missing or extra row')
    expect(() => readDeliveryRows(markdown.replace('content-grown', ''))).toThrow('Incomplete delivery row')
    expect(() => readDeliveryRows(markdown.replace('[hbar-app-ui-forms-1]', '[wrong-id]'))).toThrow(
      'link does not match',
    )
    const historical = markdown.replace('功能与布局通过', 'needs-fix: historical strict')
    expect(assessDeliveryCoverage(variants, historical, source).categories[0]?.variants[0]?.delivery?.status).toContain(
      'needs-fix',
    )
  })
})

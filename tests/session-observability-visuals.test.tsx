import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ObservabilityCompression,
  ObservabilityOutcomes,
  ObservabilityTokenChart,
} from '../packages/app-react/src/session-observability-charts'
import {
  ObservabilityRecordMetrics,
  ObservabilitySections,
} from '../packages/app-react/src/session-observability-metrics'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { observabilityReport } from './fixtures/session-observability'
import { observabilityRecordSchema } from '@hbar/contracts/session-observability'

for (const locale of ['zh-CN', 'en-US'] as const)
  describe(`statistics graphics and localized content: ${locale}`, () => {
    const labels = getShellCopy(locale).monitoring.observability
    if (!labels) throw new Error('Host statistics labels missing')
    test('compression bars share a real numeric scale, zero values never create artificial bars', () => {
      const html = renderToStaticMarkup(<ObservabilityCompression before={8000} after={2000} labels={labels} />)
      expect(html).toContain('inline-size:100%')
      expect(html).toContain('inline-size:25%')
      expect(html).toContain(labels.fields.before)
      const empty = renderToStaticMarkup(<ObservabilityCompression before={0} after={0} labels={labels} />)
      expect(empty.match(/inline-size:0%/g)).toHaveLength(2)
    })
    test('outcomes keep cancelled and unknown results independent and omit zero-count legend entries', () => {
      const base = observabilityReport()
      const html = renderToStaticMarkup(
        <ObservabilityOutcomes
          value={{ ...base.tools, total: 4, succeeded: 2, cancelled: 1, unknown: 1 }}
          labels={labels}
        />,
      )
      expect(html).toContain(labels.outcomes.cancelled)
      expect(html).toContain(labels.outcomes.unknown)
      expect(html).not.toContain(labels.outcomes.failed)
      expect(html).toContain('flex-grow:2')
    })
    test('timeline exposes actual values to keyboard users and no plot for unrecorded usage', () => {
      const html = renderToStaticMarkup(<ObservabilityTokenChart report={observabilityReport()} labels={labels} />)
      expect(html).toContain('tabindex="0"')
      expect(html).toContain(labels.series)
      expect(html).toContain('data-chart-bucket="0"')
      const empty = renderToStaticMarkup(
        <ObservabilityTokenChart report={{ ...observabilityReport(), series: [] }} labels={labels} />,
      )
      expect(empty).not.toContain('<svg')
    })
    test('all resource metrics come from typed host copy and missing prices cannot read as a zero quote', () => {
      const report = observabilityReport()
      const html = renderToStaticMarkup(
        <ObservabilitySections report={report} labels={labels} connected onDetail={() => {}} />,
      )
      for (const kind of ['skills', 'tools', 'files', 'terminal', 'compactions'] as const)
        expect(html).toContain(labels.sections[kind])
      const record = observabilityRecordSchema.parse({
        id: 'request',
        label: 'model',
        secondary: null,
        count: 1,
        succeeded: 0,
        failed: 0,
        durationMs: null,
        averageMs: null,
        status: null,
        time: null,
        linesRead: null,
        patches: null,
        addedLines: null,
        removedLines: null,
        beforeTokens: null,
        afterTokens: null,
        input: 12,
        output: 3,
        cost: null,
        pricing: {
          available: false,
          currency: 'USD',
          inputPerMillion: 0,
          outputPerMillion: 0,
          cacheReadPerMillion: null,
          cacheWritePerMillion: null,
          source: 'provider-config',
          version: 'legacy',
          effectiveAt: null,
        },
      })
      const request = renderToStaticMarkup(
        <ObservabilityRecordMetrics record={record} detail="requests" labels={labels} />,
      )
      expect(request).toContain(labels.unavailable)
      expect(request).not.toContain(labels.currency(0))
    })
  })

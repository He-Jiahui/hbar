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
  ObservabilityPerformance,
} from '../packages/app-react/src/session-observability-metrics'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { observabilityReport, observabilityRecord } from './fixtures/session-observability'
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
    test('time gaps keep their physical position rather than compressing adjacent samples together', () => {
      const base = observabilityReport()
      const html = renderToStaticMarkup(
        <ObservabilityTokenChart
          report={{
            ...base,
            range: { ...base.range, startedAt: 0, endedAt: 3999 },
            series: [
              { start: 0, input: 40, output: 10, cacheRead: 0 },
              { start: 3900, input: 5, output: 1, cacheRead: 0 },
            ],
          }}
          labels={labels}
        />,
      )
      expect(html).toContain('x="1.44"')
      expect(html).toContain('x="313.44"')
    })
    test('individual records show the measured success denominator, compaction expansion and model share', () => {
      const render = (detail: 'tools' | 'compactions' | 'models', value: Parameters<typeof observabilityRecord>[0]) =>
        renderToStaticMarkup(
          <ObservabilityRecordMetrics
            detail={detail}
            record={observabilityRecord(value)}
            labels={labels}
            totalTokens={300}
          />,
        )
      const tools = render('tools', { count: 8, succeeded: 3, failed: 1 })
      expect(tools).toContain(labels.percent(0.75))
      expect(tools).not.toContain(labels.percent(0.375))
      const compaction = render('compactions', { beforeTokens: 8000, afterTokens: 10000 })
      expect(compaction).toContain(labels.percent(-0.25))
      expect(compaction).toContain(labels.number(-2000))
      const model = render('models', { input: 120, output: 30 })
      expect(model).toContain(labels.percent(0.5))
      expect(model).toContain(labels.fields.tokenShare)
      expect(model).toContain(labels.unavailable)
      expect(model).not.toContain(labels.currency(0))
    })
    test('existing latency and execution information keeps real samples and missing measurements', () => {
      const html = renderToStaticMarkup(<ObservabilityPerformance report={observabilityReport()} labels={labels} />)
      expect(html).toContain(labels.latency.title)
      expect(html).toContain(labels.duration(40))
      expect(html).toContain(labels.duration(250))
      expect(html).toContain(labels.chart.samples(2))
      expect(html).toContain(labels.execution.requestConcurrency)
      expect(html).toContain(labels.execution.toolConcurrency)
      expect(html).toContain(labels.unavailable)
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

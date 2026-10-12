import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  sessionObservabilityReportSchema,
  type SessionObservabilityReport,
} from '@hbar/contracts/session-observability'
import { USAGE_REPORT_SQL } from './session-observability-facts'

type UsageArguments = [string, number, number, number, number, number]
type UsageRow = SessionObservabilityReport['usage'] & {
  firstTextP95Ms: number | null
  firstTextSamples: number
  responseP95Ms: number | null
  responseSamples: number
  seriesJson: string
  requestConcurrency: number | null
}

export type ObservabilityUsageFacts = {
  usage: SessionObservabilityReport['usage']
  latency: SessionObservabilityReport['latency']
  requestConcurrency: number | null
  series: SessionObservabilityReport['series']
}

export function readObservabilityUsageFacts(
  db: Database,
  args: [string, number, number],
  range: SessionObservabilityReport['range'],
): ObservabilityUsageFacts {
  const bucketMs = Math.max(1, Math.ceil(Math.max(1, range.endedAt - range.startedAt + 1) / 40))
  const fullArgs: UsageArguments = [...args, range.startedAt, range.endedAt, bucketMs]
  const row = db.query<UsageRow, UsageArguments>(USAGE_REPORT_SQL).get(...fullArgs)
  if (!row) throw new HbarError('STORAGE_ERROR', 'Session statistics usage query returned no row')

  const {
    firstTextP95Ms,
    firstTextSamples,
    responseP95Ms,
    responseSamples,
    seriesJson,
    requestConcurrency,
    ...usageRow
  } = row
  const usage = sessionObservabilityReportSchema.shape.usage.parse(usageRow)
  const latency = sessionObservabilityReportSchema.shape.latency.parse({
    firstText: { p95Ms: firstTextP95Ms, samples: firstTextSamples },
    response: { p95Ms: responseP95Ms, samples: responseSamples },
  })
  const series = sessionObservabilityReportSchema.shape.series.parse(JSON.parse(seriesJson))
  return { usage, latency, requestConcurrency, series }
}

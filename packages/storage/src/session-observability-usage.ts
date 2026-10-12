import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import {
  sessionObservabilityReportSchema,
  type SessionObservabilityReport,
} from '@hbar/contracts/session-observability'
import { USAGE_REPORT_SQL } from './session-observability-facts'

type UsageArguments = [string, number, number, number, number]
type UsageRow = SessionObservabilityReport['usage'] & { seriesJson: string }

export type ObservabilityUsageFacts = {
  usage: SessionObservabilityReport['usage']
  series: SessionObservabilityReport['series']
}

export function readObservabilityUsageFacts(
  db: Database,
  args: [string, number, number],
  range: SessionObservabilityReport['range'],
): ObservabilityUsageFacts {
  const bucketMs = Math.max(1, Math.ceil(Math.max(1, range.endedAt - range.startedAt + 1) / 40))
  const row = db.query<UsageRow, UsageArguments>(USAGE_REPORT_SQL).get(...args, range.startedAt, bucketMs)
  if (!row) throw new HbarError('STORAGE_ERROR', 'Session statistics usage query returned no row')
  const { seriesJson, ...usageRow } = row
  const usage = sessionObservabilityReportSchema.shape.usage.parse(usageRow)
  const series = sessionObservabilityReportSchema.shape.series.parse(JSON.parse(seriesJson))
  return { usage, series }
}

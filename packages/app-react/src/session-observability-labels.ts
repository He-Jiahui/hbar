import type {
  ObservabilityDetail,
  ObservabilityScope,
  ObservabilityRecord,
} from '@hbar/contracts/session-observability'
import type { HbarSessionMonitoringUsageLabels } from './session-monitoring-usage'

export type ObservabilityField =
  | 'outputRate'
  | 'cacheShare'
  | 'tokenShare'
  | 'knownCost'
  | 'successRate'
  | 'duration'
  | 'average'
  | 'p95'
  | 'maximum'
  | 'usedSkills'
  | 'skillUses'
  | 'skillLoads'
  | 'resources'
  | 'reads'
  | 'writes'
  | 'readPaths'
  | 'writtenPaths'
  | 'readLines'
  | 'patches'
  | 'addedLines'
  | 'removedLines'
  | 'before'
  | 'after'
  | 'reduction'
  | 'removedTokens'
  | 'completed'
  | 'failed'
  | 'count'
  | 'pricing'
  | 'revision'
export interface HbarSessionObservabilityLabels extends HbarSessionMonitoringUsageLabels {
  readonly scopeTitle: string
  readonly scopes: Readonly<Record<ObservabilityScope, string>>
  readonly sections: Readonly<Record<ObservabilityDetail, string>>
  readonly fields: Readonly<Record<ObservabilityField, string>>
  readonly outcomes: Readonly<
    Record<
      'succeeded' | 'failed' | 'denied' | 'cancelled' | 'interrupted' | 'unknown' | 'pending' | 'running' | 'completed',
      string
    >
  >
  readonly loading: string
  readonly emptyRecords: string
  readonly refresh: string
  readonly previous: string
  readonly next: string
  readonly latest: string
  readonly previousPage: string
  readonly nextPage: string
  readonly details: string
  readonly measurementNote: string
  readonly rateNote: string
  readonly skillNote: string
  readonly fileNote: string
  readonly error: (code: string) => string
  readonly range: (scope: ObservabilityScope, ordinal: number, label: string) => string
  readonly coverage: (recorded: number, total: number) => string
  readonly page: (page: number) => string
  readonly timestamp: (time: number) => string
  readonly price: (pricing: NonNullable<ObservabilityRecord['pricing']>) => string
  readonly list: (items: readonly string[]) => string
}

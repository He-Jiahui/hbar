import { createMessageScope } from './messages'
import type { HbarStatusWorkspaceLabels } from './lumen-status-workspace'

export type StatusNavigationLabels = Pick<
  HbarStatusWorkspaceLabels,
  'title' | 'description' | 'close' | 'refresh' | 'loading' | 'tabs' | 'sections' | 'error'
>

export type StatusPerformanceLabels = Pick<
  HbarStatusWorkspaceLabels,
  | 'performanceFilters'
  | 'gap'
  | 'process'
  | 'resources'
  | 'runtime'
  | 'io'
  | 'trends'
  | 'readings'
  | 'processLabels'
  | 'unavailable'
  | 'number'
  | 'percent'
  | 'bytes'
  | 'bytesPerSecond'
  | 'milliseconds'
  | 'duration'
>

export type StatusUsageLabels = Pick<
  HbarStatusWorkspaceLabels,
  'usage' | 'unavailable' | 'number' | 'percent' | 'duration' | 'milliseconds' | 'currency' | 'tokenCount' | 'tokenRate'
>

export type StatusGitLabels = Pick<
  HbarStatusWorkspaceLabels,
  'git' | 'unavailable' | 'number' | 'percent' | 'duration' | 'milliseconds'
>

export const statusNavigationMessages = createMessageScope<StatusNavigationLabels>()
export const statusPerformanceMessages = createMessageScope<StatusPerformanceLabels>()
export const statusUsageMessages = createMessageScope<StatusUsageLabels>()
export const statusGitMessages = createMessageScope<StatusGitLabels>()

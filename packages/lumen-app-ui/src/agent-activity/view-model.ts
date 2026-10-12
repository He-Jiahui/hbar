import type { LumenAgentActivityAction } from '../agent-activity'

/** Host-owned values and commands; missing capabilities never imply service success. */
export interface LumenAgentActivityViewModel {
  readonly ownerId: string
  readonly openGroupIds: readonly string[]
  readonly activeFilterId: string | null
  readonly liveStopped: boolean
  readonly deploymentStopped: boolean
  readonly retryQueued: boolean
  readonly log: {
    readonly visibleCount: number
    readonly running: boolean
    readonly lineCount: string
  }
  readonly notice?: string | undefined
  readonly onAction?: ((event: LumenAgentActivityAction) => void) | undefined
}

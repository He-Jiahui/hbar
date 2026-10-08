import { usageAttemptExportSchema } from '@hbar/contracts/commands/usage'
import { usageFeatureCopy } from '../../apps/web/src/usage-feature-copy'

export const originalBudgetSessionId = 'original-session-'.padEnd(160, 's')
export const completeUsageModelId = 'original-model-'.padEnd(160, 'm')
export function usageFeedbackLabels(locale: 'en-US' | 'zh-CN') {
  const base = usageFeatureCopy(locale)
  return {
    requests: {
      ...base.requests,
      title: base.requests.title.repeat(12),
      description: base.requests.description.repeat(8),
      request: base.requests.request.repeat(10),
      filterOptions: base.requests.filterOptions.map((item) => ({ ...item, label: item.label.repeat(10) })),
      previous: base.requests.previous.repeat(12),
      next: base.requests.next.repeat(12),
      open: base.requests.open.repeat(12),
      retry: base.requests.retry.repeat(12),
      error: (code: string) => base.requests.error(code).repeat(12),
    },
    budget: {
      ...base.budget,
      title: base.budget.title.repeat(12),
      description: base.budget.description.repeat(8),
      cap: base.budget.cap.repeat(12),
      save: base.budget.save.repeat(12),
      unknown: base.budget.unknown.repeat(12),
      reconcile: base.budget.reconcile.repeat(12),
      retry: base.budget.retry.repeat(12),
      pendingTarget: (id: string) => base.budget.pendingTarget(id).repeat(10),
      error: (code: string) => base.budget.error(code).repeat(12),
    },
  }
}
export function usageFeedbackAttempt(index: number) {
  return usageAttemptExportSchema.parse({
    usageId: `usage-${index}`,
    attemptId: `attempt-${index}`,
    workspaceId: 'original-workspace',
    sessionId: originalBudgetSessionId,
    runId: `run-${index}`,
    source: index % 2 ? 'compaction' : 'model',
    providerId: 'original-provider',
    modelId: completeUsageModelId,
    modelSelectionId: 'original-model-selection',
    startedAt: 1,
    firstProviderEventAt: 2,
    firstThinkingAt: null,
    firstTextAt: 3,
    endedAt: 1000 + index,
    runStatus: 'completed',
    input: 3,
    output: 4,
    cacheRead: 0,
    cacheWrite: 0,
    billableTokens: 7,
    cost: {
      value: null,
      unit: 'USD',
      availability: 'unavailable',
      reason: 'PRICE_COVERAGE_INCOMPLETE',
      source: 'usage-ledger',
      estimated: false,
      sampleCount: 1,
    },
    pricingVersion: null,
    accountingVersion: 1,
  })
}

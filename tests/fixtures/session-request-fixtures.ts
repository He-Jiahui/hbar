import type { UsageAttemptExport, UsageExportResult, UsageScope } from '@hbar/contracts/commands/usage'
import type { UsageRequestItem } from '@hbar/app-runtime'
import type { Message } from '@hbar/contracts'

export function sessionRequestAttempt(id: string, sessionId = 'session-A'): UsageAttemptExport {
  return {
    usageId: id,
    attemptId: `attempt-${id}`,
    sessionId,
    workspaceId: 'workspace-A',
    runId: 'run-A',
    source: 'model',
    providerId: 'provider-A',
    modelId: 'model-A',
    modelSelectionId: 'selection-A',
    startedAt: 0,
    firstProviderEventAt: 0,
    firstThinkingAt: null,
    firstTextAt: 2,
    endedAt: 20,
    runStatus: 'completed',
    input: 100,
    output: 40,
    cacheRead: 20,
    cacheWrite: 5,
    billableTokens: 120,
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
  }
}

export function sessionRequestItem(id = 'usage-A'): UsageRequestItem {
  return { ...sessionRequestAttempt(id), id }
}

export function sessionRequestExport(scope: UsageScope, items: UsageAttemptExport[] = []): UsageExportResult {
  return { accountingVersion: 1, scope, observedAt: 20, gap: false, items }
}

export function sessionRequestMessage(id: string, seq = 1): Message {
  return {
    id,
    seq,
    sessionId: 'session-A',
    runId: 'run-A',
    role: 'assistant',
    createdAt: 2,
    content: [{ type: 'text', text: `Original content ${id}` }],
  }
}

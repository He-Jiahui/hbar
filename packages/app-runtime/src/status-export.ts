import type { UsageAttemptExport } from '@hbar/contracts/commands/usage'

const csvColumns = [
  'usageId',
  'attemptId',
  'sessionId',
  'workspaceId',
  'runId',
  'source',
  'providerId',
  'modelId',
  'modelSelectionId',
  'startedAt',
  'firstProviderEventAt',
  'firstThinkingAt',
  'firstTextAt',
  'endedAt',
  'runStatus',
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
  'billableTokens',
  'cost',
  'costAvailability',
  'costEstimated',
  'pricingVersion',
  'accountingVersion',
] as const

function csv(value: string | number | boolean | null): string {
  const source = value === null ? '' : String(value)
  return /[",\r\n]/.test(source) ? `"${source.replaceAll('"', '""')}"` : source
}

function row(
  item: UsageAttemptExport,
): Readonly<Record<(typeof csvColumns)[number], string | number | boolean | null>> {
  return {
    usageId: item.usageId,
    attemptId: item.attemptId,
    sessionId: item.sessionId,
    workspaceId: item.workspaceId,
    runId: item.runId,
    source: item.source,
    providerId: item.providerId,
    modelId: item.modelId,
    modelSelectionId: item.modelSelectionId,
    startedAt: item.startedAt,
    firstProviderEventAt: item.firstProviderEventAt,
    firstThinkingAt: item.firstThinkingAt,
    firstTextAt: item.firstTextAt,
    endedAt: item.endedAt,
    runStatus: item.runStatus,
    input: item.input,
    output: item.output,
    cacheRead: item.cacheRead,
    cacheWrite: item.cacheWrite,
    billableTokens: item.billableTokens,
    cost: item.cost.value,
    costAvailability: item.cost.availability,
    costEstimated: item.cost.estimated,
    pricingVersion: item.pricingVersion,
    accountingVersion: item.accountingVersion,
  }
}

export function serializeUsageExport(
  items: readonly UsageAttemptExport[],
  format: 'json' | 'csv',
  metadata: { readonly gap: boolean; readonly truncated: boolean },
): string {
  if (format === 'json') return JSON.stringify({ version: 1, ...metadata, items }, null, 2)
  return [
    csvColumns.join(','),
    ...items.map((item) => csvColumns.map((column) => csv(row(item)[column])).join(',')),
  ].join('\r\n')
}

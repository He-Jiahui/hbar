import { useMemo } from 'react'
import { HbarUsageFeatures } from '@hbar/app-react/usage-features'
import { useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import type { UsageFilters } from '@hbar/contracts/commands/usage'
import type { StateReader, UsageBudgetState } from '@hbar/app-runtime'
import { navigateNotification } from './notification-navigation'
import { usageFeatureCopy } from './usage-feature-copy'
import type { ShellLocale } from './shell-copy'

/** Owns the usage detail slot within the same Status surface and scroll pane. */
export function StatusUsageFeatures({
  instanceId,
  locale,
}: {
  readonly instanceId: string
  readonly locale: ShellLocale
}) {
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const status = useHbarRuntimeState(runtime.state.status)
  const budgetReader: StateReader<UsageBudgetState | null> = runtime.state.usageBudget?.state ?? emptyBudgetReader
  const budgetState = useHbarRuntimeState(budgetReader)
  const panel = surfaces.panels[instanceId]
  const entry = status.entries[instanceId]
  const report = entry?.usage
  const query = entry?.usageQuery
  const visible =
    presentation.page.kind === 'status' && presentation.page.instanceId === instanceId && entry?.section === 'usage'
  const filters = useMemo<UsageFilters>(
    () => ({
      ...(query?.providerId ? { providerId: query.providerId } : {}),
      ...(query?.modelId ? { modelId: query.modelId } : {}),
    }),
    [query?.providerId, query?.modelId],
  )
  const from = report?.window.from
  const to = report?.window.to
  const range = useMemo(() => from !== undefined && to !== undefined ? { from, to } : {}, [from, to])
  const labels = useMemo(() => usageFeatureCopy(locale), [locale])
  if (!panel || !report || !visible) return null
  const owner = runtime.state.usageBudget
  return (
    <HbarUsageFeatures
      visible={visible}
      requests={runtime.state.usageRequests.runtime}
      {...(owner && (budgetState?.targetSessionId || budgetState?.pendingSessionId) ? { budget: owner.runtime } : {})}
      scope={report.scope}
      filters={filters}
      range={range}
      labels={labels}
      onOpenRequest={(target) =>
        navigateNotification(
          {
            kind: 'session',
            workspaceId: target.workspaceId,
            sessionId: target.sessionId,
            ...(target.runId ? { runId: target.runId } : {}),
          },
          {
            commands: runtime.commands,
            getSchedule: async () => null,
          },
        )
      }
    />
  )
}
const emptyBudgetReader = { getSnapshot: () => null, subscribe: () => () => undefined }

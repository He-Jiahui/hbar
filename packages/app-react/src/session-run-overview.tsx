import { LumenContentText, LumenFrame } from '@lumen/app-ui'
import { runStatusSchema, type Run, type RunStatus } from '@hbar/contracts'
import { monitoringRunCounts } from './session-monitoring-model'
import { createMessageScope } from './messages'

export interface HbarSessionRunOverviewLabels {
  readonly title: string
  readonly window: (count: number) => string
  readonly count: (count: number) => string
  readonly status: (status: RunStatus) => string
  readonly point: (timestamp: number, status: RunStatus) => string
}
const { Provider: RunOverviewMessagesProvider, useMessages: useRunOverviewMessages } =
  createMessageScope<HbarSessionRunOverviewLabels>()

function RunOverviewContent({ runs }: { readonly runs: readonly Run[] }) {
  const { t } = useRunOverviewMessages()
  if (runs.length === 0) return null
  const counts = monitoringRunCounts(runs)
  return (
    <LumenFrame as="section" className="hbar-monitoring-run-overview" aria-label={t('title')}>
      <LumenFrame className="hbar-monitoring-section-heading">
        <LumenContentText context="section.subtitle">{t('title')}</LumenContentText>
        <LumenContentText context="message.inline" tone="muted">
          {t('window')(runs.length)}
        </LumenContentText>
      </LumenFrame>
      <LumenFrame className="hbar-monitoring-run-strip" aria-hidden="true">
        {[...runs].reverse().map((run) => (
          <LumenFrame as="span" key={run.id} data-status={run.status} title={t('point')(run.createdAt, run.status)} />
        ))}
      </LumenFrame>
      <LumenFrame role="list" className="hbar-monitoring-run-counts">
        {runStatusSchema.options
          .filter((status) => counts[status] > 0)
          .map((status) => (
            <LumenFrame role="listitem" key={status} data-status={status}>
              <LumenContentText context="message.inline">{t('status')(status)}</LumenContentText>
              <LumenContentText context="record.title">{t('count')(counts[status])}</LumenContentText>
            </LumenFrame>
          ))}
      </LumenFrame>
    </LumenFrame>
  )
}

/** A chronological strip of the same bounded Run window as the actionable history. */
export function HbarSessionRunOverview({
  runs,
  labels,
}: {
  readonly runs: readonly Run[]
  readonly labels: HbarSessionRunOverviewLabels
}) {
  return (
    <RunOverviewMessagesProvider messages={labels}>
      <RunOverviewContent runs={runs} />
    </RunOverviewMessagesProvider>
  )
}

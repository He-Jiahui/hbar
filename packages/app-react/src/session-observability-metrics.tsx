import { BookOpen, FileText, Terminal, Wrench, Minimize2 } from 'lucide-react'
import { LumenButton, LumenCompactMetrics, LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type {
  ObservabilityDetail,
  ObservabilityRecord,
  SessionObservabilityReport,
} from '@hbar/contracts/session-observability'
import { ObservabilityCompression, ObservabilityOutcomes } from './session-observability-charts'
import { sessionObservabilityMessages } from './session-observability-messages'
import { HbarLumenDisclosure } from './lumen-disclosure'

export function ObservabilityMetrics({ entries }: { readonly entries: readonly { label: string; value: string }[] }) {
  return (
    <LumenFrame className="hbar-observability-metrics">
      <LumenCompactMetrics
        label={entries.map((entry) => entry.label).join(' · ')}
        metrics={entries.map((entry, index) => ({ id: String(index), ...entry }))}
      />
    </LumenFrame>
  )
}

export function ObservabilityRecordMetrics({
  record,
  detail,
  totalTokens,
}: {
  readonly record: ObservabilityRecord
  readonly detail: ObservabilityDetail
  readonly totalTokens?: number
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const number = (value: number | null) => (value === null ? t('unavailable') : t('number')(value))
  const entries: { label: string; value: string }[] = []
  if (detail === 'skills')
    entries.push(
      { label: t('fields').skillUses, value: number(record.count) },
      { label: t('fields').skillLoads, value: number(record.succeeded) },
      { label: t('fields').resources, value: number(record.failed) },
    )
  if (detail === 'tools')
    entries.push(
      { label: t('fields').count, value: number(record.count) },
      { label: t('outcomes').succeeded, value: number(record.succeeded) },
      { label: t('outcomes').failed, value: number(record.failed) },
      {
        label: t('fields').successRate,
        value:
          record.succeeded + record.failed > 0
            ? t('percent')(record.succeeded / (record.succeeded + record.failed))
            : t('unavailable'),
      },
    )
  if (detail === 'files')
    entries.push(
      { label: t('fields').reads, value: number(record.succeeded) },
      { label: t('fields').writes, value: number(record.failed) },
      { label: t('fields').readLines, value: number(record.linesRead) },
      { label: t('fields').patches, value: number(record.patches) },
      { label: t('fields').addedLines, value: number(record.addedLines) },
      { label: t('fields').removedLines, value: number(record.removedLines) },
    )
  if (detail === 'compactions')
    entries.push(
      { label: t('fields').before, value: number(record.beforeTokens) },
      { label: t('fields').after, value: number(record.afterTokens) },
      {
        label: t('fields').removedTokens,
        value:
          record.beforeTokens === null || record.afterTokens === null
            ? t('unavailable')
            : t('number')(record.beforeTokens - record.afterTokens),
      },
      {
        label: t('fields').reduction,
        value:
          record.beforeTokens === null || record.afterTokens === null || record.beforeTokens === 0
            ? t('unavailable')
            : t('percent')((record.beforeTokens - record.afterTokens) / record.beforeTokens),
      },
    )
  if (detail === 'requests' || detail === 'models')
    entries.push(
      { label: t('composition').input, value: number(record.input) },
      { label: t('composition').output, value: number(record.output) },
      { label: t('totals').cost, value: record.cost === null ? t('unavailable') : t('currency')(record.cost) },
    )
  if (detail === 'models')
    entries.push(
      { label: t('totals').attempts, value: number(record.count) },
      {
        label: t('fields').tokenShare,
        value:
          !totalTokens || record.input === null || record.output === null
            ? t('unavailable')
            : t('percent')((record.input + record.output) / totalTokens),
      },
    )
  entries.push({
    label: t('fields').duration,
    value: record.durationMs === null ? t('unavailable') : t('duration')(record.durationMs),
  })
  if (detail === 'tools' || detail === 'terminal' || detail === 'models')
    entries.push({
      label: t('fields').average,
      value: record.averageMs === null ? t('unavailable') : t('duration')(record.averageMs),
    })
  return (
    <>
      <ObservabilityMetrics entries={entries} />
      {detail === 'skills' && record.secondary && (
        <LumenContentText context="section.description" tone="muted" className="hbar-observability-revision">
          {t('fields').revision} {record.secondary}
        </LumenContentText>
      )}
      {record.pricing && (
        <LumenContentText context="section.description" tone="muted">
          {t('price')(record.pricing)}
        </LumenContentText>
      )}
    </>
  )
}

export function ObservabilityPerformance({
  report,
}: {
  readonly report: SessionObservabilityReport
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const duration = (value: number | null) => (value === null ? t('unavailable') : t('duration')(value))
  const number = (value: number | null) => (value === null ? t('unavailable') : t('number')(value))
  return (
    <>
      <HbarLumenDisclosure label={t('latency').title}>
        <ObservabilityMetrics
          entries={[
            { label: t('latency').firstToken, value: duration(report.latency.firstText.p95Ms) },
            { label: t('latency').response, value: duration(report.latency.response.p95Ms) },
          ]}
        />
        <LumenContentText context="section.description" tone="muted">
          {t('list')([
            t('latency').firstToken,
            t('chart').samples(report.latency.firstText.samples),
            t('latency').response,
            t('chart').samples(report.latency.response.samples),
          ])}
        </LumenContentText>
      </HbarLumenDisclosure>
      <HbarLumenDisclosure label={t('execution').title}>
        <ObservabilityMetrics
          entries={[
            { label: t('execution').requestConcurrency, value: number(report.execution.requestConcurrency) },
            { label: t('execution').toolConcurrency, value: number(report.execution.toolConcurrency) },
            { label: t('execution').totalDuration, value: duration(report.execution.totalRunDurationMs) },
            { label: t('execution').runDuration, value: duration(report.execution.runP95Ms) },
            { label: t('execution').toolDuration, value: duration(report.tools.p95Ms) },
          ]}
        />
      </HbarLumenDisclosure>
    </>
  )
}

export function ObservabilitySections({
  report,
  onDetail,
  connected,
}: {
  readonly report: SessionObservabilityReport
  readonly onDetail: (detail: ObservabilityDetail) => void
  readonly connected: boolean
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const number = (value: number | null) => (value === null ? t('unavailable') : t('number')(value))
  const duration = (value: number | null) => (value === null ? t('unavailable') : t('duration')(value))
  const percent = (value: number | null) => (value === null ? t('unavailable') : t('percent')(value))
  const metric = (label: string, value: string) => ({ label, value })
  const icons = { skills: BookOpen, tools: Wrench, files: FileText, terminal: Terminal, compactions: Minimize2 }
  const entries = {
    skills: [
      metric(t('fields').usedSkills, number(report.skills.used)),
      metric(t('fields').skillUses, number(report.skills.uses)),
      metric(t('fields').skillLoads, number(report.skills.loads)),
      metric(t('fields').resources, number(report.skills.resourceReads)),
    ],
    files: [
      metric(t('fields').reads, number(report.files.reads)),
      metric(t('fields').writes, number(report.files.writes)),
      metric(t('fields').readPaths, number(report.files.readPaths)),
      metric(t('fields').writtenPaths, number(report.files.writtenPaths)),
      metric(t('fields').readLines, number(report.files.linesRead)),
      metric(t('fields').patches, number(report.files.patches)),
      metric(t('fields').addedLines, number(report.files.addedLines)),
      metric(t('fields').removedLines, number(report.files.removedLines)),
    ],
    compactions: [
      metric(t('fields').completed, number(report.compactions.completed)),
      metric(t('fields').failed, number(report.compactions.failed)),
      metric(t('fields').before, number(report.compactions.beforeTokens)),
      metric(t('fields').after, number(report.compactions.afterTokens)),
      metric(t('fields').removedTokens, number(report.compactions.removedTokens)),
      metric(t('fields').reduction, percent(report.compactions.reductionRate)),
      metric(t('fields').duration, duration(report.compactions.durationMs)),
      metric(t('fields').average, duration(report.compactions.averageMs)),
    ],
  }
  return (
    <LumenFrame className="hbar-observability-sections">
      {(['skills', 'tools', 'files', 'terminal', 'compactions'] as const).map((section) => {
        const activity = section === 'tools' || section === 'terminal' ? report[section] : null
        const metrics = activity
          ? [
              metric(t('fields').count, number(activity.total)),
              metric(t('fields').successRate, percent(activity.successRate)),
              metric(t('fields').duration, duration(activity.durationMs)),
              metric(t('fields').average, duration(activity.averageMs)),
              metric(t('fields').p95, duration(activity.p95Ms)),
              metric(t('fields').maximum, duration(activity.maximumMs)),
            ]
          : entries[section as keyof typeof entries]
        return (
          <LumenFrame
            as="section"
            key={section}
            className="hbar-observability-section"
            data-statistics-section={section}
            aria-label={t('sections')[section]}
          >
            <LumenFrame as="header" className="hbar-monitoring-section-heading">
              <LumenFrame as="span" className="hbar-observability-heading">
                <LumenIcon icon={icons[section]} tier="sm" />
                <LumenContentText context="section.subtitle">{t('sections')[section]}</LumenContentText>
              </LumenFrame>
              <LumenButton
                size="s"
                variant="text"
                onClick={() => onDetail(section)}
                disabled={!connected}
                aria-label={`${t('sections')[section]} · ${t('details')}`}
              >
                {t('details')}
              </LumenButton>
            </LumenFrame>
            {activity && <ObservabilityOutcomes value={activity} />}
            <ObservabilityMetrics entries={metrics} />
            {activity && (
              <LumenContentText context="section.description" tone="muted">
                {t('list')([t('fields').duration, t('chart').samples(activity.timingSamples)])}
              </LumenContentText>
            )}
            {section === 'skills' && (
              <LumenContentText context="section.description" tone="muted">
                {t('skillNote')}
              </LumenContentText>
            )}
            {section === 'files' && (
              <LumenContentText context="section.description" tone="muted">
                {t('fileNote')}
              </LumenContentText>
            )}
            {section === 'compactions' &&
              report.compactions.beforeTokens !== null &&
              report.compactions.afterTokens !== null && (
                <ObservabilityCompression
                  before={report.compactions.beforeTokens}
                  after={report.compactions.afterTokens}
                />
              )}
            {section === 'compactions' && (
              <LumenContentText context="section.description" tone="muted">
                {t('list')([t('fields').reduction, t('chart').samples(report.compactions.measured)])}
              </LumenContentText>
            )}
          </LumenFrame>
        )
      })}
    </LumenFrame>
  )
}

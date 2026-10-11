import { BookOpen, FileText, Terminal, Wrench, Minimize2 } from 'lucide-react'
import { LumenButton, LumenCompactMetrics, LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type {
  ObservabilityDetail,
  ObservabilityRecord,
  SessionObservabilityReport,
} from '@hbar/contracts/session-observability'
import { ObservabilityCompression, ObservabilityOutcomes } from './session-observability-charts'
import type { HbarSessionObservabilityLabels } from './session-observability-labels'

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
  labels,
}: {
  readonly record: ObservabilityRecord
  readonly detail: ObservabilityDetail
  readonly labels: HbarSessionObservabilityLabels
}) {
  const number = (value: number | null) => (value === null ? labels.unavailable : labels.number(value))
  const entries: { label: string; value: string }[] = []
  if (detail === 'skills')
    entries.push(
      { label: labels.fields.skillUses, value: number(record.count) },
      { label: labels.fields.skillLoads, value: number(record.succeeded) },
      { label: labels.fields.resources, value: number(record.failed) },
    )
  if (detail === 'tools')
    entries.push(
      { label: labels.fields.count, value: number(record.count) },
      { label: labels.outcomes.succeeded, value: number(record.succeeded) },
      { label: labels.outcomes.failed, value: number(record.failed) },
    )
  if (detail === 'files')
    entries.push(
      { label: labels.fields.reads, value: number(record.succeeded) },
      { label: labels.fields.writes, value: number(record.failed) },
      { label: labels.fields.readLines, value: number(record.linesRead) },
      { label: labels.fields.patches, value: number(record.patches) },
      { label: labels.fields.addedLines, value: number(record.addedLines) },
      { label: labels.fields.removedLines, value: number(record.removedLines) },
    )
  if (detail === 'compactions')
    entries.push(
      { label: labels.fields.before, value: number(record.beforeTokens) },
      { label: labels.fields.after, value: number(record.afterTokens) },
    )
  if (detail === 'requests')
    entries.push(
      { label: labels.composition.input, value: number(record.input) },
      { label: labels.composition.output, value: number(record.output) },
      { label: labels.totals.cost, value: record.cost === null ? labels.unavailable : labels.currency(record.cost) },
    )
  entries.push({
    label: labels.fields.duration,
    value: record.durationMs === null ? labels.unavailable : labels.duration(record.durationMs),
  })
  if (detail === 'tools' || detail === 'terminal')
    entries.push({
      label: labels.fields.average,
      value: record.averageMs === null ? labels.unavailable : labels.duration(record.averageMs),
    })
  return (
    <>
      <ObservabilityMetrics entries={entries} />
      {detail === 'skills' && record.secondary && (
        <LumenContentText context="section.description" tone="muted" className="hbar-observability-revision">
          {labels.fields.revision} {record.secondary}
        </LumenContentText>
      )}
      {record.pricing && (
        <LumenContentText context="section.description" tone="muted">
          {labels.price(record.pricing)}
        </LumenContentText>
      )}
    </>
  )
}

export function ObservabilitySections({
  report,
  labels,
  onDetail,
  connected,
}: {
  readonly report: SessionObservabilityReport
  readonly labels: HbarSessionObservabilityLabels
  readonly onDetail: (detail: ObservabilityDetail) => void
  readonly connected: boolean
}) {
  const number = (value: number | null) => (value === null ? labels.unavailable : labels.number(value))
  const duration = (value: number | null) => (value === null ? labels.unavailable : labels.duration(value))
  const percent = (value: number | null) => (value === null ? labels.unavailable : labels.percent(value))
  const metric = (label: string, value: string) => ({ label, value })
  const icons = { skills: BookOpen, tools: Wrench, files: FileText, terminal: Terminal, compactions: Minimize2 }
  const entries = {
    skills: [
      metric(labels.fields.usedSkills, number(report.skills.used)),
      metric(labels.fields.skillUses, number(report.skills.uses)),
      metric(labels.fields.skillLoads, number(report.skills.loads)),
      metric(labels.fields.resources, number(report.skills.resourceReads)),
    ],
    files: [
      metric(labels.fields.reads, number(report.files.reads)),
      metric(labels.fields.writes, number(report.files.writes)),
      metric(labels.fields.readPaths, number(report.files.readPaths)),
      metric(labels.fields.writtenPaths, number(report.files.writtenPaths)),
      metric(labels.fields.readLines, number(report.files.linesRead)),
      metric(labels.fields.patches, number(report.files.patches)),
      metric(labels.fields.addedLines, number(report.files.addedLines)),
      metric(labels.fields.removedLines, number(report.files.removedLines)),
    ],
    compactions: [
      metric(labels.fields.completed, number(report.compactions.completed)),
      metric(labels.fields.failed, number(report.compactions.failed)),
      metric(labels.fields.before, number(report.compactions.beforeTokens)),
      metric(labels.fields.after, number(report.compactions.afterTokens)),
      metric(labels.fields.removedTokens, number(report.compactions.removedTokens)),
      metric(labels.fields.reduction, percent(report.compactions.reductionRate)),
      metric(labels.fields.duration, duration(report.compactions.durationMs)),
      metric(labels.fields.average, duration(report.compactions.averageMs)),
    ],
  }
  return (
    <LumenFrame className="hbar-observability-sections">
      {(['skills', 'tools', 'files', 'terminal', 'compactions'] as const).map((section) => {
        const activity = section === 'tools' || section === 'terminal' ? report[section] : null
        const metrics = activity
          ? [
              metric(labels.fields.count, number(activity.total)),
              metric(labels.fields.successRate, percent(activity.successRate)),
              metric(labels.fields.duration, duration(activity.durationMs)),
              metric(labels.fields.average, duration(activity.averageMs)),
              metric(labels.fields.p95, duration(activity.p95Ms)),
              metric(labels.fields.maximum, duration(activity.maximumMs)),
            ]
          : entries[section as keyof typeof entries]
        return (
          <LumenFrame
            as="section"
            key={section}
            className="hbar-observability-section"
            data-statistics-section={section}
            aria-label={labels.sections[section]}
          >
            <LumenFrame as="header" className="hbar-monitoring-section-heading">
              <LumenFrame as="span" className="hbar-observability-heading">
                <LumenIcon icon={icons[section]} tier="sm" />
                <LumenContentText context="section.subtitle">{labels.sections[section]}</LumenContentText>
              </LumenFrame>
              <LumenButton
                size="s"
                variant="text"
                onClick={() => onDetail(section)}
                disabled={!connected}
                aria-label={`${labels.sections[section]} · ${labels.details}`}
              >
                {labels.details}
              </LumenButton>
            </LumenFrame>
            {activity && <ObservabilityOutcomes value={activity} labels={labels} />}
            <ObservabilityMetrics entries={metrics} />
            {section === 'skills' && (
              <LumenContentText context="section.description" tone="muted">
                {labels.skillNote}
              </LumenContentText>
            )}
            {section === 'files' && (
              <LumenContentText context="section.description" tone="muted">
                {labels.fileNote}
              </LumenContentText>
            )}
            {section === 'compactions' &&
              report.compactions.beforeTokens !== null &&
              report.compactions.afterTokens !== null && (
                <ObservabilityCompression
                  before={report.compactions.beforeTokens}
                  after={report.compactions.afterTokens}
                  labels={labels}
                />
              )}
          </LumenFrame>
        )
      })}
    </LumenFrame>
  )
}

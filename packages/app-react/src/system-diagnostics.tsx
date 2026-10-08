import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { LumenButton, LumenCollection, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './system-diagnostics.css'

const DATABASE_PREVIEW_LIMIT = 12

export interface HbarSystemDiagnosticsLabels {
  readonly title: string
  readonly description: string
  readonly refresh: string
  readonly loading: string
  readonly unavailable: string
  readonly oldResult: string
  readonly host: string
  readonly storage: string
  readonly activity: string
  readonly version: string
  readonly protocol: string
  readonly platform: string
  readonly demo: string
  readonly yes: string
  readonly no: string
  readonly activeRuns: string
  readonly recoveredRuns: string
  readonly streams: string
  readonly plugins: string
  readonly tools: string
  readonly noStorageEntries: string
  readonly moreStorageEntries: (count: number) => string
  readonly number: (value: number) => string
  readonly error: (code: string) => string
}

export interface HbarSystemDiagnosticsProps {
  readonly instanceId: string
  readonly connected: boolean
  readonly labels: HbarSystemDiagnosticsLabels
}

/** Read-only host facts and a sorted twelve-entry database preview; the Host owns all copy and values. */
export function HbarSystemDiagnostics({ instanceId, connected, labels }: HbarSystemDiagnosticsProps) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.diagnostics)
  const entry = state.entries[instanceId]
  const report = entry?.report
  const loading = entry?.status === 'loading'
  const refresh = () => {
    void runtime.commands.execute('systemDiagnostics.refresh', { instanceId }).catch(() => undefined)
  }
  useEffect(() => {
    if (connected) void runtime.commands.execute('systemDiagnostics.refresh', { instanceId }).catch(() => undefined)
  }, [connected, instanceId, runtime])
  const database = report ? Object.entries(report.database).sort(([a], [b]) => a.localeCompare(b)) : []
  const visibleDatabase = database.slice(0, DATABASE_PREVIEW_LIMIT)
  const hiddenDatabase = database.length - visibleDatabase.length
  return (
    <LumenFrame as="section" className="hbar-system-diagnostics" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-system-diagnostics-header">
        <LumenFrame className="hbar-system-diagnostics-intro">
          <LumenContentText context="section.title" level={2}>
            {labels.title}
          </LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {labels.description}
          </LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-system-diagnostics-reader" role="group" aria-label={labels.title} tabIndex={0}>
          <LumenButton type="button" variant="outlined" disabled={!connected || loading} onClick={refresh}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.paragraph" role="status" className="hbar-system-diagnostics-feedback">
          {labels.loading}
        </LumenContentText>
      )}
      {!connected && (
        <LumenContentText context="feedback.paragraph" role="status" className="hbar-system-diagnostics-feedback">
          {labels.unavailable}
        </LumenContentText>
      )}
      {entry?.error && (
        <LumenFrame className="hbar-system-diagnostics-feedback">
          <LumenContentText context="feedback.paragraph" role="alert">
            {labels.error(entry.error)}
          </LumenContentText>
        </LumenFrame>
      )}
      {report && (entry?.error || loading || !connected) && (
        <LumenContentText context="feedback.paragraph" tone="muted">
          {labels.oldResult}
        </LumenContentText>
      )}
      {report && (
        <LumenFrame className="hbar-system-diagnostics-results">
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={labels.host}>
            <LumenContentText context="section.title" level={3}>
              {labels.host}
            </LumenContentText>
            <LumenCollection as="dl" className="hbar-system-diagnostics-values">
              <DiagnosticValue label={labels.version} value={report.host.version} />
              <DiagnosticValue label={labels.protocol} value={labels.number(report.host.protocol)} />
              <DiagnosticValue label={labels.platform} value={report.host.platform} />
              <DiagnosticValue label={labels.demo} value={report.host.demo ? labels.yes : labels.no} />
            </LumenCollection>
          </LumenFrame>
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={labels.activity}>
            <LumenContentText context="section.title" level={3}>
              {labels.activity}
            </LumenContentText>
            <LumenCollection as="dl" className="hbar-system-diagnostics-values">
              <DiagnosticValue label={labels.activeRuns} value={labels.number(report.host.activeRuns)} />
              <DiagnosticValue label={labels.recoveredRuns} value={labels.number(report.recoveredRuns)} />
              <DiagnosticValue label={labels.streams} value={labels.number(report.streams)} />
              <DiagnosticValue label={labels.plugins} value={labels.number(report.plugins.length)} />
              <DiagnosticValue label={labels.tools} value={labels.number(report.tools.length)} />
            </LumenCollection>
          </LumenFrame>
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={labels.storage}>
            <LumenContentText context="section.title" level={3}>
              {labels.storage}
            </LumenContentText>
            {visibleDatabase.length ? (
              <LumenCollection as="dl" className="hbar-system-diagnostics-values">
                {visibleDatabase.map(([name, value]) => (
                  <DiagnosticValue key={name} label={name} value={labels.number(value)} />
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="empty.description" tone="muted">
                {labels.noStorageEntries}
              </LumenContentText>
            )}
            {hiddenDatabase > 0 && (
              <LumenContentText context="section.description" tone="muted">
                {labels.moreStorageEntries(hiddenDatabase)}
              </LumenContentText>
            )}
          </LumenFrame>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

function DiagnosticValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <LumenFrame className="hbar-system-diagnostics-value">
      <LumenContentText context="detail.term" className="hbar-system-diagnostics-term" tone="muted">
        <LumenFrame className="hbar-system-diagnostics-term-reader" role="region" aria-label={label} tabIndex={0}>
          <LumenContentText context="inline.text">{label}</LumenContentText>
        </LumenFrame>
      </LumenContentText>
      <LumenContentText context="detail.value" className="hbar-system-diagnostics-result">
        {value}
      </LumenContentText>
    </LumenFrame>
  )
}

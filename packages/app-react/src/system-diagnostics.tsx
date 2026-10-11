import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
} from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarRuntimeStatusDiagnostics, type HbarRuntimeStatusLabels } from './host-runtime-status'
import './system-diagnostics.css'

const DATABASE_PREVIEW_LIMIT = 12

export interface HbarSystemDiagnosticsLabels {
  readonly runtime: HbarRuntimeStatusLabels
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

export function HbarSystemDiagnostics({ instanceId, connected, labels }: HbarSystemDiagnosticsProps) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.diagnostics)
  const entry = state.entries[instanceId]
  const report = entry?.report
  const loading = entry?.status === 'loading'
  const refresh = () => {
    void runtime.hostRuntimeStatus.refresh()
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
          <LumenContentText context="section.title">{labels.title}</LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {labels.description}
          </LumenContentText>
        </LumenFrame>
        <LumenButton type="button" variant="outlined" disabled={!connected || loading} onClick={refresh}>
          <LumenIcon icon={RefreshCw} tier="sm" />
          {labels.refresh}
        </LumenButton>
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.message" role="status" className="hbar-system-diagnostics-feedback">
          {labels.loading}
        </LumenContentText>
      )}
      {!connected && (
        <LumenContentText context="feedback.message" role="status" className="hbar-system-diagnostics-feedback">
          {labels.unavailable}
        </LumenContentText>
      )}
      {entry?.error && (
        <LumenFrame className="hbar-system-diagnostics-feedback">
          <LumenContentText context="feedback.message" role="alert">
            {labels.error(entry.error)}
          </LumenContentText>
          {report && (
            <LumenContentText context="section.description" tone="muted">
              {labels.oldResult}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      <HbarRuntimeStatusDiagnostics labels={labels.runtime} />
      {report && (
        <LumenFrame className="hbar-system-diagnostics-results">
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={labels.host}>
            <LumenContentText context="section.subtitle">{labels.host}</LumenContentText>
            <LumenCollection className="hbar-system-diagnostics-values">
              <DiagnosticValue label={labels.version} value={report.host.version} />
              <DiagnosticValue label={labels.protocol} value={labels.number(report.host.protocol)} />
              <DiagnosticValue label={labels.platform} value={report.host.platform} />
              <DiagnosticValue label={labels.demo} value={report.host.demo ? labels.yes : labels.no} />
            </LumenCollection>
          </LumenFrame>
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={labels.activity}>
            <LumenContentText context="section.subtitle">{labels.activity}</LumenContentText>
            <LumenCollection className="hbar-system-diagnostics-values">
              <DiagnosticValue label={labels.activeRuns} value={labels.number(report.host.activeRuns)} />
              <DiagnosticValue label={labels.recoveredRuns} value={labels.number(report.recoveredRuns)} />
              <DiagnosticValue label={labels.streams} value={labels.number(report.streams)} />
              <DiagnosticValue label={labels.plugins} value={labels.number(report.plugins.length)} />
              <DiagnosticValue label={labels.tools} value={labels.number(report.tools.length)} />
            </LumenCollection>
          </LumenFrame>
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={labels.storage}>
            <LumenContentText context="section.subtitle">{labels.storage}</LumenContentText>
            {visibleDatabase.length ? (
              <LumenCollection className="hbar-system-diagnostics-values">
                {visibleDatabase.map(([name, value]) => (
                  <DiagnosticValue key={name} label={name} value={labels.number(value)} />
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="section.description" tone="muted">
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
    <LumenCollectionItem className="hbar-system-diagnostics-value">
      <LumenContentText context="message.inline" tone="muted">
        {label}
      </LumenContentText>
      <LumenContentText context="message.inline">{value}</LumenContentText>
    </LumenCollectionItem>
  )
}

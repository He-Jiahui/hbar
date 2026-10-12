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
import { systemDiagnosticsMessages } from './system-diagnostics-messages'
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
  return (
    <systemDiagnosticsMessages.Provider messages={labels}>
      <SystemDiagnosticsContent instanceId={instanceId} connected={connected} />
    </systemDiagnosticsMessages.Provider>
  )
}

function SystemDiagnosticsContent({
  instanceId,
  connected,
}: {
  readonly instanceId: string
  readonly connected: boolean
}) {
  const { t } = systemDiagnosticsMessages.useMessages()
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
    <LumenFrame as="section" className="hbar-system-diagnostics" aria-label={t('title')}>
      <LumenFrame as="header" className="hbar-system-diagnostics-header">
        <LumenFrame className="hbar-system-diagnostics-intro">
          <LumenContentText context="section.title">{t('title')}</LumenContentText>
          <LumenContentText context="section.description" tone="muted">
            {t('description')}
          </LumenContentText>
        </LumenFrame>
        <LumenButton type="button" variant="outlined" disabled={!connected || loading} onClick={refresh}>
          <LumenIcon icon={RefreshCw} tier="sm" />
          {t('refresh')}
        </LumenButton>
      </LumenFrame>
      {loading && (
        <LumenContentText context="feedback.message" role="status" className="hbar-system-diagnostics-feedback">
          {t('loading')}
        </LumenContentText>
      )}
      {!connected && (
        <LumenContentText context="feedback.message" role="status" className="hbar-system-diagnostics-feedback">
          {t('unavailable')}
        </LumenContentText>
      )}
      {entry?.error && (
        <LumenFrame className="hbar-system-diagnostics-feedback">
          <LumenContentText context="feedback.message" role="alert">
            {t('error')(entry.error)}
          </LumenContentText>
          {report && (
            <LumenContentText context="section.description" tone="muted">
              {t('oldResult')}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      <HbarRuntimeStatusDiagnostics />
      {report && (
        <LumenFrame className="hbar-system-diagnostics-results">
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={t('host')}>
            <LumenContentText context="section.subtitle">{t('host')}</LumenContentText>
            <LumenCollection className="hbar-system-diagnostics-values">
              <DiagnosticValue label={t('version')} value={report.host.version} />
              <DiagnosticValue label={t('protocol')} value={t('number')(report.host.protocol)} />
              <DiagnosticValue label={t('platform')} value={report.host.platform} />
              <DiagnosticValue label={t('demo')} value={report.host.demo ? t('yes') : t('no')} />
            </LumenCollection>
          </LumenFrame>
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={t('activity')}>
            <LumenContentText context="section.subtitle">{t('activity')}</LumenContentText>
            <LumenCollection className="hbar-system-diagnostics-values">
              <DiagnosticValue label={t('activeRuns')} value={t('number')(report.host.activeRuns)} />
              <DiagnosticValue label={t('recoveredRuns')} value={t('number')(report.recoveredRuns)} />
              <DiagnosticValue label={t('streams')} value={t('number')(report.streams)} />
              <DiagnosticValue label={t('plugins')} value={t('number')(report.plugins.length)} />
              <DiagnosticValue label={t('tools')} value={t('number')(report.tools.length)} />
            </LumenCollection>
          </LumenFrame>
          <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={t('storage')}>
            <LumenContentText context="section.subtitle">{t('storage')}</LumenContentText>
            {visibleDatabase.length ? (
              <LumenCollection className="hbar-system-diagnostics-values">
                {visibleDatabase.map(([name, value]) => (
                  <DiagnosticValue key={name} label={name} value={t('number')(value)} />
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="section.description" tone="muted">
                {t('noStorageEntries')}
              </LumenContentText>
            )}
            {hiddenDatabase > 0 && (
              <LumenContentText context="section.description" tone="muted">
                {t('moreStorageEntries')(hiddenDatabase)}
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

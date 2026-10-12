import { useEffect, useId, useMemo, useRef } from 'react'
import { LumenButton, LumenContentText, LumenFrame, LumenTabs } from '@lumen/app-ui'
import type { SessionObservabilityReader } from '@hbar/app-runtime'
import type { ObservabilityDetail } from '@hbar/contracts/session-observability'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { ObservabilityTokenChart } from './session-observability-charts'
import {
  ObservabilityMetrics,
  ObservabilityRecordMetrics,
  ObservabilitySections,
  ObservabilityPerformance,
} from './session-observability-metrics'
import type { HbarSessionObservabilityLabels } from './session-observability-labels'
import { sessionObservabilityMessages } from './session-observability-messages'
import './session-observability.css'

export type { HbarSessionObservabilityLabels } from './session-observability-labels'

function Dashboard({
  owner,
  connected,
  active,
}: {
  readonly owner: SessionObservabilityReader
  readonly connected: boolean
  readonly active: boolean
}) {
  const { t } = sessionObservabilityMessages.useMessages()
  const state = useHbarRuntimeState(owner.reader)
  const namespace = useId()
  const recordsElement = useRef<HTMLElement | null>(null)
  const showRecords = (detail: ObservabilityDetail) => {
    owner.detail(detail)
    recordsElement.current?.scrollIntoView({ block: 'start' })
    recordsElement.current?.ownerDocument.getElementById(`${namespace}-${detail}`)?.focus({ preventScroll: true })
  }
  const report = state.report
  const number = (value: number | null) => (value === null ? t('unavailable') : t('number')(value))
  const percent = (value: number | null) => (value === null ? t('unavailable') : t('percent')(value))
  const metric = (label: string, value: string) => ({ label, value })
  useEffect(() => {
    owner.setConnected(connected && active)
  }, [owner, connected, active])
  useEffect(() => owner.retain(), [owner])
  const scopes = (['session', 'turn', 'window'] as const).map((id) => ({
    id,
    label: t('scopes')[id],
    disabled: !connected,
  }))
  const detailKinds = ['skills', 'tools', 'files', 'terminal', 'compactions', 'requests', 'models'] as const
  return (
    <LumenFrame
      as="section"
      className="hbar-session-observability"
      aria-label={t('scopeTitle')}
      aria-busy={state.status === 'loading'}
      data-statistics-scope={state.scope}
    >
      <LumenFrame className="hbar-observability-scope">
        <LumenContentText context="section.subtitle">{t('scopeTitle')}</LumenContentText>
        <LumenTabs
          label={t('scopeTitle')}
          items={scopes}
          selectedId={state.scope}
          onChange={(id) => {
            if (id === 'session' || id === 'turn' || id === 'window') owner.select(id)
          }}
        />
        <LumenFrame className="hbar-observability-range-actions">
          <LumenContentText context="section.description" tone="muted">
            {report ? t('range')(report.range.scope, report.range.ordinal, report.range.label) : t('loading')}
          </LumenContentText>
          {state.scope !== 'session' && (
            <LumenFrame className="hbar-observability-pagination">
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || state.status === 'loading' || report?.range.previous == null}
                onClick={() => {
                  if (report?.range.previous != null) owner.select(state.scope, report.range.previous)
                }}
              >
                {t('previous')}
              </LumenButton>
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || state.status === 'loading' || report?.range.next == null}
                onClick={() => {
                  if (report?.range.next != null) owner.select(state.scope, report.range.next)
                }}
              >
                {t('next')}
              </LumenButton>
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || state.status === 'loading' || state.anchor === null}
                onClick={() => owner.select(state.scope)}
              >
                {t('latest')}
              </LumenButton>
            </LumenFrame>
          )}
          <LumenButton
            size="s"
            variant="text"
            disabled={!connected || state.status === 'loading'}
            onClick={owner.refresh}
          >
            {t('refresh')}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      {state.status === 'error' && connected && (
        <LumenContentText context="feedback.message" role="status">
          {t('error')(state.error ?? 'STATISTICS_UNAVAILABLE')}
        </LumenContentText>
      )}
      {!report && state.status !== 'error' && (
        <LumenContentText context="section.description" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {report && (
        <>
          <LumenFrame className="hbar-monitoring-primary-metrics">
            <ObservabilityMetrics
              entries={[
                metric(t('totals').tokens, number(report.usage.input + report.usage.output)),
                metric(
                  t('totals').cost,
                  report.usage.cost === null ? t('unavailable') : t('currency')(report.usage.cost),
                ),
              ]}
            />
          </LumenFrame>
          <ObservabilityMetrics
            entries={[
              metric(
                t('totals').rate,
                report.usage.tokensPerSecond === null ? t('unavailable') : t('rate')(report.usage.tokensPerSecond),
              ),
              metric(
                t('fields').outputRate,
                report.usage.outputPerSecond === null ? t('unavailable') : t('rate')(report.usage.outputPerSecond),
              ),
              metric(t('totals').cache, percent(report.usage.cacheHitRate)),
              metric(t('fields').cacheShare, percent(report.usage.cacheInputShare)),
              metric(t('totals').attempts, number(report.usage.requests)),
              metric(t('totals').runs, number(report.usage.runs)),
              metric(t('fields').knownCost, t('currency')(report.usage.knownCost)),
            ]}
          />
          <LumenContentText context="section.description" tone="muted">
            {t('list')([t('coverage')(report.usage.recorded, report.usage.requests), t('rateNote')])}
          </LumenContentText>
          <LumenFrame className="hbar-monitoring-composition">
            <LumenContentText context="section.subtitle">{t('composition').title}</LumenContentText>
            <LumenFrame
              className="hbar-observability-token-flow"
              role="img"
              aria-label={t('composition').summary(report.usage.input, report.usage.output)}
            >
              <LumenFrame as="span" data-token-part="input" style={{ flexGrow: report.usage.input }} />
              <LumenFrame as="span" data-token-part="output" style={{ flexGrow: report.usage.output }} />
            </LumenFrame>
            <ObservabilityMetrics
              entries={[
                metric(t('composition').input, number(report.usage.input)),
                metric(t('composition').output, number(report.usage.output)),
                metric(t('composition').cacheRead, number(report.usage.cacheRead)),
                metric(t('composition').cacheWrite, number(report.usage.cacheWrite)),
                metric(t('composition').billable, number(report.usage.billableTokens)),
              ]}
            />
          </LumenFrame>
          <ObservabilityTokenChart report={report} />
          <ObservabilitySections report={report} connected={connected} onDetail={showRecords} />
          <ObservabilityPerformance report={report} />
          <LumenFrame as="section" className="hbar-observability-records" ref={recordsElement}>
            <LumenContentText context="section.subtitle">{t('details')}</LumenContentText>
            <LumenTabs
              label={t('details')}
              items={detailKinds.map((id) => ({
                id,
                label: t('sections')[id],
                disabled: !connected,
                tabId: `${namespace}-${id}`,
                panelId: `${namespace}-records`,
              }))}
              selectedId={state.detail}
              onChange={(id) => {
                if (detailKinds.some((kind) => kind === id)) owner.detail(id as ObservabilityDetail)
              }}
            />
            <LumenFrame role="tabpanel" id={`${namespace}-records`} aria-labelledby={`${namespace}-${state.detail}`}>
              {report.detail === state.detail ? (
                report.records.length > 0 ? (
                  report.records.map((record) => (
                    <LumenFrame
                      key={record.id}
                      {...(state.detail === 'models' ? { 'data-model-usage': record.id } : {})}
                    >
                      <HbarLumenDisclosure
                        className="hbar-observability-record"
                        label={
                          <LumenFrame as="span" className="hbar-observability-record-label">
                            <LumenContentText context="control.label">{record.label}</LumenContentText>
                            <LumenContentText context="message.inline" tone="muted">
                              {record.status && Object.hasOwn(t('outcomes'), record.status)
                                ? t('outcomes')[record.status as keyof HbarSessionObservabilityLabels['outcomes']]
                                : state.detail === 'models'
                                  ? t('tokens')((record.input ?? 0) + (record.output ?? 0))
                                  : t('number')(record.count)}
                            </LumenContentText>
                          </LumenFrame>
                        }
                      >
                        <LumenContentText context="section.description" tone="muted">
                          {record.time === null ? t('unavailable') : t('timestamp')(record.time)}
                        </LumenContentText>
                        <ObservabilityRecordMetrics
                          record={record}
                          detail={state.detail}
                          totalTokens={report.usage.input + report.usage.output}
                        />
                        {state.detail === 'models' && report.usage.input + report.usage.output > 0 && (
                          <LumenFrame className="hbar-monitoring-model-track" aria-hidden="true">
                            <LumenFrame
                              as="span"
                              style={{
                                inlineSize: `${(((record.input ?? 0) + (record.output ?? 0)) / (report.usage.input + report.usage.output)) * 100}%`,
                              }}
                            />
                          </LumenFrame>
                        )}
                      </HbarLumenDisclosure>
                    </LumenFrame>
                  ))
                ) : (
                  <LumenContentText context="section.description" tone="muted">
                    {t('emptyRecords')}
                  </LumenContentText>
                )
              ) : (
                <LumenContentText context="section.description" role="status">
                  {t('loading')}
                </LumenContentText>
              )}
            </LumenFrame>
            <LumenFrame className="hbar-observability-pagination">
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || state.page <= state.firstPage || state.status === 'loading'}
                onClick={owner.previousPage}
              >
                {t('previousPage')}
              </LumenButton>
              <LumenContentText context="message.inline" tone="muted">
                {t('page')(state.page)}
              </LumenContentText>
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || !report.nextCursor || state.status === 'loading'}
                onClick={owner.nextPage}
              >
                {t('nextPage')}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
          <LumenContentText context="section.description" tone="muted">
            {t('list')([t('measurementNote'), t('chart').observed(report.observedAt)])}
          </LumenContentText>
        </>
      )}
    </LumenFrame>
  )
}

export function HbarSessionObservability({
  sessionId,
  connected,
  active = true,
  labels,
}: {
  readonly sessionId: string
  readonly connected: boolean
  readonly active?: boolean
  readonly labels: HbarSessionObservabilityLabels
}) {
  const runtime = useHbarRuntime()
  const owner = useMemo(() => runtime.state.sessionObservability.create(sessionId), [runtime, sessionId])
  return (
    <sessionObservabilityMessages.Provider messages={labels}>
      <Dashboard owner={owner} connected={connected} active={active} />
    </sessionObservabilityMessages.Provider>
  )
}

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
} from './session-observability-metrics'
import type { HbarSessionObservabilityLabels } from './session-observability-labels'
import './session-observability.css'

export type { HbarSessionObservabilityLabels } from './session-observability-labels'

function Dashboard({
  owner,
  connected,
  labels,
}: {
  readonly owner: SessionObservabilityReader
  readonly connected: boolean
  readonly labels: HbarSessionObservabilityLabels
}) {
  const state = useHbarRuntimeState(owner.reader)
  const namespace = useId()
  const recordsElement = useRef<HTMLElement | null>(null)
  const showRecords = (detail: ObservabilityDetail) => {
    owner.detail(detail)
    recordsElement.current?.scrollIntoView({ block: 'start' })
    recordsElement.current?.ownerDocument.getElementById(`${namespace}-${detail}`)?.focus({ preventScroll: true })
  }
  const report = state.report
  const number = (value: number | null) => (value === null ? labels.unavailable : labels.number(value))
  const percent = (value: number | null) => (value === null ? labels.unavailable : labels.percent(value))
  const metric = (label: string, value: string) => ({ label, value })
  useEffect(() => {
    owner.setConnected(connected)
  }, [owner, connected])
  useEffect(() => owner.retain(), [owner])
  const scopes = (['session', 'turn', 'window'] as const).map((id) => ({
    id,
    label: labels.scopes[id],
    disabled: !connected,
  }))
  const detailKinds = ['skills', 'tools', 'files', 'terminal', 'compactions', 'requests'] as const
  return (
    <LumenFrame
      as="section"
      className="hbar-session-observability"
      aria-label={labels.scopeTitle}
      aria-busy={state.status === 'loading'}
      data-statistics-scope={state.scope}
    >
      <LumenFrame className="hbar-observability-scope">
        <LumenContentText context="section.subtitle">{labels.scopeTitle}</LumenContentText>
        <LumenTabs
          label={labels.scopeTitle}
          items={scopes}
          selectedId={state.scope}
          onChange={(id) => {
            if (id === 'session' || id === 'turn' || id === 'window') owner.select(id)
          }}
        />
        <LumenFrame className="hbar-observability-range-actions">
          <LumenContentText context="section.description" tone="muted">
            {report ? labels.range(report.range.scope, report.range.ordinal, report.range.label) : labels.loading}
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
                {labels.previous}
              </LumenButton>
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || state.status === 'loading' || report?.range.next == null}
                onClick={() => {
                  if (report?.range.next != null) owner.select(state.scope, report.range.next)
                }}
              >
                {labels.next}
              </LumenButton>
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || state.status === 'loading' || state.anchor === null}
                onClick={() => owner.select(state.scope)}
              >
                {labels.latest}
              </LumenButton>
            </LumenFrame>
          )}
          <LumenButton
            size="s"
            variant="text"
            disabled={!connected || state.status === 'loading'}
            onClick={owner.refresh}
          >
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      {state.status === 'error' && connected && (
        <LumenContentText context="feedback.message" role="status">
          {labels.error(state.error ?? 'STATISTICS_UNAVAILABLE')}
        </LumenContentText>
      )}
      {!report && state.status !== 'error' && (
        <LumenContentText context="section.description" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {report && (
        <>
          <LumenFrame className="hbar-monitoring-primary-metrics">
            <ObservabilityMetrics
              entries={[
                metric(labels.totals.tokens, number(report.usage.input + report.usage.output)),
                metric(
                  labels.totals.cost,
                  report.usage.cost === null ? labels.unavailable : labels.currency(report.usage.cost),
                ),
              ]}
            />
          </LumenFrame>
          <ObservabilityMetrics
            entries={[
              metric(
                labels.totals.rate,
                report.usage.tokensPerSecond === null ? labels.unavailable : labels.rate(report.usage.tokensPerSecond),
              ),
              metric(
                labels.fields.outputRate,
                report.usage.outputPerSecond === null ? labels.unavailable : labels.rate(report.usage.outputPerSecond),
              ),
              metric(labels.totals.cache, percent(report.usage.cacheHitRate)),
              metric(labels.fields.cacheShare, percent(report.usage.cacheInputShare)),
              metric(labels.totals.attempts, number(report.usage.requests)),
              metric(labels.totals.runs, number(report.usage.runs)),
              metric(labels.fields.knownCost, labels.currency(report.usage.knownCost)),
            ]}
          />
          <LumenContentText context="section.description" tone="muted">
            {labels.coverage(report.usage.recorded, report.usage.requests)} · {labels.rateNote}
          </LumenContentText>
          <LumenFrame className="hbar-monitoring-composition">
            <LumenContentText context="section.subtitle">{labels.composition.title}</LumenContentText>
            <LumenFrame
              className="hbar-observability-token-flow"
              role="img"
              aria-label={labels.composition.summary(report.usage.input, report.usage.output)}
            >
              <LumenFrame as="span" data-token-part="input" style={{ flexGrow: report.usage.input }} />
              <LumenFrame as="span" data-token-part="output" style={{ flexGrow: report.usage.output }} />
            </LumenFrame>
            <ObservabilityMetrics
              entries={[
                metric(labels.composition.input, number(report.usage.input)),
                metric(labels.composition.output, number(report.usage.output)),
                metric(labels.composition.cacheRead, number(report.usage.cacheRead)),
                metric(labels.composition.cacheWrite, number(report.usage.cacheWrite)),
              ]}
            />
          </LumenFrame>
          <ObservabilityTokenChart report={report} labels={labels} />
          <ObservabilitySections report={report} labels={labels} connected={connected} onDetail={showRecords} />
          <LumenFrame as="section" className="hbar-observability-records" ref={recordsElement}>
            <LumenContentText context="section.subtitle">{labels.details}</LumenContentText>
            <LumenTabs
              label={labels.details}
              items={detailKinds.map((id) => ({
                id,
                label: labels.sections[id],
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
                    <HbarLumenDisclosure
                      key={record.id}
                      className="hbar-observability-record"
                      label={
                        <LumenFrame as="span" className="hbar-observability-record-label">
                          <LumenContentText context="control.label">{record.label}</LumenContentText>
                          <LumenContentText context="message.inline" tone="muted">
                            {record.status && Object.hasOwn(labels.outcomes, record.status)
                              ? labels.outcomes[record.status as keyof typeof labels.outcomes]
                              : labels.number(record.count)}
                          </LumenContentText>
                        </LumenFrame>
                      }
                    >
                      <LumenContentText context="section.description" tone="muted">
                        {record.time === null ? labels.unavailable : labels.timestamp(record.time)}
                      </LumenContentText>
                      <ObservabilityRecordMetrics record={record} detail={state.detail} labels={labels} />
                    </HbarLumenDisclosure>
                  ))
                ) : (
                  <LumenContentText context="section.description" tone="muted">
                    {labels.emptyRecords}
                  </LumenContentText>
                )
              ) : (
                <LumenContentText context="section.description" role="status">
                  {labels.loading}
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
                {labels.previousPage}
              </LumenButton>
              <LumenContentText context="message.inline" tone="muted">
                {labels.page(state.page)}
              </LumenContentText>
              <LumenButton
                size="s"
                variant="text"
                disabled={!connected || !report.nextCursor || state.status === 'loading'}
                onClick={owner.nextPage}
              >
                {labels.nextPage}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
          <LumenContentText context="section.description" tone="muted">
            {labels.measurementNote} · {labels.chart.observed(report.observedAt)}
          </LumenContentText>
        </>
      )}
    </LumenFrame>
  )
}

export function HbarSessionObservability({
  sessionId,
  connected,
  labels,
}: {
  readonly sessionId: string
  readonly connected: boolean
  readonly labels: HbarSessionObservabilityLabels
}) {
  const runtime = useHbarRuntime()
  const owner = useMemo(() => runtime.state.sessionObservability.create(sessionId), [runtime, sessionId])
  return <Dashboard owner={owner} connected={connected} labels={labels} />
}

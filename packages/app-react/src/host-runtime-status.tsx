import { useState } from 'react'
import { Activity } from 'lucide-react'
import { LumenButton, LumenCollection, LumenCollectionItem, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { hostRuntimePhase, type HostRuntimePhase, type HostRuntimeStatusState } from '@hbar/app-runtime'
import type { RuntimeGeneration, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { createMessageScope } from './messages'
import { systemDiagnosticsMessages } from './system-diagnostics-messages'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './host-runtime-status.css'

export const RUNTIME_GENERATION_PREVIEW_LIMIT = 24

export interface HbarRuntimeStatusLabels {
  readonly title: string
  readonly diagnostics: string
  readonly empty: string
  readonly phases: Readonly<Record<HostRuntimePhase, string>>
  readonly generationPhases: Readonly<Record<RuntimeGeneration['phase'], string>>
  readonly roles: Readonly<Record<RuntimeGeneration['role'], string>>
  readonly kinds: Readonly<Record<RuntimeUnitDescriptor['kind'], string>>
  readonly unit: (kind: string, id: string) => string
  readonly generation: (generation: number, role: string) => string
  readonly process: (pid: number) => string
  readonly references: (references: RuntimeGeneration['references']) => string
  readonly retry: (timestamp: number) => string
  readonly reason: (code: string) => string
  readonly more: (count: number) => string
  readonly error: (code: string) => string
}
const hostRuntimeStatusMessages = createMessageScope<HbarRuntimeStatusLabels>()

/** References: https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-9 — stable regions;
 * https://pro.reactbits.dev/docs/app-ui/monitoring — health feedback in the existing notice flow. */
export function HbarRuntimeStatusNotice({
  connected,
  labels,
}: {
  readonly connected: boolean
  readonly labels: HbarRuntimeStatusLabels
}) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.hostRuntimeStatus)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const phase = hostRuntimePhase(state)
  if (!connected || phase === 'serving' || (phase === 'unavailable' && !state.errorCode)) return null
  return (
    <LumenFrame className="hbar-runtime-status-notice" role="status" aria-live="polite" aria-atomic="true">
      <LumenIcon icon={Activity} tier="md" />
      <LumenText as="span">{labels.phases[phase]}</LumenText>
      <LumenButton
        size="s"
        variant="text"
        indicator="none"
        onClick={() => {
          setNavigationError(null)
          void runtime.commands
            .execute('app.openSettings', { scope: 'global', section: 'diagnostics' })
            .catch((error: unknown) => {
              setNavigationError(
                error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
                  ? error.code
                  : 'EXECUTION_FAILED',
              )
            })
        }}
      >
        {labels.diagnostics}
      </LumenButton>
      {navigationError && (
        <LumenText as="span" role="alert">
          {labels.error(navigationError)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

export function HbarRuntimeStatusDiagnostics() {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.hostRuntimeStatus)
  const { t } = systemDiagnosticsMessages.useMessages()
  return <HbarRuntimeStatusDetails state={state} labels={t('runtime')} />
}

/** Read-only, bounded content; identifiers and reasons come from the confirmed Host snapshot. */
export function HbarRuntimeStatusDetails({
  state,
  labels,
}: {
  readonly state: HostRuntimeStatusState
  readonly labels: HbarRuntimeStatusLabels
}) {
  return (
    <hostRuntimeStatusMessages.Provider messages={labels}>
      <HbarRuntimeStatusDetailsContent state={state} />
    </hostRuntimeStatusMessages.Provider>
  )
}

function HbarRuntimeStatusDetailsContent({ state }: { readonly state: HostRuntimeStatusState }) {
  const { t } = hostRuntimeStatusMessages.useMessages()
  const generations = (state.snapshot?.units ?? []).flatMap((unit) =>
    unit.generations.map((generation) => ({ unit, generation })),
  )
  const visible = generations.slice(0, RUNTIME_GENERATION_PREVIEW_LIMIT)
  const hidden = generations.length - visible.length
  const admissionReason = state.snapshot?.admission?.reasonCode
  const sourceReason = state.snapshot?.sourceReload?.reasonCode
  return (
    <LumenFrame as="section" className="hbar-system-diagnostics-section" aria-label={t('title')}>
      <LumenText as="h3">{t('title')}</LumenText>
      <LumenText as="p" role="status">
        {t('phases')[hostRuntimePhase(state)]}
      </LumenText>
      {state.errorCode && (
        <LumenText as="p" role="alert">
          {t('error')(state.errorCode)}
        </LumenText>
      )}
      {admissionReason && (
        <LumenText as="p" tone="muted">
          {t('reason')(admissionReason)}
        </LumenText>
      )}
      {sourceReason && sourceReason !== admissionReason && (
        <LumenText as="p" tone="muted">
          {t('reason')(sourceReason)}
        </LumenText>
      )}
      {visible.length ? (
        <LumenCollection className="hbar-runtime-status-generations">
          {visible.map(({ unit, generation }) => (
            <LumenCollectionItem
              key={`${unit.descriptor.id}:${generation.generation}`}
              className="hbar-runtime-status-generation"
            >
              <LumenFrame className="hbar-runtime-status-generation-heading">
                <LumenText as="strong">{t('unit')(t('kinds')[unit.descriptor.kind], unit.descriptor.id)}</LumenText>
                <LumenText as="span">{t('generationPhases')[generation.phase]}</LumenText>
              </LumenFrame>
              <LumenText as="span" tone="muted">
                {t('generation')(generation.generation, t('roles')[generation.role])}
              </LumenText>
              {generation.pid !== null && (
                <LumenText as="span" tone="muted">
                  {t('process')(generation.pid)}
                </LumenText>
              )}
              <LumenText as="span" tone="muted">
                {t('references')(generation.references)}
              </LumenText>
              {generation.nextAttemptAt !== null && <LumenText as="span">{t('retry')(generation.nextAttemptAt)}</LumenText>}
              {generation.reasonCode && <LumenText as="span">{t('reason')(generation.reasonCode)}</LumenText>}
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      ) : (
        <LumenText as="p" tone="muted">
          {t('empty')}
        </LumenText>
      )}
      {hidden > 0 && (
        <LumenText as="p" tone="muted">
          {t('more')(hidden)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

import { useEffect, useRef, useState } from 'react'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { SettingsFormEntry } from '@hbar/app-runtime'
import { useHbarRuntime, type HbarRuntimeView } from './runtime'

export interface SettingsContentRecoveryLabels {
  readonly retry: string
  readonly loading: string
  readonly offline: string
  readonly error: (code: string) => string
}

interface RecoveryAttempt {
  readonly runtime: HbarRuntimeView
  readonly owner: string
  readonly field: string
  readonly revision: number
  readonly accepted: boolean
  readonly error: string | null
}

/** Only interaction ownership lives here; options and draft remain in the runtime. */
export function useSettingsContentRecovery(
  entry: SettingsFormEntry | undefined,
  groupId: string | null,
  fieldNames: readonly string[],
  connected: boolean,
) {
  const runtime = useHbarRuntime()
  const owner = JSON.stringify([entry?.formId, groupId, entry?.form?.revision])
  const currentOwner = useRef({ runtime, owner })
  currentOwner.current = { runtime, owner }
  const [attempt, setAttempt] = useState<RecoveryAttempt | null>(null)
  const request = useRef<RecoveryAttempt | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const focusOwned = useRef(false)
  const focusFrame = useRef<number | null>(null)
  const current = attempt?.runtime === runtime && attempt.owner === owner ? attempt : null
  const loading = Object.values(entry?.content ?? {}).some((value) => value.status === 'loading')
  const pending = Boolean(current && !current.error && (!current.accepted || loading))
  const firstError = fieldNames.find((name) => entry?.content[name]?.status === 'error')
  const field = current?.field ?? firstError ?? null
  const disabled =
    !connected || loading || pending || entry?.form?.status === 'submitting' || entry?.form?.status === 'unknown'

  useEffect(() => {
    request.current = null
    focusOwned.current = false
    setAttempt(null)
    return () => {
      request.current = null
      focusOwned.current = false
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
      focusFrame.current = null
    }
  }, [runtime, owner])

  useEffect(() => {
    if (!current || (!current.accepted && !current.error) || loading) return
    const button = buttonRef.current
    const document = button?.ownerDocument
    const fieldBoundary = button?.closest<HTMLElement>('[data-field]')
    const controlId = fieldBoundary?.dataset.field === current.field ? fieldBoundary.dataset.controlId : undefined
    const original = controlId ? document?.getElementById(controlId) : null
    const originalControl =
      original instanceof HTMLElement &&
      original.matches('input:not([type="hidden"]), button, select, textarea, [tabindex]:not([tabindex="-1"])')
        ? original
        : (original?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not(:disabled)') ??
          original?.querySelector<HTMLElement>(
            '[role="radio"]:not(:disabled), input:not([type="hidden"]):not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
          ))
    // A later background refresh can settle the same canonical content even
    // after this interaction's guard rejected it. Do not retain a stale retry.
    const failed = entry?.content[current.field]?.status === 'error'
    const target = failed
      ? button
      : originalControl?.matches(':disabled')
        ? button?.closest('[data-schema-form]')?.querySelector('input:not(:disabled), button:not(:disabled)')
        : originalControl
    if (
      focusOwned.current &&
      entry?.form?.revision === current.revision &&
      document &&
      (document.activeElement === button || document.activeElement === document.body) &&
      !document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"]') &&
      target instanceof HTMLElement &&
      !target.matches(':disabled') &&
      target.getClientRects().length > 0
    ) {
      target.focus()
      // Wait for the focused control's layout (including any popup), then
      // reveal the original control inside its own scrolling pane.
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current)
      const capturedOwner = currentOwner.current
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = null
        if (
          currentOwner.current.runtime !== capturedOwner.runtime ||
          currentOwner.current.owner !== capturedOwner.owner ||
          document.activeElement !== target ||
          !target.isConnected ||
          target.closest('[inert]') ||
          document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"]')
        )
          return
        const popupId = target.getAttribute('aria-controls')
        const popup = popupId ? document.getElementById(popupId) : null
        if (popup?.getClientRects().length) popup.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        // Compound controls can wrap across several rows. Reveal the whole
        // field before its focused option, otherwise the remaining options
        // can stay clipped behind the scrolling pane's footer.
        if (original instanceof HTMLElement && original.contains(target))
          original.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    }
    request.current = null
    focusOwned.current = false
    if (!current.error || !failed) setAttempt(null)
  }, [current, loading, entry])

  useEffect(() => {
    const button = buttonRef.current
    if (!current || !button) return undefined
    const document = button.ownerDocument
    const leave = (event: Event) => {
      if (event.target !== button && event.target !== document.body) focusOwned.current = false
      if (event.type === 'pointerdown' && event.target !== button) focusOwned.current = false
    }
    const tab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') focusOwned.current = false
    }
    document.addEventListener('focusin', leave, true)
    document.addEventListener('pointerdown', leave, true)
    document.addEventListener('keydown', tab, true)
    return () => {
      document.removeEventListener('focusin', leave, true)
      document.removeEventListener('pointerdown', leave, true)
      document.removeEventListener('keydown', tab, true)
    }
  }, [current])

  const retry = () => {
    if (
      disabled ||
      request.current ||
      !entry?.form ||
      !field ||
      !groupId ||
      currentOwner.current.runtime !== runtime ||
      currentOwner.current.owner !== owner
    )
      return
    const captured: RecoveryAttempt = {
      runtime,
      owner,
      field,
      revision: entry.form.revision,
      accepted: false,
      error: null,
    }
    request.current = captured
    focusOwned.current = buttonRef.current?.ownerDocument.activeElement === buttonRef.current
    setAttempt(captured)
    void runtime.commands
      .execute('settingsForm.refreshContent', {
        formId: entry.formId,
        retry: { field, revision: captured.revision, groupId },
      })
      .then(() => {
        if (request.current === captured) setAttempt({ ...captured, accepted: true })
      })
      .catch((reason: unknown) => {
        if (request.current !== captured) return
        request.current = null
        const code =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED'
        setAttempt({ ...captured, error: code })
      })
  }
  return { field, buttonRef, pending, disabled, connected, error: current?.error ?? null, retry }
}

export function SettingsContentRecovery({
  controller,
  labels,
}: {
  readonly controller: ReturnType<typeof useSettingsContentRecovery>
  readonly labels: SettingsContentRecoveryLabels
}) {
  return (
    <LumenFrame className="hbar-settings-content-recovery" aria-busy={controller.pending || undefined}>
      <LumenButton ref={controller.buttonRef} type="button" disabled={controller.disabled} onClick={controller.retry}>
        {labels.retry}
      </LumenButton>
      {controller.pending && (
        <LumenText as="small" role="status">
          {labels.loading}
        </LumenText>
      )}
      {!controller.connected && (
        <LumenText as="small" role="status">
          {labels.offline}
        </LumenText>
      )}
      {controller.error && (
        <LumenText as="small" role="alert">
          {labels.error(controller.error)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

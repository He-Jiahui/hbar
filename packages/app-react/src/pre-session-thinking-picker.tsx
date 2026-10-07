import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { LumenButton, LumenFrame, LumenRange, LumenContentText } from '@lumen/app-ui'
import type { ComposerModelState } from '@hbar/app-runtime'
import type { HbarComposerModelLabels } from './composer-model-picker'
import { thinkingProgressPercent } from './composer-model-picker'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import './composer-model-picker.css'
import './pre-session-thinking-picker.css'

type ModelDescriptor = ComposerModelState['models'][number]
type ThinkingLevel = ModelDescriptor['thinkingLevels'][number]

export interface HbarPreSessionThinkingPickerProps {
  readonly model: ModelDescriptor | null
  readonly level: ThinkingLevel | null
  readonly labels: Pick<HbarComposerModelLabels, 'thinking' | 'thinkingTrigger' | 'thinkingLevel' | 'error'>
  readonly disabled?: boolean
  readonly onChoose: (level: ThinkingLevel, modelId: string) => Promise<void>
}

/** A local first-send effort preview. Only a confirmed Host model choice is applied before Run. */
export function HbarPreSessionThinkingPicker({
  model,
  level,
  labels,
  disabled = false,
  onChoose,
}: HbarPreSessionThinkingPickerProps) {
  const popupId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const openedIdentity = useRef<string | null>(null)
  const inFlight = useRef(false)
  const cancelled = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ readonly identity: string; readonly code: string } | null>(null)
  const [preview, setPreview] = useState<{ identity: string; index: number } | null>(null)
  const levels = model?.thinkingLevels ?? []
  const modelDefault =
    model?.defaultThinkingLevel && levels.includes(model.defaultThinkingLevel)
      ? model.defaultThinkingLevel
      : (levels[0] ?? 'off')
  const confirmed = level && levels.includes(level) ? level : modelDefault
  const unavailable = Boolean(level && !levels.includes(level))
  const displayed = level ?? confirmed
  const confirmedIndex = Math.max(0, levels.indexOf(confirmed))
  const identity = JSON.stringify([model?.id ?? null, levels, displayed])
  const selectedIndex = preview?.identity === identity ? preview.index : confirmedIndex
  const selectedLevel = levels[selectedIndex] ?? confirmed
  const visible = model !== null && levels.length > 0 && (levels.length > 1 || unavailable)
  const selectionError = error?.identity === identity ? error.code : null
  const close = useCallback(() => {
    cancelled.current = true
    setPreview(null)
    setOpen(false)
  }, [])
  const openPicker = useCallback(() => {
    if (disabled || inFlight.current || !visible) return
    cancelled.current = false
    openedIdentity.current = identity
    setPreview(null)
    setOpen(true)
  }, [disabled, identity, visible])
  const triggerEvents = useFloatingTrigger({ open, onOpen: openPicker, onClose: close })

  useEffect(() => {
    if (open && (disabled || !visible || openedIdentity.current !== identity)) close()
  }, [close, disabled, identity, open, visible])

  if (!visible) return null

  const commit = (input: HTMLInputElement, confirmUnavailable = false) => {
    if (
      disabled ||
      inFlight.current ||
      cancelled.current ||
      openedIdentity.current !== identity ||
      !model ||
      (preview?.identity !== identity && !(unavailable && confirmUnavailable))
    )
      return
    const next = levels[Number(input.value)]
    if (!next || (next === confirmed && !unavailable)) {
      setPreview(null)
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    const modelId = model.id
    void Promise.resolve()
      .then(() => onChoose(next, modelId))
      .then(() => {
        setPreview(null)
        setError(null)
        close()
      })
      .catch((reason: unknown) => {
        setPreview(null)
        setError({
          identity,
          code:
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
        })
      })
      .finally(() => {
        inFlight.current = false
        setBusy(false)
      })
  }

  return (
    <LumenFrame className="hbar-composer-model-picker hbar-pre-session-thinking-picker">
      <LumenButton
        ref={trigger}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-thinking-trigger"
        aria-label={labels.thinkingTrigger(labels.thinkingLevel(displayed))}
        aria-invalid={unavailable || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        disabled={disabled}
        {...triggerEvents}
      >
        {labels.thinkingLevel(displayed)}
      </LumenButton>
      <FloatingSurface
        open={open}
        onClose={close}
        anchorRef={trigger}
        initialFocusRef={slider}
        responsivePresentation="anchored"
        placement="above"
        label={labels.thinking}
        id={popupId}
        role="dialog"
        aria-label={labels.thinking}
        aria-busy={busy}
        className="hbar-pre-session-thinking-popover"
        data-kind="thinking"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <LumenFrame
          className="hbar-composer-thinking-heading"
          role="region"
          aria-label={labels.thinkingLevel(selectedLevel)}
          tabIndex={0}
        >
          <LumenContentText context="choice.title" className="hbar-composer-thinking-value">
            {labels.thinkingLevel(selectedLevel)}
          </LumenContentText>
          <LumenContentText context="popover.title" className="hbar-composer-thinking-context">
            {labels.thinking}
          </LumenContentText>
        </LumenFrame>
        <LumenFrame
          className="hbar-composer-thinking-scale"
          style={
            { '--hbar-thinking-progress': `${thinkingProgressPercent(levels.length, selectedIndex)}%` } as CSSProperties
          }
        >
          <LumenRange
            ref={slider}
            className="hbar-composer-thinking-slider"
            min={0}
            max={levels.length - 1}
            step={1}
            value={selectedIndex}
            disabled={disabled}
            aria-disabled={busy || undefined}
            aria-label={labels.thinking}
            aria-valuetext={labels.thinkingLevel(selectedLevel)}
            onChange={(event) => {
              if (busy) return
              cancelled.current = false
              setPreview({ identity, index: Number(event.currentTarget.value) })
              setError(null)
            }}
            onPointerDown={() => {
              cancelled.current = false
            }}
            onPointerUp={(event) => commit(event.currentTarget, true)}
            onPointerCancel={() => {
              cancelled.current = true
              setPreview(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
              event.preventDefault()
              event.stopPropagation()
              commit(event.currentTarget, true)
            }}
            onBlur={(event) => commit(event.currentTarget)}
          />
          <LumenFrame className="hbar-composer-thinking-rail" aria-hidden="true">
            {levels.map((item, index) => (
              <LumenFrame key={item} className="hbar-composer-thinking-stop" data-reached={index <= selectedIndex} />
            ))}
          </LumenFrame>
        </LumenFrame>
        {selectionError && (
          <LumenFrame className="hbar-composer-picker-feedback" role="region" aria-label={labels.thinking} tabIndex={0}>
            <LumenContentText context="feedback.paragraph" role="alert">
              {labels.error(selectionError)}
            </LumenContentText>
          </LumenFrame>
        )}
      </FloatingSurface>
      {selectionError && !open && (
        <LumenContentText context="feedback.paragraph" role="alert" className="hbar-composer-model-closed-recovery">
          {labels.error(selectionError)}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}

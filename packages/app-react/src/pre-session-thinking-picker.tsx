import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { LumenContentText, LumenButton, LumenFrame, LumenRange, LumenFloatingSurface } from '@lumen/app-ui'
import type { ComposerModelState } from '@hbar/app-runtime'
import type { HbarComposerModelLabels } from './composer-model-picker'
import { thinkingProgressPercent } from './composer-model-picker'
import './composer-model-picker.css'
import { maximumContextWindow } from '@hbar/contracts'
import { HbarMaxModeControl } from './max-mode-control'

type ModelDescriptor = ComposerModelState['models'][number]
type ThinkingLevel = ModelDescriptor['thinkingLevels'][number]

export interface HbarPreSessionThinkingPickerProps {
  readonly model: ModelDescriptor | null
  readonly level: ThinkingLevel | null
  readonly labels: Pick<HbarComposerModelLabels, 'thinking' | 'thinkingTrigger' | 'thinkingLevel' | 'error' | 'maxMode'>
  readonly maxMode?: boolean
  readonly disabled?: boolean
  readonly onChoose: (level: ThinkingLevel, modelId: string) => Promise<void>
  readonly onMaxModeChange: (enabled: boolean, modelId: string) => Promise<void>
}

/** A local first-send effort preview. Only a confirmed Host model choice is applied before Run. */
export function HbarPreSessionThinkingPicker({
  model,
  level,
  labels,
  disabled = false,
  onChoose,
  maxMode = false,
  onMaxModeChange,
}: HbarPreSessionThinkingPickerProps) {
  const popupId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const cancelled = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ identity: string; index: number } | null>(null)
  const levels = model?.thinkingLevels ?? []
  const supportsMax = Boolean(model && maximumContextWindow(model) > model.contextWindow)
  const modelDefault =
    model?.defaultThinkingLevel && levels.includes(model.defaultThinkingLevel)
      ? model.defaultThinkingLevel
      : (levels[0] ?? 'off')
  const confirmed = level && levels.includes(level) ? level : modelDefault
  const unavailable = Boolean(level && !levels.includes(level))
  const displayed = level ?? confirmed
  const confirmedIndex = Math.max(0, levels.indexOf(confirmed))
  const identity = JSON.stringify([model?.id ?? null, levels, displayed, model?.contextTiers, maxMode])
  const liveIdentity = useRef<string | null>(identity)
  useEffect(() => {
    liveIdentity.current = identity
    setError(null)
    return () => {
      liveIdentity.current = null
    }
  }, [identity])
  const selectedIndex = preview?.identity === identity ? preview.index : confirmedIndex
  const selectedLevel = levels[selectedIndex] ?? confirmed

  useEffect(() => {
    if ((levels.length > 1 || unavailable || supportsMax || maxMode) && !disabled) return
    popup.current?.hidePopover()
  }, [disabled, levels.length, unavailable, supportsMax, maxMode])

  if (!model || (levels.length < 2 && !unavailable && !supportsMax && !maxMode)) return null
  const effortName = levels.length > 1 ? labels.thinkingLevel(displayed) : labels.maxMode.menu
  const effortTrigger = levels.length > 1 ? labels.thinkingTrigger(effortName) : labels.maxMode.menu

  const commit = (input: HTMLInputElement, confirmUnavailable = false) => {
    if (
      disabled ||
      inFlight.current ||
      cancelled.current ||
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
    void onChoose(next, model.id)
      .then(() => {
        setPreview(null)
        popup.current?.hidePopover()
        setTimeout(() => trigger.current?.focus(), 0)
      })
      .catch((reason: unknown) => {
        setPreview(null)
        setError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
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
        aria-label={maxMode ? labels.maxMode.trigger(effortTrigger) : effortTrigger}
        aria-invalid={unavailable || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {effortName}
        {maxMode && (
          <LumenContentText context="control.label" className="hbar-composer-max-badge">
            {labels.maxMode.badge}
          </LumenContentText>
        )}
      </LumenButton>
      <LumenFloatingSurface
        contentRef={popup}
        anchorRef={trigger}
        open={open}
        onClose={() => setOpen(false)}
        keepMounted
        focusBehavior="preserve"
        id={popupId}
        role="dialog"
        aria-label={labels.thinking}
        aria-busy={busy}
        className="hbar-composer-picker-popover"
        data-kind="thinking"
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          if (opening) {
            cancelled.current = false
            queueMicrotask(() => {
              if (levels.length > 1) slider.current?.focus()
              else popup.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
            })
          } else {
            setPreview(null)
            setError(null)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancelled.current = true
            setPreview(null)
            popup.current?.hidePopover()
            trigger.current?.focus()
          }
        }}
      >
        {levels.length > 1 && (
          <LumenFrame className="hbar-composer-thinking-heading">
            <LumenContentText context="control.label" className="hbar-composer-thinking-value">
              {labels.thinkingLevel(selectedLevel)}
            </LumenContentText>
            <LumenContentText context="control.label" className="hbar-composer-thinking-context">
              {labels.thinking}
            </LumenContentText>
          </LumenFrame>
        )}
        {levels.length > 1 && (
          <LumenFrame
            className="hbar-composer-thinking-scale"
            style={
              {
                '--hbar-thinking-progress': `${thinkingProgressPercent(levels.length, selectedIndex)}%`,
              } as CSSProperties
            }
          >
            <LumenRange
              ref={slider}
              className="hbar-composer-thinking-slider"
              min={0}
              max={levels.length - 1}
              step={1}
              value={selectedIndex}
              disabled={disabled || busy}
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
                if (event.key !== 'Enter') return
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
        )}
        <HbarMaxModeControl
          model={model}
          enabled={maxMode}
          disabled={disabled || busy}
          labels={labels.maxMode}
          onChange={(enabled) => {
            if (disabled || inFlight.current) return
            inFlight.current = true
            setBusy(true)
            setError(null)
            void onMaxModeChange(enabled, model.id)
              .catch((reason: unknown) => {
                if (liveIdentity.current !== identity) return
                setError(
                  reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                    ? reason.code
                    : 'EXECUTION_FAILED',
                )
              })
              .finally(() => {
                inFlight.current = false
                setBusy(false)
              })
          }}
        />
        {error && (
          <LumenFrame className="hbar-composer-picker-feedback">
            <LumenContentText context="feedback.message" role="alert">
              {labels.error(error)}
            </LumenContentText>
          </LumenFrame>
        )}
      </LumenFloatingSurface>
    </LumenFrame>
  )
}

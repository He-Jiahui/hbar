import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { LumenButton, LumenFrame, LumenRange, LumenText } from '@lumen/app-ui'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import type { ThinkingLevel } from '@hbar/contracts'
import type { HbarComposerModelLabels } from './composer-model-picker'
import { thinkingProgressPercent } from './composer-model-picker'
import './composer-model-picker.css'

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
  const popup = useRef<HTMLDivElement>(null)
  const slider = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const cancelled = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ identity: string; index: number } | null>(null)
  const levels = model?.thinkingLevels ?? []
  const modelDefault =
    model?.defaultThinkingLevel && levels.includes(model.defaultThinkingLevel)
      ? model.defaultThinkingLevel
      : (levels[0] ?? 'off')
  const confirmed = level && levels.includes(level) ? level : modelDefault
  const confirmedIndex = Math.max(0, levels.indexOf(confirmed))
  const identity = JSON.stringify([model?.id ?? null, levels, confirmed])
  const selectedIndex = preview?.identity === identity ? preview.index : confirmedIndex
  const selectedLevel = levels[selectedIndex] ?? confirmed

  useEffect(() => {
    if (levels.length > 1 && !disabled) return
    popup.current?.hidePopover()
  }, [disabled, levels.length])

  if (!model || levels.length < 2) return null

  const commit = (input: HTMLInputElement) => {
    if (disabled || inFlight.current || cancelled.current || !model || preview?.identity !== identity) return
    const next = levels[Number(input.value)]
    if (!next || next === confirmed) {
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
        aria-label={labels.thinkingTrigger(labels.thinkingLevel(confirmed))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        disabled={disabled}
        popoverTarget={popupId}
      >
        {labels.thinkingLevel(confirmed)}
      </LumenButton>
      <LumenFrame
        ref={popup}
        id={popupId}
        popover="auto"
        role="dialog"
        aria-label={labels.thinking}
        aria-busy={busy}
        className="hbar-composer-picker-popover"
        data-kind="thinking"
        onBeforeToggle={(event) => {
          if (event.newState !== 'open' || !trigger.current) return
          const rect = trigger.current.getBoundingClientRect()
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
          const width = Math.min(18.75 * rem, innerWidth - 2 * rem)
          const above = rect.top > innerHeight - rect.bottom
          event.currentTarget.style.setProperty(
            '--composer-popup-left',
            `${Math.max(rem, Math.min(rect.right - width, innerWidth - width - rem))}px`,
          )
          event.currentTarget.style.setProperty('--composer-popup-top', above ? 'auto' : `${rect.bottom + rem / 2}px`)
          event.currentTarget.style.setProperty(
            '--composer-popup-bottom',
            above ? `${innerHeight - rect.top + rem / 2}px` : 'auto',
          )
          event.currentTarget.style.setProperty(
            '--composer-popup-limit',
            `${Math.max(0, (above ? rect.top : innerHeight - rect.bottom) - 1.5 * rem)}px`,
          )
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          if (opening) {
            cancelled.current = false
            queueMicrotask(() => slider.current?.focus())
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
        <LumenFrame className="hbar-composer-thinking-heading">
          <LumenText as="strong" className="hbar-composer-thinking-value">
            {labels.thinkingLevel(selectedLevel)}
          </LumenText>
          <LumenText as="span" className="hbar-composer-thinking-context">
            {labels.thinking}
          </LumenText>
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
            onPointerUp={(event) => commit(event.currentTarget)}
            onPointerCancel={() => {
              cancelled.current = true
              setPreview(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              event.stopPropagation()
              commit(event.currentTarget)
            }}
            onBlur={(event) => commit(event.currentTarget)}
          />
          <LumenFrame className="hbar-composer-thinking-rail" aria-hidden="true">
            {levels.map((item, index) => (
              <LumenFrame key={item} className="hbar-composer-thinking-stop" data-reached={index <= selectedIndex} />
            ))}
          </LumenFrame>
        </LumenFrame>
        {error && (
          <LumenFrame className="hbar-composer-picker-feedback">
            <LumenText role="alert">{labels.error(error)}</LumenText>
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}

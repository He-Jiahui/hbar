import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Paperclip, Plus, Slash } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenIconButton, LumenInput } from '@lumen/app-ui'
import './composer-add-menu.css'

export interface HbarComposerAddMenuLabels {
  readonly open: string
  readonly menu: string
  readonly files: string
  readonly filesUnavailable: string
  readonly slash: string
  readonly slashUnavailable: string
}

/** A content-grown menu of at most three composer actions; the Goal slot stays mounted through async recovery. */
export function HbarComposerAddMenu({
  labels,
  canAddFiles,
  canOpenSlash,
  onFiles,
  onOpenSlash,
  goalSlotRef,
  triggerRef,
  goalPreparedRequest = 0,
  onGoalPrepared,
}: {
  readonly labels: HbarComposerAddMenuLabels
  readonly canAddFiles: boolean
  readonly canOpenSlash: boolean
  readonly onFiles?: ((files: readonly File[]) => void) | undefined
  readonly onOpenSlash: () => void
  readonly goalSlotRef?: ((element: HTMLDivElement | null) => void) | undefined
  readonly triggerRef?: RefObject<HTMLButtonElement | null>
  readonly goalPreparedRequest?: number
  readonly onGoalPrepared?: (() => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const hasFiles = Boolean(onFiles)
  const hasGoal = Boolean(goalSlotRef)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const setTrigger = useCallback(
    (element: HTMLButtonElement | null) => {
      trigger.current = element
      if (triggerRef) triggerRef.current = element
    },
    [triggerRef],
  )
  const fileChoice = useRef<HTMLButtonElement>(null)
  const slashChoice = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const consumedGoalPreparedRequest = useRef(goalPreparedRequest)

  useEffect(() => {
    if (goalPreparedRequest === consumedGoalPreparedRequest.current) return
    consumedGoalPreparedRequest.current = goalPreparedRequest
    if (!open) return
    setOpen(false)
    onGoalPrepared?.()
  }, [goalPreparedRequest, open, onGoalPrepared])

  useEffect(() => {
    if (!open) return
    const document = root.current?.ownerDocument
    if (!document) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (root.current?.querySelector('[popover]:popover-open')) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    if (hasFiles && canAddFiles) fileChoice.current?.focus()
    else if (canOpenSlash) slashChoice.current?.focus()
    else root.current?.querySelector<HTMLButtonElement>('.hbar-composer-add-goal-slot button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open, hasFiles, canAddFiles, canOpenSlash])

  return (
    <LumenFrame ref={root} className="hbar-composer-add-root">
      <LumenIconButton
        ref={setTrigger}
        label={labels.open}
        disabled={!canAddFiles && !canOpenSlash && !hasGoal}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <LumenIcon icon={Plus} tier="md" />
      </LumenIconButton>
      <LumenFrame id={id} role="group" aria-label={labels.menu} className="hbar-composer-add-popover" hidden={!open}>
        {onFiles && (
          <LumenButton
            ref={fileChoice}
            type="button"
            variant="text"
            indicator="none"
            className="hbar-composer-add-choice"
            disabled={!canAddFiles}
            title={!canAddFiles ? labels.filesUnavailable : undefined}
            aria-description={!canAddFiles ? labels.filesUnavailable : undefined}
            onClick={() => {
              setOpen(false)
              trigger.current?.focus()
              fileInput.current?.click()
            }}
          >
            <LumenIcon icon={Paperclip} tier="sm" />
            {labels.files}
          </LumenButton>
        )}
        <LumenButton
          ref={slashChoice}
          type="button"
          variant="text"
          indicator="none"
          className="hbar-composer-add-choice"
          disabled={!canOpenSlash}
          title={!canOpenSlash ? labels.slashUnavailable : undefined}
          aria-description={!canOpenSlash ? labels.slashUnavailable : undefined}
          onClick={() => {
            setOpen(false)
            onOpenSlash()
          }}
        >
          <LumenIcon icon={Slash} tier="sm" />
          {labels.slash}
        </LumenButton>
        {hasGoal && <LumenFrame ref={goalSlotRef} className="hbar-composer-add-goal-slot" />}
      </LumenFrame>
      {onFiles && (
        <LumenInput
          ref={fileInput}
          type="file"
          variant="plain"
          hidden
          multiple
          disabled={!canAddFiles}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            if (files.length) onFiles(files)
          }}
        />
      )}
    </LumenFrame>
  )
}

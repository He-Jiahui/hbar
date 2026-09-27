import { useEffect, useId, useRef, useState } from 'react'
import { Paperclip, Plus, Slash } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenIconButton } from '@lumen/app-ui'
import './composer-add-menu.css'

export interface HbarComposerAddMenuLabels {
  readonly open: string
  readonly menu: string
  readonly files: string
  readonly filesUnavailable: string
  readonly slash: string
  readonly slashUnavailable: string
}

/** The plus button is a choice of intents, not an implicit file-system action. */
export function HbarComposerAddMenu({
  labels,
  canAddFiles,
  canOpenSlash,
  onFiles,
  onOpenSlash,
}: {
  readonly labels: HbarComposerAddMenuLabels
  readonly canAddFiles: boolean
  readonly canOpenSlash: boolean
  readonly onFiles?: ((files: readonly File[]) => void) | undefined
  readonly onOpenSlash: () => void
}) {
  const [open, setOpen] = useState(false)
  const hasFiles = Boolean(onFiles)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const fileChoice = useRef<HTMLButtonElement>(null)
  const slashChoice = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const document = root.current?.ownerDocument
    if (!document) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    if (hasFiles && canAddFiles) fileChoice.current?.focus()
    else if (canOpenSlash) slashChoice.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open, hasFiles, canAddFiles, canOpenSlash])

  return (
    <LumenFrame ref={root} className="hbar-composer-add-root">
      <LumenIconButton
        ref={trigger}
        label={labels.open}
        disabled={!canAddFiles && !canOpenSlash}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <LumenIcon icon={Plus} tier="md" />
      </LumenIconButton>
      {open && (
        <LumenFrame id={id} role="group" aria-label={labels.menu} className="hbar-composer-add-popover">
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
        </LumenFrame>
      )}
      {onFiles && (
        <input
          ref={fileInput}
          type="file"
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

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { FileText, Paperclip, Plus, Slash, Target } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenFloatingSurface,
  LumenFrame,
  LumenIcon,
  LumenInput,
  useFloatingTrigger,
} from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import './composer-add-menu.css'
import { createMessageScope } from './messages'

export interface HbarComposerAddMenuLabels {
  readonly open: string
  readonly menu: string
  readonly files: string
  readonly filesUnavailable: string
  readonly slash: string
  readonly slashUnavailable: string
  readonly templates: string
  readonly templatesUnavailable: string
}

const ComposerAddMenuMessages = createMessageScope<{ readonly addMenu: HbarComposerAddMenuLabels }>()

/** Bounded composer actions; the Goal slot stays mounted through async recovery. */
export function HbarComposerAddMenu({ labels, ...viewProps }: {
  readonly labels: HbarComposerAddMenuLabels
  readonly canAddFiles: boolean
  readonly canOpenSlash: boolean
  readonly onFiles?: ((files: readonly File[]) => void) | undefined
  readonly onOpenSlash: () => void
  readonly showSlash?: boolean
  readonly templateAction?: {
    readonly disabled: boolean
    readonly onChoose: () => void
  }
  readonly goalAction?: {
    readonly label: string
    readonly disabled?: boolean
    readonly disabledHint?: string
    readonly onChoose: () => void
  }
  readonly goalSlotRef?: ((element: HTMLDivElement | null) => void) | undefined
  readonly triggerRef?: RefObject<HTMLButtonElement | null>
  readonly goalPreparedRequest?: number
  readonly onGoalPrepared?: (() => void) | undefined
}) {
  return (
    <ComposerAddMenuMessages.Provider messages={{ addMenu: labels }}>
      <HbarComposerAddMenuContent
        {...viewProps}
      />
    </ComposerAddMenuMessages.Provider>
  )
}

function HbarComposerAddMenuContent({
  canAddFiles,
  canOpenSlash,
  onFiles,
  onOpenSlash,
  showSlash = true,
  templateAction,
  goalAction,
  goalSlotRef,
  triggerRef,
  goalPreparedRequest = 0,
  onGoalPrepared,
}: Omit<Parameters<typeof HbarComposerAddMenu>[0], 'labels'>) {
  const { t } = ComposerAddMenuMessages.useMessages()
  const labels = t('addMenu')
  const [open, setOpen] = useState(false)
  const hasFiles = Boolean(onFiles)
  const hasGoal = Boolean(goalSlotRef || goalAction)
  const id = useId()
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
  const templateChoice = useRef<HTMLButtonElement>(null)
  const goalChoice = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const consumedGoalPreparedRequest = useRef(goalPreparedRequest)
  const triggerEvents = useFloatingTrigger({
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  })
  const initialFocusRef =
    hasFiles && canAddFiles
      ? fileChoice
      : showSlash && canOpenSlash
        ? slashChoice
        : templateAction && !templateAction.disabled
          ? templateChoice
          : goalChoice

  useEffect(() => {
    if (goalPreparedRequest === consumedGoalPreparedRequest.current) return
    consumedGoalPreparedRequest.current = goalPreparedRequest
    if (!open) return
    setOpen(false)
    onGoalPrepared?.()
  }, [goalPreparedRequest, onGoalPrepared, open])

  const menu = (
    <>
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
      {showSlash && (
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
      )}
      {templateAction && (
        <LumenButton
          ref={templateChoice}
          type="button"
          variant="text"
          indicator="none"
          className="hbar-composer-add-choice"
          disabled={templateAction.disabled}
          title={templateAction.disabled ? labels.templatesUnavailable : undefined}
          aria-description={templateAction.disabled ? labels.templatesUnavailable : undefined}
          onClick={() => {
            setOpen(false)
            templateAction.onChoose()
          }}
        >
          <LumenIcon icon={FileText} tier="sm" />
          {labels.templates}
        </LumenButton>
      )}
      {goalAction && (
        <>
          <LumenButton
            ref={goalChoice}
            type="button"
            variant="text"
            indicator="none"
            className="hbar-composer-add-choice"
            disabled={goalAction.disabled}
            title={goalAction.disabled ? goalAction.disabledHint : undefined}
            aria-description={goalAction.disabled ? goalAction.disabledHint : undefined}
            onClick={() => {
              setOpen(false)
              goalAction.onChoose()
            }}
          >
            <LumenIcon icon={Target} tier="sm" />
            {goalAction.label}
          </LumenButton>
          {goalAction.disabled && goalAction.disabledHint && (
            <LumenContentText context="section.description" className="hbar-composer-add-hint">
              {goalAction.disabledHint}
            </LumenContentText>
          )}
        </>
      )}
      {hasGoal && <LumenFrame ref={goalSlotRef} className="hbar-composer-add-goal-slot" />}
    </>
  )

  const filePicker = onFiles ? (
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
  ) : null

  return (
    <LumenFrame className="hbar-composer-add-root">
      <HbarActionIconButton
        ref={setTrigger}
        label={labels.open}
        disabled={!canAddFiles && !(showSlash && canOpenSlash) && !hasGoal && !templateAction}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onPointerDown={triggerEvents.onPointerDown}
        onClick={triggerEvents.onClick}
      >
        <LumenIcon icon={Plus} tier="md" />
      </HbarActionIconButton>
      <LumenFloatingSurface
        id={id}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        mode="anchored"
        placement="above"
        initialFocusRef={initialFocusRef}
        keepMounted
        label={labels.menu}
        role="dialog"
        className="hbar-composer-add-popover"
      >
        <LumenFrame role="group" aria-label={labels.menu} className="hbar-composer-add-actions">
          {menu}
        </LumenFrame>
      </LumenFloatingSurface>
      {filePicker}
    </LumenFrame>
  )
}

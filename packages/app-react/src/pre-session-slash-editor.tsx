import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { LumenFrame, LumenTextarea } from '@lumen/app-ui'
import { HbarComposerSlashMenu, type HbarComposerSlashLabels } from './composer-slash-menu'
import {
  localSlashCommand,
  shouldSubmitExactSlashOnSend,
  slashMatches,
  slashTokenAt,
  type LocalSlashCommand,
} from './composer-slash'
import './composer-mention-editor.css'
import './pre-session-slash-editor.css'

export type PreSessionLocalSlashCommand = Extract<LocalSlashCommand, 'model' | 'settings' | 'goal'>

function isPreSessionSuggestion(command: LocalSlashCommand): boolean {
  return (
    command === 'model' ||
    command === 'settings' ||
    command === 'goal' ||
    command === 'agent' ||
    command.startsWith('agent ')
  )
}

export function preSessionSlashLabels(labels: HbarComposerSlashLabels): HbarComposerSlashLabels {
  return { ...labels, commands: labels.commands.filter((command) => isPreSessionSuggestion(command.id)) }
}

export interface HbarPreSessionSlashEditorProps {
  readonly value: string
  readonly inputLabel: string
  readonly placeholder: string
  readonly disabled: boolean
  readonly sendBehavior: 'enter' | 'modifierEnter' | null
  readonly labels: HbarComposerSlashLabels
  /** Monotonic request from the add menu; inserts `/` at the current selection. */
  readonly slashOpenRequest?: number | undefined
  /** Optional Host focus target for a nearby composer action. */
  readonly editorRef?: RefObject<HTMLTextAreaElement | null> | undefined
  readonly onChange: (value: string) => void
  readonly onSubmit: () => void
  /** The Host owns any asynchronous state and its visible failure feedback. */
  readonly onLocalCommand: (command: PreSessionLocalSlashCommand) => void | Promise<void>
}

type SlashTrigger = { readonly from: number; readonly to: number; readonly term: string }
type PendingCaret = { readonly value: string; readonly offset: number }

export function isSameSlashTrigger(
  left: { readonly from: number; readonly to: number; readonly term: string } | null,
  right: { readonly from: number; readonly to: number; readonly term: string } | null,
): boolean {
  return left !== null && right !== null && left.from === right.from && left.to === right.to && left.term === right.term
}

function getSlashTrigger(value: string, cursor: number, available: readonly LocalSlashCommand[]): SlashTrigger | null {
  const token = slashTokenAt(value, cursor)
  return token && slashMatches(token.term, available).length ? token : null
}

function isSubmitShortcut(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  behavior: HbarPreSessionSlashEditorProps['sendBehavior'],
) {
  if (event.key !== 'Enter' || event.shiftKey || behavior === null) return false
  if (behavior === 'enter') return !event.ctrlKey && !event.metaKey
  return event.ctrlKey || event.metaKey
}

/** Controlled no-tab input: local setup actions and completion-only Agent parent prompts. */
export function HbarPreSessionSlashEditor({
  value,
  inputLabel,
  placeholder,
  disabled,
  sendBehavior,
  labels,
  slashOpenRequest = 0,
  editorRef,
  onChange,
  onSubmit,
  onLocalCommand,
}: HbarPreSessionSlashEditorProps) {
  const localEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const inputRef = editorRef ?? localEditorRef
  const menuId = useId()
  const consumedSlashOpenRequest = useRef(slashOpenRequest)
  const composing = useRef(false)
  const pendingCaret = useRef<PendingCaret | null>(null)
  const slashTriggerRef = useRef<SlashTrigger | null>(null)
  const dismissedSlashRef = useRef<SlashTrigger | null>(null)

  const slashLabels = useMemo<HbarComposerSlashLabels>(() => preSessionSlashLabels(labels), [labels])
  const availableCommands = useMemo(() => slashLabels.commands.map((command) => command.id), [slashLabels])
  const [slashTrigger, setSlashTrigger] = useState<SlashTrigger | null>(() =>
    disabled ? null : getSlashTrigger(value, value.length, availableCommands),
  )
  const [selectedIndex, setSelectedIndex] = useState(0)

  const setActiveSlash = useCallback((next: SlashTrigger | null) => {
    let active = next
    const dismissed = dismissedSlashRef.current
    if (dismissed) {
      if (isSameSlashTrigger(next, dismissed)) active = null
      else dismissedSlashRef.current = null
    }
    const previous = slashTriggerRef.current
    if (!active || previous?.from !== active.from || previous?.term !== active.term) setSelectedIndex(0)
    slashTriggerRef.current = active
    setSlashTrigger(active)
  }, [])

  const matches = slashTrigger && !disabled ? slashMatches(slashTrigger.term, availableCommands) : []
  const activeIndex = matches.length ? Math.min(selectedIndex, matches.length - 1) : 0
  const slashOpen = matches.length > 0

  useEffect(() => {
    if (disabled) setActiveSlash(null)
  }, [disabled, setActiveSlash])

  useEffect(() => {
    const pending = pendingCaret.current
    if (!pending) return
    if (pending.value !== value) {
      pendingCaret.current = null
      return
    }
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(pending.offset, pending.offset)
    pendingCaret.current = null
  }, [inputRef, value])

  const openSlashAtSelection = useCallback(() => {
    const input = inputRef.current
    if (!input || disabled) return
    dismissedSlashRef.current = null

    const start = Math.max(0, Math.min(value.length, input.selectionStart ?? value.length))
    const end = Math.max(start, Math.min(value.length, input.selectionEnd ?? start))
    const currentToken = getSlashTrigger(value, start, availableCommands)
    if (currentToken) {
      setActiveSlash(currentToken)
      input.focus()
      input.setSelectionRange(start, start)
      return
    }

    const separator = start > 0 && !/\s/.test(value[start - 1] ?? '') ? ' ' : ''
    const insertion = `${separator}/`
    const nextValue = value.slice(0, start) + insertion + value.slice(end)
    const nextCursor = start + insertion.length
    const nextToken = getSlashTrigger(nextValue, nextCursor, availableCommands)
    setActiveSlash(nextToken)
    pendingCaret.current = { value: nextValue, offset: nextCursor }
    input.focus()
    input.setSelectionRange(nextCursor, nextCursor)
    onChange(nextValue)
  }, [availableCommands, disabled, inputRef, onChange, setActiveSlash, value])

  useEffect(() => {
    if (slashOpenRequest <= consumedSlashOpenRequest.current) return
    consumedSlashOpenRequest.current = slashOpenRequest
    openSlashAtSelection()
  }, [slashOpenRequest, openSlashAtSelection])

  const chooseSlashCommand = (command: LocalSlashCommand) => {
    const trigger = slashTriggerRef.current
    if (!trigger || disabled || !isPreSessionSuggestion(command)) return
    if (!slashMatches(trigger.term, availableCommands).includes(command)) return
    const currentToken = slashTokenAt(value, trigger.to)
    if (!currentToken || currentToken.from !== trigger.from || currentToken.to !== trigger.to) return

    const insertion = `/${command} `
    const nextValue = value.slice(0, trigger.from) + insertion + value.slice(trigger.to)
    const nextCursor = trigger.from + insertion.length
    setActiveSlash(null)
    pendingCaret.current = { value: nextValue, offset: nextCursor }
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(nextCursor, nextCursor)
    onChange(nextValue)
  }

  const submit = () => {
    if (disabled) return
    const command = localSlashCommand(value, availableCommands)
    if (command === 'model' || command === 'settings' || command === 'goal') {
      void onLocalCommand(command)
      return
    }
    onSubmit()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      event.stopPropagation()
      return
    }

    if (slashOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((index) => Math.min(matches.length - 1, index + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((index) => Math.max(0, index - 1))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const command = matches[activeIndex]
        if (
          event.key === 'Enter' &&
          shouldSubmitExactSlashOnSend({
            text: value,
            activeTerm: slashTrigger?.term ?? '',
            selectedCommand: command,
            availableCommands,
            submitCommands: ['model', 'settings', 'goal'],
            sendShortcut: isSubmitShortcut(event, sendBehavior),
          })
        ) {
          event.preventDefault()
          setActiveSlash(null)
          submit()
          return
        }
        if (command) {
          event.preventDefault()
          chooseSlashCommand(command)
        }
        return
      }
    }

    if (isSubmitShortcut(event, sendBehavior)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <LumenFrame className="hbar-composer-mention-root hbar-pre-session-slash-editor">
      <LumenTextarea
        ref={inputRef}
        className="hbar-pre-session-slash-editor-input"
        variant="plain"
        rows={3}
        value={value}
        disabled={disabled}
        aria-label={inputLabel}
        aria-multiline="true"
        aria-autocomplete={slashOpen ? 'list' : undefined}
        aria-expanded={slashOpen}
        aria-controls={slashOpen ? menuId : undefined}
        aria-activedescendant={slashOpen ? `${menuId}-option-${activeIndex}` : undefined}
        placeholder={placeholder}
        onChange={(event) => {
          const nextValue = event.currentTarget.value
          const nextTrigger = getSlashTrigger(nextValue, event.currentTarget.selectionStart, availableCommands)
          setActiveSlash(nextTrigger)
          onChange(nextValue)
        }}
        onSelect={(event) => {
          const input = event.currentTarget
          setActiveSlash(getSlashTrigger(input.value, input.selectionStart, availableCommands))
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
      />
      {slashOpen && (
        <HbarComposerSlashMenu
          id={menuId}
          anchorRef={inputRef}
          term={slashTrigger!.term}
          selected={activeIndex}
          labels={slashLabels}
          onSelect={chooseSlashCommand}
          onHover={setSelectedIndex}
          onClose={() => {
            const dismissed = slashTriggerRef.current
            setActiveSlash(null)
            dismissedSlashRef.current = dismissed
          }}
        />
      )}
    </LumenFrame>
  )
}

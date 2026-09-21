import { LumenButton, LumenInput, LumenTextarea } from '@lumen/app-ui'
import { ArrowUp, FileText, LoaderCircle, Paperclip, Square, X } from 'lucide-react'
import { createContext, useContext, useRef, type ReactNode } from 'react'
import { HbarAppUiIcon } from '../../icon'
import './Composer.css'

export interface HbarAppUiComposerAttachment {
  readonly id: string
  readonly kind: 'image' | 'file'
  readonly name: string
  readonly previewUrl?: string | undefined
}
export interface HbarAppUiPromptLabels {
  readonly input: string
  readonly placeholder: string
  readonly send: string
  readonly submitTitle: string
  readonly stop: string
  readonly uploading: string
  readonly addAttachment: string
  readonly removeAttachment: (attachment: HbarAppUiComposerAttachment) => string
}
export interface HbarAppUiPromptProps {
  readonly value: string
  readonly labels: HbarAppUiPromptLabels
  /** Bound by the host's attachment policy; never truncate records in the view. */
  readonly attachments: readonly HbarAppUiComposerAttachment[]
  readonly disabled?: boolean | undefined
  readonly submitting: boolean
  readonly uploading: boolean
  readonly canSubmit: boolean
  readonly canStop: boolean
  readonly canAddAttachments?: boolean | undefined
  readonly stopping?: boolean | undefined
  readonly error?: string | undefined
  readonly context?: ReactNode
  readonly controls?: ReactNode
  readonly modelPicker?: ReactNode
  readonly onChange: (value: string) => void
  readonly onAddAttachments?: ((files: readonly File[]) => void) | undefined
  readonly onRemoveAttachment: (id: string, kind: 'image' | 'file') => void
  readonly onSubmit: () => void
  readonly onStop: () => void
}

const PromptContext = createContext<HbarAppUiPromptProps | undefined>(undefined)
export function HbarAppUiPromptProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiPromptProps
  readonly children: ReactNode
}) {
  return <PromptContext.Provider value={content}>{children}</PromptContext.Provider>
}
export function useHbarAppUiPromptContent() {
  return useContext(PromptContext)
}

/** Prompt Input 01, controlled by either the production or preview ViewModel. */
export function HbarAppUiPromptComposer(props: HbarAppUiPromptProps) {
  const composing = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const attachments = [...new Map(props.attachments.map((item) => [`${item.kind}:${item.id}`, item])).values()]
  const blocked = props.disabled || props.submitting || props.uploading || !props.canSubmit
  return (
    <form
      className="hbar-app-ui-prompt-composer composer"
      aria-busy={props.submitting || props.uploading}
      onSubmit={(event) => {
        event.preventDefault()
        if (!blocked) props.onSubmit()
      }}
    >
      {props.context}
      {attachments.length > 0 && (
        <div className="attachment-strip">
          {attachments.map((attachment) => (
            <div
              className={`attachment-chip${attachment.kind === 'file' ? ' attachment-chip-file' : ''}`}
              key={`${attachment.kind}:${attachment.id}`}
            >
              {attachment.kind === 'image' && attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt={attachment.name} />
              ) : (
                <HbarAppUiIcon icon={FileText} />
              )}
              <span title={attachment.name}>{attachment.name}</span>
              <LumenButton
                type="button"
                title={props.labels.removeAttachment(attachment)}
                aria-label={props.labels.removeAttachment(attachment)}
                onClick={() => props.onRemoveAttachment(attachment.id, attachment.kind)}
                disabled={props.submitting}
              >
                <HbarAppUiIcon icon={X} tier="xs" />
              </LumenButton>
            </div>
          ))}
        </div>
      )}
      <LumenTextarea
        aria-label={props.labels.input}
        placeholder={props.labels.placeholder}
        disabled={props.disabled}
        rows={3}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) {
            event.preventDefault()
            if (!blocked) props.onSubmit()
          }
        }}
      />
      {props.error && (
        <p className="hbar-app-ui-composer-error" role="alert">
          {props.error}
        </p>
      )}
      <div className="composer-toolbar">
        <div className="composer-left">
          {props.onAddAttachments && (
            <>
              <LumenInput
                ref={fileInput}
                className="attachment-input"
                type="file"
                multiple
                disabled={!props.canAddAttachments}
                onChange={(event) => {
                  const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : []
                  event.currentTarget.value = ''
                  if (files.length > 0) props.onAddAttachments?.(files)
                }}
              />
              <LumenButton
                type="button"
                className="attachment-button"
                title={props.labels.addAttachment}
                aria-label={props.labels.addAttachment}
                disabled={!props.canAddAttachments}
                onClick={() => fileInput.current?.click()}
              >
                <HbarAppUiIcon icon={Paperclip} tier="sm" />
              </LumenButton>
            </>
          )}
          {props.controls}
          {props.uploading && (
            <span role="status" aria-label={props.labels.uploading}>
              <HbarAppUiIcon icon={LoaderCircle} />
            </span>
          )}
        </div>
        <div className="composer-right">
          {props.modelPicker}
          {props.canStop && (
            <LumenButton
              type="button"
              className="stop-button"
              title={props.labels.stop}
              aria-label={props.labels.stop}
              disabled={props.stopping}
              onClick={props.onStop}
            >
              <HbarAppUiIcon icon={Square} tier="sm" fill="currentColor" />
            </LumenButton>
          )}
          <LumenButton
            className="send-button"
            type="submit"
            title={props.labels.submitTitle}
            aria-label={props.labels.send}
            disabled={blocked}
          >
            <HbarAppUiIcon icon={props.submitting ? LoaderCircle : ArrowUp} />
          </LumenButton>
        </div>
      </div>
    </form>
  )
}

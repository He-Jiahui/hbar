import { ArrowUp, File, LoaderCircle, Plus, Square, X } from 'lucide-react'
import {
  LumenButton,
  LumenFilePicker,
  LumenIcon,
  LumenSurface,
  LumenTextarea,
  LumenText,
  type LumenPromptComposerProps,
  type LumenSurfaceProps,
} from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import './prompt-composer.css'

/**
 * hbar owns this View because the shared composer has no public action slot.
 * The public input contract and host-owned gates/editor remain unchanged.
 * Legacy attachment chips are content-grown; the Host bounds the draft at 12
 * attachments/transfers. This View deduplicates but never silently truncates.
 * The lumen-* hooks intentionally preserve existing host styles/find/tests.
 */
export function HbarPromptComposer(props: LumenPromptComposerProps) {
  const runningActions = props.canStop ? props.runningActions : undefined
  const seen = new Set<string>()
  const attachments = props.attachments.filter((attachment) => {
    const key = `${attachment.kind}:${attachment.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const blocked = Boolean(
    props.disabled || props.submitting || props.uploading || !props.canSubmit || runningActions?.submit === 'hidden',
  )
  const submit = () => {
    if (!blocked) props.onSubmit()
  }
  let surfaceState: NonNullable<LumenSurfaceProps['state']> = 'idle'
  if (props.error) surfaceState = 'failed'
  else if (props.submitting || props.uploading) surfaceState = 'running'
  else if (props.disabled) surfaceState = 'disabled'
  else if (props.value.trim()) surfaceState = 'selected'

  return (
    <LumenSurface
      as="form"
      boundary={props.boundary ?? 'horizontal'}
      className="hbar-prompt-composer-surface lumen-prompt-composer-surface"
      contentClassName="hbar-prompt-composer lumen-prompt-composer"
      interactive
      material="frost"
      state={surfaceState}
      tone={props.error ? 'danger' : 'neutral'}
      aria-busy={props.submitting || props.uploading || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {props.context}
      {props.attachmentContent}
      {props.attachmentContent === undefined && attachments.length > 0 ? (
        <div className="hbar-prompt-attachments lumen-attachment-strip">
          {attachments.map((attachment) => (
            <div
              className="hbar-prompt-attachment lumen-attachment-chip"
              data-kind={attachment.kind}
              key={`${attachment.kind}:${attachment.id}`}
            >
              {attachment.kind === 'image' && attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt={attachment.name} />
              ) : (
                <LumenIcon icon={File} tier="md" />
              )}
              <span title={attachment.name}>{attachment.name}</span>
              <HbarActionIconButton
                label={props.labels.removeAttachment(attachment)}
                size="s"
                disabled={props.submitting}
                onClick={() => props.onRemoveAttachment(attachment.id, attachment.kind)}
              >
                <LumenIcon icon={X} tier="md" />
              </HbarActionIconButton>
            </div>
          ))}
        </div>
      ) : null}
      {props.editor ? (
        props.editor({
          value: props.value,
          inputLabel: props.labels.input,
          placeholder: props.labels.placeholder,
          disabled: Boolean(props.disabled),
          onChange: props.onChange,
          onSubmit: submit,
        })
      ) : (
        <LumenTextarea
          variant="plain"
          aria-label={props.labels.input}
          placeholder={props.labels.placeholder}
          disabled={props.disabled}
          rows={3}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
      )}
      {props.error ? (
        <LumenText as="p" tone="danger" role="alert">
          {props.error}
        </LumenText>
      ) : null}
      <div className="hbar-prompt-toolbar lumen-composer-toolbar">
        <div>
          {props.onAddAttachments ? (
            <LumenFilePicker
              label={props.labels.addAttachment}
              disabled={!props.canAddAttachments}
              multiple
              onFiles={props.onAddAttachments}
            >
              <LumenIcon icon={Plus} tier="md" />
            </LumenFilePicker>
          ) : null}
          {props.controls}
          {props.uploading ? (
            <span className="hbar-prompt-uploading" role="status" aria-label={props.labels.uploading}>
              <LumenIcon icon={LoaderCircle} tier="md" className="hbar-action-icon-busy" />
            </span>
          ) : null}
        </div>
        <div className={runningActions ? 'hbar-prompt-running-actions lumen-composer-running-actions' : undefined}>
          {props.modelPicker}
          {runningActions?.submit === 'queue' ? (
            <LumenButton
              type="submit"
              className="hbar-prompt-queue-action lumen-composer-queue-action"
              title={runningActions.queueTitle}
              tone="primary"
              variant="text"
              indicator="none"
              loading={props.submitting}
              disabled={blocked}
            >
              {props.submitting ? <LumenIcon icon={LoaderCircle} tier="md" className="hbar-action-icon-busy" /> : null}
              {runningActions.queueLabel}
            </LumenButton>
          ) : null}
          {props.canStop ? (
            <LumenButton
              className="hbar-prompt-primary-action"
              aria-label={props.labels.stop}
              title={props.labels.stop}
              tone={runningActions ? 'danger' : 'neutral'}
              variant="solid"
              indicator="none"
              disabled={props.stopping || Boolean(runningActions && props.disabled)}
              onClick={props.onStop}
            >
              <LumenIcon icon={Square} tier="md" fill="currentColor" strokeWidth={0} />
            </LumenButton>
          ) : null}
          {!runningActions ? (
            <LumenButton
              type="submit"
              className="hbar-prompt-primary-action"
              aria-label={props.labels.send}
              title={props.labels.submitTitle}
              tone="primary"
              variant="solid"
              indicator="none"
              loading={props.submitting}
              disabled={blocked}
            >
              <LumenIcon
                icon={props.submitting ? LoaderCircle : ArrowUp}
                tier="md"
                className={props.submitting ? 'hbar-action-icon-busy' : undefined}
              />
            </LumenButton>
          ) : null}
        </div>
      </div>
    </LumenSurface>
  )
}

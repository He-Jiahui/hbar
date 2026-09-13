import { ArrowUp, FileText, LoaderCircle, Square, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react'
import type { ArtifactRef, Run, Session, Workspace } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import { FloatingSurface } from '../../FloatingLayer'
import { ActionButton } from '../semantic'
import GlassSurface from '../GlassSurface'
import SpotlightCard from '../SpotlightCard'
import { referenceAttributes } from '../production'
// The legacy stylesheet is now consumed by the extracted surface itself so
// the adapter no longer owns presentation. The selectors remain stable for
// existing themes while the ReactBits surface adds its own namespace.
import '../../PromptComposer.css'
import './PromptInputSurface.css'

export type PromptInputAttachmentKind = 'image' | 'file'
export type PromptInputFilePicker = (options?: { accept?: string; multiple?: boolean }) => void

export interface PromptInputLabels {
  readonly messageComposer: string
  readonly pendingAttachments: string
  readonly removeImage: string
  readonly removeFile: string
  readonly dropToUpload: string
  readonly archivedSession: string
  readonly sendMessage: string
  readonly message: string
  readonly slashCommands: string
  readonly uploading: string
  readonly stopRunning: string
  readonly queueMessage: string
  readonly send: string
}

export interface PromptInputSurfaceProps {
  readonly sessionInfo?: Session | undefined
  readonly workspace?: Workspace | undefined
  readonly draft: string
  readonly images: readonly ArtifactRef[]
  readonly files: readonly ArtifactRef[]
  artifactUrl(id: string): string
  readonly composerActions: readonly ComposerAction[]
  readonly labels: PromptInputLabels
  actionMenu(onSelect: (action: ComposerAction) => void): ReactNode
  readonly permissionControl: ReactNode
  readonly modelControl: ReactNode
  readonly gitContext?: ReactNode | undefined
  readonly modeTags?: ReactNode | undefined
  readonly activeRun?: Run | undefined
  readonly busy: boolean
  readonly uploading: boolean
  readonly imageAccept: string
  filterActions(actions: readonly ComposerAction[], query: string): ComposerAction[]
  onDraftChange(value: string): void
  onSend(): void | Promise<void>
  onAttach(files: FileList | null, kind: PromptInputAttachmentKind): void | Promise<void>
  onSelectAction(action: ComposerAction, openFilePicker: PromptInputFilePicker): void
  onRemoveImage(id: string): void
  onRemoveFile(id: string): void
  onStopRun(): void | Promise<void>
  readonly className?: string | undefined
}

function isImageAccept(accept: string): boolean {
  return accept
    .split(',')
    .map((part) => part.trim().toLocaleLowerCase())
    .some((part) => part.startsWith('image/'))
}

function AttachmentStrip({
  images,
  files,
  artifactUrl,
  labels,
  onRemoveImage,
  onRemoveFile,
}: Pick<PromptInputSurfaceProps, 'images' | 'files' | 'artifactUrl' | 'labels' | 'onRemoveImage' | 'onRemoveFile'>) {
  return (
    <div className="attachment-strip rb-prompt-attachment-strip" aria-label={labels.pendingAttachments}>
      {images.map((image) => (
        <SpotlightCard
          className="attachment-chip"
          key={image.id}
          spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
        >
          <img src={artifactUrl(image.id)} alt={image.name} />
          <span title={image.name}>{image.name}</span>
          <button
            type="button"
            title={`${labels.removeImage} ${image.name}`}
            aria-label={`${labels.removeImage} ${image.name}`}
            onClick={() => onRemoveImage(image.id)}
          >
            <X size={12} />
          </button>
        </SpotlightCard>
      ))}
      {files.map((file) => (
        <SpotlightCard
          className="attachment-chip attachment-chip-file"
          key={`file:${file.id}`}
          spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
        >
          <FileText size={18} className="attachment-chip-icon" aria-hidden="true" />
          <span title={file.name}>{file.name}</span>
          <button
            type="button"
            title={`${labels.removeFile} ${file.name}`}
            aria-label={`${labels.removeFile} ${file.name}`}
            onClick={() => onRemoveFile(file.id)}
          >
            <X size={12} />
          </button>
        </SpotlightCard>
      ))}
    </div>
  )
}

/**
 * ReactBits Prompt Input 1/3/5/6/7 composition, with the AI Chat 3 compact
 * breakpoint behavior. The implementation translates the reference's
 * autosize editor, attachment rail, slash-command palette and action toolbar
 * into a real hbar surface; all business actions and controls arrive through
 * typed props/slots.
 *
 * Reference contracts:
 * - https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1
 * - https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-3
 * - https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-5
 * - https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-6
 * - https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-7
 * - https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-3
 */
export default function PromptInputSurface({
  sessionInfo,
  workspace,
  draft,
  images,
  files,
  artifactUrl,
  composerActions,
  labels,
  actionMenu,
  permissionControl,
  modelControl,
  gitContext,
  modeTags,
  activeRun,
  busy,
  uploading,
  imageAccept,
  filterActions,
  onDraftChange,
  onSend,
  onAttach,
  onSelectAction,
  onRemoveImage,
  onRemoveFile,
  onStopRun,
  className = '',
}: PromptInputSurfaceProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pendingAttachmentKind = useRef<PromptInputAttachmentKind>('image')
  const composing = useRef(false)
  const [pickerAccept, setPickerAccept] = useState(imageAccept)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.max(Math.min(textarea.current.scrollHeight, 220), 78)}px`
  }, [draft])

  const openFilePicker: PromptInputFilePicker = (options) => {
    const accept = options?.accept ?? (pendingAttachmentKind.current === 'file' ? '*/*' : imageAccept)
    if (options?.accept) pendingAttachmentKind.current = isImageAccept(accept) ? 'image' : 'file'
    setPickerAccept(accept)
    if (!fileInput.current) return
    fileInput.current.accept = accept
    fileInput.current.multiple = options?.multiple ?? true
    fileInput.current.click()
  }

  const selectAction = (action: ComposerAction) => {
    if (action.id === 'add-image') pendingAttachmentKind.current = 'image'
    else if (action.id === 'add-file') pendingAttachmentKind.current = 'file'
    onSelectAction(action, openFilePicker)
  }
  const slashQuery = draft.startsWith('/') ? (draft.slice(1).split(/\s/)[0] ?? '') : ''
  const slashActions = draft.startsWith('/') && !draft.includes(' ') ? filterActions(composerActions, slashQuery) : []
  const slashOpen = slashActions.length > 0

  useEffect(() => {
    setSlashIndex(0)
    setSlashMenuOpen(draft.startsWith('/') && !draft.includes(' '))
  }, [draft, slashQuery])

  const selectSlashAction = (action: ComposerAction) => {
    setSlashMenuOpen(false)
    onDraftChange('')
    selectAction(action)
  }
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSend()
  }
  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    void Promise.resolve(onAttach(input.files, pendingAttachmentKind.current)).finally(() => {
      input.value = ''
    })
  }
  const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (sessionInfo?.archived || uploading) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }
  const handleDragLeave = (event: DragEvent<HTMLFormElement>) => {
    if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
  }
  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDragActive(false)
    if (sessionInfo?.archived || uploading) return
    const dropped = event.dataTransfer.files
    if (dropped.length === 0) return
    const kind: PromptInputAttachmentKind = [...dropped].every((file) => file.type.startsWith('image/')) ? 'image' : 'file'
    void Promise.resolve(onAttach(dropped, kind))
  }

  return (
    <form
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1', 'session-chat')}
      className={`composer rb-composer-surface rb-prompt-composer rb-prompt-input-surface${dragActive ? ' is-drag-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={labels.messageComposer}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <GlassSurface className="composer-glass" width="100%" height="100%" aria-hidden="true" />
      {dragActive && <div className="composer-dropzone" role="status">{labels.dropToUpload}</div>}
      {(images.length > 0 || files.length > 0) && (
        <AttachmentStrip
          images={images}
          files={files}
          artifactUrl={artifactUrl}
          labels={labels}
          onRemoveImage={onRemoveImage}
          onRemoveFile={onRemoveFile}
        />
      )}
      <textarea
        ref={textarea}
        aria-label={labels.message}
        placeholder={sessionInfo?.archived ? labels.archivedSession : labels.sendMessage}
        disabled={sessionInfo?.archived}
        rows={3}
        value={draft}
        onFocus={() => {
          if (draft.startsWith('/') && !draft.includes(' ')) setSlashMenuOpen(true)
        }}
        onChange={(event) => {
          const next = event.target.value
          setSlashMenuOpen(next.startsWith('/') && !next.includes(' '))
          onDraftChange(next)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDown={(event) => {
          if (slashOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setSlashIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + slashActions.length) % slashActions.length)
            return
          }
          if (slashOpen && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) {
            const action = slashActions[Math.min(slashIndex, Math.max(0, slashActions.length - 1))]
            if (action) {
              event.preventDefault()
              selectSlashAction(action)
              return
            }
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) {
            event.preventDefault()
            void onSend()
          }
        }}
      />
      <FloatingSurface
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/command-menu', 'session-chat')}
        anchorRef={textarea}
        open={slashMenuOpen && slashOpen}
        onClose={() => setSlashMenuOpen(false)}
        placement="above"
        className="composer-slash-menu rb-menu-surface"
        role="listbox"
        aria-label={labels.slashCommands}
      >
        <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
        {slashActions.map((action, index) => {
          const selected = index === Math.min(slashIndex, Math.max(0, slashActions.length - 1))
          return (
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={selected ? 'selected' : ''}
              key={action.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSlashAction(action)}
            >
              <span className="composer-slash-icon" aria-hidden="true">⌁</span>
              <span className="composer-slash-copy">
                <strong>{action.label}</strong>
                {action.description && <small>{action.description}</small>}
              </span>
              <code>/{action.keywords?.[0] ?? action.id}</code>
            </button>
          )
        })}
      </FloatingSurface>
      <div className="composer-toolbar">
        <div className="composer-left">
          {actionMenu(selectAction)}
          <input
            className="visually-hidden"
            ref={fileInput}
            type="file"
            accept={pickerAccept}
            multiple
            onChange={handleAttachmentChange}
          />
          {uploading && <LoaderCircle size={15} className="spinning composer-uploading" aria-label={labels.uploading} />}
          {permissionControl}
          {gitContext}
        </div>
        <div className="composer-right">
          {modelControl}
          {activeRun && (
            <button
              type="button"
              className="stop-button"
              title={labels.stopRunning}
              aria-label={labels.stopRunning}
              onClick={() => void onStopRun()}
            >
              <Square size={14} fill="currentColor" />
            </button>
          )}
          <ActionButton
            variant="primary"
            className="send-button"
            type="submit"
            title={activeRun ? labels.queueMessage : labels.send}
            aria-label={labels.send}
            disabled={busy || uploading || sessionInfo?.archived || (!draft.trim() && !images.length && !files.length) || !workspace}
          >
            {busy ? <LoaderCircle size={17} className="spinning" /> : <ArrowUp size={18} />}
          </ActionButton>
        </div>
      </div>
      {modeTags && <div className="composer-status-row">{modeTags}</div>}
    </form>
  )
}

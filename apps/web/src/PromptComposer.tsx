import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowUp, FileText, LoaderCircle, Square, X } from 'lucide-react'
import type { ArtifactRef, Run, Session, Workspace } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import ComposerMenu, { filterComposerActions } from './ComposerMenu'
import ModelPicker from './ModelPicker'
import PermissionSelector from './PermissionSelector'
import { IMAGE_ACCEPT } from './composer-actions'
import GlassSurface from './react-bits/GlassSurface'
import { ActionButton, referenceAttributes } from './react-bits'
import SpotlightCard from './react-bits/SpotlightCard'
import { FloatingSurface } from './FloatingLayer'
import { useLocale } from './locale'
import './PromptComposer.css'

export type AttachmentKind = 'image' | 'file'
export type OpenFilePicker = (options?: { accept?: string; multiple?: boolean }) => void

export interface PromptComposerProps {
  sessionInfo: Session | undefined
  workspace: Workspace | undefined
  draft: string
  images: readonly ArtifactRef[]
  files: readonly ArtifactRef[]
  artifactUrl(id: string): string
  composerActions: readonly ComposerAction[]
  modeTags?: ReactNode
  gitContext?: ReactNode
  activeRun: Run | undefined
  busy: boolean
  uploading: boolean
  onDraftChange(value: string): void
  onSend(): void | Promise<void>
  onAttach(files: FileList | null, kind: AttachmentKind): void | Promise<void>
  onSelectAction(action: ComposerAction, openFilePicker: OpenFilePicker): void
  onRemoveImage(id: string): void
  onRemoveFile(id: string): void
  onStopRun(): void | Promise<void>
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
  onRemoveImage,
  onRemoveFile,
}: Pick<PromptComposerProps, 'images' | 'files' | 'artifactUrl' | 'onRemoveImage' | 'onRemoveFile'>) {
  const { t } = useLocale()
  return (
    <div className="attachment-strip" aria-label={t('pendingAttachments')}>
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
            title={`${t('removeImage')} ${image.name}`}
            aria-label={`${t('removeImage')} ${image.name}`}
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
            title={`${t('removeFile')} ${file.name}`}
            aria-label={`${t('removeFile')} ${file.name}`}
            onClick={() => onRemoveFile(file.id)}
          >
            <X size={12} />
          </button>
        </SpotlightCard>
      ))}
    </div>
  )
}

export default function PromptComposer({
  sessionInfo,
  workspace,
  draft,
  images,
  files,
  artifactUrl,
  composerActions,
  modeTags,
  gitContext,
  activeRun,
  busy,
  uploading,
  onDraftChange,
  onSend,
  onAttach,
  onSelectAction,
  onRemoveImage,
  onRemoveFile,
  onStopRun,
}: PromptComposerProps) {
  const { t } = useLocale()
  const fileInput = useRef<HTMLInputElement>(null)
  const slashAnchor = useRef<HTMLTextAreaElement>(null)
  const pendingAttachmentKind = useRef<AttachmentKind>('image')
  const composing = useRef(false)
  const [pickerAccept, setPickerAccept] = useState(IMAGE_ACCEPT)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    const textarea = slashAnchor.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const computed = Math.min(textarea.scrollHeight, 220)
    textarea.style.height = `${Math.max(computed, 78)}px`
  }, [draft])

  function openFilePicker(options?: { accept?: string; multiple?: boolean }) {
    const accept = options?.accept ?? (pendingAttachmentKind.current === 'file' ? '*/*' : IMAGE_ACCEPT)
    if (options?.accept) pendingAttachmentKind.current = isImageAccept(accept) ? 'image' : 'file'
    setPickerAccept(accept)
    const input = fileInput.current
    if (!input) return
    input.accept = accept
    input.multiple = options?.multiple ?? true
    input.click()
  }

  function selectAction(action: ComposerAction) {
    if (action.id === 'add-image') pendingAttachmentKind.current = 'image'
    else if (action.id === 'add-file') pendingAttachmentKind.current = 'file'
    onSelectAction(action, openFilePicker)
  }

  const slashQuery = draft.startsWith('/') ? (draft.slice(1).split(/\s/)[0] ?? '') : ''
  const slashActions =
    draft.startsWith('/') && !draft.includes(' ') ? filterComposerActions(composerActions, slashQuery) : []
  const slashOpen = slashActions.length > 0

  useEffect(() => {
    setSlashIndex(0)
    setSlashMenuOpen(draft.startsWith('/') && !draft.includes(' '))
  }, [draft, slashQuery])

  function selectSlashAction(action: ComposerAction) {
    setSlashMenuOpen(false)
    onDraftChange('')
    selectAction(action)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onSend()
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    void Promise.resolve(onAttach(input.files, pendingAttachmentKind.current)).finally(() => {
      input.value = ''
    })
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    if (sessionInfo?.archived || uploading) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragActive(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
    setDragActive(false)
    if (sessionInfo?.archived || uploading) return
    const dropped = event.dataTransfer.files
    if (dropped.length === 0) return
    const kind: AttachmentKind = [...dropped].every((file) => file.type.startsWith('image/')) ? 'image' : 'file'
    void Promise.resolve(onAttach(dropped, kind))
  }

  return (
    <form
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1', 'session-chat')}
      className={`composer rb-composer-surface rb-prompt-composer${dragActive ? ' is-drag-active' : ''}`}
      aria-label={t('messageComposer')}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <GlassSurface className="composer-glass" width="100%" height="100%" aria-hidden="true" />
      {dragActive && <div className="composer-dropzone" role="status">{t('dropToUpload')}</div>}
      {(images.length > 0 || files.length > 0) && (
        <AttachmentStrip
          images={images}
          files={files}
          artifactUrl={artifactUrl}
          onRemoveImage={onRemoveImage}
          onRemoveFile={onRemoveFile}
        />
      )}
      <textarea
        ref={slashAnchor}
        aria-label={t('message')}
        placeholder={sessionInfo?.archived ? t('archivedSession') : t('sendMessage')}
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
            setSlashIndex((current) => {
              const delta = event.key === 'ArrowDown' ? 1 : -1
              return (current + delta + slashActions.length) % slashActions.length
            })
            return
          }
          if (
            slashOpen &&
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            !composing.current
          ) {
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
        anchorRef={slashAnchor}
        open={slashMenuOpen && slashOpen}
        onClose={() => setSlashMenuOpen(false)}
        placement="above"
        className="composer-slash-menu rb-menu-surface"
        role="listbox"
        aria-label={t('slashCommands')}
      >
        <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
        {slashActions.map((action, index) => (
          <button
            type="button"
            role="option"
            aria-selected={index === Math.min(slashIndex, Math.max(0, slashActions.length - 1))}
            className={index === Math.min(slashIndex, Math.max(0, slashActions.length - 1)) ? 'selected' : ''}
            key={action.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectSlashAction(action)}
          >
            <span className="composer-slash-icon" aria-hidden="true">
              ⌁
            </span>
            <span className="composer-slash-copy">
              <strong>{action.label}</strong>
              {action.description && <small>{action.description}</small>}
            </span>
            <code>/{action.keywords?.[0] ?? action.id}</code>
          </button>
        ))}
      </FloatingSurface>
      <div className="composer-toolbar">
        <div className="composer-left">
          <ComposerMenu actions={composerActions} onSelect={selectAction} />
          <input
            className="visually-hidden"
            ref={fileInput}
            type="file"
            accept={pickerAccept}
            multiple
            onChange={handleAttachmentChange}
          />
          {uploading && <LoaderCircle size={15} className="spinning composer-uploading" aria-label={t('uploading')} />}
          <PermissionSelector />
          {gitContext}
        </div>
        <div className="composer-right">
          <ModelPicker />
          {activeRun && (
            <button
              type="button"
              className="stop-button"
              title={t('stopRunning')}
              aria-label={t('stopRunning')}
              onClick={() => void onStopRun()}
            >
              <Square size={14} fill="currentColor" />
            </button>
          )}
          <ActionButton
            variant="primary"
            className="send-button"
            type="submit"
            title={activeRun ? t('queueMessage') : t('send')}
            aria-label={t('send')}
            disabled={
              busy ||
              uploading ||
              sessionInfo?.archived ||
              (!draft.trim() && !images.length && !files.length) ||
              !workspace
            }
          >
            {busy ? <LoaderCircle size={17} className="spinning" /> : <ArrowUp size={18} />}
          </ActionButton>
        </div>
      </div>
      {modeTags && <div className="composer-status-row">{modeTags}</div>}
    </form>
  )
}

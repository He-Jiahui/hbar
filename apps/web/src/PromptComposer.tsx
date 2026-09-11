import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowUp, FileText, FolderOpen, GitBranch, LoaderCircle, Square, X } from 'lucide-react'
import type { ArtifactRef, GitInfo, Run, Session, Workspace } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import ComposerMenu, { filterComposerActions } from './ComposerMenu'
import ModelPicker from './ModelPicker'
import PermissionSelector from './PermissionSelector'
import { IMAGE_ACCEPT } from './composer-actions'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'
import './PromptComposer.css'

export type AttachmentKind = 'image' | 'file'
export type OpenFilePicker = (options?: { accept?: string; multiple?: boolean }) => void

export interface PromptComposerProps {
  sessionId: string
  sessionInfo: Session | undefined
  workspace: Workspace | undefined
  gitInfo: GitInfo | null
  draft: string
  images: readonly ArtifactRef[]
  files: readonly ArtifactRef[]
  artifactUrl(id: string): string
  composerActions: readonly ComposerAction[]
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
  onSettings(): void
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
  return (
    <div className="attachment-strip" aria-label="待发送附件">
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
            title={`移除图片 ${image.name}`}
            aria-label={`移除图片 ${image.name}`}
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
            title={`移除文件 ${file.name}`}
            aria-label={`移除文件 ${file.name}`}
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
  sessionId,
  sessionInfo,
  workspace,
  gitInfo,
  draft,
  images,
  files,
  artifactUrl,
  composerActions,
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
  onSettings,
}: PromptComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingAttachmentKind = useRef<AttachmentKind>('image')
  const composing = useRef(false)
  const [pickerAccept, setPickerAccept] = useState(IMAGE_ACCEPT)
  const [slashIndex, setSlashIndex] = useState(0)

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
  }, [slashQuery])

  function selectSlashAction(action: ComposerAction) {
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

  return (
    <form className="composer rb-composer-surface rb-prompt-composer" aria-label="消息输入器" onSubmit={handleSubmit}>
      <GlassSurface className="composer-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="composer-context-strip" aria-label="会话上下文">
        <span className="composer-context-location" title={workspace?.path ?? '未选择工作区'}>
          <FolderOpen size={14} />
          <span>{workspace?.name ?? 'Workspace'}</span>
        </span>
        <span className="composer-context-separator" aria-hidden="true" />
        <span className="composer-context-mode">Local</span>
        {gitInfo?.branch && (
          <span className="composer-context-branch" title="当前 Git 分支">
            <GitBranch size={13} />
            <span>{gitInfo.branch}</span>
          </span>
        )}
        {sessionId && <span className="composer-context-session">#{sessionId.slice(0, 8)}</span>}
      </div>
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
        aria-label="消息"
        placeholder={sessionInfo?.archived ? '会话已归档' : '发送消息…'}
        disabled={sessionInfo?.archived}
        rows={3}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
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
            const action = slashActions[slashIndex]
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
      {slashOpen && (
        <div className="composer-slash-menu rb-menu-surface" role="listbox" aria-label="斜杠命令">
          <GlassSurface className="rb-menu-glass" width="100%" height="100%" aria-hidden="true" />
          {slashActions.map((action, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === slashIndex}
              className={index === slashIndex ? 'selected' : ''}
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
        </div>
      )}
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
          {uploading && <LoaderCircle size={15} className="spinning composer-uploading" aria-label="上传中" />}
          <PermissionSelector />
        </div>
        <div className="composer-right">
          <ModelPicker onSettings={onSettings} />
          {activeRun && (
            <button
              type="button"
              className="stop-button"
              title="停止运行"
              aria-label="停止运行"
              onClick={() => void onStopRun()}
            >
              <Square size={14} fill="currentColor" />
            </button>
          )}
          <GlareButton
            className="send-button"
            type="submit"
            title={activeRun ? '加入队列' : '发送'}
            aria-label="发送"
            disabled={
              busy ||
              uploading ||
              sessionInfo?.archived ||
              (!draft.trim() && !images.length && !files.length) ||
              !workspace
            }
          >
            {busy ? <LoaderCircle size={17} className="spinning" /> : <ArrowUp size={18} />}
          </GlareButton>
        </div>
      </div>
    </form>
  )
}

import type { ArtifactRef, Run, Session, Workspace } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import ComposerMenu, { filterComposerActions } from './ComposerMenu'
import ModelPicker from './ModelPicker'
import PermissionSelector from './PermissionSelector'
import { IMAGE_ACCEPT } from './composer-actions'
import PromptInputSurface, {
  type PromptInputAttachmentKind,
  type PromptInputFilePicker,
  type PromptInputLabels,
} from './react-bits/components/PromptInputSurface'
import { useLocale } from './locale'

export type AttachmentKind = PromptInputAttachmentKind
export type OpenFilePicker = PromptInputFilePicker

export interface PromptComposerProps {
  sessionInfo: Session | undefined
  workspace: Workspace | undefined
  draft: string
  images: readonly ArtifactRef[]
  files: readonly ArtifactRef[]
  artifactUrl(id: string): string
  composerActions: readonly ComposerAction[]
  modeTags?: React.ReactNode
  gitContext?: React.ReactNode
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

// ViewModel adapter for the ReactBits Prompt Input family. The extracted
// surface owns all editor/menu/dropzone behavior; this adapter only supplies
// live hbar state and existing capability slots.
// References: prompt-input-1/3/5/6/7 and ai-chat-3.
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
  const labels: PromptInputLabels = {
    messageComposer: t('messageComposer'),
    pendingAttachments: t('pendingAttachments'),
    removeImage: t('removeImage'),
    removeFile: t('removeFile'),
    dropToUpload: t('dropToUpload'),
    archivedSession: t('archivedSession'),
    sendMessage: t('sendMessage'),
    message: t('message'),
    slashCommands: t('slashCommands'),
    uploading: t('uploading'),
    stopRunning: t('stopRunning'),
    queueMessage: t('queueMessage'),
    send: t('send'),
  }
  return (
    <PromptInputSurface
      sessionInfo={sessionInfo}
      workspace={workspace}
      draft={draft}
      images={images}
      files={files}
      artifactUrl={artifactUrl}
      composerActions={composerActions}
      labels={labels}
      imageAccept={IMAGE_ACCEPT}
      filterActions={filterComposerActions}
      actionMenu={(onSelect) => <ComposerMenu actions={composerActions} onSelect={onSelect} />}
      permissionControl={<PermissionSelector />}
      modelControl={<ModelPicker />}
      gitContext={gitContext}
      modeTags={modeTags}
      activeRun={activeRun}
      busy={busy}
      uploading={uploading}
      onDraftChange={onDraftChange}
      onSend={onSend}
      onAttach={onAttach}
      onSelectAction={onSelectAction}
      onRemoveImage={onRemoveImage}
      onRemoveFile={onRemoveFile}
      onStopRun={onStopRun}
    />
  )
}

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { ArrowLeft, FileText, Folder, RefreshCw } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenText,
} from '@lumen/app-ui'
import type { ExtensionWorkspaceEntryState } from '@hbar/app-runtime'
import { MessageMarkdown } from './message-markdown'
import { ExtensionPagination, type ExtensionPaginationLabels } from './extension-pagination'
import './extension-skill-detail.css'

type SkillDetailState = NonNullable<ExtensionWorkspaceEntryState['skillDetail']>
type Skill = NonNullable<SkillDetailState['skill']>
type SkillFile = Skill['files'][number]

export interface ExtensionSkillDetailLabels {
  readonly title: string
  readonly back: string
  readonly overview: string
  readonly files: string
  readonly tabs: string
  readonly retry: string
  readonly loading: string
  readonly missing: string
  readonly noOverview: string
  readonly noFiles: string
  readonly noSelectedFile: string
  readonly path: string
  readonly scope: string
  readonly scopeValue: Readonly<Record<Skill['scope'], string>>
  readonly fileCount: (count: number) => string
  readonly fileSize: (size: number) => string
  readonly filesTruncated: string
  readonly missingEntry: string
  readonly entryTruncated: string
  readonly fileLoading: string
  readonly fileMissing: string
  readonly fileRetry: string
  readonly fileTruncated: string
  readonly error: (code: string) => string
  readonly fileError: (code: string) => string
  readonly pagination: ExtensionPaginationLabels
}

function SkillSummary({ skill, labels }: { readonly skill: Skill; readonly labels: ExtensionSkillDetailLabels }) {
  return (
    <LumenFrame as="section" className="hbar-app-react-skill-summary">
      <LumenFrame as="header">
        <LumenContentText context="section.subtitle">{skill.displayName}</LumenContentText>
      </LumenFrame>
      {skill.description && <LumenContentText context="section.description">{skill.description}</LumenContentText>}
      <LumenCollection as="dl">
        <LumenFrame>
          <LumenCollectionItem as="dt">{labels.path}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{skill.path}</LumenCollectionItem>
        </LumenFrame>
        <LumenFrame>
          <LumenCollectionItem as="dt">{labels.scope}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{labels.scopeValue[skill.scope]}</LumenCollectionItem>
        </LumenFrame>
        <LumenFrame>
          <LumenCollectionItem as="dt">{labels.files}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{labels.fileCount(skill.files.length)}</LumenCollectionItem>
        </LumenFrame>
      </LumenCollection>
      {skill.filesTruncated && (
        <LumenContentText context="feedback.message" role="status">
          {labels.filesTruncated}
        </LumenContentText>
      )}
      {!skill.entryPath && (
        <LumenContentText context="feedback.message" role="status">
          {labels.missingEntry}
        </LumenContentText>
      )}
      {skill.entryTruncated && (
        <LumenContentText context="feedback.message" role="status">
          {labels.entryTruncated}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}

function SkillFiles({
  skill,
  detail,
  labels,
  connected,
  onPage,
  onOpenFile,
}: {
  readonly skill: Skill
  readonly detail: SkillDetailState
  readonly labels: ExtensionSkillDetailLabels
  readonly connected: boolean
  readonly onPage: (page: number) => void
  readonly onOpenFile: (path: string) => void
}) {
  const selectedPath = detail.selectedPath
  const previewRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const pageSize = 20
  const pageCount = Math.ceil(skill.files.length / pageSize)
  const page = Math.min(detail.filesPage, Math.max(0, pageCount - 1))
  const files = skill.files.slice(page * pageSize, (page + 1) * pageSize)
  const selectedFile = detail.file.file
  useEffect(() => {
    if (detail.file.status !== 'ready' || !openerRef.current || openerRef.current !== document.activeElement) return
    previewRef.current?.scrollIntoView({ block: 'nearest' })
    openerRef.current = null
  }, [detail.file.status, selectedPath])
  return (
    <LumenFrame className="hbar-app-react-skill-files-layout">
      <LumenFrame as="section" className="hbar-app-react-skill-file-index" aria-label={labels.files}>
        {!skill.files.length ? (
          <LumenContentText context="section.description" className="hbar-app-react-skill-empty">
            {labels.noFiles}
          </LumenContentText>
        ) : (
          <LumenCollection as="ul">
            {files.map((file: SkillFile) => (
              <LumenCollectionItem as="li" key={file.path}>
                <LumenButton
                  type="button"
                  variant="text"
                  aria-label={file.path}
                  data-skill-file-path={file.path}
                  disabled={!connected}
                  aria-current={selectedPath === file.path ? 'page' : undefined}
                  onClick={(event) => {
                    openerRef.current = event.currentTarget
                    onOpenFile(file.path)
                  }}
                >
                  <LumenIcon icon={FileText} tier="sm" />
                  <LumenContentText context="control.label" className="hbar-app-react-skill-file-index-copy">
                    <LumenContentText context="choice.title">{file.path}</LumenContentText>
                    <LumenContentText context="choice.description">{labels.fileSize(file.size)}</LumenContentText>
                  </LumenContentText>
                </LumenButton>
              </LumenCollectionItem>
            ))}
          </LumenCollection>
        )}
        <ExtensionPagination labels={labels.pagination} count={skill.files.length} page={page} onPage={onPage} />
      </LumenFrame>
      <LumenFrame
        ref={previewRef}
        as="section"
        className="hbar-app-react-skill-file-preview"
        aria-label={selectedPath ?? labels.files}
      >
        {detail.file.status === 'loading' && (
          <LumenContentText context="feedback.message" role="status">
            {labels.fileLoading}
          </LumenContentText>
        )}
        {detail.file.status === 'missing' && (
          <LumenFrame className="hbar-app-react-skill-file-error">
            <LumenContentText context="feedback.message" role="status">
              {labels.fileMissing}
            </LumenContentText>
            {selectedPath && (
              <LumenButton type="button" variant="text" disabled={!connected} onClick={() => onOpenFile(selectedPath)}>
                <LumenIcon icon={RefreshCw} tier="sm" />
                {labels.fileRetry}
              </LumenButton>
            )}
          </LumenFrame>
        )}
        {detail.file.status === 'error' && (
          <LumenFrame className="hbar-app-react-skill-file-error">
            <LumenContentText context="feedback.message" role="alert">
              {labels.fileError(detail.file.error ?? 'EXECUTION_FAILED')}
            </LumenContentText>
            {selectedPath && (
              <LumenButton type="button" variant="text" disabled={!connected} onClick={() => onOpenFile(selectedPath)}>
                <LumenIcon icon={RefreshCw} tier="sm" />
                {labels.fileRetry}
              </LumenButton>
            )}
          </LumenFrame>
        )}
        {detail.file.status === 'ready' && selectedFile && (
          <>
            <LumenFrame as="header" className="hbar-app-react-skill-file-heading">
              <LumenIcon icon={FileText} tier="sm" />
              <LumenContentText context="record.title">{selectedFile.path}</LumenContentText>
            </LumenFrame>
            <LumenFrame className="hbar-app-react-skill-file-content" tabIndex={0}>
              {selectedFile.path !== skill.entryPath && /\.md$/i.test(selectedFile.path) ? (
                <MessageMarkdown text={selectedFile.text} />
              ) : (
                <LumenText as="pre" variant="code">
                  <LumenText as="code" variant="code">
                    {selectedFile.text}
                  </LumenText>
                </LumenText>
              )}
              {selectedFile.truncated && (
                <LumenContentText context="feedback.message" role="status">
                  {labels.fileTruncated}
                </LumenContentText>
              )}
            </LumenFrame>
          </>
        )}
        {detail.file.status === 'idle' && !selectedFile && (
          <LumenContentText context="section.description" className="hbar-app-react-skill-empty">
            {skill.files.length ? labels.noSelectedFile : labels.noFiles}
          </LumenContentText>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}

export function ExtensionSkillDetail({
  detail,
  labels,
  connected,
  onBack,
  onRetry,
  onView,
  onFilesPage,
  onOpenFile,
}: {
  readonly detail: Readonly<SkillDetailState>
  readonly labels: ExtensionSkillDetailLabels
  readonly connected: boolean
  readonly onBack: () => void
  readonly onRetry: () => void
  readonly onView: (view: 'overview' | 'files') => void
  readonly onFilesPage: (page: number) => void
  readonly onOpenFile: (path: string) => void
}) {
  const skill = detail.skill
  const tabId = useId()
  const overviewId = `${tabId}-overview`
  const filesId = `${tabId}-files`
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const busy = !connected || detail.status === 'loading'
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = 1
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % (last + 1)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index + last) % (last + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1
    if (next < 0) return
    event.preventDefault()
    tabRefs.current[next]?.focus()
    onView(next === 0 ? 'overview' : 'files')
  }
  return (
    <LumenFrame className="hbar-app-react-skill-detail" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-app-react-skill-detail-navigation">
        <LumenButton type="button" variant="text" onClick={onBack}>
          <LumenIcon icon={ArrowLeft} tier="md" />
          {labels.back}
        </LumenButton>
        {detail.status !== 'ready' && (
          <LumenButton type="button" variant="text" disabled={busy} onClick={onRetry}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {labels.retry}
          </LumenButton>
        )}
      </LumenFrame>
      {detail.status === 'loading' && (
        <LumenContentText context="feedback.message" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {detail.status === 'error' && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(detail.error ?? 'EXECUTION_FAILED')}
        </LumenContentText>
      )}
      {detail.status === 'missing' && (
        <LumenContentText context="feedback.message" role="status">
          {labels.missing}
        </LumenContentText>
      )}
      {skill && (
        <>
          <SkillSummary skill={skill} labels={labels} />
          <LumenFrame as="div" role="tablist" aria-label={labels.tabs} className="hbar-app-react-skill-tabs">
            <LumenButton
              type="button"
              variant="text"
              role="tab"
              id={`${tabId}-overview-tab`}
              ref={(element) => {
                tabRefs.current[0] = element
              }}
              tabIndex={detail.view === 'overview' ? 0 : -1}
              indicatorState={detail.view === 'overview' ? 'selected' : 'idle'}
              aria-selected={detail.view === 'overview'}
              aria-controls={overviewId}
              onKeyDown={(event) => onTabKeyDown(event, 0)}
              onClick={() => onView('overview')}
            >
              <LumenIcon icon={FileText} tier="sm" />
              {labels.overview}
            </LumenButton>
            <LumenButton
              type="button"
              variant="text"
              role="tab"
              id={`${tabId}-files-tab`}
              ref={(element) => {
                tabRefs.current[1] = element
              }}
              tabIndex={detail.view === 'files' ? 0 : -1}
              indicatorState={detail.view === 'files' ? 'selected' : 'idle'}
              aria-selected={detail.view === 'files'}
              aria-controls={filesId}
              aria-label={labels.files}
              onKeyDown={(event) => onTabKeyDown(event, 1)}
              onClick={() => onView('files')}
            >
              <LumenIcon icon={Folder} tier="sm" />
              {labels.files}
              <LumenContentText context="choice.description">{labels.fileCount(skill.files.length)}</LumenContentText>
            </LumenButton>
          </LumenFrame>
          {detail.view === 'overview' ? (
            <LumenFrame
              id={overviewId}
              role="tabpanel"
              aria-labelledby={`${tabId}-overview-tab`}
              className="hbar-app-react-skill-overview"
            >
              {skill.body.trim() ? (
                <MessageMarkdown text={skill.body} />
              ) : (
                <LumenContentText context="section.description">{labels.noOverview}</LumenContentText>
              )}
            </LumenFrame>
          ) : (
            <LumenFrame id={filesId} role="tabpanel" aria-labelledby={`${tabId}-files-tab`}>
              <SkillFiles
                skill={skill}
                detail={detail}
                labels={labels}
                connected={connected}
                onPage={onFilesPage}
                onOpenFile={onOpenFile}
              />
            </LumenFrame>
          )}
        </>
      )}
    </LumenFrame>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { useStore } from 'zustand'
import {
  LumenButton,
  LumenFrame,
  LumenInput,
  LumenContentText,
  LumenFormField,
  LumenCollection,
  LumenCollectionItem,
} from '@lumen/app-ui'
import type { SkillImportController } from '@hbar/app-runtime/skill-import'
import type { SkillImportJob, SkillImportPreview, SkillImportWarning } from '@hbar/contracts/commands/skill-import'
import './skill-import-panel.css'
export interface SkillImportLabels {
  readonly open: string
  readonly close: string
  readonly title: string
  readonly description: string
  readonly source: string
  readonly sources: Readonly<Record<'claude' | 'codex', string>>
  readonly sourceRoot: string
  readonly automaticSource: string
  readonly preview: string
  readonly previewing: string
  readonly convert: string
  readonly working: string
  readonly check: string
  readonly retryOriginal: string
  readonly cancel: string
  readonly empty: string
  readonly truncated: string
  readonly destination: (path: string) => string
  readonly sourcePaths: (paths: readonly string[]) => string
  readonly candidateStatus: Readonly<Record<SkillImportPreview['candidates'][number]['status'], string>>
  readonly warnings: Readonly<Record<SkillImportWarning, string>>
  readonly capacity: (files: number, bytes: number) => string
  readonly result: (job: SkillImportJob) => string
  readonly unknown: string
  readonly error: (code: string) => string
  readonly previous: string
  readonly next: string
  readonly page: (page: number, total: number) => string
}
/** At most 128 preview records, displayed in content-grown pages of 20. */
export function HbarSkillImportPanel({
  controller,
  labels,
  connected,
  onImported,
}: {
  readonly controller: SkillImportController
  readonly labels: SkillImportLabels
  readonly connected: boolean
  readonly onImported: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sourceRootId = useId()
  const state = useStore(controller.store)
  const seen = useRef(state.job?.operationId)
  useEffect(() => {
    if (
      state.job &&
      state.job.status !== 'running' &&
      state.job.items.some((item) => item.status === 'imported') &&
      state.job.operationId !== seen.current
    ) {
      seen.current = state.job.operationId
      onImported()
    }
  }, [state.job, onImported])
  useEffect(() => {
    if (expanded && connected) return controller.mount()
    return undefined
  }, [controller, expanded, connected])
  const busy = state.status === 'running' || state.status === 'starting'
  const locked = busy || state.status === 'unknown'
  const preview = state.preview
  const pages = Math.max(1, Math.ceil((preview?.candidates.length ?? 0) / 20))
  return (
    <LumenFrame className="hbar-skill-import">
      <LumenFrame className="hbar-skill-import-actions" role="group" aria-label={labels.title} tabIndex={0}>
        <LumenButton variant="text" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? labels.close : labels.open}
        </LumenButton>
      </LumenFrame>
      {expanded && (
        <LumenFrame as="section" className="hbar-skill-import-body" aria-label={labels.title}>
          <LumenContentText context="section.title" level={3}>
            {labels.title}
          </LumenContentText>
          <LumenContentText context="section.description">{labels.description}</LumenContentText>
          <LumenFrame role="group" aria-label={labels.source} className="hbar-skill-import-actions" tabIndex={0}>
            {(['claude', 'codex'] as const).map((source) => (
              <LumenButton
                key={source}
                variant="outlined"
                aria-pressed={state.source === source}
                disabled={!connected || locked}
                onClick={() => controller.setSource(source)}
              >
                {labels.sources[source]}
              </LumenButton>
            ))}
          </LumenFrame>
          <LumenFormField
            controlId={sourceRootId}
            label={labels.sourceRoot}
            layout="rows"
            className="hbar-skill-import-source"
          >
            <LumenInput
              id={sourceRootId}
              aria-label={labels.sourceRoot}
              placeholder={labels.automaticSource}
              value={state.sourceRoot}
              maxLength={4000}
              disabled={!connected || locked}
              onChange={(event) => controller.setSourceRoot(event.currentTarget.value)}
            />
          </LumenFormField>
          <LumenFrame className="hbar-skill-import-actions" role="group" aria-label={labels.preview} tabIndex={0}>
            <LumenButton
              disabled={!connected || locked || state.status === 'previewing'}
              onClick={() => void controller.preview()}
            >
              {state.status === 'previewing' ? labels.previewing : labels.preview}
            </LumenButton>
            <LumenButton
              disabled={
                !connected ||
                locked ||
                state.status === 'previewing' ||
                !preview?.candidates.some((item) => item.status === 'ready')
              }
              onClick={() => void controller.start()}
            >
              {busy ? labels.working : labels.convert}
            </LumenButton>
            {(locked || state.error) && (
              <LumenButton
                variant="text"
                disabled={!connected || state.checking}
                onClick={() => void controller.checkResult()}
              >
                {labels.check}
              </LumenButton>
            )}
            {state.status === 'unknown' && (
              <LumenButton variant="text" disabled={!connected} onClick={() => void controller.retryOriginal()}>
                {labels.retryOriginal}
              </LumenButton>
            )}
            {locked && (
              <LumenButton variant="text" disabled={!connected} onClick={() => void controller.cancel()}>
                {labels.cancel}
              </LumenButton>
            )}
          </LumenFrame>
          {state.error && (
            <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
              {labels.error(state.error)}
            </LumenContentText>
          )}
          {state.status === 'unknown' && (
            <LumenContentText context="feedback.paragraph" tone="warning" role="status">
              {labels.unknown}
            </LumenContentText>
          )}
          {state.job && (
            <LumenContentText context="feedback.paragraph" role="status">
              {labels.result(state.job)}
            </LumenContentText>
          )}
          {preview && (
            <>
              <LumenContentText context="section.description">
                {labels.sourcePaths(preview.sourceRoots)}
              </LumenContentText>
              <LumenContentText context="section.description">
                {labels.destination(preview.destination)}
              </LumenContentText>
              {!preview.candidates.length && (
                <LumenContentText context="empty.description" role="status">
                  {labels.empty}
                </LumenContentText>
              )}
              {preview.truncated && (
                <LumenContentText context="feedback.paragraph" tone="warning" role="status">
                  {labels.truncated}
                </LumenContentText>
              )}
              <LumenCollection className="hbar-skill-import-candidates" aria-label={labels.title}>
                {preview.candidates.slice(state.page * 20, (state.page + 1) * 20).map((candidate) => (
                  <LumenCollectionItem key={candidate.sourcePath}>
                    <LumenContentText context="collection.title">{candidate.name}</LumenContentText>
                    <LumenContentText context="collection.detail">
                      {labels.candidateStatus[candidate.status]}
                    </LumenContentText>
                    <LumenFrame
                      className="hbar-skill-import-metadata"
                      role="group"
                      aria-label={candidate.sourcePath}
                      tabIndex={0}
                    >
                      <LumenContentText context="resource.path">{candidate.sourcePath}</LumenContentText>
                    </LumenFrame>
                    <LumenFrame
                      className="hbar-skill-import-metadata"
                      role="group"
                      aria-label={candidate.name}
                      tabIndex={0}
                    >
                      <LumenContentText context="metadata.detail">
                        {labels.capacity(candidate.files, candidate.bytes)}
                      </LumenContentText>
                    </LumenFrame>
                    {candidate.warnings.map((warning, index) => (
                      <LumenContentText context="feedback.detail" tone="warning" key={`${warning}:${index}`}>
                        {labels.warnings[warning]}
                      </LumenContentText>
                    ))}
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
              {pages > 1 && (
                <LumenFrame
                  className="hbar-skill-import-actions"
                  role="group"
                  aria-label={labels.page(state.page + 1, pages)}
                  tabIndex={0}
                >
                  <LumenButton
                    variant="text"
                    disabled={state.page === 0}
                    onClick={() => controller.setPage(state.page - 1)}
                  >
                    {labels.previous}
                  </LumenButton>
                  <LumenContentText context="metadata">{labels.page(state.page + 1, pages)}</LumenContentText>
                  <LumenButton
                    variant="text"
                    disabled={state.page + 1 >= pages}
                    onClick={() => controller.setPage(state.page + 1)}
                  >
                    {labels.next}
                  </LumenButton>
                </LumenFrame>
              )}
            </>
          )}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

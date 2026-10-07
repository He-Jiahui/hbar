import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LumenProvider, LumenButton, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import type { FileWorkspaceEntryState, FileComposerContextSelection } from '@hbar/app-runtime'
import { filteredFileChanges } from '@hbar/app-runtime'
import { gitStatusSchema, gitDiffSchema, gitStatusEntrySchema } from '@hbar/contracts'
import { HbarFileChanges, HbarFileDiff } from '../../packages/app-react/src/file-workspace-changes'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface FileChangesContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly view: 'changes' | 'diff'
  readonly count: number
  readonly suffix: string
  readonly state:
    | 'ready'
    | 'loading'
    | 'error'
    | 'offline'
    | 'non-repository'
    | 'filtered-empty'
    | 'truncated'
    | 'add-success'
    | 'add-error'
}
interface FileChangesContentCall {
  readonly action: string
  readonly path?: string
  readonly cached?: boolean
  readonly value?: string
  readonly source?: string
  readonly selection?: FileComposerContextSelection
}
declare global {
  interface Window {
    mountFileChangesContent(input: FileChangesContentInput): void
    reverseFileChangesContent(): void
    fileChangesContentState(): { readonly calls: readonly FileChangesContentCall[]; readonly source: string }
    fileChangesContentBounds(): Readonly<Record<string, boolean>>
  }
}
const path = (index: number) => `原始目录/${'Complete original directory 完整原始目录/'.repeat(10)}original-${index}.ts`
const source = (count: number) =>
  count === 0
    ? ''
    : [
        `@@ -0,0 +1,${Math.max(0, count - 1)} @@`,
        ...Array.from(
          { length: count - 1 },
          (_, index) =>
            `+  \t原始行 ${index} Original line   ${index === 0 ? 'complete-original-source '.repeat(40) : ''}`,
        ),
      ].join('\n')
let root: Root | undefined
window.mountFileChangesContent = (input) => {
  const element = document.getElementById('file-changes-content-fixture')
  if (!element) throw new Error('Missing owned file changes fixture')
  root?.unmount()
  const originalItems = Array.from({ length: input.count }, (_, index) => ({
    path: path(index),
    originalPath: `Original rename source 原始重命名路径/${index}.ts`,
    index: 'R',
    worktree: 'M',
  }))
  const originalSource = source(input.count)
  const base = getShellCopy(input.locale).files
  const labels = {
    ...base.changes,
    loading: base.changes.loading + input.suffix,
    notRepository: base.changes.notRepository + input.suffix,
    noChanges: base.changes.noChanges + input.suffix,
    noMatches: base.changes.noMatches + input.suffix,
    limit: base.changes.limit + input.suffix,
    previous: base.changes.previous + input.suffix,
    next: base.changes.next + input.suffix,
    previousLines: base.changes.previousLines + input.suffix,
    nextLines: base.changes.nextLines + input.suffix,
    readOnlyDiff: base.changes.readOnlyDiff + input.suffix,
    workingTree: base.changes.workingTree + input.suffix,
    staged: base.changes.staged + input.suffix,
    openFile: base.changes.openFile + input.suffix,
    refresh: base.changes.refresh + input.suffix,
    noDiff: base.changes.noDiff + input.suffix,
    truncated: base.changes.truncated + input.suffix,
    error: (code: string) => base.changes.error(code) + input.suffix,
    status: (index: string, worktree: string) => base.changes.status(index, worktree) + input.suffix,
  }
  const copy = input.locale === 'zh-CN' ? '复制完整原始差异' : 'Copy complete original diff'
  const add = input.locale === 'zh-CN' ? '添加原始差异到聊天' : 'Add original diff to chat'
  function Fixture() {
    const [items, setItems] = useState(originalItems)
    const [page, setPage] = useState(0)
    const [filter, setFilter] = useState(input.state === 'filtered-empty' ? 'missing-original-file' : '')
    const [cached, setCached] = useState(false)
    const [calls, setCalls] = useState<readonly FileChangesContentCall[]>([])
    const record = (call: FileChangesContentCall) => setCalls((current) => [...current, call])
    window.reverseFileChangesContent = () => setItems((current) => [...current].reverse())
    window.fileChangesContentState = () => ({ calls, source: originalSource })
    const changes: FileWorkspaceEntryState['changes'] = {
      status: input.state === 'loading' ? 'loading' : input.state === 'error' ? 'error' : 'ready',
      cwd: '/owned',
      root: input.state === 'non-repository' ? null : '/owned',
      branch: 'main',
      isRepository: input.state !== 'non-repository',
      items,
      filter,
      page,
      error: input.state === 'error' ? 'EXECUTION_FAILED' : null,
      limitReached: input.count === 5000,
    }
    return (
      <LumenProvider
        className="file-changes-fixture-provider"
        appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
      >
        {input.view === 'changes' ? (
          <HbarFileChanges
            changes={changes}
            labels={labels}
            connected={input.state !== 'offline'}
            selectedPath={path(0)}
            onRefresh={() => record({ action: 'refresh-changes' })}
            onFilter={(value) => {
              record({ action: 'filter', value })
              setFilter(value)
              setPage(0)
            }}
            onPage={(value) => {
              record({ action: 'page', value: String(value) })
              setPage(value)
            }}
            onOpen={(value) => record({ action: 'open-change', path: value })}
          />
        ) : (
          <HbarFileDiff
            diff={{
              path: path(0),
              cached,
              status: input.state === 'loading' ? 'loading' : input.state === 'error' ? 'error' : 'ready',
              text: originalSource,
              error: input.state === 'error' ? 'EXECUTION_FAILED' : null,
              truncated: input.state === 'truncated',
            }}
            change={{ path: path(0), index: 'M', worktree: 'M' }}
            labels={labels}
            connected={input.state !== 'offline'}
            pagination={{
              page,
              onChange: (value) => {
                record({ action: 'line-page', value: String(value) })
                setPage(value)
              },
            }}
            onOpen={(value) => {
              record({ action: 'open-diff', path: path(0), cached: value })
              setCached(value)
            }}
            onFile={() => record({ action: 'open-file', path: path(0) })}
            onRefresh={() => record({ action: 'refresh-diff', path: path(0), cached })}
            headerActions={
              <LumenButton aria-label={copy} onClick={() => record({ action: 'copy', source: originalSource })}>
                {copy}
              </LumenButton>
            }
            addToChat={{
              label: add + input.suffix,
              disabled: input.state === 'offline',
              onClick: () => record({ action: 'add', path: path(0), cached }),
              ...(input.state === 'add-success' || input.state === 'add-error'
                ? {
                    feedback: input.state === 'add-error' ? labels.error('EXECUTION_FAILED') : add + input.suffix,
                    feedbackKind: input.state === 'add-error' ? 'error' : 'success',
                  }
                : {}),
            }}
            context={{
              labels: base.context,
              disabled: input.state === 'offline',
              onAdd: async (selection) => {
                record({ action: 'comment', selection })
                return true
              },
            }}
          />
        )}
      </LumenProvider>
    )
  }
  root = createRoot(element)
  root.render(<Fixture />)
}
window.fileChangesContentBounds = () => {
  const status = {
    cwd: '/owned',
    root: '/owned',
    branch: 'main',
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    dirty: true,
    originUrl: null,
    entries: Array.from({ length: 5000 }, (_, index) => ({ path: path(index), index: ' ', worktree: 'M' })),
  }
  const diff = { cwd: '/owned', cached: false, truncated: false, diff: 'x'.repeat(512000) }
  return {
    list5000: gitStatusSchema.safeParse(status).success,
    list5001: gitStatusSchema.safeParse({ ...status, entries: [...status.entries, status.entries[0]] }).success,
    path4000: gitStatusEntrySchema.safeParse({ path: 'x'.repeat(4000), index: ' ', worktree: 'M' }).success,
    path4001: gitStatusEntrySchema.safeParse({ path: 'x'.repeat(4001), index: ' ', worktree: 'M' }).success,
    diff512000: gitDiffSchema.safeParse(diff).success,
    diff512001: gitDiffSchema.safeParse({ ...diff, diff: diff.diff + 'x' }).success,
    filtered5000:
      filteredFileChanges({
        status: 'ready',
        cwd: '/owned',
        root: '/owned',
        branch: 'main',
        isRepository: true,
        items: status.entries,
        filter: '',
        page: 0,
        error: null,
        limitReached: true,
      }).length === 5000,
  }
}

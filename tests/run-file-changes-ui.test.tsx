import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRunFileChanges } from '@hbar/app-react'
import { EMPTY_FILE_CHANGE_REVIEW } from '@hbar/app-runtime'
import type { RunFileChangeReview } from '@hbar/app-runtime'
import type { RunFileChangesSummary } from '@hbar/contracts/run-file-changes'
import type { Run } from '@hbar/contracts'
import { runFileChangesCopy } from '../apps/web/src/run-file-changes-copy'
import { projectSessionTimelineSequence } from '../packages/app-react/src/session-message-model'
import { fileChangeSummary, fileChangePage, fileChangeDiff } from './fixtures/run-file-changes'

function render(
  summary: RunFileChangesSummary,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
  review: RunFileChangeReview = EMPTY_FILE_CHANGE_REVIEW,
) {
  return renderToStaticMarkup(
    <HbarRunFileChanges
      summary={summary}
      review={review}
      labels={runFileChangesCopy(locale)}
      onFiles={() => undefined}
      onCollapse={() => undefined}
      onDiff={() => undefined}
      onCloseDiff={() => undefined}
      onUndo={() => undefined}
      onRetry={() => undefined}
    />,
  )
}
for (const locale of ['zh-CN', 'en-US'] as const)
  test(`finished file changes render counts, three paths and expansion in ${locale}`, () => {
    const labels = runFileChangesCopy(locale),
      summary = fileChangeSummary()
    const html = render(summary, locale)
    expect(html).toContain(labels.edited(10))
    expect(html).toContain('+1,080')
    expect(html).toContain('−3')
    expect(html.match(/<li /g)).toHaveLength(3)
    expect(html).toContain(labels.more(7))
    expect(html).toContain(labels.view)
    expect(html).toContain(labels.undo)
    expect(html).toContain('aria-expanded="false"')
  })
test('zero and single file summaries have explicit empty and short list behavior', () => {
  expect(render(fileChangeSummary(0))).toBe('')
  const html = render(fileChangeSummary(1))
  expect(html.match(/<li /g)).toHaveLength(1)
  expect(html.match(/aria-controls="/g)).toHaveLength(1)
  expect(html).not.toContain('hbar-run-file-change-footer')
})
test('file list pages render exactly fifty items and keep the next page available at capacity', () => {
  for (const count of [50, 51, 256]) {
    const review = { ...EMPTY_FILE_CHANGE_REVIEW, expanded: true, page: fileChangePage(count) }
    const html = render(fileChangeSummary(count), 'en-US', review)
    expect(html.match(/<li /g)).toHaveLength(50)
    expect(html).toContain(runFileChangesCopy('en-US').filePage(1, 50, count))
    expect(review.page.nextCursor !== null).toBe(count > 50)
  }
})
test('long host labels, file paths, incomplete measurements and unavailable undo remain explicit', () => {
  const summary = fileChangeSummary(1, {
    addedLines: null,
    removedLines: null,
    canUndo: false,
    incomplete: true,
    preview: [{ path: `${'deeply/nested/'.repeat(30)}文件.ts`, kind: 'created', addedLines: null, removedLines: null }],
  })
  const labels = {
    ...runFileChangesCopy('en-US'),
    edited: () => 'A deliberately long localized file change summary that must wrap at narrow widths',
  }
  const html = renderToStaticMarkup(
    <HbarRunFileChanges
      summary={summary}
      labels={labels}
      onFiles={() => undefined}
      onCollapse={() => undefined}
      onDiff={() => undefined}
      onCloseDiff={() => undefined}
      onUndo={() => undefined}
      onRetry={() => undefined}
    />,
  )
  expect(html).toContain(labels.edited())
  expect(html).toContain('+Unknown')
  expect(html).toContain(labels.incomplete)
  expect(html).toContain('data-text-context="code.inline"')
  expect(html).toContain('disabled=""')
  expect(html).toContain(summary.preview[0]?.path ?? '')
})
test('review displays recorded differences and successful undo keeps the historical summary', () => {
  const diff = fileChangeDiff(),
    page = fileChangePage()
  const summary = fileChangeSummary(10, { undoneAt: 123, canUndo: false })
  const html = render(summary, 'zh-CN', {
    ...EMPTY_FILE_CHANGE_REVIEW,
    selectedPath: diff.path,
    diff,
    page: { ...page, summary },
  })
  expect(html).toContain('const before = 1')
  expect(html).toContain('const after = 2')
  expect(html).toContain('data-text-context="code.inline"')
  expect(html).toContain('data-text-context="metadata"')
  expect(html).toContain('data-kind="removed"')
  expect(html).toContain('data-kind="added"')
  expect(html).toContain(runFileChangesCopy('zh-CN').undone)
  expect(html).toContain('data-undone="true"')
})
test('empty file content has an explicit diff state', () => {
  const diff = { ...fileChangeDiff(), items: [], totalLines: 0 }
  expect(
    render(fileChangeSummary(1), 'en-US', { ...EMPTY_FILE_CHANGE_REVIEW, selectedPath: diff.path, diff }),
  ).toContain(runFileChangesCopy('en-US').noTextDiff)
})
test('pending undo and conflict errors expose nearby status and retry without claiming success', () => {
  const summary = fileChangeSummary(),
    labels = runFileChangesCopy('zh-CN')
  const pending = render(summary, 'zh-CN', { ...EMPTY_FILE_CHANGE_REVIEW, action: 'undo' })
  expect(pending).toContain('aria-busy="true"')
  expect(pending).toContain(labels.undoing)
  expect(pending).not.toContain('data-undone="true"')
  const failed = render(summary, 'zh-CN', { ...EMPTY_FILE_CHANGE_REVIEW, error: 'FILE_CONFLICT', failedAction: 'undo' })
  expect(failed).toContain('role="alert"')
  expect(failed).toContain(labels.error('FILE_CONFLICT', 'undo'))
  expect(failed).toContain(labels.retry)
})
test('the read-only patch slot receives the bounded page and preserves its fallback on failure', () => {
  const diff = fileChangeDiff(),
    review = { ...EMPTY_FILE_CHANGE_REVIEW, selectedPath: diff.path, diff }
  const renderSlot = (renderPage: (page: Readonly<typeof diff>) => import('react').ReactNode) =>
    renderToStaticMarkup(
      <HbarRunFileChanges
        summary={fileChangeSummary()}
        review={review}
        labels={runFileChangesCopy('en-US')}
        renderer={{ id: 'fixture.patch', slot: 'patch', readOnly: true, render: renderPage }}
        onFiles={() => undefined}
        onCollapse={() => undefined}
        onDiff={() => undefined}
        onCloseDiff={() => undefined}
        onUndo={() => undefined}
        onRetry={() => undefined}
      />,
    )
  expect(renderSlot((page) => <code data-patch-renderer>{page.items[1]?.text}</code>)).toContain(
    'data-patch-renderer="true"',
  )
  expect(
    renderSlot(() => {
      throw new Error('renderer failed')
    }),
  ).toContain('data-kind="added"')
  expect(renderSlot(() => null)).toContain('data-kind="removed"')
})
test('file cards have canonical completed order, including failed turns, without duplicates or foreign history', () => {
  const run: Run = {
    id: 'run',
    sessionId: 'session',
    requestId: 'request',
    input: { text: '', images: [], source: 'user', approval: 'allow' },
    modelId: 'mock',
    status: 'failed',
    createdAt: 1,
    startedAt: 1,
    endedAt: 4,
    error: 'failed later',
    fileChanges: fileChangeSummary(),
  }
  const timeline = {
    sessionId: 'session',
    messages: [
      {
        id: 'reply',
        sessionId: 'session',
        runId: 'run',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: 'Finished reply' }],
        seq: 19,
        createdAt: 3,
      },
      {
        id: 'next',
        sessionId: 'session',
        runId: 'next',
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Next question' }],
        seq: 21,
        createdAt: 5,
      },
    ],
    runs: [
      run,
      run,
      { ...run, id: 'foreign', sessionId: 'other' },
      { ...run, id: 'active', status: 'running' as const },
    ],
    streams: {},
  }
  const sequence = projectSessionTimelineSequence(timeline)
  expect(sequence.map((item) => item.kind)).toEqual(['message', 'runFileChanges', 'message'])
  expect(
    projectSessionTimelineSequence({ ...timeline, messages: [timeline.messages[1]!] }).map((item) => item.kind),
  ).toEqual(['message'])
})

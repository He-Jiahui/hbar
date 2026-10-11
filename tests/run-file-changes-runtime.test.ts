import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  createRunFileChanges,
  runFileChangeReviewKey,
  MAX_FILE_CHANGE_REVIEWS,
} from '../packages/app-runtime/src/run-file-changes'
import { fileChangePage, fileChangeDiff } from './fixtures/run-file-changes'

test('file and diff actions target a captured Run, page its files and retain recorded diff versions', async () => {
  const requests: { name: string; input: unknown }[] = []
  const files: CommandExecutor = {
    async execute(name, input) {
      requests.push({ name, input })
      if (name === 'run.fileChanges') return fileChangePage(51, requests.length === 1 ? 0 : 50)
      return fileChangeDiff()
    },
  }
  const feature = createRunFileChanges(files, () => undefined),
    key = runFileChangeReviewKey('session', 'run')
  try {
    expect(await feature.readFiles('session', 'run')).toBe(true)
    expect(feature.reader.getSnapshot().entries[key]?.page?.items).toHaveLength(50)
    expect(await feature.readFiles('session', 'run', 'next')).toBe(true)
    expect(feature.reader.getSnapshot().entries[key]?.pageIndex).toBe(1)
    expect(feature.reader.getSnapshot().entries[key]?.page?.items).toHaveLength(1)
    const path = fileChangeDiff().path
    expect(await feature.readDiff('session', 'run', path)).toBe(true)
    expect(requests[2]).toEqual({
      name: 'run.fileChangeDiff',
      input: { sessionId: 'session', runId: 'run', path, offset: 0 },
    })
    feature.closeDiff('session', 'run')
    expect(feature.reader.getSnapshot().entries[key]?.selectedPath).toBeNull()
    feature.collapse('session', 'run')
    expect(feature.reader.getSnapshot().entries[key]?.expanded).toBe(false)
  } finally {
    feature.dispose()
  }
})
test('later diff reads fence stale responses and release cancels reads instead of crossing cards', async () => {
  let resolve: (value: unknown) => void = () => {}
  let calls = 0
  const feature = createRunFileChanges(
    {
      async execute() {
        if (++calls === 1)
          return new Promise<unknown>((done) => {
            resolve = done
          })
        return fileChangeDiff('second.ts')
      },
    },
    () => undefined,
  )
  try {
    const first = feature.readDiff('session', 'run', 'first.ts')
    expect(await feature.readDiff('session', 'run', 'second.ts')).toBe(true)
    resolve(fileChangeDiff('first.ts'))
    expect(await first).toBe(false)
    expect(feature.reader.getSnapshot().entries[runFileChangeReviewKey('session', 'run')]?.diff?.path).toBe('second.ts')
    feature.release('session', 'run')
    expect(Object.keys(feature.reader.getSnapshot().entries)).toHaveLength(0)
  } finally {
    feature.dispose()
  }
})
test('wrong session output and non-advancing cursors fail closed', async () => {
  for (const response of [
    { ...fileChangePage(), sessionId: 'other' },
    { ...fileChangePage(), nextCursor: 'not-the-last-path' },
  ]) {
    const feature = createRunFileChanges(
      {
        async execute() {
          return response
        },
      },
      () => undefined,
    )
    expect(await feature.readFiles('session', 'run')).toBe(false)
    expect(feature.reader.getSnapshot().entries[runFileChangeReviewKey('session', 'run')]?.error).toBe('INVALID_OUTPUT')
    feature.dispose()
  }
})
test('undo never succeeds optimistically, rejects duplicate mutation, then renders the durable receipt', async () => {
  let resolve: (value: unknown) => void = () => {},
    calls = 0
  const feature = createRunFileChanges(
    {
      async execute() {
        calls++
        return new Promise<unknown>((done) => {
          resolve = done
        })
      },
    },
    () => undefined,
  )
  const key = runFileChangeReviewKey('session', 'run')
  try {
    const pending = feature.undo('session', 'run')
    expect(feature.reader.getSnapshot().entries[key]?.action).toBe('undo')
    expect(await feature.undo('session', 'run')).toBe(false)
    feature.release('session', 'run')
    expect(feature.reader.getSnapshot().entries[key]?.action).toBe('undo')
    const page = fileChangePage()
    resolve({ ...page, summary: { ...page.summary, undoneAt: 123, canUndo: false } })
    expect(await pending).toBe(true)
    expect(calls).toBe(1)
    expect(feature.reader.getSnapshot().entries[key]?.page?.summary?.undoneAt).toBe(123)
  } finally {
    feature.dispose()
  }
})
test('errors and unavailable transport remain actionable and retained reviews have a memory bound', async () => {
  const unavailable = createRunFileChanges(undefined, () => undefined)
  expect(await unavailable.readFiles('session', 'run')).toBe(false)
  expect(unavailable.reader.getSnapshot().entries[runFileChangeReviewKey('session', 'run')]?.error).toBe(
    'CAPABILITY_UNAVAILABLE',
  )
  unavailable.dispose()
  const feature = createRunFileChanges(
    {
      async execute() {
        throw new CommandError('FILE_CONFLICT', 'later edit')
      },
    },
    () => undefined,
  )
  try {
    for (let i = 0; i < MAX_FILE_CHANGE_REVIEWS + 1; i++) expect(await feature.undo('session', `run-${i}`)).toBe(false)
    expect(Object.keys(feature.reader.getSnapshot().entries)).toHaveLength(MAX_FILE_CHANGE_REVIEWS)
    expect(
      feature.reader.getSnapshot().entries[runFileChangeReviewKey('session', `run-${MAX_FILE_CHANGE_REVIEWS}`)]
        ?.failedAction,
    ).toBe('undo')
  } finally {
    feature.dispose()
  }
})
test('review capacity never aborts or evicts an in-flight undo to admit another card', async () => {
  const resolvers: ((value: unknown) => void)[] = []
  const feature = createRunFileChanges(
    {
      async execute() {
        return new Promise<unknown>((resolve) => {
          resolvers.push(resolve)
        })
      },
    },
    () => undefined,
  )
  try {
    const requests = Array.from({ length: MAX_FILE_CHANGE_REVIEWS }, (_, index) =>
      feature.undo('session', `run-${index}`),
    )
    expect(await feature.undo('session', 'overflow')).toBe(false)
    expect(feature.reader.getSnapshot().rejected).toEqual({
      key: runFileChangeReviewKey('session', 'overflow'),
      action: 'undo',
    })
    expect(Object.values(feature.reader.getSnapshot().entries).every((entry) => entry.action === 'undo')).toBe(true)
    expect(resolvers).toHaveLength(MAX_FILE_CHANGE_REVIEWS)
    for (const [index, resolve] of resolvers.entries()) {
      const page = fileChangePage()
      resolve({ ...page, runId: `run-${index}`, summary: { ...page.summary, undoneAt: 123, canUndo: false } })
    }
    expect((await Promise.all(requests)).every(Boolean)).toBe(true)
  } finally {
    feature.dispose()
  }
})

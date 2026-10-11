import { describe, expect, test } from 'bun:test'
import { createSessionObservabilityReaders } from '@hbar/app-runtime'
import type { SessionObservabilityInput, SessionObservabilityReport } from '@hbar/contracts/session-observability'
import { observabilityReport } from './fixtures/session-observability'

async function waitFor(condition: () => boolean) {
  const end = Date.now() + 3000
  while (!condition()) {
    if (Date.now() >= end) throw new Error('Statistics did not settle')
    await Bun.sleep(10)
  }
}
function pending() {
  let finish: ((value: SessionObservabilityReport) => void) | undefined
  return {
    promise: new Promise<SessionObservabilityReport>((resolve) => {
      finish = resolve
    }),
    resolve(value: SessionObservabilityReport) {
      if (!finish) throw new Error('Missing resolver')
      finish(value)
    },
  }
}

describe('Session statistics reader lifecycle', () => {
  test('keeps one actual request, discards old scope results and serves the latest selection', async () => {
    const requests: SessionObservabilityInput[] = []
    const first = pending(),
      second = pending()
    const factory = createSessionObservabilityReaders({
      read: (input) => {
        requests.push(input)
        return requests.length === 1 ? first.promise : second.promise
      },
    })
    const owner = factory.create('session')
    try {
      owner.setConnected(true)
      await waitFor(() => requests.length === 1)
      owner.select('turn', 9)
      owner.select('window')
      owner.refresh()
      expect(requests).toHaveLength(1)
      first.resolve(observabilityReport())
      await waitFor(() => requests.length === 2)
      expect(owner.reader.getSnapshot().report).toBeNull()
      expect(requests[1]?.scope).toBe('window')
      second.resolve(observabilityReport('session', 'window'))
      await waitFor(() => owner.reader.getSnapshot().status === 'idle')
      expect(owner.reader.getSnapshot().report?.range.scope).toBe('window')
    } finally {
      factory.dispose()
    }
  })
  test('rejects a mismatched Session, keeps offline data, and ignores late responses after disposal', async () => {
    let wrong = false
    const factory = createSessionObservabilityReaders({
      read: async () => observabilityReport(wrong ? 'other' : 'session'),
    })
    const owner = factory.create('session')
    try {
      owner.setConnected(true)
      await waitFor(() => owner.reader.getSnapshot().report !== null)
      owner.setConnected(false)
      const saved = owner.reader.getSnapshot().report
      owner.refresh()
      await Bun.sleep(270)
      expect(owner.reader.getSnapshot().report).toBe(saved)
      wrong = true
      owner.setConnected(true)
      await waitFor(() => owner.reader.getSnapshot().status === 'error')
      expect(owner.reader.getSnapshot().error).toBe('INVALID_STATE')
      expect(owner.reader.getSnapshot().report).toBe(saved)
    } finally {
      factory.dispose()
    }
    const response = pending()
    const late = createSessionObservabilityReaders({ read: () => response.promise })
    const reader = late.create('session')
    reader.setConnected(true)
    await waitFor(() => reader.reader.getSnapshot().status === 'loading')
    reader.dispose()
    response.resolve(observabilityReport())
    await Bun.sleep(20)
    expect(reader.reader.getSnapshot().report).toBeNull()
    late.dispose()
  })
  test('pins the scope while paging and resets cursors when switching detail kinds', async () => {
    const requests: SessionObservabilityInput[] = []
    const factory = createSessionObservabilityReaders({
      read: async (input) => {
        requests.push(input)
        return {
          ...observabilityReport('session', input.scope ?? 'session', input.detail ?? 'skills'),
          nextCursor: 'next-page',
        }
      },
    })
    const owner = factory.create('session')
    try {
      owner.select('window')
      owner.setConnected(true)
      await waitFor(() => owner.reader.getSnapshot().report !== null)
      owner.nextPage()
      await waitFor(() => requests.length === 2 && owner.reader.getSnapshot().status === 'idle')
      expect(requests[1]).toMatchObject({ scope: 'window', anchor: 5, after: 'next-page' })
      expect(owner.reader.getSnapshot().page).toBe(2)
      owner.detail('files')
      await waitFor(() => requests.length === 3 && owner.reader.getSnapshot().status === 'idle')
      expect(requests[2]?.after).toBeUndefined()
      expect(owner.reader.getSnapshot().page).toBe(1)
    } finally {
      factory.dispose()
    }
  })
  test('same-turn effect cleanup and reattachment preserves the reader under React StrictMode', async () => {
    let calls = 0
    const factory = createSessionObservabilityReaders({
      read: async () => {
        calls++
        return observabilityReport()
      },
    })
    const owner = factory.create('session')
    const release = owner.retain()
    owner.setConnected(true)
    release()
    const attached = owner.retain()
    await waitFor(() => owner.reader.getSnapshot().report !== null)
    expect(calls).toBe(1)
    attached()
    await Bun.sleep(10)
    owner.refresh()
    await Bun.sleep(270)
    expect(calls).toBe(1)
    factory.dispose()
  })
})

import { expect, test } from 'bun:test'
import { awaitComposerWrites } from '../packages/app-react/src/lumen-session-workspace'

test('Plan approval waits for an earlier write even when the latest write settles first', async () => {
  const first = Promise.withResolvers<void>()
  const latest = Promise.withResolvers<void>()
  const writes = new Map<string, ReadonlySet<Promise<unknown>>>([['session-a', new Set([first.promise, latest.promise])]])
  let settled = false
  const waiting = awaitComposerWrites(writes, 'session-a').then(() => {
    settled = true
  })
  latest.resolve()
  await Bun.sleep(0)
  expect(settled).toBe(false)
  first.resolve()
  await waiting
  expect(settled).toBe(true)
})

test('Plan approval only waits for the captured Session writes', async () => {
  const other = Promise.withResolvers<void>()
  const target = Promise.withResolvers<void>()
  const writes = new Map<string, ReadonlySet<Promise<unknown>>>([
    ['session-a', new Set([target.promise])],
    ['session-b', new Set([other.promise])],
  ])
  let otherSettled = false
  void other.promise.then(() => {
    otherSettled = true
  })
  const waiting = awaitComposerWrites(writes, 'session-a')
  target.resolve()
  await waiting
  expect(otherSettled).toBe(false)
  other.resolve()
})

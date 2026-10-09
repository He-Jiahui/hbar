import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createMessageResources, type MessageResourcePort } from '@hbar/app-runtime'
import type { ResourceCandidate } from '@hbar/contracts/resources'
import { splitResourceReferences } from '../packages/app-react/src/message-resource-model'
import { projectSessionFindText } from '../packages/app-react/src/session-find-text'

const source = { workspaceId: 'w', sessionId: 's', messageId: 'm', sourceTabInstanceKey: null }
const candidate = (name: string, kind: ResourceCandidate['kind'] = 'file'): ResourceCandidate => ({
  id: name.padEnd(64, '0'),
  name,
  kind,
  location: `/tmp/${name}.png`,
  directory: '/tmp',
  workspacePath: null,
  mime: null,
  size: 4,
})
function fixture() {
  let owned = true
  let items = [candidate('a')]
  let mediaReads = 0
  let releases = 0
  let opened = ''
  const pending = Promise.withResolvers<{ url: string; release(): void }>()
  const port: MessageResourcePort = {
    target: () => Promise.resolve({ sessionId: 's', expectedRevision: 1 }),
    resolve: () => Promise.resolve({ candidates: items, truncated: false }),
    text: () => Promise.resolve({ candidate: items[0]!, text: 'read-only text' }),
    media: () => {
      mediaReads++
      return pending.promise
    },
    defaultMode: () => Promise.resolve('internal'),
    openSystem: (item) => {
      opened = item.name
      return Promise.resolve()
    },
    openBrowser: () => Promise.resolve(),
    owns: () => owned,
  }
  return {
    model: createMessageResources(port),
    setItems: (next: ResourceCandidate[]) => {
      items = next
    },
    retire: () => {
      owned = false
    },
    reads: () => mediaReads,
    releases: () => releases,
    opened: () => opened,
    finish: () =>
      pending.resolve({
        url: 'blob:owned',
        release: () => {
          releases++
        },
      }),
    fail: () => pending.reject(new CommandError('UNSUPPORTED_IMAGE', 'Unsupported image')),
  }
}
test('resource segmentation retains exact prose and identifies relative images and complete quoted paths', () => {
  const text =
    '打开 src/main.ts:12，图片 images/test.png 和 `C:\\My Project\\test.png`，URL `https://example.com:8080/a?q=1`。'
  const parts = splitResourceReferences(text)
  expect(parts.map((part) => part.value).join('')).toBe(text)
  expect(parts.filter((part) => part.kind === 'resource').map((part) => part.reference)).toEqual([
    { kind: 'file', path: 'src/main.ts', line: 12 },
    { kind: 'file', path: 'images/test.png' },
    { kind: 'file', path: 'C:/My Project/test.png' },
    { kind: 'web', url: 'https://example.com:8080/a?q=1', image: false },
  ])
  expect(projectSessionFindText('`src/main.ts:12` and `console.log`').text).toBe('src/main.ts:12 and console.log')
})
test('ambiguous selection revalidates the original candidate and opens only the selected target', async () => {
  const f = fixture()
  f.setItems([candidate('a'), candidate('b')])
  await f.model.open(source, { kind: 'file', path: 'same.txt' }, () => Promise.resolve(), 'system')
  expect(f.model.store.getState().chooser?.candidates).toHaveLength(2)
  f.setItems([candidate('a')])
  await f.model.select(candidate('b').id)
  expect(f.model.store.getState().chooser?.error).toBe('STALE_TARGET')
  expect(f.opened()).toBe('')
  f.setItems([candidate('a'), candidate('b')])
  await f.model.select(candidate('b').id)
  expect(f.opened()).toBe('b')
  expect(f.model.store.getState().chooser).toBeNull()
})
test('image reads start only after opening and close releases late resources without publishing stale URLs', async () => {
  const f = fixture()
  f.setItems([candidate('image', 'image')])
  expect(f.reads()).toBe(0)
  const opening = f.model.open(source, { kind: 'file', path: 'test.png' }, () => Promise.resolve())
  await Bun.sleep(0)
  expect(f.reads()).toBe(1)
  expect(f.model.store.getState().image?.status).toBe('loading')
  f.model.close()
  f.finish()
  await opening
  expect(f.model.store.getState().image).toBeNull()
  expect(f.releases()).toBe(1)
})
test('missing resources and retired source owners cannot produce a preview or unrelated navigation', async () => {
  const f = fixture()
  f.setItems([])
  await expect(
    f.model.open(source, { kind: 'file', path: 'missing.ts' }, () => Promise.resolve()),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  f.retire()
  await expect(f.model.open(source, { kind: 'file', path: 'test.ts' }, () => Promise.resolve())).rejects.toMatchObject({
    code: 'TARGET_CHANGED',
  })
})
test('failed media can open the revalidated target with a one-time system override and no second byte read', async () => {
  const f = fixture()
  f.setItems([candidate('image', 'image')])
  const opening = f.model.open(source, { kind: 'file', path: 'test.png' }, () => Promise.resolve())
  await Bun.sleep(0)
  f.fail()
  await opening
  expect(f.model.store.getState().image).toMatchObject({ status: 'failed', error: 'UNSUPPORTED_IMAGE' })
  await f.model.openImageSystem()
  expect(f.opened()).toBe('image')
  expect(f.reads()).toBe(1)
  expect(f.model.store.getState().image).toBeNull()
})

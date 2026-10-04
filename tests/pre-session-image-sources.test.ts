import { expect, test } from 'bun:test'
import type { ArtifactRef } from '@hbar/contracts'
import { CommandError } from '@hbar/commands'
import {
  containsPreSessionDraftImages,
  isPreSessionImageRequestCurrent,
  projectPreSessionDraftImages,
  type PreSessionImageDraft,
  type PreSessionImageProjection,
} from '../packages/app-runtime/src/session-image-sources'
import { createImageViewer } from '../packages/app-runtime/src/image-viewer'

const hostIdentity = 'confirmed-host-a'
const draftId = '5dc54e77-2e3f-4567-8be4-1e5838f95dfd'
const otherDraftId = '5dc54e77-2e3f-4567-8be4-1e5838f95dfe'
const artifact = (value = 'a', name = 'same-image.png'): ArtifactRef => ({
  id: value.repeat(64),
  name,
  mime: 'image/png',
  size: 16,
})
function draft(
  attachments: PreSessionImageDraft['attachments'] = [{ kind: 'image', artifact: artifact() }],
  revision = 7,
  id = draftId,
): PreSessionImageDraft {
  return { draftId: id, revision, attachments }
}
function present(value: PreSessionImageProjection | null): PreSessionImageProjection {
  if (!value) throw new Error('Expected images in the fixture')
  return value
}
const project = (value = draft(), activeOrdinal?: number) =>
  present(
    projectPreSessionDraftImages({
      hostIdentity,
      draft: value,
      ...(activeOrdinal === undefined ? {} : { activeOrdinal }),
    }),
  )

test('pre-session projection identifies the real draft owner and keeps confirmed occurrences stable', () => {
  const original = draft([
    { kind: 'file', artifact: artifact('d') },
    { kind: 'image', artifact: artifact() },
    { kind: 'image', artifact: artifact() },
  ])
  const value = project(original, 1)
  const newerRevision = { ...original, revision: 42 }

  expect(value.request.source).toEqual({ kind: 'pre-session-draft', draftId, draftRevision: 7 })
  expect(value.sourceId).toBe(project(newerRevision).sourceId)
  expect(value.request.items.map((item) => item.artifact.id)).toEqual([artifact().id, artifact().id])
  expect(new Set(value.request.items.map((item) => item.key)).size).toBe(2)
  expect(value.request.activeKey).toBe(value.request.items[1]!.key)
  expect(containsPreSessionDraftImages(value.request, newerRevision)).toBe(true)
  expect(isPreSessionImageRequestCurrent(value.request, { activeDraftId: draftId, draft: newerRevision })).toBe(true)
})

test('pre-session currentness requires the selected owner and the exact ordered confirmed image list', () => {
  const original = draft([
    { kind: 'image', artifact: artifact() },
    { kind: 'image', artifact: artifact('b') },
  ])
  const value = project(original)
  const secondAttachment = original.attachments[1]
  if (!secondAttachment) throw new Error('Expected a second canonical attachment')

  expect(containsPreSessionDraftImages(value.request, original)).toBe(true)
  expect(isPreSessionImageRequestCurrent(value.request, { activeDraftId: null, draft: original })).toBe(false)
  expect(isPreSessionImageRequestCurrent(value.request, { activeDraftId: otherDraftId, draft: original })).toBe(false)
  expect(isPreSessionImageRequestCurrent(value.request, { activeDraftId: draftId, draft: undefined })).toBe(false)
  expect(containsPreSessionDraftImages(value.request, { ...original, revision: 6 })).toBe(false)
  expect(containsPreSessionDraftImages(value.request, { ...original, draftId: otherDraftId })).toBe(false)
  expect(
    containsPreSessionDraftImages(value.request, { ...original, attachments: original.attachments.slice(1) }),
  ).toBe(false)
  expect(
    containsPreSessionDraftImages(value.request, {
      ...original,
      attachments: [{ kind: 'image', artifact: artifact('b') }, secondAttachment],
    }),
  ).toBe(false)
  expect(
    containsPreSessionDraftImages(value.request, {
      ...original,
      attachments: [{ kind: 'image', artifact: { ...artifact(), name: 'renamed.png' } }, secondAttachment],
    }),
  ).toBe(false)
  expect(
    containsPreSessionDraftImages(
      { ...value.request, source: { kind: 'pre-session-draft', draftId, draftRevision: 8 } },
      original,
    ),
  ).toBe(false)
})

test('pre-session collections are owner/Host isolated, nullable when empty, and reject malformed input', () => {
  const first = project()
  const otherHost = present(projectPreSessionDraftImages({ hostIdentity: 'confirmed-host-b', draft: draft() }))
  const otherDraft = present(projectPreSessionDraftImages({ hostIdentity, draft: draft(undefined, 7, otherDraftId) }))

  expect(new Set([first.sourceId, otherHost.sourceId, otherDraft.sourceId]).size).toBe(3)
  expect(projectPreSessionDraftImages({ hostIdentity, draft: draft([]) })).toBeNull()
  expect(() => projectPreSessionDraftImages({ hostIdentity, draft: draft(undefined, -1) })).toThrow(CommandError)
  expect(() => projectPreSessionDraftImages({ hostIdentity, draft: draft(undefined, 1, 'not-a-uuid') })).toThrow(
    CommandError,
  )
  expect(() => projectPreSessionDraftImages({ hostIdentity: ' ', draft: draft() })).toThrow(CommandError)
  expect(() => projectPreSessionDraftImages({ hostIdentity, draft: draft(), activeOrdinal: 1 })).toThrow(CommandError)
  expect(() =>
    projectPreSessionDraftImages({
      hostIdentity,
      draft: draft([{ kind: 'image', artifact: { ...artifact(), id: 'not-a-hash' } }]),
    }),
  ).toThrow(CommandError)
})

test('image viewer accepts a pre-session source and still revalidates its canonical owner', async () => {
  const initialDraft = draft()
  let currentDraft: PreSessionImageDraft | null = initialDraft
  let released = 0
  const viewer = createImageViewer({
    isCurrent: (request) =>
      isPreSessionImageRequestCurrent(request, { activeDraftId: currentDraft?.draftId ?? null, draft: currentDraft }),
    resources: {
      acquire: () =>
        Promise.resolve({
          url: 'blob:https://fixture.invalid/pre-session-image',
          width: 4,
          height: 4,
          release: () => {
            released++
          },
        }),
    },
  })

  viewer.open(project(initialDraft).request)
  await Promise.resolve()
  await Promise.resolve()
  expect(viewer.reader.getSnapshot().status).toBe('ready')
  currentDraft = { ...initialDraft, revision: 8 }
  viewer.revalidate()
  expect(viewer.reader.getSnapshot().status).toBe('ready')
  currentDraft = { ...initialDraft, revision: 9, attachments: [] }
  viewer.revalidate()
  expect(viewer.reader.getSnapshot().status).toBe('closed')
  expect(released).toBe(1)
  viewer.dispose()
  expect(released).toBe(1)
})

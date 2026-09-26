import { expect, test } from 'bun:test'
import { StrictMode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider } from '@hbar/app-react'
import {
  HbarSessionImagesModelProvider,
  createSessionImagesModelScope,
  useSessionImageGallery,
  useSessionImageThumbnails,
} from '../packages/app-react/src/session-images-model'
import { sessionImagesFixture } from './fixtures/session-images-model-fixture'

const turn = () => Bun.sleep(0)
test('render/SSR abandonment creates no subscriptions, resource reads or URLs', () => {
  const fixture = sessionImagesFixture()
  const projection = fixture.project()
  function Probe() {
    const gallery = useSessionImageGallery()
    const thumbnails = useSessionImageThumbnails(projection, { visible: true })
    return (
      <output>
        {gallery.state.status}:{thumbnails.state.items.length}
      </output>
    )
  }
  const markup = renderToStaticMarkup(
    <StrictMode>
      <HbarRuntimeProvider view={fixture.view}>
        <HbarSessionImagesModelProvider resources={fixture.resources} hostIdentity="host">
          <Probe />
        </HbarSessionImagesModelProvider>
      </HbarRuntimeProvider>
    </StrictMode>,
  )
  expect(markup).toContain('closed:0')
  expect(fixture.counts()).toMatchObject({ calls: 0, live: 0, subscriptions: 0 })
  fixture.runtime.dispose()
})

test('retain/release effect replay survives microtask disposal; final unmount permanently disposes and blocks late actions', async () => {
  const fixture = sessionImagesFixture()
  const scope = createSessionImagesModelScope(fixture.view, fixture.resources, 'host')
  const projection = fixture.project()
  expect(scope.open(projection, projection.request.activeKey)).toBe(false)
  const release = scope.retain()
  expect(fixture.counts().subscriptions).toBe(3)
  release()
  const replayRelease = scope.retain()
  await turn()
  expect(scope.open(projection, projection.request.activeKey)).toBe(true)
  await turn()
  expect(scope.reader.getSnapshot().status).toBe('ready')
  replayRelease()
  expect(scope.open(projection, projection.request.activeKey)).toBe(false)
  await turn()
  expect(fixture.counts()).toMatchObject({ live: 0, subscriptions: 0 })
  const impossible = scope.retain()
  expect(scope.open(projection, projection.request.activeKey)).toBe(false)
  impossible()
  fixture.runtime.dispose()
})

test('visible collection retains canonical text edits, removes resources and is paused synchronously before gallery reads', async () => {
  const fixture = sessionImagesFixture()
  const scope = createSessionImagesModelScope(fixture.view, fixture.resources, 'host')
  const release = scope.retain()
  const inline = scope.createThumbnails()
  const off = inline.retain()
  inline.update(fixture.project(), false, false)
  expect(fixture.calls).toHaveLength(0)
  inline.update(fixture.project(), true, false)
  await turn()
  expect(fixture.counts().live).toBe(2)
  fixture.drafts.set({ 'session-a': { ...fixture.drafts.get()['session-a'], revision: 2, text: 'Changed only text' } })
  expect(fixture.calls).toHaveLength(2)
  fixture.drafts.set({
    'session-a': {
      ...fixture.drafts.get()['session-a'],
      revision: 3,
      attachments: fixture.drafts.get()['session-a'].attachments.slice(0, 1),
    },
  })
  expect(fixture.counts().live).toBe(1)
  expect(fixture.calls).toHaveLength(2)
  const target = fixture.project()
  scope.open(target, target.request.activeKey)
  expect(fixture.leases.slice(0, 2).every((lease) => lease.releases === 1)).toBe(true)
  const galleryThumbs = scope.createThumbnails()
  const offGallery = galleryThumbs.retain()
  galleryThumbs.update(scope.getProjection(), true, true)
  await turn()
  expect(fixture.counts().live).toBe(2)
  expect(inline.reader.getSnapshot().active).toBe(false)
  expect(galleryThumbs.reader.getSnapshot().active).toBe(true)
  scope.close()
  await turn()
  expect(galleryThumbs.reader.getSnapshot().active).toBe(false)
  expect(inline.reader.getSnapshot().items[0]?.status).toBe('ready')
  offGallery()
  off()
  release()
  await turn()
  expect(fixture.counts()).toMatchObject({ live: 0, subscriptions: 0 })
  fixture.runtime.dispose()
})

test('navigation and canonical source loss invalidate immediately without archive/run preparation gates', async () => {
  const fixture = sessionImagesFixture(false)
  const scope = createSessionImagesModelScope(fixture.view, fixture.resources, 'host')
  const release = scope.retain()
  const target = fixture.project()
  scope.open(target, target.request.activeKey)
  fixture.navigation.set({ ...fixture.navigation.get(), sessionId: 'session-b' })
  expect(scope.reader.getSnapshot().status).toBe('closed')
  expect(fixture.calls[0]?.signal.aborted).toBe(true)
  const late = fixture.settle(0)
  await turn()
  expect(late.releases).toBe(1)
  fixture.navigation.set({ ...fixture.navigation.get(), sessionId: 'session-a' })
  scope.open(target, target.request.activeKey)
  fixture.settle(1)
  await turn()
  fixture.drafts.set({ 'session-a': { ...fixture.drafts.get()['session-a'], revision: 2, attachments: [] } })
  expect(scope.reader.getSnapshot().status).toBe('closed')
  expect(fixture.counts().live).toBe(0)
  release()
  await turn()
  fixture.runtime.dispose()
})

test('missing capability/Host and over-capacity targets cannot manufacture an open viewer', async () => {
  const fixture = sessionImagesFixture()
  for (const [resources, host] of [
    [undefined, 'host'],
    [fixture.resources, null],
  ] as const) {
    const scope = createSessionImagesModelScope(fixture.view, resources, host)
    const release = scope.retain()
    expect(scope.available).toBe(false)
    expect(scope.open(fixture.project(), fixture.project().request.activeKey)).toBe(false)
    expect(scope.reader.getSnapshot().status).toBe('closed')
    release()
    await turn()
  }
  const scope = createSessionImagesModelScope(fixture.view, fixture.resources, 'host')
  const release = scope.retain()
  const target = fixture.project()
  expect(scope.open({ ...target, capacity: { count: 13, limit: 12, exceeded: true } }, target.request.activeKey)).toBe(
    false,
  )
  expect(fixture.calls).toHaveLength(0)
  release()
  await turn()
  fixture.runtime.dispose()
})

test('thumbnail StrictMode replay retains the owner, deactivated/disposed late results only release', async () => {
  const fixture = sessionImagesFixture(false)
  const scope = createSessionImagesModelScope(fixture.view, fixture.resources, 'host')
  const releaseScope = scope.retain()
  const thumbnail = scope.createThumbnails()
  const release = thumbnail.retain()
  thumbnail.update(fixture.project(), true, false)
  release()
  const replay = thumbnail.retain()
  thumbnail.update(fixture.project(), true, false)
  await turn()
  expect(fixture.calls).toHaveLength(1)
  fixture.settle(0)
  await turn()
  expect(fixture.calls).toHaveLength(2)
  replay()
  releaseScope()
  const late = fixture.settle(1)
  await turn()
  expect(late.releases).toBe(1)
  expect(fixture.counts()).toMatchObject({ live: 0, subscriptions: 0 })
  fixture.runtime.dispose()
})

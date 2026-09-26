import { createBrowserImageResources } from '../../../apps/web/src/browser-image-resources'
import type { ImageResourceLease } from '@hbar/app-runtime'
import { imageResourceFixtures } from '../../../tests/fixtures/image-resource-fixtures'

// This fixture exercises the real bundled Worker/Blob/bitmap adapter without a Host,
// credentials, model execution, or claiming to be the product gallery.
const nativeCreate = URL.createObjectURL.bind(URL)
const nativeRevoke = URL.revokeObjectURL.bind(URL)
const nativeWorker = globalThis.Worker
const counters = { created: 0, revoked: 0, workers: 0, terminated: 0, liveWorkers: 0, maxWorkers: 0, reads: 0 }
URL.createObjectURL = (blob) => {
  counters.created++
  return nativeCreate(blob)
}
URL.revokeObjectURL = (url) => {
  counters.revoked++
  nativeRevoke(url)
}
globalThis.Worker = class extends nativeWorker {
  private stopped = false
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options)
    counters.workers++
    counters.liveWorkers++
    counters.maxWorkers = Math.max(counters.maxWorkers, counters.liveWorkers)
  }
  override terminate(): void {
    if (!this.stopped) {
      this.stopped = true
      counters.terminated++
      counters.liveWorkers--
    }
    super.terminate()
  }
}
let currentBytes = new Uint8Array()
let currentMime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' = 'image/png'
let pendingWorkerAbort: AbortController | undefined
const resources = createBrowserImageResources({
  async readImageArtifact(ref) {
    counters.reads++
    return { artifactId: ref.id, mime: currentMime, bytes: currentBytes }
  },
})
let lease: ImageResourceLease | undefined
const preview = document.querySelector<HTMLImageElement>('#preview')!
const close = (): void => {
  preview.removeAttribute('src')
  lease?.release()
  lease = undefined
}

const probe = {
  cases: imageResourceFixtures.map(({ name, frames }) => ({ name, frames })),
  async open(name: string, purpose: 'full' | 'thumbnail' = 'full') {
    close()
    const fixture = imageResourceFixtures.find((entry) => entry.name === name)
    if (!fixture) throw new Error('Missing test image')
    currentBytes = Uint8Array.from(atob(fixture.base64), (character) => character.charCodeAt(0))
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(fixture.mime))
      throw new Error('Bad fixture MIME')
    currentMime = fixture.mime as typeof currentMime
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', currentBytes))
    const id = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const abort = pendingWorkerAbort ?? new AbortController()
    pendingWorkerAbort = undefined
    lease = await resources.acquire(
      { id, name, mime: currentMime, size: currentBytes.length },
      { purpose, signal: abort.signal },
    )
    preview.src = lease.url
    await preview.decode()
    return {
      width: lease.width,
      height: lease.height,
      naturalWidth: preview.naturalWidth,
      naturalHeight: preview.naturalHeight,
    }
  },
  async cancelWorker() {
    const before = counters.workers
    const abort = new AbortController()
    pendingWorkerAbort = abort
    // Register an ordinary rejection observer before scheduling abort.
    const result = probe.open('apng').then(
      () => 'UNEXPECTED_SUCCESS',
      (error: unknown) => (error && typeof error === 'object' && 'code' in error ? String(error.code) : 'ERROR'),
    )
    for (let count = 0; counters.workers === before && count < 100; count += 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    abort.abort()
    return { code: await result, started: counters.workers > before }
  },
  close,
  finish() {
    close()
    resources.dispose()
    return { ...counters }
  },
}

declare global {
  interface Window {
    imageResourceProbe: typeof probe
  }
}
window.imageResourceProbe = probe

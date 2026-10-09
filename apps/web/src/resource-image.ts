import { HbarError } from '@hbar/contracts'
import { preflightImage } from './image-preflight'

/** Terminate decoding on cancellation; don't publish a URL before validation. */
export async function acquireResourceImage(blob: Blob, signal: AbortSignal): Promise<{ url: string; release(): void }> {
  signal.throwIfAborted()
  if (blob.type === 'image/svg+xml') {
    const document = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml')
    const svg = document.documentElement
    if (svg.localName !== 'svg' || document.querySelector('parsererror, script, foreignObject'))
      throw new HbarError('UNSUPPORTED_IMAGE', 'Invalid SVG image')
    const box = svg
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number)
    const width = Number.parseFloat(svg.getAttribute('width') ?? '') || box?.[2] || 300
    const height = Number.parseFloat(svg.getAttribute('height') ?? '') || box?.[3] || 150
    if (width > 16384 || height > 16384 || width * height > 32_000_000)
      throw new HbarError('TOO_LARGE', 'SVG exceeds image dimensions')
    const url = URL.createObjectURL(blob)
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        let done = false
        const finish = (error?: Error) => {
          if (done) return
          done = true
          clearTimeout(deadline)
          signal.removeEventListener('abort', abort)
          image.onload = null
          image.onerror = null
          image.src = ''
          if (error) reject(error)
          else resolve()
        }
        const abort = () => finish(new HbarError('CANCELLED', 'SVG loading cancelled'))
        const deadline = setTimeout(() => finish(new HbarError('TIMEOUT', 'SVG loading timed out')), 10_000)
        image.onload = () =>
          finish(
            image.naturalWidth <= 16384 &&
              image.naturalHeight <= 16384 &&
              image.naturalWidth * image.naturalHeight <= 32_000_000
              ? undefined
              : new HbarError('TOO_LARGE', 'SVG exceeds image dimensions'),
          )
        image.onerror = () => finish(new HbarError('DECODE_FAILED', 'SVG could not be decoded'))
        signal.addEventListener('abort', abort, { once: true })
        image.src = url
        if (signal.aborted) abort()
      })
      signal.throwIfAborted()
      return { url, release: () => URL.revokeObjectURL(url) }
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
  }
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type))
    preflightImage(new Uint8Array(await blob.arrayBuffer()), blob.type)
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./resource-image-worker.ts', import.meta.url), { type: 'module' })
    const timeout = setTimeout(() => finish(new HbarError('TIMEOUT', 'Image decoding timed out')), 10_000)
    let done = false
    const finish = (error?: Error) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      worker.terminate()
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(new HbarError('CANCELLED', 'Image decoding cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const result = event.data
      if (!result || typeof result !== 'object' || !('ok' in result))
        return finish(new HbarError('DECODE_FAILED', 'Invalid image decoder result'))
      finish(
        result.ok === true
          ? undefined
          : new HbarError(
              'code' in result && typeof result.code === 'string' ? result.code : 'DECODE_FAILED',
              'Image decoding failed',
            ),
      )
    }
    worker.onerror = () => finish(new HbarError('DECODE_FAILED', 'Image decoding failed'))
    worker.onmessageerror = () => finish(new HbarError('DECODE_FAILED', 'Image decoding failed'))
    worker.postMessage({ blob })
  })
  signal.throwIfAborted()
  const url = URL.createObjectURL(blob)
  return { url, release: () => URL.revokeObjectURL(url) }
}

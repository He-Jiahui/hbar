import type { ImagePreflight } from './image-preflight'

export interface ImageDecodeRequest {
  readonly blob: Blob
  readonly metadata: ImagePreflight
  readonly purpose: 'full' | 'thumbnail'
  readonly thumbnailEdge: number
}

export type ImageDecodeResponse =
  | { readonly ok: true; readonly width: number; readonly height: number; readonly thumbnail?: Blob }
  | { readonly ok: false; readonly code: 'DECODE_FAILED' | 'UNAVAILABLE' | 'CONTENT_MISMATCH' }

/** This worker receives only authenticated, preflight-checked bytes from its owning browser adapter. */
async function decode(request: ImageDecodeRequest): Promise<ImageDecodeResponse> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function')
    return { ok: false, code: 'UNAVAILABLE' }
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(request.blob)
    const { width, height } = bitmap
    const expected = request.metadata
    // EXIF orientation can exchange width and height without changing the encoded pixel budget.
    if (!(
      (width === expected.width && height === expected.height) ||
      (width === expected.height && height === expected.width)
    ))
      return { ok: false, code: 'CONTENT_MISMATCH' }
    if (request.purpose === 'full') return { ok: true, width, height }
    const scale = Math.min(1, request.thumbnailEdge / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const canvas = new OffscreenCanvas(targetWidth, targetHeight)
    const context = canvas.getContext('2d')
    if (!context) return { ok: false, code: 'UNAVAILABLE' }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    const thumbnail = await canvas.convertToBlob({ type: 'image/png' })
    return { ok: true, width: targetWidth, height: targetHeight, thumbnail }
  } catch {
    return { ok: false, code: 'DECODE_FAILED' }
  } finally {
    bitmap?.close()
  }
}

// A dedicated worker, terminated by its owner on completion, timeout or cancellation.
globalThis.addEventListener('message', (event: MessageEvent<ImageDecodeRequest>) => {
  decode(event.data)
    .then((response) => globalThis.postMessage(response))
    .catch(() => globalThis.postMessage({ ok: false, code: 'DECODE_FAILED' } satisfies ImageDecodeResponse))
})

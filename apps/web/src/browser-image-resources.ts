import { HbarError, type ArtifactRef } from '@hbar/contracts'
import type { ImageArtifactBytes } from '@hbar/client'
import type { ImageDecodeRequest, ImageDecodeResponse } from './image-decode-worker'
import {
  createImageResourceController,
  IMAGE_THUMBNAIL_EDGE,
  type BrowserImageResources,
  type DecodedImageResource,
  type ImageResourceEnvironment,
} from './image-resource-controller'

export interface ImageArtifactReader {
  readImageArtifact(ref: ArtifactRef, options: { signal: AbortSignal }): Promise<ImageArtifactBytes>
}

/** A terminable decode scope, not a Promise.race around an uncancellable main-thread decoder. */
const decodeInWorker: ImageResourceEnvironment['decode'] = (blob, metadata, purpose, signal) =>
  new Promise<DecodedImageResource>((resolve, reject) => {
    if (signal.aborted) {
      reject(new HbarError('CANCELLED', 'Image decoding was cancelled'))
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./image-decode-worker.ts', import.meta.url), { type: 'module' })
    } catch {
      reject(new HbarError('UNAVAILABLE', 'Image decoding is unavailable'))
      return
    }
    let finished = false
    const finish = (action: () => void): void => {
      if (finished) return
      finished = true
      signal.removeEventListener('abort', cancel)
      worker.terminate()
      action()
    }
    const cancel = (): void => finish(() => reject(new HbarError('CANCELLED', 'Image decoding was cancelled')))
    signal.addEventListener('abort', cancel, { once: true })
    worker.onerror = () => finish(() => reject(new HbarError('DECODE_FAILED', 'Image decoding failed')))
    worker.onmessageerror = () => finish(() => reject(new HbarError('DECODE_FAILED', 'Image decoding failed')))
    worker.onmessage = (event: MessageEvent<ImageDecodeResponse>) => {
      finish(() => {
        if (event.data.ok) resolve(event.data)
        else reject(new HbarError(event.data.code, 'Image decoding failed'))
      })
    }
    try {
      worker.postMessage({ blob, metadata, purpose, thumbnailEdge: IMAGE_THUMBNAIL_EDGE } satisfies ImageDecodeRequest)
    } catch {
      finish(() => reject(new HbarError('DECODE_FAILED', 'Image decoding failed')))
    }
  })

export function createBrowserImageResources(reader: ImageArtifactReader): BrowserImageResources {
  return createImageResourceController({
    readImageArtifact: (ref, options) => reader.readImageArtifact(ref, options),
    decode: decodeInWorker,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    now: () => performance.now(),
    setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer: (timer) => {
      if (typeof timer === 'number') clearTimeout(timer)
    },
  })
}

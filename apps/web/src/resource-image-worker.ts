interface ImageRequest {
  blob: Blob
}
self.onmessage = (event: MessageEvent<ImageRequest>) => {
  void createImageBitmap(event.data.blob).then(
    (bitmap) => {
      const allowed =
        bitmap.width > 0 &&
        bitmap.height > 0 &&
        bitmap.width <= 16384 &&
        bitmap.height <= 16384 &&
        bitmap.width * bitmap.height <= 32_000_000
      bitmap.close()
      self.postMessage({ ok: allowed, code: allowed ? null : 'TOO_LARGE' })
    },
    () => self.postMessage({ ok: false, code: 'DECODE_FAILED' }),
  )
}

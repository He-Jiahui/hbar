import { expect, test } from 'bun:test'
import { preflightResourceImage } from '../apps/web/src/resource-image-preflight'
import { acquireResourceImage } from '../apps/web/src/resource-image'
import { imageResourceFixtures } from './fixtures/image-resource-fixtures'
import { resourceImageFixtures } from './fixtures/resource-image-fixtures'

test('resource admission accepts native raster dimensions for every supported format', () => {
  for (const fixture of [...imageResourceFixtures, ...resourceImageFixtures])
    expect(() =>
      preflightResourceImage(new Uint8Array(Buffer.from(fixture.base64, 'base64')), fixture.mime),
    ).not.toThrow()
})
test('BMP and AVIF reject oversized canvas metadata before invoking a raster decoder', () => {
  for (const name of ['bmp', 'avif']) {
    const fixture = resourceImageFixtures.find((item) => item.name === name)!
    const bytes = new Uint8Array(Buffer.from(fixture.base64, 'base64'))
    const view = new DataView(bytes.buffer)
    const offset = name === 'bmp' ? 18 : Buffer.from(bytes).indexOf('ispe') + 8
    view.setUint32(offset, 50_000, name === 'bmp')
    let error: unknown
    try {
      preflightResourceImage(bytes, fixture.mime)
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({ code: 'TOO_LARGE' })
  }
})
test('ICO admission validates every embedded PNG and rejects a forged size or directory count', () => {
  const fixture = resourceImageFixtures.find((item) => item.name === 'ico')!
  const bytes = new Uint8Array(Buffer.from(fixture.base64, 'base64'))
  bytes[6] = 8
  expect(() => preflightResourceImage(bytes, fixture.mime)).toThrow()
  bytes[6] = 4
  new DataView(bytes.buffer).setUint16(4, 257, true)
  let error: unknown
  try {
    preflightResourceImage(bytes, fixture.mime)
  } catch (caught) {
    error = caught
  }
  expect(error).toMatchObject({ code: 'TOO_LARGE' })
})
test('truncated metadata and mismatched declared formats are rejected', () => {
  for (const fixture of resourceImageFixtures) {
    const bytes = new Uint8Array(Buffer.from(fixture.base64, 'base64'))
    expect(() => preflightResourceImage(bytes.slice(0, 14), fixture.mime)).toThrow()
    expect(() => preflightResourceImage(bytes, 'image/png')).toThrow()
  }
})
test('cancellation during an asynchronous Blob read rejects before starting a decoder or creating a URL', async () => {
  const read = Promise.withResolvers<ArrayBuffer>()
  class PendingBlob extends Blob {
    override arrayBuffer() {
      return read.promise
    }
  }
  const controller = new AbortController()
  const opening = acquireResourceImage(new PendingBlob([], { type: 'image/png' }), controller.signal)
  controller.abort()
  read.resolve(new ArrayBuffer(0))
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
})

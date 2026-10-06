import { expect, test } from 'bun:test'
import type { ArtifactRef } from '@hbar/contracts'
import { persistToolResultImages } from '../packages/kernel/src/tool-result-images'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DYkAAAAASUVORK5CYII='
const picture = { type: 'image' as const, data: png, mimeType: 'image/png' }
const result = (count: number) => ({
  text: 'Original tool output',
  content: Array.from({ length: count }, () => picture),
})

test('empty, single and twelve-image tool outputs preserve occurrences with only sequential artifact writes', async () => {
  for (const count of [0, 1, 12]) {
    const writes: { name: string; mime: string; bytes: Uint8Array }[] = []
    let active = 0
    let maximum = 0
    const refs = await persistToolResultImages(
      'computer_screenshot',
      result(count),
      async (name, mime, bytes) => {
        active++
        maximum = Math.max(maximum, active)
        await Bun.sleep(0)
        writes.push({ name, mime, bytes })
        active--
        return { id: 'a'.repeat(64), name, mime, size: bytes.length }
      },
      new AbortController().signal,
    )
    expect(writes).toHaveLength(count)
    expect(refs).toHaveLength(count)
    expect(maximum).toBe(count ? 1 : 0)
    expect(new Set(refs.map((ref) => ref.name)).size).toBe(count)
    for (const write of writes) expect(Buffer.from(write.bytes).toString('base64')).toBe(png)
  }
})

test('thirteenth image, invalid base64, unsupported format and oversized data fail without writes', async () => {
  let writes = 0
  const upload = async (): Promise<ArtifactRef> => {
    writes++
    throw new Error('Unexpected upload')
  }
  const signal = new AbortController().signal
  await expect(persistToolResultImages('test', result(13), upload, signal)).rejects.toMatchObject({
    code: 'IMAGE_LIMIT',
  })
  for (const data of ['?', 'A', 'Zh=='])
    await expect(
      persistToolResultImages('test', { text: '', content: [{ ...picture, data }] }, upload, signal),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  await expect(
    persistToolResultImages('test', { text: '', content: [{ ...picture, mimeType: 'image/svg+xml' }] }, upload, signal),
  ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' })
  await expect(
    persistToolResultImages(
      'test',
      { text: '', content: [{ ...picture, data: 'A'.repeat(14_000_000) }] },
      upload,
      signal,
    ),
  ).rejects.toMatchObject({ code: 'FILE_LIMIT' })
  expect(writes).toBe(0)
})

test('cancelled and failed writes cannot continue to later images', async () => {
  const controller = new AbortController()
  const reason = new Error('Stop original tool')
  let writes = 0
  await expect(
    persistToolResultImages(
      'test',
      result(3),
      async (name, mime, bytes) => {
        writes++
        controller.abort(reason)
        return { id: 'a'.repeat(64), name, mime, size: bytes.length }
      },
      controller.signal,
    ),
  ).rejects.toBe(reason)
  expect(writes).toBe(1)
  writes = 0
  await expect(
    persistToolResultImages(
      'test',
      result(3),
      async () => {
        writes++
        throw reason
      },
      new AbortController().signal,
    ),
  ).rejects.toBe(reason)
  expect(writes).toBe(1)
})

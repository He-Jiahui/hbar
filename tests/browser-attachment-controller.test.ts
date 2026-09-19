import { expect, test } from 'bun:test'
import { createBrowserAttachmentController } from '@hbar/client'

test('browser attachment sources are bounded, opaque and expire before upload', async () => {
  let timestamp = 1_000
  let expectedId = ''
  const controller = createBrowserAttachmentController(
    {
      async upload(file) {
        return { id: expectedId, name: file.name, mime: file.type, size: file.size }
      },
    },
    { maxSources: 1, maxBytes: 1024, sourceTtlMs: 10, now: () => timestamp },
  )
  try {
    const selected = await controller.prepare(new File(['image'], 'selected.png', { type: 'image/png' }))
    expectedId = selected.upload.sha256
    expect(selected.kind).toBe('image')
    expect(selected.upload.sourceId).not.toContain('selected.png')
    await expect(controller.prepare(new File(['next'], 'next.txt', { type: 'text/plain' }))).rejects.toMatchObject({
      code: 'BUSY',
    })
    const artifact = await controller.commands.execute('attachment.upload', selected.upload)
    expect(artifact).toMatchObject({ id: selected.upload.sha256, name: 'selected.png' })
    selected.release()

    const expired = await controller.prepare(new File(['later'], 'later.txt', { type: 'text/plain' }))
    timestamp += 11
    await expect(controller.commands.execute('attachment.upload', expired.upload)).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
    })
  } finally {
    controller.dispose()
  }
})

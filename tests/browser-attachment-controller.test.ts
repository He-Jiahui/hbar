import { expect, test } from 'bun:test'
import { createBrowserAttachmentController } from '@hbar/client'
import { HbarError } from '@hbar/contracts'

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

test('attachment command boundary preserves typed Host rejection and uncertain results without trusting arbitrary errors', async () => {
  for (const [failure, expected] of [
    [new HbarError('UNSUPPORTED_TYPE', 'Host rejected the file'), 'UNSUPPORTED_TYPE'],
    [new HbarError('CONNECTION_CLOSED', 'Response lost'), 'CONNECTION_CLOSED'],
    [new Error('Unknown transport failure'), 'EXECUTION_FAILED'],
  ] as const) {
    const controller = createBrowserAttachmentController({
      async upload() {
        throw failure
      },
    })
    try {
      const selection = await controller.prepare(new File(['data'], 'notes.txt', { type: 'text/plain' }))
      await expect(controller.commands.execute('attachment.upload', selection.upload)).rejects.toMatchObject({
        code: expected,
      })
      selection.release()
    } finally {
      controller.dispose()
    }
  }
})

import { expect, test } from 'bun:test'
import { createAppRuntime, projectPreSessionDraftImages, type ImageResourcePort } from '@hbar/app-runtime'
import { attachmentUploadInputSchema } from '@hbar/contracts/commands/files'
import { createSessionImagesModelScope } from '../packages/app-react/src/session-images-model'

test('no-tab photos reuse resources across text edits, open the gallery, and release on canonical removal', async () => {
  const runtime = createAppRuntime({
    instanceId: 'pre-session-images',
    hostId: 'host',
    directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
    attachments: {
      async execute(_name, raw) {
        const upload = attachmentUploadInputSchema.parse(raw)
        return { id: upload.sha256, name: upload.name, mime: upload.mime, size: upload.size }
      },
    },
  })
  const draft = await runtime.view.commands.execute('preSessionDraft.open', {})
  const reserved = await runtime.view.commands.execute('preSessionDraft.reserveAttachments', {
    draftId: draft.draftId,
    expectedRevision: draft.revision,
    files: [{ name: 'reference.png', mime: 'image/png', size: 4 }],
  })
  const reservation = reserved.reservations[0]!
  await runtime.view.commands.execute('preSessionDraft.uploadAttachment', {
    draftId: draft.draftId,
    reservationId: reservation.reservationId,
    ownerRevision: reservation.ownerRevision,
    kind: 'image',
    upload: { sourceId: 'browser-file', sha256: 'a'.repeat(64), name: 'reference.png', mime: 'image/png', size: 4 },
  })
  const leases: { purpose: 'thumbnail' | 'full'; releases: number }[] = []
  const resources: ImageResourcePort = {
    async acquire(_ref, options) {
      const lease = { purpose: options.purpose, releases: 0 }
      leases.push(lease)
      return {
        url: `blob:https://fixture/${leases.length}`,
        width: 64,
        height: 32,
        release: () => {
          lease.releases++
        },
      }
    },
  }
  const scope = createSessionImagesModelScope(runtime.view, resources, 'host', draft.draftId)
  const release = scope.retain()
  const thumbnails = scope.createThumbnails()
  const releaseThumbnails = thumbnails.retain()
  const current = () => runtime.view.state.preSessionDrafts.getSnapshot()[draft.draftId]!
  const project = () => projectPreSessionDraftImages({ hostIdentity: 'host', draft: current() })!
  try {
    thumbnails.update(project(), true, false)
    await Bun.sleep(0)
    expect(thumbnails.reader.getSnapshot().items[0]?.status).toBe('ready')
    expect(leases).toHaveLength(1)
    await runtime.view.commands.execute('preSessionDraft.setText', {
      draftId: draft.draftId,
      expectedRevision: current().revision,
      text: 'Keep the photo while typing',
    })
    expect(leases).toHaveLength(1)
    expect(scope.open(project(), project().request.activeKey)).toBe(true)
    await Bun.sleep(0)
    expect(scope.reader.getSnapshot().status).toBe('ready')
    expect(leases[0]?.releases).toBe(1)
    expect(leases[1]?.purpose).toBe('full')
    await runtime.view.commands.execute('preSessionDraft.removeAttachment', {
      draftId: draft.draftId,
      expectedRevision: current().revision,
      kind: 'image',
      artifactId: 'a'.repeat(64),
    })
    expect(scope.reader.getSnapshot().status).toBe('closed')
    expect(leases.every((lease) => lease.releases === 1)).toBe(true)
    expect(current().text).toBe('Keep the photo while typing')
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
    expect(runtime.view.state.workspaceTabs.getSnapshot().items).toEqual([])
  } finally {
    releaseThumbnails()
    release()
    await Bun.sleep(0)
    runtime.dispose()
  }
})

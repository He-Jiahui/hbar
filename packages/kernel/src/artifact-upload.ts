import { createHash } from 'node:crypto'
import { lstat, open, link, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { ChatDatabaseUploadOwner } from '@hbar/contracts/commands/chat-database'
import type { StoragePort } from '@hbar/storage'

const recoveries = new WeakMap<StoragePort, Promise<void>>()
/** Restore per-hash metadata revisions before a new upload can allocate its completion proof. */
export function recoverArtifactReferenceIndex(storage: StoragePort): Promise<void> {
  const existing = recoveries.get(storage)
  if (existing) return existing
  const task = (async () => {
    let batch = await storage.call('chatDatabaseDraftBackfill', 100)
    while (!batch.done) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      batch = await storage.call('chatDatabaseDraftBackfill', 100)
    }
    if (!batch.healthy)
      throw new HbarError('REFERENCE_INCOMPLETE', 'Attachment reference records need recovery before uploading')
  })().finally(() => {
    if (recoveries.get(storage) === task) recoveries.delete(storage)
  })
  recoveries.set(storage, task)
  return task
}

export interface ArtifactUploadOptions {
  readonly actorId: string
  readonly owner?: ChatDatabaseUploadOwner
  readonly sha256?: string
}
const codeIs = (reason: unknown, code: string) => reason instanceof Error && 'code' in reason && reason.code === code

/** Publish only complete, fsynced bytes under the content hash. An existing partial write is repaired. */
export async function writeArtifactAtomically(root: string, id: string, bytes: Uint8Array): Promise<void> {
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new HbarError('PATH_REDIRECTED', 'Attachment root is redirected')
  const target = join(root, id)
  const verifyRoot = async () => {
    const current = await lstat(root)
    if (current.isSymbolicLink() || current.dev !== rootInfo.dev || current.ino !== rootInfo.ino)
      throw new HbarError('PATH_REDIRECTED', 'Attachment root changed during upload')
  }
  const validExisting = async (): Promise<boolean> => {
    await verifyRoot()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let info: Awaited<ReturnType<typeof lstat>>
      try {
        info = await lstat(target)
      } catch (reason) {
        if (codeIs(reason, 'ENOENT')) return false
        throw reason
      }
      if (!info.isFile() || info.isSymbolicLink())
        throw new HbarError('PATH_REDIRECTED', 'Attachment path is redirected')
      if (info.size !== bytes.length) return false
      const existing = await open(target, 'r')
      let replaced: boolean
      try {
        const opened = await existing.stat()
        replaced = opened.dev !== info.dev || opened.ino !== info.ino
        if (!replaced) {
          return (
            createHash('sha256')
              .update(await existing.readFile())
              .digest('hex') === id
          )
        }
      } finally {
        await existing.close()
      }
      if (replaced) await verifyRoot()
    }
    throw new HbarError('PATH_REDIRECTED', 'Attachment path changed during upload')
  }
  if (await validExisting()) return
  const temporary = join(root, `.upload-${id}-${crypto.randomUUID()}.pending`)
  let created = false
  try {
    await verifyRoot()
    const handle = await open(temporary, 'wx', 0o600)
    created = true
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await verifyRoot()
    try {
      await link(temporary, target)
    } catch (reason) {
      if (!codeIs(reason, 'EEXIST')) throw reason
      if (!(await validExisting())) {
        await verifyRoot()
        try {
          await rename(temporary, target)
          created = false
        } catch (reason) {
          if (!codeIs(reason, 'EPERM') && !codeIs(reason, 'EACCES')) throw reason
          if (!(await validExisting())) throw reason
        }
      }
    }
  } finally {
    if (created) {
      await verifyRoot()
      await unlink(temporary).catch((reason: unknown) => {
        if (!codeIs(reason, 'ENOENT')) throw reason
      })
    }
  }
}

import { createHash } from 'node:crypto'
import { lstat, open, link, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { ChatDatabaseUploadOwner } from '@hbar/contracts/commands/chat-database'

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
    try {
      const info = await lstat(target)
      if (!info.isFile() || info.isSymbolicLink())
        throw new HbarError('PATH_REDIRECTED', 'Attachment path is redirected')
      if (info.size !== bytes.length) return false
      const existing = await open(target, 'r')
      try {
        const opened = await existing.stat()
        if (opened.dev !== info.dev || opened.ino !== info.ino)
          throw new HbarError('PATH_REDIRECTED', 'Attachment path changed during upload')
        return (
          createHash('sha256')
            .update(await existing.readFile())
            .digest('hex') === id
        )
      } finally {
        await existing.close()
      }
    } catch (reason) {
      if (codeIs(reason, 'ENOENT')) return false
      throw reason
    }
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
        await rename(temporary, target)
        created = false
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

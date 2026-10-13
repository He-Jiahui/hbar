import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'

const ownerSchema = z.object({ pid: z.number().int().positive(), lease: z.string().optional() })
function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (hasCode(error, 'ESRCH')) return false
    // EPERM is evidence of an existing owner, not permission to replace its lock.
    if (hasCode(error, 'EPERM')) return true
    throw error
  }
}

export async function acquireProcessLease(path: string): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true })
  // Windows releases this exclusive pipe when its process exits, including a hard crash.
  // The PID file remains a discovery record; it never grants a second live pipe owner.
  const canonical = join(await realpath(dirname(path)), basename(path))
  const mutex =
    process.platform === 'win32'
      ? Bun.listen({
          unix: `\\\\.\\pipe\\hbar-owner-${createHash('sha256').update(canonical.toLowerCase()).digest('hex')}`,
          socket: {
            data() {},
            open(socket) {
              socket.end()
            },
            error() {},
          },
        })
      : undefined
  const lease = crypto.randomUUID()
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await writeFile(path, JSON.stringify({ pid: process.pid, lease }), { flag: 'wx', mode: 0o600 })
        return async () => {
          try {
            const owner = ownerSchema.parse(JSON.parse(await readFile(path, 'utf8')))
            if (owner.pid === process.pid && owner.lease === lease) await rm(path)
          } catch (error) {
            if (!hasCode(error, 'ENOENT')) throw error
          } finally {
            mutex?.stop(true)
          }
        }
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        let owner: z.infer<typeof ownerSchema>
        try {
          owner = ownerSchema.parse(JSON.parse(await readFile(path, 'utf8')))
        } catch (readError) {
          if (hasCode(readError, 'ENOENT')) continue
          throw new Error('Cannot verify the existing Host process lock', { cause: readError })
        }
        if (processIsAlive(owner.pid))
          throw new Error(`A Host process already owns this data root (PID ${owner.pid})`, { cause: error })
        // Re-read before removing a stale record; a competing launcher may have taken it over.
        const current = ownerSchema.parse(JSON.parse(await readFile(path, 'utf8')))
        if (current.pid !== owner.pid || current.lease !== owner.lease) continue
        try {
          await rm(path)
        } catch (removeError) {
          if (!hasCode(removeError, 'ENOENT')) throw removeError
        }
      }
    }
    throw new Error('Host process ownership changed during startup')
  } catch (error) {
    mutex?.stop(true)
    throw error
  }
}

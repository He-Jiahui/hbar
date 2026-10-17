import { readFile } from 'node:fs/promises'
import { processIsAlive } from '@hbar/runtime'
import { z } from 'zod'

const ownerSchema = z.object({ pid: z.number().int().positive() })

/** A live discovery lease is evidence to wait, never permission to replace the owner. */
export async function hasLiveHostOwner(hostLock: string): Promise<boolean> {
  for (const path of [`${hostLock}.supervisor`, hostLock]) {
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(path, 'utf8')) as unknown
    } catch (error) {
      if (error instanceof SyntaxError) continue
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
    const owner = ownerSchema.safeParse(raw)
    if (owner.success && processIsAlive(owner.data.pid)) return true
  }
  return false
}

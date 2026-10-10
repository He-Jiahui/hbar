import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const identityFileName = 'host-identity'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseIdentity(value: string, path: string): string {
  const identity = value.trim()
  if (!uuidPattern.test(identity)) throw new Error(`Invalid Host data-root identity in ${path}`)
  return identity
}

/** Returns the opaque identity shared by Host processes using one settings root. */
export async function ensureHostDataRootId(settingsRoot: string): Promise<string> {
  await mkdir(settingsRoot, { recursive: true })
  const path = join(settingsRoot, identityFileName)
  try {
    return parseIdentity(await readFile(path, 'utf8'), path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const identity = randomUUID()
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${identity}\n`, { flag: 'wx', mode: 0o600 })
    // Linking the fully-written temporary file creates the final name without
    // replacing an identity another Host may have published concurrently.
    await link(temporary, path)
    return identity
  } catch (error) {
    try {
      return parseIdentity(await readFile(path, 'utf8'), path)
    } catch {
      throw error
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

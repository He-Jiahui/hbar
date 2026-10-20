import { createHash, randomUUID } from 'node:crypto'
import { linkSync, lstatSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HbarError } from '@hbar/contracts/errors'
import { z } from 'zod'
import nativeAsset from '../native/hbar_sqlite_readonly.asset' with { type: 'file' }

/** One immutable DLL in an explicitly owned directory, shared by the caller's Workers. */
export function materializeReadonlySqliteExtension(inputDirectory: string): string {
  const directory = resolve(z.string().min(1).max(220).parse(inputDirectory))
  const destination = join(directory, 'hbar_readonly.dll')
  if (!isAbsolute(inputDirectory) || destination.length >= 248)
    throw new HbarError(
      'RUNTIME_READONLY_IO_UNAVAILABLE',
      'Readonly scan needs a short absolute native resource directory',
    )
  const source = isAbsolute(nativeAsset) ? nativeAsset : fileURLToPath(new URL(nativeAsset, import.meta.url))
  const size = statSync(source).size
  if (size < 2 || size > 1_048_576)
    throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly native asset size is invalid')
  const content = readFileSync(source)
  if (content.length !== size || content[0] !== 77 || content[1] !== 90)
    throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly native asset is not a complete Windows module')
  const digest = createHash('sha256').update(content).digest('hex')
  mkdirSync(directory, { recursive: true })
  const owner = lstatSync(directory)
  if (!owner.isDirectory() || owner.isSymbolicLink())
    throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Readonly native directory is not a physical directory')
  const verifyExisting = (): boolean => {
    let info
    try {
      info = lstatSync(destination)
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false
      throw cause
    }
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== content.length ||
      createHash('sha256').update(readFileSync(destination)).digest('hex') !== digest
    )
      throw new HbarError(
        'RUNTIME_READONLY_IO_UNCONFIRMED',
        'Existing native resource differs from this immutable runtime package',
      )
    return true
  }
  if (!verifyExisting()) {
    const temporary = join(directory, 'hbar-readonly-' + randomUUID() + '.pending')
    writeFileSync(temporary, content, { flag: 'wx' })
    try {
      try {
        linkSync(temporary, destination)
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) throw cause
      }
    } finally {
      unlinkSync(temporary)
    }
    if (!verifyExisting())
      throw new HbarError('RUNTIME_READONLY_IO_UNCONFIRMED', 'Native resource publication was not confirmed')
  }
  return toNamespacedPath(destination)
}

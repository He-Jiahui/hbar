import { HbarError } from '@hbar/contracts'
import { toolFileChangeSchema, MAX_RUN_CHANGED_FILES, type ToolFileChange } from '@hbar/contracts/run-file-changes'

/** Gate ordinary writes and multi-file restores to the same canonical files. */
export class FileMutationQueue {
  private readonly tails = new Map<string, Promise<void>>()
  private waiting = 0
  async run<Value>(paths: readonly string[], operation: () => Promise<Value>): Promise<Value> {
    if (this.waiting >= 64) throw new HbarError('BUSY', 'File mutation capacity is full')
    const keys = [...new Set(paths.map((path) => (process.platform === 'win32' ? path.toLowerCase() : path)))].sort()
    const previous = keys.map((key) => this.tails.get(key) ?? Promise.resolve())
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = Promise.all(previous).then(() => gate)
    this.waiting++
    for (const key of keys) this.tails.set(key, tail)
    try {
      await Promise.all(previous)
      return await operation()
    } finally {
      release()
      this.waiting--
      for (const key of keys) if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
interface RestorePort {
  read(path: string): Promise<string | null>
  put(path: string, text: string | null): Promise<void>
}
export async function restoreFileVersions(
  changes: readonly ToolFileChange[],
  port: RestorePort,
  signal: AbortSignal,
): Promise<void> {
  if (changes.length > MAX_RUN_CHANGED_FILES) throw new HbarError('FILE_LIMIT', 'Restore has too many files')
  const files = changes.map((file) => toolFileChangeSchema.parse(file))
  if (new Set(files.map((file) => file.path)).size !== files.length)
    throw new HbarError('INVALID_INPUT', 'Restore contains duplicate paths')
  const pending: ToolFileChange[] = []
  for (const file of files) {
    signal.throwIfAborted()
    const current = await port.read(file.path)
    if (current === file.before) continue
    if (current !== file.after) throw new HbarError('FILE_CONFLICT', `File changed after this Run: ${file.path}`)
    pending.push(file)
  }
  const restored: ToolFileChange[] = []
  try {
    for (const file of pending) {
      signal.throwIfAborted()
      if ((await port.read(file.path)) !== file.after)
        throw new HbarError('FILE_CONFLICT', `File changed during restore: ${file.path}`)
      await port.put(file.path, file.before)
      restored.push(file)
    }
  } catch (error) {
    const failures: unknown[] = []
    for (const file of restored.reverse()) {
      try {
        if ((await port.read(file.path)) !== file.before)
          throw new HbarError('FILE_CONFLICT', `File changed during rollback: ${file.path}`)
        await port.put(file.path, file.after)
      } catch (rollbackError) {
        failures.push(rollbackError)
      }
    }
    if (failures.length)
      throw new HbarError('RESTORE_PARTIAL', 'Restore rollback could not finish; inspect the file differences')
    throw error
  }
}

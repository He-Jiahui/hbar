import { HbarError } from '@hbar/contracts'

/** Map only expected local filesystem failures; never expose OS messages/paths. */
export async function localReadBoundary<Value>(read: () => Promise<Value>): Promise<Value> {
  try {
    return await read()
  } catch (error: unknown) {
    if (!(error instanceof Error) || error.name !== 'Error' || !('code' in error)) throw error
    const code = error.code
    if (code === 'ENOENT' || code === 'ENOTDIR')
      throw new HbarError(
        'NOT_FOUND',
        'Workspace file or directory was not found. Check its relative path before retrying.',
        { cause: error },
      )
    if (code === 'EACCES' || code === 'EPERM')
      throw new HbarError('PATH_DENIED', 'Workspace file or directory cannot be read with the current permissions.', {
        cause: error,
      })
    if (code === 'EBUSY')
      throw new HbarError(
        'BUSY',
        'Workspace file or directory is temporarily busy. Retry the same read after it becomes available.',
        { cause: error },
      )
    throw error
  }
}

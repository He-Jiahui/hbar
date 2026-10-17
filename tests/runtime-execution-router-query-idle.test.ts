import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { ExecutionRouter } from '@hbar/node-link'
import type { ExecutionProvider, WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import { workspaceFindInputSchema, workspaceSearchInputSchema } from '@hbar/contracts/workspace-query'
function deferred() {
  let release: () => void = () => {
    throw new Error('Missing deferred')
  }
  const promise = new Promise<void>((done) => {
    release = done
  })
  return { promise, release }
}
for (const method of ['search', 'find', 'readRange', 'invalidate'] as const)
  test(`router idle tracks actual public ${method} promise through cancel/dispose and known error`, async () => {
    const held = deferred(),
      entered = deferred(),
      controller = new AbortController()
    let disposed = false
    const operation = async (): Promise<never> => {
      entered.release()
      await held.promise
      throw new HbarError('FILE_NOT_FOUND', 'Controlled known read failure')
    }
    const query: WorkspaceQueryProvider = {
      search: operation,
      find: operation,
      readRange: operation,
      invalidate: operation,
      dispose() {},
    }
    const local: ExecutionProvider = {
      workspaceQuery: query,
      list: operation,
      read: operation,
      readBytes: operation,
      write: operation,
      exec: operation,
      dispose() {
        disposed = true
      },
    }
    const router = new ExecutionRouter({
      local,
      node: { call: () => Promise.reject(new Error('Unexpected remote call')) },
      current: () => undefined,
      loadSnapshot: () => Promise.reject(new Error('Unexpected snapshot')),
    })
    const pending = (
      method === 'search'
        ? router.workspaceQuery.search(
            'D:/fixture',
            workspaceSearchInputSchema.parse({ pattern: 'x' }),
            controller.signal,
          )
        : method === 'find'
          ? router.workspaceQuery.find('D:/fixture', workspaceFindInputSchema.parse({}), controller.signal)
          : method === 'readRange'
            ? router.workspaceQuery.readRange('D:/fixture', 'x', 1, 1, controller.signal)
            : router.workspaceQuery.invalidate('D:/fixture', 'x')
    ).then(
      () => null,
      (error: unknown) => (error instanceof HbarError ? error.code : 'UNCLASSIFIED'),
    )
    let closing: Promise<void> | undefined
    try {
      await entered.promise
      expect(router.idleRequests()).toBe(1)
      controller.abort()
      expect(router.idleRequests()).toBe(1)
      closing = router.dispose()
      await Promise.resolve()
      expect(disposed).toBe(false)
      held.release()
      expect(await pending).toBe('FILE_NOT_FOUND')
      await closing
      expect(disposed).toBe(true)
      expect(router.idleRequests()).toBe(1)
    } finally {
      held.release()
      await pending
      await router.dispose()
    }
  })

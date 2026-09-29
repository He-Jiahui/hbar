import { createHash } from 'node:crypto'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { fileCommands } from '@hbar/contracts/commands/files'
import { workspaceFindInputSchema } from '@hbar/contracts/workspace-query'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import type { StoragePort } from '@hbar/storage'
import { createSessionWorkspaceContext } from './session-workspace-context'
import type { SessionWorkspaceInput, SessionWorkspaceResolver } from './session-workspace-context'

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new HbarError('UNSUPPORTED_TYPE', 'File is not valid UTF-8 text')
  }
}

export type SessionFileWorkspaceResolver = SessionWorkspaceResolver

export function createFileCommands(
  storage: StoragePort,
  execution: ExecutionProvider,
  sessionWorkspace?: SessionFileWorkspaceResolver,
) {
  const registry = new CommandRegistry({ execution: 'host' })
  const writes = new Map<string, Promise<void>>()
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const sessionContext = createSessionWorkspaceContext(storage, sessionWorkspace)
  const workspace = sessionContext.resolve
  const assertSessionTarget = sessionContext.assertCurrent
  const read = async (input: SessionWorkspaceInput, workspacePath: string, path: string) => {
    const bytes = await execution.readBytes(workspacePath, path)
    return {
      workspaceId: input.workspaceId,
      ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
      path,
      text: decodeText(bytes),
      size: bytes.byteLength,
      sha256: digest(bytes),
    }
  }
  const serialized = async <Value>(key: string, operation: () => Promise<Value>): Promise<Value> => {
    const previous = writes.get(key) ?? Promise.resolve()
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => {}).then(() => gate)
    writes.set(key, tail)
    await previous.catch(() => {})
    try {
      return await operation()
    } finally {
      release()
      if (writes.get(key) === tail) writes.delete(key)
    }
  }

  registry.register(fileCommands['file.find'], (input, context) =>
    translate(async () => {
      const target = await workspace(input, context.signal)
      if (!execution.workspaceQuery)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace path search is unavailable')
      context.signal.throwIfAborted()
      return execution.workspaceQuery.find(
        target.path,
        workspaceFindInputSchema.parse({ path: input.path, nameQuery: input.query, limit: input.limit }),
        context.signal,
      )
    }),
  )
  registry.register(fileCommands['file.list'], (input, context) =>
    translate(async () => {
      const target = await workspace(input, context.signal)
      // Cursor comparison and page ordering must use one global strict order.
      const entries = (await execution.list(target.path, input.path)).sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      )
      const filtered = input.after ? entries.filter((entry) => entry.path > input.after!) : entries
      const items = filtered.slice(0, input.limit)
      return {
        items,
        ...(filtered.length > input.limit && items.length ? { nextCursor: items.at(-1)!.path } : {}),
      }
    }),
  )
  registry.register(fileCommands['file.read'], (input, context) =>
    translate(async () => {
      const target = await workspace(input, context.signal)
      return read(input, target.path, input.path)
    }),
  )
  registry.register(
    fileCommands['file.write'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId) throw new HbarError('INVALID_INPUT', 'Authenticated actor is required')
        const target = await workspace(input, context.signal)
        // Shared sessions still serialize writes to the same physical checkout.
        const rootKey = process.platform === 'win32' ? target.path.toLocaleLowerCase() : target.path
        const key = `${rootKey}\u0000${input.path}`
        return serialized(key, async () => {
          context.signal.throwIfAborted()
          await assertSessionTarget(input)
          let before: Awaited<ReturnType<typeof read>> | null = null
          try {
            before = await read(input, target.path, input.path)
          } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
          }
          const bytes = new TextEncoder().encode(input.text)
          const afterSha256 = digest(bytes)
          if (before?.sha256 === afterSha256)
            return {
              workspaceId: input.workspaceId,
              ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
              path: input.path,
              created: false,
              beforeSha256: input.expectedSha256,
              afterSha256,
              size: bytes.byteLength,
            }
          if ((before?.sha256 ?? null) !== input.expectedSha256)
            throw new HbarError('FILE_CONFLICT', 'File changed since the supplied baseline')
          context.signal.throwIfAborted()
          await assertSessionTarget(input)
          await execution.write(target.path, input.path, input.text)
          return {
            workspaceId: input.workspaceId,
            ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
            path: input.path,
            created: before === null,
            beforeSha256: before?.sha256 ?? null,
            afterSha256,
            size: bytes.byteLength,
          }
        })
      }),
    { durable: true },
  )
  registry.register(fileCommands['attachment.query'], ({ artifactId }) =>
    translate(() => storage.call('artifact', artifactId)),
  )

  return {
    ...createCommandClient(fileCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}

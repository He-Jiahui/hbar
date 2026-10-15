import { z } from 'zod'
import { checkInvocationSize } from './limits'
import { captureCommandExpectation } from './execution-expectation'
import {
  CommandError,
  commandCatalogQuerySchema,
  commandDescriptionQuerySchema,
  invocationSchema,
  validationError,
  type CommandDescriptor,
  type PreparedCommandRoutingPort,
  type CommandExecutionExpectation,
  type CommandPreparedOptions,
  type CommandInvocation,
} from './protocol'

export const MAX_COMMAND_CATALOG_BYTES = 524_288
const MAX_CATALOG_ENTRIES = 10_000
const actorSchema = z.string().min(1).max(160).regex(/\S/)

export interface CommandRoute {
  readonly describe: () => CommandDescriptor
  readonly prepare?: (invocation: unknown) => CommandInvocation | Promise<CommandInvocation>
  readonly dispatch: (invocation: unknown, actorId: string) => Promise<unknown>
  readonly dispatchPrepared?: (
    invocation: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options?: CommandPreparedOptions,
  ) => Promise<unknown>
}
export interface CommandRouterOptions {
  /** Resolve on each call so an owner-generation change cannot leave a cached dispatcher behind. */
  readonly resolve: (commandId: string) => CommandRoute | undefined
  readonly catalogs: () => readonly { readonly revision: number; readonly items: readonly CommandDescriptor[] }[]
}

function serializedBytes(value: unknown): number {
  let encoded: string | undefined
  try {
    encoded = JSON.stringify(value)
  } catch {
    throw new CommandError('INVALID_DEFINITION', 'Command descriptor must be serializable')
  }
  if (encoded === undefined) throw new CommandError('INVALID_DEFINITION', 'Command descriptor is absent')
  return new TextEncoder().encode(encoded).byteLength
}

/** Shared routing, discovery and bounds. Executable validators, permissions and receipts stay in their owners. */
export function createCommandRouter(options: CommandRouterOptions): PreparedCommandRoutingPort {
  const route = (id: string) => {
    const selected = options.resolve(id)
    if (!selected) throw new CommandError('COMMAND_NOT_FOUND', 'Command is not registered on this Host')
    return selected
  }
  const describe = (id: string, selected?: CommandRoute): CommandDescriptor => {
    const input = commandDescriptionQuerySchema.safeParse({ commandId: id })
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    const descriptor = (selected ?? route(input.data.commandId)).describe()
    if (descriptor.metadata.id !== id || serializedBytes(descriptor) > MAX_COMMAND_CATALOG_BYTES - 2048)
      throw new CommandError('INVALID_DEFINITION', 'Command descriptor exceeds routing bounds or has another identity')
    return descriptor
  }
  return {
    describe,
    async prepare(value) {
      checkInvocationSize(value)
      const parsed = invocationSchema.safeParse(value)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      const selected = route(parsed.data.commandId)
      if (!selected.prepare)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'The command owner does not expose read-only validation')
      const descriptor = structuredClone(describe(parsed.data.commandId, selected))
      if (descriptor.metadata.version !== parsed.data.commandVersion)
        throw new CommandError('VERSION_MISMATCH', 'Command version is incompatible')
      const prepared = invocationSchema.parse(await selected.prepare(structuredClone(parsed.data)))
      if (
        prepared.commandId !== parsed.data.commandId ||
        prepared.commandVersion !== parsed.data.commandVersion ||
        prepared.requestId !== parsed.data.requestId ||
        prepared.idempotencyKey !== parsed.data.idempotencyKey
      )
        throw new CommandError('INVALID_DEFINITION', 'Command preparation changed its invocation identity')
      checkInvocationSize(prepared)
      return { descriptor, invocation: prepared }
    },
    list(query = {}) {
      const parsed = commandCatalogQuerySchema.safeParse(query)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      const filter = parsed.data
      const candidates = new Set<string>()
      let revision = 0
      let entries = 0
      const catalogs = options.catalogs()
      if (catalogs.length > 128) throw new CommandError('BUSY', 'Command catalog source capacity reached')
      for (const catalog of catalogs) {
        if (!Number.isSafeInteger(catalog.revision) || catalog.revision < 0)
          throw new CommandError('INVALID_DEFINITION', 'Command catalog revision is invalid')
        revision += catalog.revision
        entries += catalog.items.length
        if (entries > MAX_CATALOG_ENTRIES || !Number.isSafeInteger(revision) || revision < 0)
          throw new CommandError('BUSY', 'Command catalog capacity reached')
        for (const descriptor of catalog.items) {
          const metadata = descriptor.metadata
          if (
            metadata.visibility !== 'internal' &&
            (!filter.category ||
              metadata.category === filter.category ||
              metadata.category.startsWith(`${filter.category}.`)) &&
            (filter.after === undefined || metadata.id > filter.after)
          )
            candidates.add(metadata.id)
        }
      }
      // Cursor predicates and ordering use the same locale-independent comparison.
      const ids = [...candidates].sort()
      const items: CommandDescriptor[] = []
      let bytes = 1024
      let consumed = 0
      for (const id of ids) {
        if (items.length >= filter.limit) break
        const descriptor = describe(id)
        if (descriptor.metadata.visibility === 'internal') {
          consumed++
          continue
        }
        const size = serializedBytes(descriptor) + 1
        if (bytes + size > MAX_COMMAND_CATALOG_BYTES) break
        items.push(descriptor)
        consumed++
        bytes += size
      }
      const last = items.at(-1)
      if (ids.length > consumed && !last)
        throw new CommandError('INVALID_DEFINITION', 'Command descriptor exceeds catalog page capacity')
      return { revision, items, ...(ids.length > consumed && last ? { nextCursor: last.metadata.id } : {}) }
    },
    async execute(value, actorId) {
      const actor = actorSchema.safeParse(actorId)
      if (!actor.success) throw new CommandError('FORBIDDEN', 'A Host-bound command actor is required')
      checkInvocationSize(value)
      const input = invocationSchema.safeParse(value)
      if (!input.success) throw validationError('INVALID_INPUT', input.error)
      return route(input.data.commandId).dispatch(input.data, actor.data)
    },
    async executePrepared(value, actorId, expectation, executeOptions = {}) {
      const actor = actorSchema.safeParse(actorId)
      if (!actor.success) throw new CommandError('FORBIDDEN', 'A Host-bound command actor is required')
      if (executeOptions.signal?.aborted) throw new CommandError('CANCELLED', 'Command cancelled before execution')
      checkInvocationSize(value)
      const invocation = invocationSchema.parse(value)
      const captured = captureCommandExpectation(expectation)
      const selected = route(invocation.commandId)
      if (!selected.dispatchPrepared)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'The command owner does not support guarded dispatch')
      captured.assertDescriptor(describe(invocation.commandId, selected))
      captured.assertInput(invocation.input)
      return selected.dispatchPrepared(
        { ...invocation, input: captured.detachInput(invocation.input) },
        actor.data,
        captured.detached(),
        executeOptions,
      )
    },
  }
}

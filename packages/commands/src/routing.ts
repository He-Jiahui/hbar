import { z } from 'zod'
import { checkInvocationSize } from './limits'
import {
  CommandError,
  commandCatalogQuerySchema,
  commandDescriptionQuerySchema,
  invocationSchema,
  validationError,
  type CommandDescriptor,
  type CommandRoutingPort,
} from './protocol'

export const MAX_COMMAND_CATALOG_BYTES = 524_288
const MAX_CATALOG_ENTRIES = 10_000
const actorSchema = z.string().min(1).max(160).regex(/\S/)

export interface CommandRoute {
  readonly describe: () => CommandDescriptor
  readonly dispatch: (invocation: unknown, actorId: string) => Promise<unknown>
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
export function createCommandRouter(options: CommandRouterOptions): CommandRoutingPort {
  const route = (id: string) => {
    const selected = options.resolve(id)
    if (!selected) throw new CommandError('COMMAND_NOT_FOUND', 'Command is not registered on this Host')
    return selected
  }
  const describe = (id: string): CommandDescriptor => {
    const input = commandDescriptionQuerySchema.safeParse({ commandId: id })
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    const descriptor = route(input.data.commandId).describe()
    if (descriptor.metadata.id !== id || serializedBytes(descriptor) > MAX_COMMAND_CATALOG_BYTES - 2048)
      throw new CommandError('INVALID_DEFINITION', 'Command descriptor exceeds routing bounds or has another identity')
    return descriptor
  }
  return {
    describe,
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
  }
}

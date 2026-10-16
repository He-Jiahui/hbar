import {
  commandCatalogQuerySchema,
  commandCatalogPageSchema,
  commandDescriptionQuerySchema,
  commandDescriptorSchema,
  describeCommand,
  MAX_COMMAND_CATALOG_BYTES,
  type CommandCatalogPage,
  type CommandCatalogQuery,
  type CommandDescriptor,
  type CommandRoutingPort,
  type CommandPreparation,
} from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { cliLocalCommands } from '@hbar/contracts/commands/cli-catalog'

const local = new Map(
  Object.values(cliLocalCommands).map((definition) => [definition.metadata.id, describeCommand(definition)]),
)

/** One ordered prefix from each domain; never skip unread Host commands behind a byte-limited page. */
export function mergeSessionCommandCatalog(query: CommandCatalogQuery, host: CommandCatalogPage): CommandCatalogPage {
  const filter = commandCatalogQuerySchema.parse(query)
  const page = commandCatalogPageSchema.parse(host)
  let previous = filter.after
  for (const descriptor of page.items) {
    if (previous !== undefined && descriptor.metadata.id <= previous)
      throw new HbarError('COMMAND_CATALOG_INVALID', 'Host command cursor order did not advance')
    previous = descriptor.metadata.id
  }
  const ceiling = page.nextCursor === undefined ? undefined : page.items.at(-1)?.metadata.id
  if (page.nextCursor !== undefined && (!ceiling || page.nextCursor !== ceiling))
    throw new HbarError('COMMAND_CATALOG_INVALID', 'Host command cursor does not match its page')
  const locals = [...local.values()].filter(
    ({ metadata }) =>
      metadata.visibility !== 'internal' &&
      (filter.after === undefined || metadata.id > filter.after) &&
      (ceiling === undefined || metadata.id <= ceiling) &&
      (!filter.category ||
        metadata.category === filter.category ||
        metadata.category.startsWith(`${filter.category}.`)),
  )
  const merged = [
    ...new Map([...page.items, ...locals].map((descriptor) => [descriptor.metadata.id, descriptor])).values(),
  ].sort((left, right) => (left.metadata.id < right.metadata.id ? -1 : left.metadata.id > right.metadata.id ? 1 : 0))
  const items: CommandDescriptor[] = []
  let bytes = 1024
  for (const descriptor of merged) {
    if (items.length >= filter.limit) break
    const size = new TextEncoder().encode(JSON.stringify(descriptor)).byteLength + 1
    if (bytes + size > MAX_COMMAND_CATALOG_BYTES) break
    bytes += size
    items.push(descriptor)
  }
  const last = items.at(-1)
  const more = page.nextCursor !== undefined || merged.length > items.length
  if (more && !last) throw new HbarError('COMMAND_CATALOG_INVALID', 'A command exceeds the discovery page capacity')
  const revision = page.revision + local.size
  if (!Number.isSafeInteger(revision))
    throw new HbarError('COMMAND_CATALOG_INVALID', 'Command catalog revision overflowed')
  return { revision, items, ...(more && last ? { nextCursor: last.metadata.id } : {}) }
}

interface Waiter {
  finish(source?: CommandRoutingPort, error?: unknown): void
}

/** The listener supplies its actual router after startup. Pending reads are bounded, cancellable and released on close. */
export class SessionCommandDiscovery {
  private source: CommandRoutingPort | undefined
  private generation = 0
  private closed = false
  private readonly pending = new Set<Waiter>()
  constructor(private readonly timeoutMs = 10_000) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new HbarError('INVALID_CONFIGURATION', 'Command discovery timeout is outside its bound')
  }
  attach(source: CommandRoutingPort): () => void {
    if (this.closed) throw new HbarError('HOST_SHUTTING_DOWN', 'Command discovery is closed')
    this.source = source
    const generation = ++this.generation
    for (const waiter of [...this.pending]) waiter.finish(source)
    return () => {
      if (this.generation === generation) this.source = undefined
    }
  }
  private ready(signal: AbortSignal): Promise<CommandRoutingPort> {
    signal.throwIfAborted()
    if (this.closed) return Promise.reject(new HbarError('HOST_SHUTTING_DOWN', 'Command discovery is closed'))
    if (this.source) return Promise.resolve(this.source)
    if (this.pending.size >= 32)
      return Promise.reject(new HbarError('COMMAND_CATALOG_BUSY', 'Command discovery startup capacity is full'))
    return new Promise((resolve, reject) => {
      const abort = () => waiter.finish(undefined, signal.reason)
      const timer = setTimeout(
        () =>
          waiter.finish(
            undefined,
            new HbarError('COMMAND_CATALOG_UNAVAILABLE', 'The Host command router is not ready'),
          ),
        this.timeoutMs,
      )
      const waiter: Waiter = {
        finish: (source, error) => {
          if (!this.pending.delete(waiter)) return
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          if (source) resolve(source)
          else reject(error)
        },
      }
      this.pending.add(waiter)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }
  private async read<Result>(
    signal: AbortSignal,
    operation: (source: CommandRoutingPort) => Result | Promise<Result>,
  ): Promise<Result> {
    const source = await this.ready(signal)
    signal.throwIfAborted()
    if (this.source !== source || this.closed)
      throw new HbarError('COMMAND_CATALOG_UNAVAILABLE', 'The command router changed during discovery')
    return operation(source)
  }
  list(query: CommandCatalogQuery, signal: AbortSignal): Promise<CommandCatalogPage> {
    return this.read(signal, (source) => mergeSessionCommandCatalog(query, source.list(query)))
  }
  describe(commandId: string, signal: AbortSignal): Promise<CommandDescriptor> {
    const { commandId: id } = commandDescriptionQuerySchema.parse({ commandId })
    return this.read(signal, (source) => commandDescriptorSchema.parse(local.get(id) ?? source.describe(id)))
  }
  prepare(invocation: unknown, signal: AbortSignal): Promise<CommandPreparation> {
    return this.read(signal, (source) => source.prepare(invocation))
  }
  close(): void {
    this.closed = true
    this.source = undefined
    for (const waiter of [...this.pending])
      waiter.finish(undefined, new HbarError('HOST_SHUTTING_DOWN', 'Command discovery is closed'))
  }
}

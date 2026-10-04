import { z } from 'zod'
import { describeCommand } from './descriptor'
import { parseArguments, tokenizeCommand } from './parser'
import { checkInvocationSize } from './limits'
import {
  COMMAND_PROTOCOL_VERSION,
  CommandError,
  invocationSchema,
  validationError,
  type CommandDefinition,
  type CommandDescriptor,
  type CommandMetadata,
} from './protocol'

export interface CommandContext {
  readonly requestId: string
  readonly signal: AbortSignal
  /** Supplied by the authenticated execution boundary, never from caller input. */
  readonly actorId?: string
  readonly idempotencyKey?: string
}

export type CommandHandler<Input extends z.ZodType, Output extends z.ZodType> = (
  input: z.output<Input>,
  context: CommandContext,
) => z.input<Output> | Promise<z.input<Output>>

export interface CommandRegistryOptions {
  readonly execution?: CommandMetadata['execution']
  readonly maxRegistered?: number
  readonly maxConcurrent?: number
  readonly authorize?: (metadata: CommandMetadata, context: CommandContext) => boolean | Promise<boolean>
}

export interface ExecuteOptions {
  readonly requestId?: string
  readonly signal?: AbortSignal
  readonly version?: number
  readonly actorId?: string
  readonly idempotencyKey?: string
}

interface Registration {
  readonly descriptor: CommandDescriptor
  readonly parseInput: (value: unknown) => unknown
  readonly run: (input: unknown, context: CommandContext) => Promise<unknown>
  readonly active: Set<AbortController>
  readonly durable: boolean
}

function checkedLimit(value: number, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new CommandError('INVALID_DEFINITION', 'Invalid registry capacity')
  return value
}

/** Per execution-domain registry. Business and platform implementations are injected handlers. */
export class CommandRegistry {
  readonly #registrations = new Map<string, Registration>()
  readonly #names = new Map<string, string>()
  readonly #active = new Set<AbortController>()
  readonly #maxRegistered: number
  readonly #maxConcurrent: number
  readonly #authorize: CommandRegistryOptions['authorize']
  readonly #execution: CommandMetadata['execution']
  #revision = 0
  #requestSequence = 0
  #disposed = false

  constructor(options: CommandRegistryOptions = {}) {
    this.#maxRegistered = checkedLimit(options.maxRegistered ?? 1024, 10_000)
    this.#maxConcurrent = checkedLimit(options.maxConcurrent ?? 32, 128)
    this.#authorize = options.authorize
    this.#execution = options.execution ?? 'client'
  }

  get revision(): number {
    return this.#revision
  }

  #assertActive(): void {
    if (this.#disposed) throw new CommandError('DISPOSED', 'Registry is disposed')
  }

  register<Input extends z.ZodType, Output extends z.ZodType>(
    definition: CommandDefinition<Input, Output>,
    handler: CommandHandler<Input, Output>,
    options: { readonly durable?: boolean } = {},
  ): () => void {
    this.#assertActive()
    const descriptor = describeCommand(definition)
    if (descriptor.metadata.execution !== this.#execution)
      throw new CommandError('INVALID_DEFINITION', 'Command execution domain does not match this registry')
    if (
      options.durable &&
      (descriptor.metadata.kind !== 'command' || !['persistent', 'external'].includes(descriptor.metadata.stateEffect))
    )
      throw new CommandError('INVALID_DEFINITION', 'Durable handler requires a persistent or external command')
    const names = [descriptor.metadata.id, ...descriptor.metadata.aliases]
    if (names.some((name) => this.#names.has(name)))
      throw new CommandError('COMMAND_CONFLICT', 'Command name is already registered')
    if (this.#registrations.size >= this.#maxRegistered) throw new CommandError('BUSY', 'Registry capacity reached')
    const inputSchema = definition.input,
      outputSchema = definition.output
    const parseInput = (value: unknown): z.output<Input> => {
      checkInvocationSize(value)
      const parsed = inputSchema.safeParse(value)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      return parsed.data
    }
    const registration: Registration = {
      descriptor,
      parseInput,
      active: new Set(),
      durable: options.durable ?? false,
      async run(value, context) {
        const result = await handler(parseInput(value), context)
        const parsed = outputSchema.safeParse(result)
        if (!parsed.success) throw validationError('INVALID_OUTPUT', parsed.error)
        return parsed.data
      },
    }
    this.#registrations.set(descriptor.metadata.id, registration)
    for (const name of names) this.#names.set(name, descriptor.metadata.id)
    this.#revision++
    return () => {
      if (this.#registrations.get(descriptor.metadata.id) !== registration) return
      this.#registrations.delete(descriptor.metadata.id)
      for (const name of names) this.#names.delete(name)
      for (const controller of registration.active) controller.abort()
      this.#revision++
    }
  }

  namespace(namespace: string) {
    const bind = <Input extends z.ZodType, Output extends z.ZodType>(
      kind: 'command' | 'query',
      name: string,
      registration: {
        readonly definition: CommandDefinition<Input, Output>
        readonly execute: CommandHandler<Input, Output>
      },
    ): (() => void) => {
      if (
        registration.definition.metadata.id !== `${namespace}.${name}` ||
        registration.definition.metadata.kind !== kind
      )
        throw new CommandError('INVALID_DEFINITION', 'Namespace, name and kind must match the definition')
      return this.register(registration.definition, registration.execute)
    }
    return {
      registerCommand: <Input extends z.ZodType, Output extends z.ZodType>(
        name: string,
        registration: {
          readonly definition: CommandDefinition<Input, Output>
          readonly execute: CommandHandler<Input, Output>
        },
      ) => bind('command', name, registration),
      registerQuery: <Input extends z.ZodType, Output extends z.ZodType>(
        name: string,
        registration: {
          readonly definition: CommandDefinition<Input, Output>
          readonly execute: CommandHandler<Input, Output>
        },
      ) => bind('query', name, registration),
    }
  }

  #find(name: string): Registration {
    this.#assertActive()
    const registration = this.#registrations.get(this.#names.get(name) ?? name)
    if (!registration) throw new CommandError('COMMAND_NOT_FOUND', 'Command is not registered')
    return registration
  }

  describe(name: string): CommandDescriptor {
    return this.#find(name).descriptor
  }

  list(
    filter: {
      readonly category?: string
      readonly surface?: CommandMetadata['surfaces'][number]
      readonly includeInternal?: boolean
      readonly after?: string
      readonly limit?: number
    } = {},
  ): { readonly revision: number; readonly items: readonly CommandDescriptor[]; readonly nextCursor?: string } {
    this.#assertActive()
    const limit = checkedLimit(filter.limit ?? 100, 500)
    const items = [...this.#registrations.values()]
      .map((item) => item.descriptor)
      .filter(
        ({ metadata }) =>
          (filter.includeInternal || metadata.visibility !== 'internal') &&
          (filter.category === undefined ||
            metadata.category === filter.category ||
            metadata.category.startsWith(`${filter.category}.`)) &&
          (filter.surface === undefined || metadata.surfaces.includes(filter.surface)) &&
          (filter.after === undefined || metadata.id > filter.after),
      )
      .sort((a, b) => (a.metadata.id < b.metadata.id ? -1 : 1))
    const page = items.slice(0, limit)
    const last = page.at(-1)
    return {
      revision: this.#revision,
      items: page,
      ...(items.length > limit && last ? { nextCursor: last.metadata.id } : {}),
    }
  }

  complete(prefix: string, limit = 20): readonly CommandDescriptor[] {
    this.#assertActive()
    checkedLimit(limit, 100)
    return [...this.#registrations.values()]
      .filter(
        ({ descriptor: { metadata } }) =>
          metadata.visibility !== 'internal' &&
          [metadata.id, ...metadata.aliases].some((name) => name.startsWith(prefix)),
      )
      .sort((a, b) => (a.descriptor.metadata.id < b.descriptor.metadata.id ? -1 : 1))
      .slice(0, limit)
      .map((item) => item.descriptor)
  }

  parseArgv(argv: readonly string[]): { readonly commandId: string; readonly input: unknown } {
    const [name, ...args] = argv
    if (name === undefined) throw new CommandError('INVALID_SYNTAX', 'Command name is required')
    const registration = this.#find(name)
    return {
      commandId: registration.descriptor.metadata.id,
      input: registration.parseInput(parseArguments(registration.descriptor.metadata, args)),
    }
  }

  parseText(source: string): { readonly commandId: string; readonly input: unknown } {
    return this.parseArgv(tokenizeCommand(source))
  }

  async executeText(source: string, options: ExecuteOptions = {}): Promise<unknown> {
    const invocation = this.parseText(source)
    return this.execute(invocation.commandId, invocation.input, options)
  }

  async dispatch(value: unknown, options: Pick<ExecuteOptions, 'signal' | 'actorId'> = {}): Promise<unknown> {
    const parsed = invocationSchema.safeParse(value)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    return this.execute(parsed.data.commandId, parsed.data.input, {
      ...options,
      requestId: parsed.data.requestId,
      version: parsed.data.commandVersion,
      ...(parsed.data.idempotencyKey ? { idempotencyKey: parsed.data.idempotencyKey } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
    })
  }

  async execute(name: string, value: unknown, options: ExecuteOptions = {}): Promise<unknown> {
    const registration = this.#find(name)
    const metadata = registration.descriptor.metadata
    if (options.version !== undefined && options.version !== metadata.version)
      throw new CommandError('VERSION_MISMATCH', 'Command version is incompatible')
    // Persistent/external execution is enabled with the journal adapter in A3, never silently memory-only.
    if (
      (metadata.idempotency === 'required' ||
        metadata.stateEffect === 'persistent' ||
        metadata.stateEffect === 'external') &&
      !registration.durable
    )
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Durable execution requires a journal adapter')
    if (registration.durable && !options.actorId)
      throw new CommandError('INVALID_INPUT', 'Durable command requires an authenticated actor')
    if (registration.durable && metadata.idempotency === 'required' && !options.idempotencyKey)
      throw new CommandError('INVALID_INPUT', 'Durable command requires an idempotency key')
    if (options.signal?.aborted) throw new CommandError('CANCELLED', 'Command cancelled before execution')
    const input = registration.parseInput(value)
    if (this.#active.size >= this.#maxConcurrent || registration.active.size >= metadata.maxConcurrent)
      throw new CommandError('BUSY', 'Command concurrency limit reached')
    const requestId = options.requestId ?? `local-${++this.#requestSequence}`
    const invocation = invocationSchema.safeParse({
      protocol: COMMAND_PROTOCOL_VERSION,
      requestId,
      commandId: metadata.id,
      commandVersion: metadata.version,
      input,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    })
    if (!invocation.success) throw validationError('INVALID_INPUT', invocation.error)
    const controller = new AbortController()
    registration.active.add(controller)
    this.#active.add(controller)
    return new Promise((resolve, reject) => {
      let enteredHandler = false
      const interrupted = (timedOut: boolean): void => {
        const uncertain = enteredHandler && metadata.kind === 'command'
        reject(
          new CommandError(
            uncertain ? 'RESULT_UNKNOWN' : timedOut ? 'TIMED_OUT' : 'CANCELLED',
            'Execution was interrupted; inspect state before retrying writes',
          ),
        )
      }
      const abort = (): void => controller.abort()
      const onAbort = (): void => interrupted(false)
      controller.signal.addEventListener('abort', onAbort, { once: true })
      options.signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => {
        interrupted(true)
        controller.abort()
      }, metadata.timeoutMs)
      const cleanup = (): void => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        controller.signal.removeEventListener('abort', onAbort)
        registration.active.delete(controller)
        this.#active.delete(controller)
      }
      const run = async (): Promise<unknown> => {
        const context = {
          requestId,
          signal: controller.signal,
          ...(options.actorId ? { actorId: options.actorId } : {}),
          ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        }
        if (metadata.capabilities.length && !(await this.#authorize?.(metadata, context)))
          throw new CommandError('FORBIDDEN', 'Command capability is not authorized')
        if (controller.signal.aborted) throw new CommandError('CANCELLED', 'Command cancelled before execution')
        enteredHandler = true
        return registration.run(input, context)
      }
      // Retain capacity until the real handler settles, even if it ignores cancellation.
      run().then(
        (output) => {
          cleanup()
          resolve(output)
        },
        (error: unknown) => {
          cleanup()
          reject(
            error instanceof CommandError ? error : new CommandError('EXECUTION_FAILED', 'Command execution failed'),
          )
        },
      )
    })
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const controller of this.#active) controller.abort()
    this.#registrations.clear()
    this.#names.clear()
    this.#revision++
  }
}

import { CommandError, type TrackedCommandRoutingPort } from '@hbar/commands'
import { CommandExecutionJobs, commandJobStartSchema } from '@hbar/commands/jobs'
import {
  clientCommandRequestSchema,
  clientCommandRegisteredSchema,
  clientCommandPreparationSchema,
  clientCommandRegistrationSchema,
  type ClientCommandTarget,
} from '@hbar/contracts/client-commands'
import type { HbarClient } from './index'

/** Owns real client handlers and retains physical results until the Host acknowledges them. */
export class ClientCommandEndpoint {
  private readonly jobs = new CommandExecutionJobs({ maxJobs: 64 })
  private readonly lifetime = new AbortController()
  private readonly identity: ClientCommandTarget & { readonly actorId: string }
  private readonly commands: ReadonlySet<string>
  private closed = false
  constructor(
    identity: ClientCommandTarget & { readonly actorId: string },
    commands: ReadonlySet<string>,
    private readonly routing: TrackedCommandRoutingPort,
  ) {
    const captured = clientCommandRegisteredSchema.parse({ ...identity, commands: [...commands] })
    this.identity = Object.freeze({
      clientId: captured.clientId,
      generation: captured.generation,
      actorId: captured.actorId,
    })
    this.commands = new Set(captured.commands)
  }

  async dispatch(raw: unknown, requestSignal?: AbortSignal): Promise<unknown> {
    requestSignal?.throwIfAborted()
    const request = clientCommandRequestSchema.parse(raw)
    if (request.clientId !== this.identity.clientId || request.generation !== this.identity.generation)
      throw new CommandError('COMMAND_TARGET_STALE', 'This command belongs to another client generation')
    const operation = request.operation
    if (operation.method === 'prepare') {
      this.assertCommand(operation.input.commandId)
      const prepared = await this.routing.prepare(operation.input)
      requestSignal?.throwIfAborted()
      this.assertCommand(prepared.invocation.commandId)
      return clientCommandPreparationSchema.parse(prepared)
    }
    if (operation.input.actorId !== this.identity.actorId)
      throw new CommandError('FORBIDDEN', 'The client job belongs to another authenticated actor')
    switch (operation.method) {
      case 'command.jobs.start': {
        const input = commandJobStartSchema.parse(operation.input)
        this.assertCommand(input.invocation.commandId)
        return this.jobs.start({ actorId: input.actorId, jobId: input.jobId }, (signal) =>
          this.routing.executePreparedTracked(input.invocation, this.identity.actorId, input.expectation, { signal }),
        )
      }
      case 'command.jobs.get':
        return this.jobs.get(operation.input)
      case 'command.jobs.watch':
        return this.jobs.watch(
          operation.input,
          requestSignal ? AbortSignal.any([this.lifetime.signal, requestSignal]) : this.lifetime.signal,
        )
      case 'command.jobs.read':
        return this.jobs.read(operation.input)
      case 'command.jobs.cancel':
        return this.jobs.cancel(operation.input)
      case 'command.jobs.acknowledge':
        return this.jobs.acknowledge(operation.input)
    }
  }
  private assertCommand(commandId: string): void {
    if (this.closed) throw new CommandError('CANCELLED', 'The command client is closing')
    if (!this.commands.has(commandId))
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'This client did not publish that command')
    const descriptor = this.routing.describe(commandId)
    if (descriptor.metadata.execution === 'host' || descriptor.metadata.visibility === 'internal')
      throw new CommandError('FORBIDDEN', 'This endpoint only executes published client or platform commands')
  }
  dispose(): void {
    this.closed = true
    this.lifetime.abort(new CommandError('CANCELLED', 'The command client is closing'))
    this.jobs.dispose()
  }
}

export async function registerCommandClient(
  client: HbarClient,
  options: ClientCommandTarget & { readonly commands: readonly string[]; readonly routing: TrackedCommandRoutingPort },
) {
  const captured = clientCommandRegistrationSchema.parse({
    clientId: options.clientId,
    generation: options.generation,
    commands: [...new Set(options.commands)],
  })
  const routing = options.routing
  let disposed = false
  let ordinary = 0
  let controls = 0
  let connectionLifetime = new AbortController()
  let endpoint: ClientCommandEndpoint | undefined
  let boundActor: string | undefined
  let ready!: Promise<void>
  const unsubscribe = client.onEvent((event) => {
    if (disposed || event.method !== 'command.client.request') return
    const parsed = clientCommandRequestSchema.safeParse(event.params)
    if (!parsed.success || parsed.data.clientId !== captured.clientId || parsed.data.generation !== captured.generation)
      return
    const request = parsed.data
    const control =
      request.operation.method === 'command.jobs.cancel' || request.operation.method === 'command.jobs.acknowledge'
    if ((control ? controls : ordinary) >= (control ? 16 : 64)) {
      void client
        .call('command.client.reply', {
          clientId: captured.clientId,
          generation: captured.generation,
          requestId: request.requestId,
          outcome: { ok: false, error: { code: 'BUSY', message: 'Command client request capacity is full' } },
        })
        .catch(() => undefined)
      return
    }
    if (control) controls++
    else ordinary++
    const requestSignal = connectionLifetime.signal
    void (async () => {
      await ready
      let outcome: { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } }
      try {
        if (disposed || !endpoint) throw new CommandError('CANCELLED', 'The command client is closing')
        outcome = { ok: true, result: await endpoint.dispatch(request, requestSignal) }
      } catch (error) {
        outcome = {
          ok: false,
          error: {
            code: error instanceof CommandError ? error.code.slice(0, 128) || 'EXECUTION_FAILED' : 'EXECUTION_FAILED',
            message:
              error instanceof Error
                ? error.message.slice(0, 8_192) || 'Client command failed'
                : 'Client command failed',
          },
        }
      }
      await client.call('command.client.reply', {
        clientId: captured.clientId,
        generation: captured.generation,
        requestId: request.requestId,
        outcome,
      })
    })()
      .catch(() => undefined)
      .finally(() => {
        if (control) controls--
        else ordinary--
      })
  })
  const register = async () => {
    if (disposed) return
    const registration = clientCommandRegisteredSchema.parse(
      await client.call('command.client.register', {
        ...captured,
      }),
    )
    if (
      registration.clientId !== captured.clientId ||
      registration.generation !== captured.generation ||
      (boundActor !== undefined && boundActor !== registration.actorId)
    )
      throw new CommandError('FORBIDDEN', 'The command registration changed its original identity')
    boundActor = registration.actorId
    endpoint ??= new ClientCommandEndpoint(registration, new Set(registration.commands), routing)
  }
  ready = register()
  try {
    await ready
  } catch (error) {
    unsubscribe()
    throw error
  }
  const offStatus = client.onStatus((status) => {
    if (disposed) return
    if (status !== 'connected') {
      connectionLifetime.abort(new CommandError('CANCELLED', 'The command client connection changed'))
      return
    }
    connectionLifetime = new AbortController()
    ready = ready.catch(() => {}).then(register)
    void ready.catch(() => undefined)
  })
  return {
    async dispose() {
      if (disposed) return
      disposed = true
      connectionLifetime.abort(new CommandError('CANCELLED', 'The command client is closing'))
      endpoint?.dispose()
      offStatus()
      unsubscribe()
      await client.call('command.client.unregister', { clientId: captured.clientId, generation: captured.generation })
    },
  }
}

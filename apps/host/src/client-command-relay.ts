import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  clientCommandOperationSchema,
  clientCommandRegistrationSchema,
  clientCommandReplySchema,
  clientCommandTargetSchema,
  type ClientCommandTarget,
  type ClientCommandRequest,
} from '@hbar/contracts/client-commands'
import { surfaceCommands } from '@hbar/contracts/commands/surfaces'
import type { IpcCallOptions } from '@hbar/runtime'

const published = new Set(
  Object.values(surfaceCommands)
    .filter((item) => item.metadata.visibility !== 'internal')
    .map((item) => item.metadata.id),
)

interface Target extends ClientCommandTarget {
  readonly connectionId: string
  readonly actorId: string
  readonly commands: ReadonlySet<string>
}
interface Pending {
  readonly target: Target
  readonly control: boolean
  finish(result?: unknown, error?: unknown): void
}

/** Stable Host transport only. It never executes a command or substitutes another client generation. */
export class ClientCommandRelay {
  private readonly targets = new Map<string, Target>()
  private readonly pending = new Map<string, Pending>()
  private closed = false
  constructor(private readonly send: (connectionId: string, request: ClientCommandRequest) => void) {}

  register(connectionId: string, actorId: string, raw: unknown) {
    if (this.closed) throw new HbarError('CANCELLED', 'The Host command relay is closed')
    const input = clientCommandRegistrationSchema.parse(raw)
    if (input.commands.some((id) => !published.has(id)))
      throw new HbarError('COMMAND_NOT_FOUND', 'This client command is not published by the Host catalog')
    const previous = this.targets.get(input.clientId)
    if (previous && previous.actorId !== actorId)
      throw new HbarError('FORBIDDEN', 'This command client belongs to another authenticated device')
    if (previous && previous.connectionId === connectionId && previous.generation === input.generation) {
      if (
        previous.commands.size !== new Set(input.commands).size ||
        input.commands.some((id) => !previous.commands.has(id))
      )
        throw new HbarError('COMMAND_TARGET_STALE', 'Changing published commands requires a new client generation')
      return {
        clientId: previous.clientId,
        generation: previous.generation,
        actorId,
        commands: [...previous.commands].sort(),
      }
    }
    if (!previous && this.targets.size >= 64) throw new HbarError('BUSY', 'Command client capacity is full')
    if (previous && (previous.connectionId !== connectionId || previous.generation !== input.generation))
      this.remove(
        previous,
        new HbarError('COMMAND_TARGET_STALE', 'The original command client generation was replaced'),
      )
    this.targets.set(input.clientId, { ...input, connectionId, actorId, commands: new Set(input.commands) })
    return {
      clientId: input.clientId,
      generation: input.generation,
      actorId,
      commands: [...new Set(input.commands)].sort(),
    }
  }
  list(actorId: string) {
    return {
      items: [...this.targets.values()]
        .filter((item) => item.actorId === actorId)
        .map(({ clientId, generation, commands }) => ({ clientId, generation, commands: [...commands].sort() }))
        .sort((a, b) => a.clientId.localeCompare(b.clientId)),
    }
  }
  assertTarget(raw: ClientCommandTarget, actorId: string, commandId?: string): Target {
    const input = clientCommandTargetSchema.parse(raw)
    const target = this.targets.get(input.clientId)
    if (!target || target.generation !== input.generation)
      throw new HbarError('COMMAND_TARGET_STALE', 'The selected command client generation is not connected')
    if (target.actorId !== actorId)
      throw new HbarError('FORBIDDEN', 'The command target must use the device that authorized the source task')
    if (commandId && !target.commands.has(commandId))
      throw new HbarError('CAPABILITY_UNAVAILABLE', 'The selected client did not publish this command')
    return target
  }
  async call<Output>(
    raw: ClientCommandTarget,
    actorId: string,
    method: string,
    input: unknown,
    output: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    if (this.closed) throw new HbarError('CANCELLED', 'The Host command relay is closed')
    options.signal?.throwIfAborted()
    const operation = clientCommandOperationSchema.parse({ method, input })
    const commandId =
      operation.method === 'prepare'
        ? operation.input.commandId
        : operation.method === 'command.jobs.start'
          ? operation.input.invocation.commandId
          : undefined
    const target = this.assertTarget(raw, actorId, commandId)
    if (operation.method !== 'prepare' && operation.input.actorId !== actorId)
      throw new HbarError('FORBIDDEN', 'The command job identity differs from the authenticated task')
    const control = operation.method === 'command.jobs.cancel' || operation.method === 'command.jobs.acknowledge'
    const sameClass = [...this.pending.values()].filter((item) => item.control === control)
    if (
      sameClass.length >= (control ? 64 : 256) ||
      sameClass.filter((item) => item.target.clientId === target.clientId).length >= (control ? 16 : 64)
    )
      throw new HbarError('BUSY', 'Command client request capacity is full')
    const timeoutMs = options.timeoutMs ?? 30_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new HbarError('INVALID_INPUT', 'Command client requests require a bounded deadline')
    const requestId = crypto.randomUUID()
    const result = await new Promise<unknown>((resolve, reject) => {
      const abort = () =>
        item.finish(undefined, options.signal?.reason ?? new HbarError('CANCELLED', 'Command client request cancelled'))
      const timer = setTimeout(
        () => item.finish(undefined, new HbarError('RESULT_UNKNOWN', 'The command client reply is unconfirmed')),
        timeoutMs,
      )
      const item: Pending = {
        target,
        control,
        finish: (value, error) => {
          if (!this.pending.delete(requestId)) return
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', abort)
          if (error !== undefined) reject(error)
          else resolve(value)
        },
      }
      this.pending.set(requestId, item)
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) {
        abort()
        return
      }
      try {
        this.send(target.connectionId, {
          clientId: target.clientId,
          generation: target.generation,
          requestId,
          operation,
        })
      } catch (error) {
        item.finish(undefined, error)
      }
    })
    return output.parse(result)
  }
  reply(connectionId: string, actorId: string, raw: unknown): void {
    const input = clientCommandReplySchema.parse(raw)
    const pending = this.pending.get(input.requestId)
    if (!pending) return
    if (
      pending.target.connectionId !== connectionId ||
      pending.target.actorId !== actorId ||
      pending.target.clientId !== input.clientId ||
      pending.target.generation !== input.generation
    )
      throw new HbarError('FORBIDDEN', 'This reply belongs to another command client or generation')
    if (input.outcome.ok) pending.finish(input.outcome.result)
    else pending.finish(undefined, new HbarError(input.outcome.error.code, input.outcome.error.message))
  }
  unregister(connectionId: string, actorId: string, raw: unknown): void {
    const input = clientCommandTargetSchema.parse(raw)
    const target = this.targets.get(input.clientId)
    if (!target || target.generation !== input.generation) return
    if (target.connectionId !== connectionId || target.actorId !== actorId)
      throw new HbarError('FORBIDDEN', 'The command client belongs to another connection')
    this.remove(target, new HbarError('COMMAND_TARGET_STALE', 'The command client unregistered'))
  }
  disconnected(connectionId: string): void {
    for (const target of [...this.targets.values()])
      if (target.connectionId === connectionId)
        this.remove(target, new HbarError('RESULT_UNKNOWN', 'The original command client disconnected'))
  }
  close(): void {
    this.closed = true
    for (const target of [...this.targets.values()])
      this.remove(target, new HbarError('RESULT_UNKNOWN', 'The Host command relay closed'))
  }
  private remove(target: Target, error: HbarError): void {
    if (this.targets.get(target.clientId) === target) this.targets.delete(target.clientId)
    for (const item of [...this.pending.values()]) if (item.target === target) item.finish(undefined, error)
  }
}

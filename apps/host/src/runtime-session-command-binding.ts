import { HbarError } from '@hbar/contracts'
import { createCommandExpectation } from '@hbar/commands'
import type { ToolCallPreparationPort } from '@hbar/kernel'
import {
  sessionCommandCallSchema,
  sessionCommandPreparationSchema,
  sessionCommandToolResultSchema,
} from '@hbar/kernel/session-command-port'
import { runtimeKernelCommandPrepareSchema, runtimeKernelCommandExecuteSchema } from '@hbar/kernel/runtime-port'
import type { IpcPeer } from '@hbar/runtime'
import {
  isRuntimeCommandSourceMethod,
  type RuntimeCommandSources,
  type RuntimeCommandSourceCapabilities,
} from './runtime-command-source'

/** Kernel-side composition. Only this private binding can replace the generic tool's rejecting executor. */
export function createRuntimeSessionCommandBinding(
  peer: IpcPeer,
  options?: {
    readonly sources: RuntimeCommandSources
    readonly capabilities: () => RuntimeCommandSourceCapabilities
  },
): ToolCallPreparationPort {
  return {
    async prepare(name, args, context) {
      if (name !== 'hbar_command_execute') return undefined
      const identity = { sessionId: context.session.id, runId: context.run.id, callId: context.callId }
      const prepared = await peer.call(
        'kernel.commands.prepare',
        runtimeKernelCommandPrepareSchema.parse({
          ...identity,
          call: sessionCommandCallSchema.parse(args),
        }),
        sessionCommandPreparationSchema,
        { signal: context.signal, timeoutMs: 20_000 },
      )
      const canonical = (input: unknown) =>
        JSON.stringify(
          createCommandExpectation({
            descriptor: prepared.descriptor,
            invocation: { ...prepared.invocation, input },
          }).input,
        )
      const expected = canonical(prepared.arguments)
      return {
        admission: prepared.admission,
        arguments: prepared.arguments,
        async execute(finalArgs, actual) {
          actual.signal.throwIfAborted()
          if (
            actual.session.id !== identity.sessionId ||
            actual.run.id !== identity.runId ||
            actual.callId !== identity.callId ||
            canonical(sessionCommandCallSchema.parse(finalArgs)) !== expected
          )
            throw new HbarError(
              'COMMAND_PREPARATION_INVALID',
              'The admitted command cannot change its source or final arguments',
            )
          const methods = prepared.sourceMethods.map((method) => {
            if (!isRuntimeCommandSourceMethod(method))
              throw new HbarError(
                'COMMAND_SOURCE_METHOD_UNAVAILABLE',
                'The prepared command requires an unavailable source method',
              )
            return method
          })
          if (methods.length && !options)
            throw new HbarError(
              'COMMAND_SOURCE_APPLICATION_REQUIRED',
              'This Kernel has no source command capability factory',
            )
          const opened =
            methods.length && options ? options.sources.open(actual, methods, options.capabilities()) : undefined
          try {
            const ticket = peer.callTracked(
              'kernel.commands.execute',
              runtimeKernelCommandExecuteSchema.parse({
                ...identity,
                preparation: prepared,
                ...(opened ? { source: opened.descriptor } : {}),
              }),
              sessionCommandToolResultSchema,
              { signal: actual.signal, timeoutMs: 1_325_000 },
            )
            void ticket.result.catch(() => undefined)
            const result = await ticket.settled
            const fileChanges = opened?.fileChanges()
            return { ...result, ...(fileChanges?.length ? { fileChanges } : {}) }
          } finally {
            await opened?.close()
          }
        },
      }
    },
  }
}

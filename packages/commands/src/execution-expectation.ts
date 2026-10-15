import {
  CommandError,
  commandExecutionExpectationSchema,
  type CommandDescriptor,
  type CommandExecutionExpectation,
  type CommandPreparation,
} from './protocol'
import { MAX_INVOCATION_BYTES } from './limits'

const MAX_DESCRIPTOR_BYTES = 524_288

/** Bounded plain JSON comparison, independent of insertion order and without a platform crypto dependency. */
function canonical(value: unknown, maximumBytes: number): string {
  const seen = new Set<object>()
  let nodes = 0
  const visit = (item: unknown, depth: number): string | undefined => {
    if (++nodes > 65_536 || depth > 64)
      throw new CommandError('INVALID_INPUT', 'Prepared command data exceeds its structural bound')
    if (item === undefined) return undefined
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return JSON.stringify(item)
    if (typeof item !== 'object' || seen.has(item))
      throw new CommandError('INVALID_INPUT', 'Prepared command data must be acyclic JSON')
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new CommandError('INVALID_INPUT', 'Prepared command data must use plain JSON objects')
    seen.add(item)
    try {
      if (Array.isArray(item)) return `[${Array.from(item, (child) => visit(child, depth + 1) ?? 'null').join(',')}]`
      const fields: string[] = []
      for (const [key, child] of Object.entries(item).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      )) {
        const encoded = visit(child, depth + 1)
        if (encoded !== undefined) fields.push(`${JSON.stringify(key)}:${encoded}`)
      }
      return `{${fields.join(',')}}`
    } finally {
      seen.delete(item)
    }
  }
  const result = visit(value, 0)
  if (result === undefined) throw new CommandError('INVALID_INPUT', 'Prepared command data is required')
  if (new TextEncoder().encode(result).byteLength > maximumBytes)
    throw new CommandError('INPUT_TOO_LARGE', 'Prepared command data exceeds its byte bound')
  return result
}

export interface CapturedCommandExpectation {
  detachInput(value: unknown): unknown
  detached(): CommandExecutionExpectation
  assertDescriptor(descriptor: CommandDescriptor): void
  assertInput(value: unknown): void
}

/** Snapshot before any async policy or owner work, so caller mutation cannot rewrite admission. */
export function captureCommandExpectation(value: CommandExecutionExpectation): CapturedCommandExpectation {
  const parsed = commandExecutionExpectationSchema.parse(value)
  const descriptor = canonical(parsed.descriptor, MAX_DESCRIPTOR_BYTES)
  const input = canonical(parsed.input, MAX_INVOCATION_BYTES)
  return {
    detachInput: (data) => JSON.parse(canonical(data, MAX_INVOCATION_BYTES)) as unknown,
    detached: () =>
      commandExecutionExpectationSchema.parse({
        descriptor: JSON.parse(descriptor) as unknown,
        input: JSON.parse(input) as unknown,
      }),
    assertDescriptor(actual) {
      if (canonical(actual, MAX_DESCRIPTOR_BYTES) !== descriptor)
        throw new CommandError(
          'COMMAND_PREPARATION_STALE',
          'Command definition changed after admission; prepare and approve it again',
        )
    },
    assertInput(actual) {
      if (canonical(actual, MAX_INVOCATION_BYTES) !== input)
        throw new CommandError(
          'COMMAND_PREPARATION_STALE',
          'Command arguments changed after admission; prepare and approve them again',
        )
    },
  }
}

/** Serializable and detached DTO for owner-side guarded dispatch. It grants no actor or permission. */
export function createCommandExpectation(prepared: CommandPreparation): CommandExecutionExpectation {
  const descriptor = canonical(prepared.descriptor, MAX_DESCRIPTOR_BYTES)
  const input = canonical(prepared.invocation.input, MAX_INVOCATION_BYTES)
  return commandExecutionExpectationSchema.parse({
    descriptor: JSON.parse(descriptor) as unknown,
    input: JSON.parse(input) as unknown,
  })
}

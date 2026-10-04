import { CommandError } from './protocol'

export const MAX_INVOCATION_BYTES = 262_144

/** Check serializable input before recursive schema validation, including structured callers. */
export function checkInvocationSize(value: unknown): void {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new CommandError('INVALID_INPUT', 'Command input must be serializable')
  }
  if (serialized === undefined) throw new CommandError('INVALID_INPUT', 'Command input is required')
  if (new TextEncoder().encode(serialized).byteLength > MAX_INVOCATION_BYTES)
    throw new CommandError('INPUT_TOO_LARGE', 'Command input exceeds the byte limit')
}

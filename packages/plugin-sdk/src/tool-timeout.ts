import { HbarError } from '@hbar/contracts'

export const DEFAULT_TOOL_TIMEOUT_MS = 20 * 60_000

export interface ToolTimeoutPolicy {
  /** Execution deadline in milliseconds, excluding approval wait. Defaults to 20 minutes. */
  readonly timeoutMs?: number
  /** Optional numeric input field selecting a deadline no greater than timeoutMs. */
  readonly timeoutArgument?: string
}

export function resolveToolTimeoutMs(policy: ToolTimeoutPolicy, args?: Record<string, unknown>): number {
  const limit = policy.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_147_483_647)
    throw new HbarError('INVALID_TOOL_TIMEOUT', 'Tool timeout must be a positive timer-safe integer in milliseconds')
  if (policy.timeoutArgument !== undefined && !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(policy.timeoutArgument))
    throw new HbarError('INVALID_TOOL_TIMEOUT', 'Tool timeout argument must name a numeric input field')
  const value = policy.timeoutArgument ? args?.[policy.timeoutArgument] : undefined
  if (value === undefined) return limit
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > limit)
    throw new HbarError('INVALID_TOOL_TIMEOUT', `Tool timeout must be an integer between 1 and ${limit} milliseconds`)
  return value
}

export function describeToolTimeout(policy: ToolTimeoutPolicy): string {
  const timeoutMs = resolveToolTimeoutMs(policy)
  return policy.timeoutArgument
    ? `Execution timeout: ${policy.timeoutArgument} milliseconds, up to ${timeoutMs} ms. A timeout returns a tool error; the Agent may continue.`
    : `Execution timeout: ${timeoutMs} ms. A timeout returns a tool error; the Agent may continue.`
}

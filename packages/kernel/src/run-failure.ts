import { HbarError, RUN_STEP_LIMIT_CODE } from '@hbar/contracts'
import { isAutonomyRepairCode } from '@hbar/contracts/autonomy-retry'
import type { RunFailure } from '@hbar/contracts'

/** Preserve typed Host failures. Text matching is only a legacy/provider fallback. */
export function classifyRunFailure(error: unknown): RunFailure {
  const code = error instanceof HbarError ? error.code : null
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'GOAL_BUDGET_EXHAUSTED' || code === 'BUDGET_EXHAUSTED')
    return {
      code,
      category: 'budget',
      retryable: false,
      budgetSource: code === 'GOAL_BUDGET_EXHAUSTED' ? 'goal' : 'session',
    }
  if (code === 'USER_CANCELLED') return { code, category: 'cancelled', retryable: false }
  if (code === 'RUN_TIMEOUT' || code === 'COMPACTION_TIMEOUT') return { code, category: 'timeout', retryable: false }
  if (code === 'HOST_SHUTTING_DOWN') return { code, category: 'interrupted', retryable: false }
  if (code === 'RESULT_UNKNOWN' || code === 'EFFECT_UNKNOWN')
    return { code, category: 'result_unknown', retryable: false }
  if (code === 'PROVIDER_CONNECTION_FAILED' || code === 'PROVIDER_STREAM_INTERRUPTED' || code === 'PROVIDER_TRANSIENT')
    return { code, category: 'transient', retryable: true }
  if (code === 'PROVIDER_USAGE_LIMIT') return { code, category: 'usage_limit', retryable: false }
  if (code !== null && isAutonomyRepairCode(code)) return { code, category: 'execution', retryable: true }
  if (code === RUN_STEP_LIMIT_CODE) return { code: RUN_STEP_LIMIT_CODE, category: 'execution', retryable: false }
  // An explicit Host/tool cause cannot become a provider failure because its
  // message happens to mention a status, errno or quota. Legacy text is untyped.
  if (code !== null) return { code, category: 'execution', retryable: false }
  if (/(insufficient (?:credits|quota)|usage[_ -]?limit|quota (?:exceeded|exhausted))/i.test(message))
    return { code: code ?? 'PROVIDER_USAGE_LIMIT', category: 'usage_limit', retryable: false }
  if (
    /(rate[_ -]?limit|too many requests|\b429\b|\b(?:502|503|504)\b|ECONNRESET|ETIMEDOUT|temporarily unavailable)/i.test(
      message,
    ) ||
    // Bun's fetch stream may surface its socket closure without an errno code.
    // Do not reclassify a typed Host failure merely because it contains this provider text.
    (code === null && /\bThe socket connection was closed unexpectedly\b/i.test(message))
  )
    return { code: code ?? 'PROVIDER_TRANSIENT', category: 'transient', retryable: true }
  return { code: code ?? 'RUN_FAILED', category: 'execution', retryable: false }
}

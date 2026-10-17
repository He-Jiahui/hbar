import { HbarError } from '@hbar/contracts'
import {
  AUTONOMY_DECISION_MODE_SETTING,
  AUTONOMY_DECISION_TARGET_SETTING,
  AUTONOMY_DECISION_TIMEOUT_SETTING,
  AUTONOMY_DECISION_DEFAULT_TIMEOUT_SECONDS,
  autonomyDecisionModeSchema,
  autonomyDecisionPolicySchema,
  type AutonomyDecisionPolicy,
  type AutonomyPolicyResolution,
} from '@hbar/contracts/autonomy'
import { encodePath } from '@hbar/schema-core'
import type { SettingsResolution } from '@hbar/settings-core'

const field = (name: string) => encodePath([{ kind: 'field', name }])

export function resolveAutonomyDecisionPolicy(resolution: SettingsResolution): {
  readonly policy: AutonomyDecisionPolicy
  readonly source: AutonomyPolicyResolution['source']
} {
  const modeReport = resolution.reports[field(AUTONOMY_DECISION_MODE_SETTING)]
  if (!modeReport) throw new HbarError('AUTONOMY_POLICY_UNAVAILABLE', 'The decision policy description is unavailable')
  let source: AutonomyPolicyResolution['source']
  if (modeReport.sourceLayer === 'default') source = 'default'
  else if (modeReport.sourceLayer === 'settings:global') source = 'global'
  else if (modeReport.sourceLayer.startsWith('settings:session:')) source = 'session'
  else throw new HbarError('INVALID_AUTONOMY_POLICY', 'Decision policy has an unsupported settings source')
  const parsedMode = autonomyDecisionModeSchema.safeParse(modeReport.effectiveValue)
  if (!parsedMode.success) throw new HbarError('INVALID_AUTONOMY_POLICY', 'The saved decision mode is invalid')
  const mode = parsedMode.data
  const timeout =
    resolution.reports[field(AUTONOMY_DECISION_TIMEOUT_SETTING)]?.effectiveValue ??
    AUTONOMY_DECISION_DEFAULT_TIMEOUT_SECONDS
  const policy = autonomyDecisionPolicySchema.safeParse(
    mode === 'delegate'
      ? {
          mode,
          targetSessionId: resolution.reports[field(AUTONOMY_DECISION_TARGET_SETTING)]?.effectiveValue,
          ...(timeout === AUTONOMY_DECISION_DEFAULT_TIMEOUT_SECONDS
            ? {}
            : {
                timeoutMs: typeof timeout === 'number' ? timeout * 1_000 : timeout,
              }),
        }
      : { mode },
  )
  if (!policy.success) throw new HbarError('AUTONOMY_TARGET_REQUIRED', 'Delegation requires an explicit target session')
  return { policy: policy.data, source }
}

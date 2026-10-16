import type { Database } from 'bun:sqlite'
import { HbarError } from '@hbar/contracts'
import type { AutonomyPolicyResolution } from '@hbar/contracts/autonomy'

/** Only the transaction committing the original decision may validate its settings proof. */
export function assertAutomaticDecisionPolicy(
  db: Database,
  sessionId: string,
  policy: AutonomyPolicyResolution,
  mode: 'recommended' | 'delegate' = 'recommended',
): void {
  if (policy.policy.mode !== mode || policy.sessionId !== sessionId || policy.source === 'default')
    throw new HbarError(
      'AUTOMATIC_APPROVAL_INVALID',
      'Automatic approval requires its original explicit decision policy',
    )
  const revisions = Object.entries(policy.revisions)
  if (!revisions.length || revisions.length > 16)
    throw new HbarError('AUTOMATIC_APPROVAL_INVALID', 'Automatic approval requires its bounded settings revisions')
  for (const [id, expected] of revisions) {
    const layer = db.query<{ revision: number }, [string]>('SELECT revision FROM settings_layers WHERE id=?').get(id)
    if ((layer?.revision ?? 0) !== expected)
      throw new HbarError('DECISION_POLICY_CHANGED', 'The decision policy changed before approval was committed')
  }
}

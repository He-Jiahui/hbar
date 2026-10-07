import type { ComposerIntentState } from '@hbar/app-runtime'

/** Only confirmed facts owned by the captured Session may appear in its Activity. */
export function projectActivityTasks(facts: ComposerIntentState['facts'], sessionId: string) {
  const matched = facts.sessionId === sessionId && facts.snapshot?.sessionId === sessionId
  const plan = matched && facts.snapshot?.plan?.sessionId === sessionId ? facts.snapshot.plan : null
  const steps = plan?.plan ?? []
  return {
    steps,
    revision: plan?.revision ?? null,
    explanation: plan?.explanation ?? null,
    completed: steps.filter((step) => step.status === 'completed').length,
    loading: facts.sessionId !== sessionId || facts.status === 'loading' || facts.status === 'idle',
    failed: facts.sessionId === sessionId && facts.status === 'error',
  }
}

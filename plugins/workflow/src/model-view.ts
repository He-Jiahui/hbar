import type { WorkflowSnapshot } from '@hbar/contracts'
import type { ToolResult } from '@hbar/plugin-sdk'

/** Model-facing facts only. Durable/UI details keep the complete authoritative snapshot. */
export function workflowModelView({ plan, workflow }: WorkflowSnapshot) {
  return {
    plan: plan && { revision: plan.revision, plan: plan.plan, explanation: plan.explanation },
    workflow: workflow && {
      revision: workflow.revision,
      status: workflow.status,
      planRevision: workflow.planRevision,
      explorationCount: workflow.explorationCount,
      focus: workflow.focus && {
        itemId: workflow.focus.focusId,
        stepIndex: workflow.focus.stepIndex,
        status: workflow.focus.status,
        scope: workflow.focus.scope,
        completionPolicy: workflow.focus.completionPolicy,
        acceptanceChecks: workflow.focus.acceptanceChecks.map(({ updatedAt: _updatedAt, ...check }) => check),
      },
      ...(workflow.delegations.length
        ? {
            delegations: workflow.delegations.map(({ itemId, agentId, status, patchId, modelId, tokenBudget }) => ({
              itemId,
              agentId,
              status,
              patchId,
              modelId,
              tokenBudget,
            })),
          }
        : {}),
      ...(workflow.evidence.length
        ? {
            evidence: workflow.evidence.map(({ evidenceId, itemId, checkId, planRevision, source, outcome }) => ({
              evidenceId,
              itemId,
              checkId,
              planRevision,
              source,
              outcome,
            })),
          }
        : {}),
      ...(workflow.rejection
        ? {
            rejection: {
              toolName: workflow.rejection.toolName,
              path: workflow.rejection.path,
              reason: workflow.rejection.reason,
              count: workflow.rejection.count,
            },
          }
        : {}),
      ...(workflow.review
        ? {
            review: {
              reviewId: workflow.review.reviewId,
              status: workflow.review.status,
              summary: workflow.review.summary,
            },
          }
        : {}),
    },
  }
}

export function workflowModelResult(snapshot: WorkflowSnapshot): ToolResult {
  return { text: JSON.stringify(workflowModelView(snapshot)), details: snapshot }
}

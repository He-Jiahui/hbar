import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarWorkflowOverview } from '@hbar/app-react'
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'
import {
  WORKFLOW_SCHEMA_VERSION,
  planStateSchema,
  workflowPublicStateSchema,
  workflowSnapshotSchema,
} from '@hbar/contracts'
import { agentRecordSchema } from '@hbar/contracts/commands/agents'
import { getShellCopy } from '../apps/web/src/shell-copy'

function entry(evidenceCount = 1, activeItemId: string | null = 'implement'): WorkflowWorkspaceEntryState {
  const plan = planStateSchema.parse({
    sessionId: 'session',
    revision: 1,
    turnId: null,
    explanation: 'Ship verified work',
    plan: [
      { step: 'Implement a deliberately long focused workflow item that must wrap safely', status: 'in_progress' },
    ],
    updatedAt: 1,
  })
  const snapshot = workflowSnapshotSchema.parse({
    plan,
    workflow: workflowPublicStateSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      executionModel: 'focus_v2',
      workflowId: 'workflow',
      sessionId: 'session',
      goalId: 'goal',
      planRevision: 1,
      revision: 2,
      status: 'waiting_user',
      explorationCount: 0,
      focus:
        activeItemId && activeItemId !== 'missing'
          ? {
              focusId: activeItemId,
              planRevision: 1,
              stepIndex: 0,
              stepTextHash: 'a'.repeat(64),
              title: plan.plan[0]!.step,
              status: 'verifying',
              completionPolicy: 'user',
              scope: {
                readPaths: ['src/a/very/long/read/path/that/must/wrap'],
                writePaths: ['src/a/very/long/write/path/that/must/wrap'],
                tools: ['read_file', 'write_file'],
              },
              acceptanceChecks: [
                {
                  id: 'review',
                  description: 'A reviewer accepts the integrated result after external verification',
                  required: true,
                  verifier: { kind: 'user' },
                  status: 'pending',
                  evidenceId: null,
                  updatedAt: 1,
                },
              ],
              startedAt: 1,
              completedAt: null,
            }
          : null,
      scopeExpansions: [],
      delegations: [
        {
          delegationId: 'delegation',
          itemId: 'implement',
          agentId: 'agent',
          modelId: 'fixture',
          tokenBudget: 100,
          status: 'conflict',
          patchId: 'patch',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      evidence: Array.from({ length: evidenceCount }, (_, index) => ({
        evidenceId: `evidence-${index}`,
        itemId: 'implement',
        checkId: 'review',
        planRevision: 1,
        workspaceRevision: null,
        createdAt: index + 1,
        source: 'user' as const,
        outcome: 'rejected' as const,
        actorId: 'reviewer',
        note: null,
      })),
      createdAt: 1,
      updatedAt: 2,
    }),
  })
  const agent = agentRecordSchema.parse({
    agentId: 'agent',
    parentSessionId: 'session',
    sessionId: 'agent-session',
    runId: 'run',
    requestId: 'request',
    objective: 'Implement',
    modelId: 'fixture',
    tokenBudget: 100,
    status: 'completed',
    error: null,
    isolated: true,
    resultSummary: 'Patch needs coordination with the parent version.',
    patch: {
      patchId: 'patch',
      agentId: 'agent',
      parentSessionId: 'session',
      itemId: 'implement',
      planRevision: 1,
      status: 'conflict',
      artifactId: 'artifact',
      artifactSha256: 'a'.repeat(64),
      files: [
        {
          path: 'src/a/very/long/write/path/that/must/wrap',
          operation: 'update',
          beforeSha256: 'b'.repeat(64),
          afterSha256: 'c'.repeat(64),
        },
      ],
      summary: 'Patch needs coordination with the parent version.',
      createdAt: 2,
      appliedAt: null,
    },
    createdAt: 1,
    updatedAt: 2,
  })
  return {
    instanceId: 'panel',
    sessionId: 'session',
    status: 'ready',
    snapshot,
    agents: { agent },
    visibleEvidence: Math.min(evidenceCount, 20),
    actions: {},
    error: null,
  }
}

test('workflow overview renders host-supplied Chinese copy, one scoped focus, checks, and conflict coordination', () => {
  const labels = getShellCopy('zh-CN').goals.workflow
  const html = renderToStaticMarkup(
    <HbarWorkflowOverview entry={entry()} labels={labels} connected instanceId="panel" invoke={() => undefined} />,
  )
  expect(html).toContain('专注工作流')
  expect(html).toContain('当前焦点')
  expect(html).toContain('验收清单')
  expect(html).toContain('进入冲突协调')
  expect(html).toContain('src/a/very/long/write/path/that/must/wrap')
  expect(html).toContain(
    'aria-label="接受验收项：A reviewer accepts the integrated result after external verification"',
  )
})

test('workflow overview covers empty, stale-focus, evidence boundary, and boundary-plus-one states', () => {
  const base = getShellCopy('en-US').goals.workflow
  const labels = { ...base, title: 'A very long localized workflow heading that must remain visible on narrow panes' }
  const empty: WorkflowWorkspaceEntryState = {
    instanceId: 'panel',
    sessionId: 'session',
    status: 'ready',
    snapshot: workflowSnapshotSchema.parse({ plan: null, workflow: null }),
    agents: {},
    visibleEvidence: 0,
    actions: {},
    error: null,
  }
  expect(
    renderToStaticMarkup(
      <HbarWorkflowOverview entry={empty} labels={labels} connected instanceId="panel" invoke={() => undefined} />,
    ),
  ).toContain('This session does not have a focused workflow.')

  const boundary = renderToStaticMarkup(
    <HbarWorkflowOverview
      entry={entry(20, 'missing')}
      labels={labels}
      connected
      instanceId="panel"
      invoke={() => undefined}
    />,
  )
  expect(boundary).toContain('The focus is stale; refresh or record a checkpoint.')
  expect(boundary).toContain('Showing 20 of 20')
  expect(boundary).not.toContain('Load more evidence')

  const overBoundary = renderToStaticMarkup(
    <HbarWorkflowOverview entry={entry(21)} labels={labels} connected instanceId="panel" invoke={() => undefined} />,
  )
  expect(overBoundary).toContain(labels.title)
  expect(overBoundary).toContain('Showing 20 of 21')
  expect(overBoundary).toContain('Load more evidence')
})

test('autonomous workflow states expose review and recovery without manual acceptance controls', () => {
  const labels = getShellCopy('en-US').goals.workflow
  const value = entry()
  const autonomous: WorkflowWorkspaceEntryState = {
    ...value,
    snapshot: {
      ...value.snapshot,
      workflow: {
        ...value.snapshot.workflow!,
        status: 'needs_revision',
        focus: { ...value.snapshot.workflow!.focus!, completionPolicy: 'agent' },
        review: {
          reviewId: 'review',
          planRevision: 1,
          stepTextHash: 'a'.repeat(64),
          workspaceFingerprint: 'b'.repeat(64),
          resumeModelId: 'fixture',
          reviewerAgentId: 'agent',
          status: 'rejected',
          summary: 'One assertion needs revision.',
          createdAt: 1,
          updatedAt: 2,
        },
        rejection: {
          fingerprint: 'c'.repeat(64),
          toolName: 'read_file',
          path: 'src/a/very/long/read/path/that/must/wrap',
          reason: 'The same bounded path was denied repeatedly.',
          count: 3,
          updatedAt: 2,
        },
      },
    },
  }
  const html = renderToStaticMarkup(
    <HbarWorkflowOverview entry={autonomous} labels={labels} connected instanceId="panel" invoke={() => undefined} />,
  )
  expect(html).toContain('Agent judgment')
  expect(html).toContain('Independent review')
  expect(html).toContain('Recovery diagnosis')
  expect(html).toContain('3 consecutive matching denials')
  expect(html).not.toContain('aria-label="Accept check:')
})

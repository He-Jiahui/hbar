import { expect, test } from 'bun:test'
import {
  firstSendIsLocked,
  firstSendNeedsContinue,
  launchSelectionBranchName,
} from '../packages/app-react/src/pre-session-launch-model'
import { preSessionDraftStateSchema, type PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'

test('launch labels keep base branch distinct from shared and legacy execution selections', () => {
  expect(launchSelectionBranchName({ mode: 'shared-current' })).toBeNull()
  expect(
    launchSelectionBranchName({
      mode: 'isolated-worktree',
      branch: { kind: 'derived', baseRef: 'refs/heads/feature/体验' },
    }),
  ).toBe('feature/体验')
  expect(launchSelectionBranchName({ mode: 'isolated-worktree', branch: { kind: 'existing', name: 'existing' } })).toBe(
    'existing',
  )
  expect(launchSelectionBranchName({ mode: 'isolated-worktree', branch: { kind: 'new', name: 'new' } })).toBe('new')
})

function draft(phase: PreSessionDraftState['phase'], paused = false): PreSessionDraftState {
  return preSessionDraftStateSchema.parse({
    draftId: '12345678-1234-4234-8234-123456789012',
    workspaceId: 'workspace',
    text: 'Keep this draft',
    launchSelection: { mode: 'shared-current' },
    modelId: null,
    thinkingLevel: null,
    approvalChoice: 'inherit',
    planMode: 'default',
    intent: 'default',
    revision: 1,
    phase,
    unknownStage: null,
    error: null,
    sessionId: 'session',
    capturedWorkspaceId: 'workspace',
    capturedRevision: 1,
    capturedLaunchSelection: { mode: 'shared-current' },
    operationId: null,
    accepted: null,
    launchPreparation: paused
      ? { phase: 'paused-navigation', targetRevision: 1, snapshot: null, error: null, cancelRequested: false }
      : null,
  })
}

test('first-send ownership locks duplicate composer submissions until accepted, cancelled or known failure', () => {
  for (const phase of ['preparing', 'creating', 'configuring', 'submitting', 'unknown'] as const)
    expect(firstSendIsLocked(draft(phase))).toBe(true)
  for (const phase of ['idle', 'failed', 'accepted'] as const) expect(firstSendIsLocked(draft(phase))).toBe(false)
  expect(firstSendIsLocked(draft('failed', true))).toBe(true)
  expect(firstSendIsLocked(undefined)).toBe(false)
})

test('ready after result reconciliation still belongs to the original explicit Continue flow', () => {
  const ready = preSessionDraftStateSchema.parse({
    ...draft('failed'),
    error: 'CONTINUE_REQUIRED',
    launchPreparation: { phase: 'ready', targetRevision: 1, snapshot: null, error: null, cancelRequested: false },
  })
  expect(firstSendNeedsContinue(ready)).toBe(true)
  expect(firstSendIsLocked(ready)).toBe(true)
  expect(firstSendNeedsContinue(draft('failed'))).toBe(false)
})

import { expect, test } from 'bun:test'
import { getComposerState, isSessionWorkspaceMoveLocked, type ComposerStateInput } from '@hbar/app-runtime'

const ready: ComposerStateInput = {
  connected: true,
  sessionLoaded: true,
  timelineStatus: 'ready',
  cancelAllowed: false,
  preparation: 'ready',
  firstSend: undefined,
  workspaceMove: undefined,
  draft: { status: 'idle', text: 'Send this', attachments: [], attachmentTransfers: [], workspaceContexts: [] },
  configured: true,
  modelPending: false,
  intentPending: false,
  permissionLocked: false,
  planModeReady: true,
  intent: 'default',
  slash: null,
  goalReplacement: false,
  goalActionPending: false,
  runActive: false,
  compactionRunning: false,
}
test('submission is blocked by every relevant unavailable or uncertain fact', () => {
  expect(getComposerState(ready).canSubmit).toBe(true)
  for (const blocked of [
    { connected: false },
    { preparation: 'archived' as const },
    { preparation: 'unverified' as const },
    { configured: false },
    { modelPending: true },
    { intentPending: true },
    { permissionLocked: true },
    { planModeReady: false },
    { draft: undefined },
    { draft: { ...ready.draft!, text: '' } },
    { draft: { ...ready.draft!, status: 'unknown' as const } },
    { draft: { ...ready.draft!, status: 'submitting' as const } },
    { workspaceMove: { status: 'paused' as const, targetSessionId: null } },
  ])
    expect(getComposerState({ ...ready, ...blocked }).canSubmit).toBe(false)
})
test('local actions preserve their preparation and recovery exceptions without bypassing ownership locks', () => {
  expect(getComposerState({ ...ready, preparation: 'archived', configured: false, slash: 'settings' }).canSubmit).toBe(
    true,
  )
  expect(getComposerState({ ...ready, preparation: 'archived', slash: 'model' }).canSubmit).toBe(false)
  expect(getComposerState({ ...ready, slash: 'compact', runActive: true }).canSubmit).toBe(false)
  expect(getComposerState({ ...ready, slash: 'compact', compactionRunning: true }).canSubmit).toBe(false)
  expect(getComposerState({ ...ready, slash: 'goal', goalActionPending: true }).canSubmit).toBe(false)
  expect(getComposerState({ ...ready, slash: 'goal', permissionLocked: true, goalReplacement: true }).canSubmit).toBe(
    true,
  )
  expect(getComposerState({ ...ready, slash: 'goal', permissionLocked: true }).canSubmit).toBe(false)
})
test('workspace migration locks the source and known target until success is confirmed', () => {
  for (const status of ['busy', 'unknown', 'paused'] as const)
    expect(isSessionWorkspaceMoveLocked({ status, targetSessionId: null })).toBe(true)
  expect(isSessionWorkspaceMoveLocked({ status: 'failed', targetSessionId: 'target' })).toBe(true)
  expect(isSessionWorkspaceMoveLocked({ status: 'succeeded', targetSessionId: 'target' })).toBe(false)
  expect(isSessionWorkspaceMoveLocked({ status: 'failed', targetSessionId: null })).toBe(false)
})

test('composer reasons prioritize ownership and recovery while offline text remains editable', () => {
  const offline = getComposerState({ ...ready, connected: false, modelPending: true })
  expect(offline.blockedReason).toBe('disconnected')
  expect(offline.editorDisabled).toBe(false)
  expect(offline.locked).toBe(false)
  const moving = getComposerState({
    ...ready,
    workspaceMove: { status: 'unknown', targetSessionId: null },
    permissionLocked: true,
  })
  expect(moving.blockedReason).toBe('workspace-move')
  expect(moving.editorDisabled).toBe(true)
  expect(moving.optionControlsLocked).toBe(true)
  expect(moving.intentControlsLocked).toBe(true)
  const permission = getComposerState({ ...ready, permissionLocked: true })
  expect(permission.blockedReason).toBe('permission')
  expect(permission.editorDisabled).toBe(false)
  expect(permission.optionControlsLocked).toBe(false)
  expect(permission.intentControlsLocked).toBe(true)
  expect(getComposerState({ ...ready, timelineStatus: 'error' }).blockedReason).toBe('history')
  expect(
    getComposerState({ ...ready, slash: 'goal', permissionLocked: true, goalReplacement: true }).blockedReason,
  ).toBeNull()
})

test('an active stop stays visible while only a confirmed owned cancellation can dispatch', () => {
  const running = { ...ready, runActive: true, cancelAllowed: true }
  expect(getComposerState(running).canStop).toBe(true)
  const checking = getComposerState({ ...running, cancelAllowed: false })
  expect(checking.showStop).toBe(true)
  expect(checking.canStop).toBe(false)
  expect(getComposerState({ ...running, connected: false }).canStop).toBe(false)
  expect(getComposerState({ ...running, runActive: false }).showStop).toBe(false)
})

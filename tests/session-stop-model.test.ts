import { describe, expect, test } from 'bun:test'
import type { RunActionState, WorkspaceTabRef } from '@hbar/app-runtime'
import {
  activeSessionStopRun,
  sameSessionStopScope,
  sameSessionStopTarget,
  sessionStopCanCancel,
  sessionStopFeedback,
  sessionStopScope,
  sessionStopTarget,
  sessionStopToolMatches,
  shouldStopSessionKey,
  type SessionStopKey,
  type SessionStopKeyScope,
  type SessionStopRun,
  type SessionStopScope,
  type SessionStopSnapshot,
  type SessionStopTarget,
} from '../packages/app-react/src/session-stop-model'
import { currentSessionRun } from '../packages/app-react/src/session-run-activity'

const tab: WorkspaceTabRef = {
  kind: 'session',
  id: 'tab-a',
  instanceKey: 'instance-a',
  sessionId: 'session-a',
  workspaceId: 'workspace-a',
}
const running: SessionStopRun = { id: 'run-a', sessionId: 'session-a', status: 'running' }
const queued: SessionStopRun = { id: 'run-queued', sessionId: 'session-a', status: 'queued' }
const base: SessionStopSnapshot = {
  hostId: 'host-a',
  runtimeId: 'runtime-a',
  connected: true,
  navigation: { workspaceId: 'workspace-a', sessionId: 'session-a', status: 'idle', error: null },
  tabs: { activeId: tab.id, items: [tab] },
  presentation: { page: { kind: 'session' }, toolInstanceId: null, modalInstanceId: null },
  surfaces: { panels: {} },
  timeline: { sessionId: 'session-a', status: 'ready', runs: [queued, running] },
  actions: {},
}
const scope: SessionStopScope = {
  hostId: base.hostId,
  runtimeId: base.runtimeId,
  workspaceId: 'workspace-a',
  sessionId: 'session-a',
  tabId: tab.id,
  tabInstanceKey: tab.instanceKey,
}
const target: SessionStopTarget = { ...scope, operationId: running.id }
const key: SessionStopKey = {
  key: '.',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  defaultPrevented: false,
  isComposing: false,
  keyCode: 190,
}
const keyScope: SessionStopKeyScope = { scope: 'main', mainVisible: true, toolVisible: false, overlayOpen: false }
const tool: SessionStopSnapshot = {
  ...base,
  presentation: { ...base.presentation, toolInstanceId: 'files-a' },
  surfaces: {
    panels: {
      'files-a': {
        instanceId: 'files-a',
        panelId: 'files',
        sessionTool: true,
        binding: 'pinned',
        sessionId: 'session-a',
        workspaceId: 'workspace-a',
        params: {},
      },
    },
  },
}

function withAction(patch: Partial<RunActionState> = {}, snapshot: SessionStopSnapshot = base): SessionStopSnapshot {
  return {
    ...snapshot,
    actions: {
      ...snapshot.actions,
      [running.id]: {
        operationId: running.id,
        commandId: 'operation.cancel',
        status: 'unknown',
        error: null,
        ...patch,
      },
    },
  }
}

describe('Stop scope derives exact session and tab ownership', () => {
  test('captures identity without carrying action state, and retains it offline', () => {
    expect(sessionStopScope(base)).toEqual(scope)
    expect(sessionStopScope({ ...base, connected: false })).toEqual(scope)
    expect(sessionStopTarget(base)).toEqual(target)
    expect(sessionStopTarget({ ...base, connected: false })).toBeNull()
  })

  test.each(['loading', 'error'] as const)('rejects non-idle navigation %s', (status) => {
    const snapshot = { ...base, navigation: { ...base.navigation, status } }
    expect(sessionStopScope(snapshot)).toBeNull()
    expect(sessionStopTarget(snapshot)).toBeNull()
  })

  test.each(['settings', 'status'] as const)('does not infer the old session on %s page', (kind) => {
    expect(
      sessionStopScope({ ...base, presentation: { ...base.presentation, page: { kind, instanceId: kind } } }),
    ).toBeNull()
  })

  test('retained no-tab view requires matching current navigation and timeline', () => {
    const retained = { ...base, tabs: { ...base.tabs, activeId: null } }
    expect(sessionStopScope(retained)).toEqual({ ...scope, tabId: null, tabInstanceKey: null })
    expect(sessionStopTarget(retained)?.operationId).toBe(running.id)
    expect(sessionStopScope({ ...retained, timeline: { ...base.timeline, sessionId: 'session-b' } })).toBeNull()
    expect(sessionStopScope({ ...retained, navigation: { ...base.navigation, sessionId: null } })).toBeNull()
    expect(sessionStopScope({ ...retained, navigation: { ...base.navigation, workspaceId: null } })).toBeNull()
  })

  test('missing/duplicate active tabs cannot become retained-view permission', () => {
    expect(sessionStopScope({ ...base, tabs: { activeId: 'missing', items: [tab] } })).toBeNull()
    expect(sessionStopScope({ ...base, tabs: { activeId: tab.id, items: [tab, { ...tab }] } })).toBeNull()
  })

  test('different tab session/project and expanded workbench never target the source Run', () => {
    for (const changed of [
      { ...tab, sessionId: 'session-b' },
      { ...tab, workspaceId: 'workspace-b' },
    ])
      expect(sessionStopScope({ ...base, tabs: { activeId: tab.id, items: [changed] } })).toBeNull()
    const workbench: WorkspaceTabRef = {
      kind: 'workbench',
      id: 'workbench',
      instanceKey: 'instance-w',
      panelInstanceId: 'files-a',
      sourceSessionId: 'session-a',
      workspaceId: 'workspace-a',
    }
    expect(sessionStopScope({ ...base, tabs: { activeId: workbench.id, items: [tab, workbench] } })).toBeNull()
  })

  test.each(['hostId', 'runtimeId', 'workspaceId', 'sessionId', 'tabId', 'tabInstanceKey'] as const)(
    'captured %s replacement fences old feedback and identity',
    (field) => {
      const changed = { ...target, [field]: `${target[field]}-replacement` }
      expect(sameSessionStopScope(target, changed)).toBe(false)
      expect(sameSessionStopTarget(target, changed)).toBe(false)
      expect(sessionStopFeedback(withAction(), changed)).toBeNull()
      const blank = { ...scope, [field]: ' \t ' }
      expect(sameSessionStopScope(blank, { ...blank })).toBe(false)
    },
  )

  test('reopen A uses its new tab instance; close-to-retained is a different lifetime', () => {
    const reopened = { ...base, tabs: { activeId: tab.id, items: [{ ...tab, instanceKey: 'new-instance' }] } }
    expect(sessionStopFeedback(withAction({}, reopened), target)).toBeNull()
    expect(sameSessionStopTarget(target, { ...target })).toBe(true)
    expect(sameSessionStopTarget(target, { ...target, operationId: queued.id })).toBe(false)
    expect(sameSessionStopTarget({ ...target, operationId: ' ' }, { ...target, operationId: ' ' })).toBe(false)
    expect(sameSessionStopScope(scope, { ...scope, tabId: null, tabInstanceKey: null })).toBe(false)
    expect(sameSessionStopScope({ ...scope, tabId: null }, { ...scope, tabId: null })).toBe(false)
    expect(sameSessionStopScope(null, null)).toBe(false)
    expect(sameSessionStopTarget(null, null)).toBe(false)
  })
})

describe('Stop chooses the authoritative primary Run before checking its lock', () => {
  test('matches currentSessionRun(active) priority; never returns its terminal fallback', () => {
    const waiting: SessionStopRun = { ...running, id: 'run-waiting', status: 'waiting_approval' }
    for (const runs of [[queued, running], [queued, waiting], [waiting, running], [queued]]) {
      expect(activeSessionStopRun(runs)).toBe(currentSessionRun(runs))
    }
    expect(activeSessionStopRun([{ ...running, status: 'completed' }])).toBeUndefined()
    expect(sessionStopTarget({ ...base, timeline: { ...base.timeline, runs: [] } })).toBeNull()
  })

  test.each(['submitting', 'unknown', 'succeeded'] as const)(
    'a primary cancel %s cannot fall through to queued',
    (status) => {
      const snapshot = withAction({ status })
      expect(sessionStopTarget(snapshot)).toBeNull()
      expect(sessionStopCanCancel(snapshot, running.id)).toBe(false)
      // An explicit activity-row click is a different user intent.
      expect(sessionStopCanCancel(snapshot, queued.id)).toBe(true)
      expect(shouldStopSessionKey(key, keyScope, snapshot)).toBe(false)
    },
  )

  test('physical occupancy locks even failed/accepted actions; terminal retry success does not', () => {
    expect(sessionStopTarget(withAction({ status: 'failed', requestInFlight: true }))).toBeNull()
    expect(sessionStopTarget(withAction({ commandId: 'run.retry', status: 'succeeded' }))).toEqual(target)
    expect(sessionStopTarget(withAction({ commandId: 'run.retry', status: 'submitting' }))).toBeNull()
    expect(sessionStopTarget(withAction({ commandId: 'run.retry', status: 'unknown' }))).toBeNull()
    expect(sessionStopTarget(withAction({ status: 'failed' }))).toEqual(target)
  })

  test.each(['idle', 'loading', 'error'] as const)('timeline %s is not write-ready', (status) => {
    const snapshot = { ...base, timeline: { ...base.timeline, status } }
    expect(sessionStopScope(snapshot)).toEqual(scope)
    expect(sessionStopTarget(snapshot)).toBeNull()
    expect(sessionStopCanCancel(snapshot, queued.id)).toBe(false)
  })

  test('foreign, terminal, duplicated and mismatched action targets cannot be written', () => {
    const other: SessionStopRun = { ...running, id: 'foreign', sessionId: 'session-b' }
    const snapshot = {
      ...base,
      timeline: { ...base.timeline, runs: [other, { ...running, status: 'cancelled' as const }, queued] },
    }
    expect(sessionStopTarget(snapshot)?.operationId).toBe(queued.id)
    expect(sessionStopCanCancel(snapshot, running.id)).toBe(false)
    expect(sessionStopCanCancel(snapshot, other.id)).toBe(false)
    expect(sessionStopCanCancel(base, 'missing')).toBe(false)
    expect(sessionStopCanCancel(base, ' ')).toBe(false)
    expect(
      sessionStopCanCancel({ ...base, timeline: { ...base.timeline, runs: [running, { ...running }] } }, running.id),
    ).toBe(false)
    expect(sessionStopCanCancel(withAction({ operationId: 'wrong', status: 'failed' }), running.id)).toBe(false)
    expect(sessionStopCanCancel(withAction({ sessionId: 'session-b', status: 'failed' }), running.id)).toBe(false)
  })
})

describe('Stop keyboard owns only exact visible conversation or session tools', () => {
  test('Ctrl and Cmd literal period dispatch, with no event mutation', () => {
    const frozen = Object.freeze({ ...key })
    expect(shouldStopSessionKey(frozen, keyScope, base)).toBe(true)
    expect(shouldStopSessionKey({ ...key, ctrlKey: false, metaKey: true }, keyScope, base)).toBe(true)
    expect(frozen.defaultPrevented).toBe(false)
  })

  const deniedKeys: readonly Partial<SessionStopKey>[] = [
    { key: 'Period' },
    { key: '>' },
    { key: '。' },
    { key: '' },
    { ctrlKey: false },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { repeat: true },
    { isComposing: true },
    { keyCode: 229 },
    { defaultPrevented: true },
  ]
  test.each([...deniedKeys])('leaves reserved/consumed key variant %j alone', (patch) => {
    expect(shouldStopSessionKey({ ...key, ...patch }, keyScope, base)).toBe(false)
  })

  test('main may be inert behind an owned Files page; pinned sessionTool is a valid scope', () => {
    expect(sessionStopToolMatches(tool)).toBe(true)
    expect(shouldStopSessionKey(key, { ...keyScope, scope: 'tool', mainVisible: false, toolVisible: true }, tool)).toBe(
      true,
    )
    expect(shouldStopSessionKey(key, { ...keyScope, scope: 'main', mainVisible: false, toolVisible: true }, tool)).toBe(
      false,
    )
    expect(shouldStopSessionKey(key, { ...keyScope, scope: 'body', mainVisible: false, toolVisible: true }, tool)).toBe(
      true,
    )
    expect(shouldStopSessionKey(key, { ...keyScope, scope: 'body', toolVisible: true }, tool)).toBe(true)
  })

  test('project-only, foreign and generic followActive tools do not imply a Stop owner', () => {
    const own = tool.surfaces.panels['files-a']
    if (!own) throw new Error('missing fixture tool')
    const variants = [
      { ...own, sessionId: null },
      { ...own, workspaceId: 'workspace-b' },
      { ...own, sessionId: 'session-b' },
      { ...own, instanceId: 'other-instance' },
      {
        instanceId: own.instanceId,
        panelId: own.panelId,
        workspaceId: own.workspaceId,
        sessionId: own.sessionId,
        params: {},
        binding: 'followActive' as const,
      },
    ]
    for (const panel of variants) {
      const snapshot = { ...tool, surfaces: { panels: { 'files-a': panel } } }
      expect(sessionStopToolMatches(snapshot)).toBe(false)
      expect(shouldStopSessionKey(key, { ...keyScope, scope: 'tool', toolVisible: true }, snapshot)).toBe(false)
      expect(shouldStopSessionKey(key, { ...keyScope, scope: 'body', toolVisible: true }, snapshot)).toBe(false)
      expect(shouldStopSessionKey(key, { ...keyScope, scope: 'main', toolVisible: true }, snapshot)).toBe(true)
    }
    expect(sessionStopToolMatches({ ...tool, surfaces: { panels: {} } })).toBe(false)
  })

  test('hidden regions, sidebar/outside and every higher overlay leave the key alone', () => {
    for (const region of ['main', 'tool', 'body', 'sidebar', 'outside'] as const) {
      expect(shouldStopSessionKey(key, { ...keyScope, scope: region, mainVisible: false }, tool)).toBe(false)
      expect(
        shouldStopSessionKey(key, { ...keyScope, scope: region, toolVisible: true, overlayOpen: true }, tool),
      ).toBe(false)
    }
    expect(
      shouldStopSessionKey(key, keyScope, {
        ...base,
        presentation: { ...base.presentation, modalInstanceId: 'dialog' },
      }),
    ).toBe(false)
  })
})

describe('Stop feedback is a pure exact cancellation projection, not first global error', () => {
  test('unrelated retry/other-session/other-operation error is never cancellation feedback', () => {
    expect(sessionStopFeedback(base, target)).toBeNull()
    expect(
      sessionStopFeedback(withAction({ commandId: 'run.retry', status: 'failed', error: 'BUSY' }), target),
    ).toBeNull()
    expect(sessionStopFeedback(withAction({ operationId: queued.id }), target)).toBeNull()
    expect(sessionStopFeedback(withAction({ sessionId: 'session-b' }), target)).toBeNull()
    const snapshot = withAction(
      {},
      {
        ...base,
        actions: { other: { operationId: 'other', commandId: 'run.retry', status: 'failed', error: 'BUSY' } },
      },
    )
    expect(sessionStopFeedback(snapshot, target)).toMatchObject({ kind: 'unknown', error: null })
  })

  test('sending and checking use the same action owner but stay distinct and locked', () => {
    expect(
      sessionStopFeedback(withAction({ status: 'submitting', phase: 'request', requestInFlight: true }), target),
    ).toEqual({
      kind: 'sending',
      error: null,
      canCheck: false,
      canRetry: false,
      requestInFlight: true,
    })
    expect(
      sessionStopFeedback(withAction({ status: 'submitting', phase: 'state', requestInFlight: true }), target),
    ).toEqual({
      kind: 'checking',
      error: null,
      canCheck: false,
      canRetry: false,
      requestInFlight: true,
    })
  })

  test('logical unknown/error cannot unlock a still physically pending request', () => {
    expect(sessionStopFeedback(withAction({ error: 'TIMEOUT', requestInFlight: true }), target)).toEqual({
      kind: 'unknown',
      error: 'TIMEOUT',
      canCheck: false,
      canRetry: false,
      requestInFlight: true,
    })
    expect(sessionStopFeedback(withAction({ error: 'TIMEOUT', requestInFlight: false }), target)).toMatchObject({
      kind: 'unknown',
      canCheck: true,
      canRetry: false,
    })
  })

  test('active read is not rejection; cancelRequested and accepted read failure are not cancelled', () => {
    for (const observedStatus of ['running', 'queued', 'waiting_approval'] as const)
      expect(sessionStopFeedback(withAction({ observedStatus, phase: 'state' }), target)).toMatchObject({
        kind: 'unknown',
        canCheck: true,
        canRetry: false,
      })
    expect(
      sessionStopFeedback(withAction({ status: 'succeeded', observedStatus: 'cancelRequested' }), target),
    ).toMatchObject({ kind: 'requested', canCheck: true, canRetry: false })
    expect(
      sessionStopFeedback(
        withAction({ status: 'succeeded', observedStatus: 'cancelRequested', phase: 'state', error: 'TIMEOUT' }),
        target,
      ),
    ).toMatchObject({ kind: 'requested', error: 'TIMEOUT', canCheck: true, canRetry: false })
  })

  test.each([
    ['cancelled', 'cancelled'],
    ['completed', 'completed'],
    ['failed', 'run-failed'],
    ['interrupted', 'interrupted'],
    ['guided', 'guided'],
  ] as const)('canonical and validated snapshot terminal %s stays distinct', (status, kind) => {
    const snapshot = { ...base, timeline: { ...base.timeline, runs: [{ ...running, status }] } }
    expect(sessionStopFeedback(withAction(), target)?.kind).toBe('unknown')
    expect(sessionStopFeedback(withAction({}, snapshot), target)).toMatchObject({
      kind,
      canCheck: false,
      canRetry: false,
    })
    expect(
      sessionStopFeedback(withAction({ status: 'succeeded', observedStatus: status, error: 'TIMEOUT' }), target),
    ).toMatchObject({ kind, canCheck: false, canRetry: false })
    expect(sessionStopFeedback(withAction({ status: 'failed', error: 'BUSY' }, snapshot), target)).toMatchObject({
      kind,
      canCheck: false,
      canRetry: false,
    })
  })

  test('definite request failure permits explicit retry only while active, connected and ready', () => {
    expect(sessionStopFeedback(withAction({ status: 'failed', error: 'BUSY' }), target)).toEqual({
      kind: 'failed',
      error: 'BUSY',
      canCheck: false,
      canRetry: true,
      requestInFlight: false,
    })
    expect(sessionStopFeedback(withAction({ status: 'failed', requestInFlight: true }), target)?.canRetry).toBe(false)
    expect(sessionStopFeedback(withAction({ status: 'failed' }, { ...base, connected: false }), target)?.canRetry).toBe(
      false,
    )
    expect(
      sessionStopFeedback(
        withAction({ status: 'failed' }, { ...base, timeline: { ...base.timeline, status: 'loading' } }),
        target,
      )?.canRetry,
    ).toBe(false)
  })

  test('disconnect/loading preserves local feedback identity but disables Check/Retry', () => {
    for (const snapshot of [
      { ...base, connected: false },
      { ...base, timeline: { ...base.timeline, status: 'loading' as const } },
    ]) {
      expect(sessionStopFeedback(withAction({}, snapshot), target)).toMatchObject({
        kind: 'unknown',
        canCheck: false,
        canRetry: false,
      })
      expect(sessionStopFeedback(withAction({ status: 'succeeded' }, snapshot), target)).toMatchObject({
        kind: 'requested',
        canCheck: false,
        canRetry: false,
      })
    }
  })

  test('missing Run requires a previously validated session binding, not the action map key alone', () => {
    const empty = { ...base, timeline: { ...base.timeline, runs: [] } }
    expect(sessionStopFeedback(withAction({}, empty), target)).toBeNull()
    expect(sessionStopFeedback(withAction({ sessionId: target.sessionId }, empty), target)?.kind).toBe('unknown')
    expect(
      sessionStopFeedback(withAction({ status: 'failed', sessionId: target.sessionId }, empty), target)?.canRetry,
    ).toBe(false)
  })

  test('all pure resolvers leave canonical snapshots and Run/action references untouched', () => {
    const snapshot = withAction()
    const serialized = JSON.stringify(snapshot)
    const action = snapshot.actions[running.id]
    Object.freeze(snapshot)
    Object.freeze(snapshot.timeline)
    Object.freeze(snapshot.timeline.runs)
    Object.freeze(snapshot.actions)
    sessionStopScope(snapshot)
    sessionStopTarget(snapshot)
    sessionStopCanCancel(snapshot, queued.id)
    sessionStopFeedback(snapshot, target)
    shouldStopSessionKey(key, keyScope, snapshot)
    expect(JSON.stringify(snapshot)).toBe(serialized)
    expect(snapshot.actions[running.id]).toBe(action)
    expect(snapshot.timeline.runs[1]).toBe(running)
  })
})

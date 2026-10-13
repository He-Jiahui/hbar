import { createStore } from 'zustand/vanilla'
import type { NodeConsoleTransport } from '@hbar/client/node-console'
import { nodeConsoleMethods } from '@hbar/contracts/node-console'
import type { NodeConsoleModel, NodeConsoleState } from '@hbar/app-react/node-console'
import type { z } from 'zod'

type Floor = NonNullable<NodeConsoleState['policyDraft']>
type Follow = z.output<(typeof nodeConsoleMethods)['observe.sessions.follow']['output']>

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'NODE_CONSOLE_REQUEST_FAILED'
}

function unauthorizedState(code: string): Partial<NodeConsoleState> {
  return code === 'NODE_REVOKED' || code === 'UNAUTHORIZED' || code.startsWith('NODE_AUTH')
    ? {
        roleVerified: false,
        status: null,
        floor: null,
        policyDraft: null,
        policyRevision: null,
        policyDraftRevision: null,
        sessions: [],
        snapshot: null,
      }
    : {}
}

const initialState = (consoleId: string, role: NodeConsoleState['role']): NodeConsoleState => ({
  consoleId,
  role,
  roleVerified: false,
  busy: false,
  status: null,
  floor: null,
  policyDraft: null,
  policyRevision: null,
  policyDraftRevision: null,
  audit: [],
  confirmations: [],
  auditAfter: 0,
  auditHasMore: false,
  sessions: [],
  sessionCursor: null,
  selectedSessionId: null,
  snapshot: null,
  connectionError: null,
  policyError: null,
  actionError: null,
  auditError: null,
  confirmationError: null,
  observationError: null,
  loadingAudit: false,
  loadingConfirmations: false,
  resolvingConfirmationId: null,
  loadingSessions: false,
  loadingSnapshot: false,
  loadingMoreSessions: false,
  pendingOperationId: null,
  pausing: false,
  revision: 0,
})

/** Host-owned MVVM for the B-local console. Observer authority is supplied from the verified B pairing record. */
export function createNodeConsoleModel(
  client: NodeConsoleTransport,
  consoleId: string,
  role: NodeConsoleState['role'],
): NodeConsoleModel {
  const store = createStore<NodeConsoleState>(() => initialState(consoleId, role))
  let disposed = false
  let generation = 0
  let requestController: AbortController | undefined
  const lifetimeController = new AbortController()
  let followTimer: ReturnType<typeof setTimeout> | undefined
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  let started = false
  const current = () => store.getState()
  const replace = (patch: Partial<NodeConsoleState>) => {
    if (!disposed) store.setState((state) => ({ ...state, ...patch }))
  }
  const refreshStatus = async () => {
    const state = current()
    if (
      disposed ||
      state.role !== 'operator' ||
      !state.roleVerified ||
      state.busy ||
      document.visibilityState === 'hidden'
    )
      return
    try {
      const status = await client.call('node.status', {}, { signal: lifetimeController.signal })
      if (!disposed && current().consoleId === consoleId) replace({ status, connectionError: null })
    } catch (reason) {
      const code = errorCode(reason)
      if (!disposed) replace({ connectionError: code, ...unauthorizedState(code) })
    }
  }
  const clearStatusTimer = () => {
    if (statusTimer) clearTimeout(statusTimer)
    statusTimer = undefined
  }
  const scheduleStatusRefresh = () => {
    clearStatusTimer()
    if (!started || disposed || document.visibilityState === 'hidden') return
    statusTimer = setTimeout(() => {
      void refreshStatus().finally(scheduleStatusRefresh)
    }, 15_000)
  }
  const invalidateRead = () => {
    generation++
    requestController?.abort(new DOMException('Console read was replaced', 'AbortError'))
    requestController = undefined
    if (followTimer) clearTimeout(followTimer)
    followTimer = undefined
    return generation
  }
  const refresh = async () => {
    const state = current()
    if (disposed || !state.role) {
      replace({ roleVerified: false, connectionError: 'B_DEVICE_ROLE_UNKNOWN', status: null, floor: null })
      return
    }
    const request = invalidateRead()
    const controller = new AbortController()
    requestController = controller
    const signal = AbortSignal.any([controller.signal, lifetimeController.signal])
    replace({ busy: true, connectionError: null, actionError: null, revision: state.revision + 1 })
    try {
      if (state.role === 'operator') {
        const status = await client.call('node.status', {}, { signal })
        if (disposed || request !== generation || current().consoleId !== consoleId) return
        replace({ status, roleVerified: true, connectionError: null, busy: false })
        const policy = await client.call('node.policy.snapshot', {}, { signal })
        if (disposed || request !== generation || current().consoleId !== consoleId) return
        replace({
          floor: policy.floor,
          policyDraft: policy.floor,
          policyRevision: policy.revision,
          policyDraftRevision: null,
          policyError: null,
        })
      } else {
        const page = await client.call('observe.sessions.list', { limit: 50 }, { signal })
        if (disposed || request !== generation || current().consoleId !== consoleId) return
        replace({ sessions: page.items, sessionCursor: page.nextCursor, roleVerified: true, busy: false })
      }
    } catch (reason) {
      if (disposed || request !== generation || signal.aborted) return
      const code = errorCode(reason)
      replace({
        busy: false,
        connectionError: code,
        ...unauthorizedState(code),
      })
    }
  }
  const loadPolicy = async () => {
    if (disposed || !current().roleVerified || current().role !== 'operator') return
    const request = generation
    try {
      const policy = await client.call('node.policy.snapshot', {}, { signal: lifetimeController.signal })
      if (!disposed && request === generation && current().role === 'operator')
        replace({
          floor: policy.floor,
          policyDraft: policy.floor,
          policyRevision: policy.revision,
          policyDraftRevision: null,
          policyError: null,
        })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({ policyError: code, ...unauthorizedState(code) })
      }
    }
  }
  const setPolicyDraft = (draft: Floor) => {
    const state = current()
    if (disposed || !state.roleVerified || state.role !== 'operator' || state.busy) return
    replace({
      policyDraft: draft,
      policyDraftRevision: state.policyDraftRevision ?? state.policyRevision,
      policyError: null,
    })
  }
  const updatePolicy = async (floor: Floor) => {
    const state = current()
    if (
      disposed ||
      !state.roleVerified ||
      state.role !== 'operator' ||
      !state.floor ||
      state.policyDraftRevision === null
    )
      return
    const request = ++generation
    replace({ policyError: null, busy: true })
    try {
      const saved = await client.call(
        'node.policy.update',
        { floor, expectedRevision: state.policyDraftRevision },
        { signal: lifetimeController.signal },
      )
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      replace({
        floor: saved.floor,
        policyDraft: saved.floor,
        policyRevision: saved.revision,
        policyDraftRevision: null,
        busy: false,
        policyError: null,
      })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        if (code === 'NODE_POLICY_CONFLICT' && !lifetimeController.signal.aborted) {
          try {
            const latest = await client.call('node.policy.snapshot', {}, { signal: lifetimeController.signal })
            if (disposed || request !== generation || current().consoleId !== consoleId) return
            replace({
              floor: latest.floor,
              policyRevision: latest.revision,
              policyDraftRevision: latest.revision,
              busy: false,
              policyError: code,
            })
            return
          } catch (refreshReason) {
            if (disposed || request !== generation || lifetimeController.signal.aborted) return
            const refreshCode = errorCode(refreshReason)
            replace({ busy: false, policyError: refreshCode, ...unauthorizedState(refreshCode) })
            return
          }
        }
        replace({ busy: false, policyError: code, ...unauthorizedState(code) })
      }
    }
  }
  const setPaused = async (paused: boolean) => {
    const state = current()
    if (disposed || !state.roleVerified || state.role !== 'operator' || !state.status || state.pausing) return
    const request = ++generation
    replace({ pausing: true, actionError: null })
    try {
      await client.call('node.pause', { paused }, { signal: lifetimeController.signal })
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      const status = await client.call('node.status', {}, { signal: lifetimeController.signal })
      if (disposed || request !== generation) return
      replace({ status, pausing: false, actionError: null })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({ pausing: false, actionError: code, ...unauthorizedState(code) })
      }
    }
  }
  const terminate = async (operationId: string) => {
    const state = current()
    if (
      disposed ||
      !state.roleVerified ||
      state.role !== 'operator' ||
      !state.status?.running.includes(operationId) ||
      state.pendingOperationId !== null
    )
      return
    const request = ++generation
    replace({ pendingOperationId: operationId, actionError: null })
    try {
      await client.call('node.kill', { operationId }, { signal: lifetimeController.signal })
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      const status = await client.call('node.status', {}, { signal: lifetimeController.signal })
      if (disposed || request !== generation) return
      replace({ status, pendingOperationId: null, actionError: null })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({ pendingOperationId: null, actionError: code, ...unauthorizedState(code) })
      }
    }
  }
  const loadAudit = async (append = false) => {
    const state = current()
    if (disposed || !state.roleVerified || state.role !== 'operator' || state.loadingAudit) return
    const after = append ? state.auditAfter : 0
    const request = generation
    replace({
      loadingAudit: true,
      auditError: null,
      ...(append ? {} : { audit: [], auditAfter: 0, auditHasMore: false }),
    })
    try {
      const page = await client.call('node.audit', { after, limit: 100 }, { signal: lifetimeController.signal })
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      const latest = current().audit
      const seen = new Set(latest.map((item) => `${item.seq}:${item.operationId}`))
      const next = append ? [...latest, ...page.filter((item) => !seen.has(`${item.seq}:${item.operationId}`))] : page
      const last = next.at(-1)
      replace({ audit: next, auditAfter: last?.seq ?? after, auditHasMore: page.length === 100, loadingAudit: false })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({ loadingAudit: false, auditError: code, ...unauthorizedState(code) })
      }
    }
  }
  const loadConfirmations = async () => {
    const state = current()
    if (disposed || !state.roleVerified || state.role !== 'operator' || state.loadingConfirmations) return
    const request = generation
    replace({ loadingConfirmations: true, confirmationError: null })
    try {
      const page = await client.call('node.localConfirmation.list', {}, { signal: lifetimeController.signal })
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      replace({ confirmations: page.entries, loadingConfirmations: false })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({ loadingConfirmations: false, confirmationError: code, ...unauthorizedState(code) })
      }
    }
  }
  const resolveConfirmation = async (confirmationId: string, decision: 'approve' | 'reject') => {
    const state = current()
    const entry = state.confirmations.find((item) => item.id === confirmationId)
    if (
      disposed ||
      !state.roleVerified ||
      state.role !== 'operator' ||
      !entry ||
      entry.state !== 'waiting' ||
      entry.expiresAt <= Date.now() ||
      entry.identity.floorRevision !== state.policyRevision ||
      state.resolvingConfirmationId
    )
      return
    const request = generation
    replace({ resolvingConfirmationId: confirmationId, confirmationError: null })
    try {
      await client.call(
        'node.localConfirmation.resolve',
        { confirmationId, decision },
        { signal: lifetimeController.signal },
      )
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      replace({ resolvingConfirmationId: null })
      await loadConfirmations()
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({ resolvingConfirmationId: null, confirmationError: code, ...unauthorizedState(code) })
        if (code.startsWith('NODE_LOCAL_CONFIRMATION_')) {
          await Promise.all([loadConfirmations(), loadPolicy()])
        }
      }
    }
  }
  const loadSessions = async (append = false) => {
    const state = current()
    if (disposed || !state.roleVerified || state.loadingSessions || state.loadingMoreSessions) return
    if (state.role !== 'observer' && state.role !== 'operator') return
    const cursor = append ? state.sessionCursor : null
    if (append && !cursor) return
    const request = generation
    replace({
      [append ? 'loadingMoreSessions' : 'loadingSessions']: true,
      observationError: null,
    } as Partial<NodeConsoleState>)
    try {
      const page = await client.call(
        'observe.sessions.list',
        { limit: 50, ...(cursor ? { cursor } : {}) },
        { signal: lifetimeController.signal },
      )
      if (disposed || request !== generation || current().consoleId !== consoleId) return
      const items = append ? [...current().sessions, ...page.items] : page.items
      if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('NODE_SESSION_PAGE_DUPLICATE')
      replace({ sessions: items, sessionCursor: page.nextCursor, loadingSessions: false, loadingMoreSessions: false })
    } catch (reason) {
      if (!disposed && request === generation) {
        const code = errorCode(reason)
        replace({
          observationError: code,
          loadingSessions: false,
          loadingMoreSessions: false,
          ...unauthorizedState(code),
        })
      }
    }
  }
  const selectSession = async (sessionId: string) => {
    const state = current()
    if (disposed || !state.roleVerified || !state.sessions.some((session) => session.id === sessionId)) return
    invalidateRead()
    const request = generation
    const controller = new AbortController()
    requestController = controller
    const signal = AbortSignal.any([controller.signal, lifetimeController.signal])
    replace({ selectedSessionId: sessionId, snapshot: null, loadingSnapshot: true, observationError: null })
    try {
      const snapshot = await client.call('observe.sessions.snapshot', { sessionId, limit: 60 }, { signal })
      if (disposed || request !== generation || current().selectedSessionId !== sessionId) return
      replace({ snapshot, loadingSnapshot: false })
      scheduleFollow(sessionId, snapshot.cursor)
    } catch (reason) {
      if (!disposed && request === generation && !signal.aborted) {
        const code = errorCode(reason)
        replace({ loadingSnapshot: false, observationError: code, ...unauthorizedState(code) })
      }
    }
  }
  const scheduleFollow = (sessionId: string, afterSeq: number) => {
    followTimer = setTimeout(() => {
      void (async () => {
        if (disposed || !started || document.visibilityState === 'hidden' || current().selectedSessionId !== sessionId)
          return
        try {
          const followed: Follow = await client.call(
            'observe.sessions.follow',
            { sessionId, afterSeq },
            { signal: lifetimeController.signal },
          )
          if (disposed || current().selectedSessionId !== sessionId) return
          if (followed.reset || followed.events.length > 0) {
            const snapshot = await client.call(
              'observe.sessions.snapshot',
              { sessionId, limit: 60 },
              { signal: lifetimeController.signal },
            )
            if (!disposed && current().selectedSessionId === sessionId) replace({ snapshot })
            scheduleFollow(sessionId, snapshot.cursor)
          } else scheduleFollow(sessionId, followed.cursor)
        } catch (reason) {
          if (!disposed && current().selectedSessionId === sessionId) {
            const code = errorCode(reason)
            replace({ observationError: code, ...unauthorizedState(code) })
            scheduleFollow(sessionId, afterSeq)
          }
        }
      })()
    }, 15_000)
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearStatusTimer()
      if (followTimer) clearTimeout(followTimer)
      followTimer = undefined
      return
    }
    scheduleStatusRefresh()
    const state = current()
    if (state.selectedSessionId && state.snapshot) scheduleFollow(state.selectedSessionId, state.snapshot.cursor)
  }
  const stop = () => {
    if (!started) return
    started = false
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clearStatusTimer()
    if (followTimer) clearTimeout(followTimer)
    followTimer = undefined
  }
  if (role) void refresh()
  return {
    store,
    start() {
      if (started || disposed) return
      started = true
      document.addEventListener('visibilitychange', onVisibilityChange)
      scheduleStatusRefresh()
    },
    stop,
    refresh,
    loadPolicy,
    setPolicyDraft,
    updatePolicy,
    setPaused,
    terminate,
    loadAudit,
    loadConfirmations,
    resolveConfirmation,
    loadSessions,
    selectSession,
    dispose() {
      if (disposed) return
      disposed = true
      lifetimeController.abort(new DOMException('B console view model disposed', 'AbortError'))
      invalidateRead()
      stop()
      store.setState((state) => ({
        ...state,
        busy: false,
        loadingAudit: false,
        loadingSessions: false,
        loadingSnapshot: false,
        loadingMoreSessions: false,
      }))
    },
  }
}

import { createStore, type StoreApi } from 'zustand/vanilla'

export type WebSendBehavior = 'enter' | 'modifierEnter'
export const WEB_SEND_BEHAVIORS = ['enter', 'modifierEnter'] as const

export interface WebSendBehaviorRead {
  readonly behavior: WebSendBehavior
  readonly revision: number
}

export interface WebSendBehaviorWrite {
  readonly behavior: WebSendBehavior
  readonly baselineRevision: number
  readonly idempotencyKey: string
}

/** Authenticated Host settings adapter. Its receipt reads the exact original actor/key/request. */
export interface WebSendBehaviorPort {
  read(): Promise<WebSendBehaviorRead>
  write(input: WebSendBehaviorWrite): Promise<WebSendBehaviorRead>
  receipt(input: WebSendBehaviorWrite): Promise<WebSendBehaviorRead | null>
}

export type WebSendBehaviorStatus =
  'loading' | 'ready' | 'saving' | 'saved' | 'read-error' | 'save-error' | 'unknown' | 'unsupported'

export interface WebSendBehaviorState {
  readonly behavior: WebSendBehavior | null
  readonly confirmedBehavior: WebSendBehavior | null
  readonly revision: number | null
  readonly status: WebSendBehaviorStatus
  readonly error: string | null
}

export interface WebSendBehaviorController {
  readonly store: StoreApi<WebSendBehaviorState>
  bind(hostId: string | null, connected: boolean): void
  refresh(): Promise<void>
  select(behavior: WebSendBehavior): void
  reconcile(): Promise<void>
  retry(): Promise<void>
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

/** One stable owner per transport; never resolves a late response into a different Host. */
export function createWebSendBehaviorController(port: WebSendBehaviorPort): WebSendBehaviorController {
  const store = createStore<WebSendBehaviorState>(() => ({
    behavior: null,
    confirmedBehavior: null,
    revision: null,
    status: 'loading',
    error: null,
  }))
  let hostId: string | null = null
  let connected = false
  let generation = 0
  let request: WebSendBehaviorWrite | null = null

  const current = (target: number) => target === generation && hostId !== null
  const confirm = (target: number, receipt: WebSendBehaviorRead) => {
    if (!current(target)) return
    request = null
    store.setState({
      behavior: receipt.behavior,
      confirmedBehavior: receipt.behavior,
      revision: receipt.revision,
      status: 'saved',
      error: null,
    })
  }
  const reconcile = async () => {
    const pending = request
    if (!pending || !hostId || !connected) return
    const target = generation
    try {
      const receipt = await port.receipt(pending)
      if (!current(target) || request !== pending) return
      if (receipt) confirm(target, receipt)
      else store.setState({ behavior: null, status: 'unknown', error: null })
    } catch (error) {
      if (current(target) && request === pending)
        store.setState({ behavior: null, status: 'unknown', error: errorCode(error) })
    }
  }
  const write = async (pending: WebSendBehaviorWrite) => {
    const target = generation
    try {
      const receipt = await port.write(pending)
      if (current(target) && request === pending) confirm(target, receipt)
    } catch (error) {
      if (!current(target) || request !== pending) return
      if (errorCode(error) === 'RESULT_UNKNOWN') {
        store.setState({ behavior: null, status: 'unknown', error: null })
        await reconcile()
        return
      }
      request = null
      store.setState({ behavior: store.getState().confirmedBehavior, status: 'save-error', error: errorCode(error) })
    }
  }
  const refresh = async () => {
    if (!hostId || !connected) return
    if (request) {
      await reconcile()
      return
    }
    const target = ++generation
    store.setState({ status: 'loading', error: null })
    try {
      const saved = await port.read()
      if (!current(target)) return
      store.setState({
        behavior: saved.behavior,
        confirmedBehavior: saved.behavior,
        revision: saved.revision,
        status: 'ready',
        error: null,
      })
    } catch (error) {
      if (!current(target)) return
      const code = errorCode(error)
      store.setState({
        behavior: null,
        status: code === 'UNSUPPORTED_HOST' ? 'unsupported' : 'read-error',
        error: code,
      })
    }
  }
  return {
    store,
    bind(nextHostId, nextConnected) {
      const changed = hostId !== nextHostId
      const reconnected = !connected && nextConnected
      connected = nextConnected
      if (changed) {
        hostId = nextHostId
        generation++
        request = null
        store.setState({
          behavior: null,
          confirmedBehavior: null,
          revision: null,
          status: 'loading',
          error: null,
        })
      }
      if (nextHostId && nextConnected && (changed || reconnected)) void refresh()
    },
    refresh,
    select(behavior) {
      const state = store.getState()
      if (
        !WEB_SEND_BEHAVIORS.includes(behavior) ||
        !hostId ||
        !connected ||
        state.revision === null ||
        request ||
        state.status === 'loading' ||
        state.status === 'unsupported' ||
        state.status === 'read-error'
      )
        return
      if (behavior === state.behavior) return
      const pending = { behavior, baselineRevision: state.revision, idempotencyKey: crypto.randomUUID() }
      request = pending
      store.setState({ behavior, status: 'saving', error: null })
      void write(pending)
    },
    reconcile,
    async retry() {
      const pending = request
      if (!pending || !hostId || !connected) return
      await reconcile()
      if (request !== pending || store.getState().status !== 'unknown') return
      store.setState({ status: 'saving', error: null })
      await write(pending)
    },
  }
}

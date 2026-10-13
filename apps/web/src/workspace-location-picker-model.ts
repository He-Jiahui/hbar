import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Workspace } from '@hbar/contracts/directory'
import type { NodeListInput, NodeListPage } from '@hbar/contracts/node-management'
import type { WorkspaceCreateInput } from '@hbar/contracts/commands/workspaces'

export interface WorkspaceLocationPickerPort {
  readonly listNodes: (
    input: NodeListInput,
    options?: { readonly signal?: AbortSignal | undefined },
  ) => Promise<NodeListPage>
  readonly createWorkspace: (input: WorkspaceCreateInput) => Promise<Workspace>
}

export interface WorkspaceLocationPickerState {
  readonly connected: boolean
  readonly writable: boolean
  readonly mode: 'local' | 'node'
  readonly name: string
  readonly localPath: string
  readonly nodeId: string | null
  readonly rootId: string | null
  readonly page: NodeListPage | null
  readonly loading: boolean
  readonly loadingMore: boolean
  readonly creating: boolean
  readonly error: string | null
  readonly revision: number
}

export interface WorkspaceLocationPickerModel {
  readonly store: StoreApi<WorkspaceLocationPickerState>
  readonly setConnection: (connected: boolean, writable: boolean) => void
  readonly setMode: (mode: 'local' | 'node') => void
  readonly setName: (value: string) => void
  readonly setLocalPath: (value: string) => void
  readonly reportError: (code: string) => void
  readonly selectNode: (nodeId: string) => void
  readonly selectRoot: (nodeId: string, rootId: string) => void
  readonly refresh: () => Promise<void>
  readonly loadMore: () => Promise<void>
  readonly cancelLoad: () => void
  readonly create: () => Promise<Workspace | null>
  readonly retain: () => () => void
  readonly dispose: () => void
}

export interface WorkspaceNodeRegistryState {
  readonly hostId: string | null
  readonly connected: boolean
  readonly permission: string
  readonly registry: Readonly<Record<string, NodeListPage['items'][number]>>
  readonly loading: boolean
  readonly error: string | null
  readonly complete: boolean
}

export interface WorkspaceNodeRegistryModel {
  readonly store: StoreApi<WorkspaceNodeRegistryState>
  readonly setIdentity: (hostId: string | null, connected: boolean, permission: string) => void
  readonly refresh: () => Promise<void>
  readonly retain: () => () => void
  readonly dispose: () => void
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

function assertUnique(page: NodeListPage, existing: readonly NodeListPage['items'][number][] = []): void {
  const all = [...existing, ...page.items]
  if (new Set(all.map((node) => node.nodeId)).size !== all.length) throw { code: 'NODE_PAGE_DUPLICATE' }
}

const nodeRegistryPageLimit = 100
const nodeRegistryMaxPages = 100
const nodeRegistryMaxNodes = 10_000

export function createWorkspaceNodeRegistryModel(
  port: Pick<WorkspaceLocationPickerPort, 'listNodes'>,
): WorkspaceNodeRegistryModel {
  const store = createStore<WorkspaceNodeRegistryState>(() => ({
    hostId: null,
    connected: false,
    permission: 'unknown',
    registry: {},
    loading: false,
    error: null,
    complete: false,
  }))
  let generation = 0
  let controller: AbortController | null = null
  let disposed = false
  let references = 0
  let releaseEpoch = 0
  const current = () => store.getState()
  const replace = (patch: Partial<WorkspaceNodeRegistryState>) => {
    if (!disposed) store.setState((state) => ({ ...state, ...patch }))
  }
  const setIdentity: WorkspaceNodeRegistryModel['setIdentity'] = (hostId, connected, permission) => {
    const state = current()
    if (state.hostId === hostId && state.connected === connected && state.permission === permission) return
    generation++
    controller?.abort()
    controller = null
    replace({ hostId, connected, permission, registry: {}, loading: false, error: null, complete: false })
  }
  const refresh: WorkspaceNodeRegistryModel['refresh'] = async () => {
    const identity = current()
    if (disposed || !identity.hostId || !identity.connected || identity.loading) return
    const request = ++generation
    controller?.abort()
    const active = new AbortController()
    controller = active
    replace({ loading: true, registry: {}, error: null, complete: false })
    const nodes: Record<string, NodeListPage['items'][number]> = {}
    const cursors = new Set<string>()
    let after: string | undefined
    let previousCursor: string | null = null
    try {
      for (let pageIndex = 0; pageIndex < nodeRegistryMaxPages; pageIndex++) {
        const page = await port.listNodes(
          { ...(after ? { after } : {}), limit: nodeRegistryPageLimit },
          { signal: active.signal },
        )
        const latest = current()
        if (
          disposed ||
          request !== generation ||
          active.signal.aborted ||
          latest.hostId !== identity.hostId ||
          !latest.connected ||
          latest.permission !== identity.permission
        )
          return
        assertUnique(page, Object.values(nodes))
        const remainingCapacity = nodeRegistryMaxNodes - Object.keys(nodes).length
        for (const node of page.items.slice(0, remainingCapacity)) nodes[node.nodeId] = node
        after = page.nextCursor ?? undefined
        if (page.items.length > remainingCapacity) {
          replace({ registry: nodes, loading: false, error: 'NODE_REGISTRY_LIMIT', complete: false })
          return
        }
        if (!after) {
          replace({ registry: nodes, loading: false, error: null, complete: true })
          return
        }
        if (cursors.has(after) || (previousCursor !== null && after <= previousCursor))
          throw { code: 'NODE_CURSOR_STALLED' }
        cursors.add(after)
        previousCursor = after
        if (pageIndex === nodeRegistryMaxPages - 1 || Object.keys(nodes).length >= nodeRegistryMaxNodes) {
          replace({ registry: nodes, loading: false, error: 'NODE_REGISTRY_LIMIT', complete: false })
          return
        }
      }
    } catch (error) {
      if (disposed || request !== generation || active.signal.aborted) return
      replace({ registry: {}, loading: false, error: errorCode(error), complete: false })
    } finally {
      if (controller === active) controller = null
    }
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    generation++
    controller?.abort()
    controller = null
  }
  return {
    store,
    setIdentity,
    refresh,
    retain() {
      if (disposed) return () => undefined
      references++
      releaseEpoch++
      let released = false
      return () => {
        if (released) return
        released = true
        references--
        const epoch = ++releaseEpoch
        queueMicrotask(() => {
          if (references === 0 && epoch === releaseEpoch) dispose()
        })
      }
    },
    dispose,
  }
}

export function createWorkspaceLocationPickerModel(
  port: WorkspaceLocationPickerPort,
  connected: boolean,
  writable: boolean,
): WorkspaceLocationPickerModel {
  const store = createStore<WorkspaceLocationPickerState>(() => ({
    connected,
    writable,
    mode: 'local',
    name: '',
    localPath: '',
    nodeId: null,
    rootId: null,
    page: null,
    loading: false,
    loadingMore: false,
    creating: false,
    error: null,
    revision: 0,
  }))
  let readRequest = 0
  let createRequest = 0
  let readController: AbortController | null = null
  let disposed = false
  let references = 0
  let releaseEpoch = 0
  const current = () => store.getState()
  const replace = (patch: Partial<WorkspaceLocationPickerState>) => {
    if (!disposed) store.setState((state) => ({ ...state, ...patch }))
  }

  const refresh = async () => {
    const state = current()
    if (disposed || !state.connected || state.loading || state.creating) return
    const request = ++readRequest
    readController?.abort()
    const controller = new AbortController()
    readController = controller
    const revision = state.revision + 1
    replace({ page: null, loading: true, loadingMore: false, error: null, revision })
    try {
      const page = await port.listNodes({ limit: 20 }, { signal: controller.signal })
      if (disposed || request !== readRequest || !current().connected || current().revision !== revision) return
      assertUnique(page)
      const selected = current().nodeId
      const node = page.items.find((item) => item.nodeId === selected)
      const rootId =
        node?.online &&
        node.revokedAt === null &&
        node.capabilities?.roots.some((root) => root.rootId === current().rootId)
          ? current().rootId
          : null
      replace({ page, loading: false, nodeId: node ? selected : null, rootId, error: null })
    } catch (error) {
      if (disposed || request !== readRequest || current().revision !== revision) return
      replace({ loading: false, loadingMore: false, error: errorCode(error) })
    }
  }

  const loadMore = async () => {
    const state = current()
    const cursor = state.page?.nextCursor
    if (disposed || !state.connected || state.loading || state.loadingMore || state.creating || !cursor) return
    const request = ++readRequest
    readController?.abort()
    const controller = new AbortController()
    readController = controller
    const revision = state.revision
    replace({ loadingMore: true, error: null })
    try {
      const page = await port.listNodes({ after: cursor, limit: 20 }, { signal: controller.signal })
      const latest = current()
      if (disposed || request !== readRequest || !latest.connected || latest.revision !== revision) return
      if (!latest.page) throw { code: 'NODE_PAGE_MISSING' }
      assertUnique(page, latest.page.items)
      if (page.nextCursor !== null && page.nextCursor <= cursor) throw { code: 'NODE_CURSOR_STALLED' }
      const selected = latest.nodeId
      const node = page.items.find((item) => item.nodeId === selected)
      replace({
        page: { items: [...latest.page.items, ...page.items], nextCursor: page.nextCursor },
        loadingMore: false,
        nodeId: node ? selected : latest.nodeId,
      })
    } catch (error) {
      if (disposed || request !== readRequest) return
      replace({ loadingMore: false, error: errorCode(error) })
    }
  }

  const setConnection = (nextConnected: boolean, nextWritable: boolean) => {
    const state = current()
    if (state.connected === nextConnected && state.writable === nextWritable) return
    readRequest++
    createRequest++
    readController?.abort()
    readController = null
    const revision = state.revision + 1
    replace({
      connected: nextConnected,
      writable: nextWritable,
      revision,
      loading: false,
      loadingMore: false,
      creating: false,
      error: null,
    })
    if (!nextConnected) replace({ page: null, nodeId: null, rootId: null })
    else if (nextConnected && !state.connected) void refresh()
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    readRequest++
    createRequest++
    readController?.abort()
    readController = null
  }

  return {
    store,
    setConnection,
    setMode(mode) {
      if (disposed || current().creating) return
      replace({ mode, error: null })
    },
    setName(value) {
      if (!current().creating) replace({ name: value.slice(0, 160), error: null })
    },
    setLocalPath(value) {
      if (!current().creating) replace({ localPath: value.slice(0, 4_000), error: null })
    },
    reportError(code) {
      if (!current().creating) replace({ error: code.slice(0, 128) })
    },
    selectNode(nodeId) {
      const node = current().page?.items.find((item) => item.nodeId === nodeId)
      if (
        !node ||
        !node.online ||
        node.revokedAt !== null ||
        !current().connected ||
        !current().writable ||
        current().creating
      )
        return
      replace({ nodeId, rootId: null, error: null })
    },
    selectRoot(nodeId, rootId) {
      const node = current().page?.items.find((item) => item.nodeId === nodeId)
      if (
        !node ||
        nodeId !== current().nodeId ||
        !node.online ||
        node.revokedAt !== null ||
        !current().connected ||
        !current().writable ||
        current().creating
      )
        return
      if (!node.capabilities?.roots.some((root) => root.rootId === rootId)) return
      replace({ rootId, error: null })
    },
    refresh,
    loadMore,
    cancelLoad() {
      if (!current().loading && !current().loadingMore) return
      readRequest++
      readController?.abort()
      readController = null
      replace({ loading: false, loadingMore: false, revision: current().revision + 1 })
    },
    async create() {
      const state = current()
      if (disposed || !state.connected || !state.writable || state.creating || state.loading || state.loadingMore)
        return null
      let input: WorkspaceCreateInput
      if (state.mode === 'local') {
        const path = state.localPath.trim()
        if (!path) return null
        input = { path, ...(state.name.trim() ? { name: state.name.trim() } : {}) }
      } else {
        const node = state.page?.items.find((item) => item.nodeId === state.nodeId)
        const root = node?.capabilities?.roots.find((item) => item.rootId === state.rootId)
        if (!node || !node.online || node.revokedAt !== null || !root || !state.nodeId || !state.rootId) return null
        input = { node: state.nodeId, rootId: state.rootId, ...(state.name.trim() ? { name: state.name.trim() } : {}) }
      }
      const request = ++createRequest
      const revision = state.revision
      replace({ creating: true, error: null })
      try {
        const workspace = await port.createWorkspace(input)
        const latest = current()
        if (disposed || request !== createRequest) return null
        if (
          !latest.connected ||
          latest.revision !== revision ||
          latest.mode !== state.mode ||
          latest.nodeId !== state.nodeId ||
          latest.rootId !== state.rootId
        ) {
          replace({ creating: false, error: 'RESULT_UNKNOWN' })
          return null
        }
        replace({ creating: false, error: null })
        return workspace
      } catch (error) {
        if (disposed || request !== createRequest) return null
        replace({ creating: false, error: errorCode(error) })
        return null
      }
    },
    retain() {
      if (disposed) return () => undefined
      references++
      releaseEpoch++
      let released = false
      return () => {
        if (released) return
        released = true
        references--
        const epoch = ++releaseEpoch
        queueMicrotask(() => {
          if (references === 0 && epoch === releaseEpoch) dispose()
        })
      }
    },
    dispose,
  }
}

import { createStore, type StoreApi } from 'zustand/vanilla'
import type { createNodeCommandClient } from '@hbar/client'
import { nodeInviteSchema } from '@hbar/contracts/node-registry'
import type { NodeListPage } from '@hbar/contracts/node-management'
import type { z } from 'zod'

export type NodeManagementCommands = ReturnType<typeof createNodeCommandClient>
type NodeInvite = z.infer<typeof nodeInviteSchema>

export interface NodeManagementSettingsState {
  readonly hostId: string
  readonly connected: boolean
  readonly writable: boolean
  readonly page: NodeListPage | null
  readonly loading: boolean
  readonly loadingMore: boolean
  readonly listError: string | null
  readonly inviteName: string
  readonly invite: NodeInvite | null
  readonly inviteBusy: boolean
  readonly inviteError: string | null
  readonly copied: 'code' | 'fingerprint' | null
  readonly copyError: boolean
  readonly confirmingNodeId: string | null
  readonly revokingNodeId: string | null
  readonly revokeError: string | null
  /** Local generation used to reject responses after a refresh, cancellation, or owner change. */
  readonly revision: number
}

export interface NodeManagementSettingsModel {
  readonly store: StoreApi<NodeManagementSettingsState>
  readonly setConnection: (connected: boolean, writable: boolean) => void
  readonly setInviteName: (value: string) => void
  readonly requestRevoke: (nodeId: string) => void
  readonly refresh: () => Promise<void>
  readonly loadMore: () => Promise<void>
  readonly cancelLoad: () => void
  readonly createInvite: () => Promise<void>
  readonly confirmRevoke: () => Promise<void>
  readonly cancelRevoke: () => void
  readonly copy: (value: string, kind: 'code' | 'fingerprint') => Promise<void>
  readonly dispose: () => void
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function assertUniqueNodeIds(page: NodeListPage): void {
  if (new Set(page.items.map((node) => node.nodeId)).size !== page.items.length)
    throw Object.assign(new Error('Node page contains duplicate IDs'), { code: 'NODE_PAGE_DUPLICATE' })
}

export function createNodeManagementSettingsModel(
  commands: NodeManagementCommands,
  hostId: string,
  connected: boolean,
  writable: boolean,
): NodeManagementSettingsModel {
  const store = createStore<NodeManagementSettingsState>(() => ({
    hostId,
    connected,
    writable,
    page: null,
    loading: connected,
    loadingMore: false,
    listError: null,
    inviteName: '',
    invite: null,
    inviteBusy: false,
    inviteError: null,
    copied: null,
    copyError: false,
    confirmingNodeId: null,
    revokingNodeId: null,
    revokeError: null,
    revision: 0,
  }))
  let listRequest = 0
  let mutationRequest = 0
  let copyRequest = 0
  let disposed = false
  let lastConnected = connected
  const current = () => store.getState()
  const replace = (patch: Partial<NodeManagementSettingsState>) => {
    if (!disposed) store.setState((state) => ({ ...state, ...patch }))
  }
  const refresh = async () => {
    const state = current()
    if (disposed || !state.connected) return
    const request = ++listRequest
    replace({ page: null, loading: true, loadingMore: false, listError: null, revision: state.revision + 1 })
    try {
      const page = await commands.execute('node.list', { limit: 20 })
      if (disposed || request !== listRequest || !current().connected || current().hostId !== hostId) return
      assertUniqueNodeIds(page)
      replace({
        page,
        loading: false,
        listError: null,
        ...(current().confirmingNodeId && !page.items.some((node) => node.nodeId === current().confirmingNodeId)
          ? { confirmingNodeId: null, revokeError: null }
          : {}),
      })
    } catch (reason) {
      if (disposed || request !== listRequest) return
      replace({ loading: false, loadingMore: false, listError: errorCode(reason) })
    }
  }
  const setConnection = (nextConnected: boolean, nextWritable: boolean) => {
    const wasConnected = lastConnected
    const wasWritable = current().writable
    lastConnected = nextConnected
    replace({ connected: nextConnected, writable: nextWritable })
    if (!nextConnected) {
      listRequest++
      mutationRequest++
      copyRequest++
      replace({
        page: null,
        loading: false,
        loadingMore: false,
        listError: null,
        inviteBusy: false,
        invite: null,
        revokingNodeId: null,
        confirmingNodeId: null,
        revision: current().revision + 1,
      })
      return
    }
    if (wasWritable && !nextWritable) {
      mutationRequest++
      copyRequest++
      replace({
        inviteBusy: false,
        invite: null,
        copied: null,
        copyError: false,
        revokingNodeId: null,
        confirmingNodeId: null,
      })
    }
    if (!wasConnected) void refresh()
  }
  const loadMore = async () => {
    const state = current()
    const cursor = state.page?.nextCursor
    if (disposed || !state.connected || state.loadingMore || !cursor) return
    const request = ++listRequest
    const revision = state.revision
    replace({ loadingMore: true, listError: null })
    try {
      const page = await commands.execute('node.list', { after: cursor, limit: 20 })
      const latest = current()
      if (disposed || request !== listRequest || latest.revision !== revision || latest.hostId !== hostId) return
      const existing = latest.page
      if (!existing)
        throw Object.assign(new Error('Node page disappeared while loading the next page'), {
          code: 'NODE_PAGE_MISSING',
        })
      assertUniqueNodeIds(page)
      if (page.items.some((node) => existing.items.some((item) => item.nodeId === node.nodeId)))
        throw Object.assign(new Error('Node pages overlap'), { code: 'NODE_PAGE_DUPLICATE' })
      if (page.nextCursor !== null && page.nextCursor <= cursor)
        throw Object.assign(new Error('Node list cursor did not advance'), { code: 'NODE_CURSOR_STALLED' })
      replace({ page: { items: [...existing.items, ...page.items], nextCursor: page.nextCursor }, loadingMore: false })
    } catch (reason) {
      if (disposed || request !== listRequest) return
      replace({ loadingMore: false, listError: errorCode(reason) })
    }
  }
  const cancelLoad = () => {
    if (!current().loading && !current().loadingMore) return
    listRequest++
    replace({ loading: false, loadingMore: false, revision: current().revision + 1 })
  }
  const setInviteName = (value: string) => {
    copyRequest++
    replace({ inviteName: value.slice(0, 160), invite: null, inviteError: null, copied: null, copyError: false })
  }
  const createInvite = async () => {
    const state = current()
    const name = state.inviteName.trim()
    if (disposed || !state.connected || !state.writable || state.inviteBusy || !name) return
    const request = ++mutationRequest
    copyRequest++
    replace({ inviteBusy: true, invite: null, inviteError: null, copied: null, copyError: false })
    try {
      const invite = await commands.execute('node.invite', { name })
      if (
        disposed ||
        request !== mutationRequest ||
        !current().connected ||
        !current().writable ||
        current().hostId !== hostId
      )
        return
      copyRequest++
      replace({ invite, inviteBusy: false, inviteError: null })
      await refresh()
    } catch (reason) {
      if (disposed || request !== mutationRequest) return
      replace({ inviteBusy: false, inviteError: errorCode(reason) })
    }
  }
  const confirmRevoke = async () => {
    const state = current()
    const nodeId = state.confirmingNodeId
    if (
      disposed ||
      !nodeId ||
      !state.connected ||
      !state.writable ||
      state.revokingNodeId ||
      !state.page?.items.some((node) => node.nodeId === nodeId)
    )
      return
    const request = ++mutationRequest
    replace({ revokingNodeId: nodeId, revokeError: null })
    try {
      await commands.execute('node.revoke', { selector: nodeId })
      if (
        disposed ||
        request !== mutationRequest ||
        !current().connected ||
        !current().writable ||
        current().hostId !== hostId
      )
        return
      replace({ confirmingNodeId: null, revokingNodeId: null, revokeError: null })
      await refresh()
    } catch (reason) {
      if (disposed || request !== mutationRequest) return
      replace({ revokingNodeId: null, revokeError: errorCode(reason) })
    }
  }
  const cancelRevoke = () => {
    if (current().revokingNodeId) return
    replace({ confirmingNodeId: null, revokeError: null })
  }
  const requestRevoke = (nodeId: string) => {
    const state = current()
    if (disposed || !state.connected || !state.writable || state.revokingNodeId) return
    replace({ confirmingNodeId: nodeId, revokeError: null })
  }
  const copy = async (value: string, kind: 'code' | 'fingerprint') => {
    const invite = current().invite
    if (disposed || !current().writable || !invite || value !== (kind === 'code' ? invite.code : invite.fingerprint))
      return
    const request = ++copyRequest
    const isCurrent = () => !disposed && request === copyRequest && current().writable && current().invite === invite
    try {
      await navigator.clipboard.writeText(value)
      if (!isCurrent()) return
      replace({ copied: kind, copyError: false, inviteError: null })
    } catch {
      if (!isCurrent()) return
      replace({ copied: null, copyError: true, inviteError: null })
    }
  }
  if (connected) void refresh()
  return {
    store,
    setConnection,
    setInviteName,
    requestRevoke,
    refresh,
    loadMore,
    cancelLoad,
    createInvite,
    confirmRevoke,
    cancelRevoke,
    copy,
    dispose() {
      if (disposed) return
      disposed = true
      listRequest++
      mutationRequest++
      copyRequest++
    },
  }
}

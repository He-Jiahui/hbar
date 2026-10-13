import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NodeListPage } from '@hbar/contracts/node-management'
import { NodeManagementSettings } from '../packages/app-react/src/node-management-settings'
import { nodeManagementSettingsCopy } from '../apps/web/src/node-management-settings-copy'
import {
  createNodeManagementSettingsModel,
  type NodeManagementCommands,
} from '../apps/web/src/node-management-settings-model'

function node(index: number) {
  return {
    nodeId: `node-${index}`,
    publicKey: 'A'.repeat(43),
    name: `Node ${index}`,
    createdAt: 1,
    lastSeenAt: 2,
    revokedAt: null,
    capabilities: null,
    online: index % 2 === 0,
  }
}

function page(count: number, nextCursor: string | null = null): NodeListPage {
  return { items: Array.from({ length: count }, (_, index) => node(index)), nextCursor }
}

function commands(execute: (id: string, input: unknown) => Promise<unknown>): NodeManagementCommands {
  return { execute } as NodeManagementCommands
}

test('model limits pages to 20, rejects duplicate IDs, and discards cancelled stale responses', async () => {
  let resolveList: ((value: NodeListPage) => void) | undefined
  const api = commands(async (id) => {
    if (id === 'node.list')
      return await new Promise<NodeListPage>((resolve) => {
        resolveList = resolve
      })
    throw new Error(`Unexpected ${id}`)
  })
  const model = createNodeManagementSettingsModel(api, 'host-a', false, true)
  const initial = model.refresh()
  expect(model.store.getState().loading).toBe(false)
  model.setConnection(true, true)
  await Promise.resolve()
  model.cancelLoad()
  resolveList?.(page(1))
  await initial
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(model.store.getState().page).toBeNull()
  const duplicateApi = commands(async () => ({ items: [node(1), node(1)], nextCursor: null }))
  const duplicateModel = createNodeManagementSettingsModel(duplicateApi, 'host-a', true, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(duplicateModel.store.getState().listError).toBe('NODE_PAGE_DUPLICATE')
  expect(duplicateModel.store.getState().page).toBeNull()
  model.dispose()
  duplicateModel.dispose()
})

test('list errors expose recoverable state and refresh replaces it with Host data', async () => {
  let attempts = 0
  const api = commands(async (id) => {
    if (id !== 'node.list') throw new Error(`Unexpected ${id}`)
    attempts += 1
    if (attempts === 1) throw { code: 'TEMPORARY_FAILURE' }
    return page(1)
  })
  const model = createNodeManagementSettingsModel(api, 'host-a', true, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(model.store.getState().listError).toBe('TEMPORARY_FAILURE')
  expect(model.store.getState().page).toBeNull()
  await model.refresh()
  expect(model.store.getState().listError).toBeNull()
  expect(model.store.getState().page?.items.map((item) => item.nodeId)).toEqual(['node-0'])
  model.dispose()
})

test('cursor paging appends a unique second page with a stable 20-node boundary', async () => {
  const calls: Array<{ id: string; input: unknown }> = []
  const api = commands(async (id, input) => {
    calls.push({ id, input })
    return calls.length === 1 ? page(20, 'node-19') : { items: [node(20)], nextCursor: null }
  })
  const model = createNodeManagementSettingsModel(api, 'host-a', true, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(model.store.getState().page?.items).toHaveLength(20)
  await model.loadMore()
  expect(model.store.getState().page?.items.map((item) => item.nodeId)).toEqual(
    Array.from({ length: 21 }, (_, index) => `node-${index}`),
  )
  expect(calls).toEqual([
    { id: 'node.list', input: { limit: 20 } },
    { id: 'node.list', input: { after: 'node-19', limit: 20 } },
  ])
  model.dispose()
})

test('observer cannot invite or revoke even when an action is invoked directly', async () => {
  const calls: string[] = []
  const api = commands(async (id) => {
    calls.push(id)
    return id === 'node.list' ? page(0) : node(0)
  })
  const model = createNodeManagementSettingsModel(api, 'host-a', true, false)
  model.setInviteName('readonly')
  await model.createInvite()
  model.requestRevoke('node-0')
  await model.confirmRevoke()
  const currentState = model.store.getState()
  expect(currentState.confirmingNodeId).toBeNull()
  expect(calls).toEqual(['node.list'])
  expect(model.store.getState().invite).toBeNull()
  expect(model.store.getState().confirmingNodeId).toBeNull()
  model.dispose()
})

test('permission downgrade invalidates pending invite and revoke responses', async () => {
  let resolveInvite:
    ((value: { code: string; name: string; expiresAt: number; fingerprint: string }) => void) | undefined
  let rejectRevoke: ((reason: unknown) => void) | undefined
  const api = commands(async (id) => {
    if (id === 'node.list') return { items: [node(0)], nextCursor: null }
    if (id === 'node.invite')
      return await new Promise((resolve) => {
        resolveInvite = resolve
      })
    if (id === 'node.revoke')
      return await new Promise((_, reject) => {
        rejectRevoke = reject
      })
    throw new Error(`Unexpected ${id}`)
  })
  const model = createNodeManagementSettingsModel(api, 'host-a', true, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  model.setInviteName('pending invitation')
  const invitePending = model.createInvite()
  expect(model.store.getState().inviteBusy).toBe(true)
  model.setConnection(true, false)
  expect(model.store.getState().inviteBusy).toBe(false)
  expect(model.store.getState().invite).toBeNull()
  resolveInvite?.({
    code: '12345678',
    name: 'pending invitation',
    expiresAt: 100,
    fingerprint: 'SHA256:' + 'A'.repeat(43),
  })
  await invitePending
  expect(model.store.getState().invite).toBeNull()
  expect(model.store.getState().inviteError).toBeNull()

  model.setConnection(true, true)
  model.requestRevoke('node-0')
  const revokePending = model.confirmRevoke()
  expect(model.store.getState().revokingNodeId).toBe('node-0')
  model.setConnection(true, false)
  expect(model.store.getState().revokingNodeId).toBeNull()
  expect(model.store.getState().confirmingNodeId).toBeNull()
  rejectRevoke?.({ code: 'LATE_REVOKE_FAILURE' })
  await revokePending
  expect(model.store.getState().revokeError).toBeNull()
  expect(model.store.getState().confirmingNodeId).toBeNull()
  model.dispose()
})

test('failed revoke remains visible beside its confirmed row and permits retry', async () => {
  let revokeAttempts = 0
  const api = commands(async (id) => {
    if (id === 'node.list') return { items: [node(0), node(1)], nextCursor: null }
    if (id === 'node.revoke') {
      revokeAttempts += 1
      throw { code: 'REVOKE_DENIED' }
    }
    throw new Error(`Unexpected ${id}`)
  })
  const model = createNodeManagementSettingsModel(api, 'host-a', true, true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  model.requestRevoke('node-1')
  await model.confirmRevoke()
  expect(model.store.getState().confirmingNodeId).toBe('node-1')
  expect(model.store.getState().revokingNodeId).toBeNull()
  expect(model.store.getState().revokeError).toBe('REVOKE_DENIED')
  const labels = nodeManagementSettingsCopy('en-US')
  const state = model.store.getState()
  const html = renderToStaticMarkup(
    createElement(NodeManagementSettings, {
      labels,
      page: state.page,
      loading: state.loading,
      loadingMore: state.loadingMore,
      connected: state.connected,
      accessKnown: true,
      readOnly: !state.writable,
      listError: state.listError,
      inviteName: state.inviteName,
      invite: state.invite,
      inviteBusy: state.inviteBusy,
      inviteError: state.inviteError,
      revokingNodeId: state.revokingNodeId,
      confirmingNodeId: state.confirmingNodeId,
      revokeError: state.revokeError,
      copied: state.copied,
      copyError: state.copyError,
      onInviteNameChange: () => undefined,
      onInvite: () => undefined,
      onRefresh: () => undefined,
      onLoadMore: () => undefined,
      onCancelLoad: () => undefined,
      onRevoke: () => undefined,
      onConfirmRevoke: () => undefined,
      onCancelRevoke: () => undefined,
      onCopy: () => undefined,
    }),
  )
  const rows = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((match) => match[1] ?? '')
  expect(rows).toHaveLength(2)
  expect(rows[0]).not.toContain(labels.revokeError('REVOKE_DENIED'))
  expect(rows[1]).toContain(labels.revokeError('REVOKE_DENIED'))
  await model.confirmRevoke()
  expect(revokeAttempts).toBe(2)
  model.dispose()
})

test('stale clipboard completion cannot mark a replaced invitation as copied', async () => {
  let resolveClipboard: (() => void) | undefined
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: () =>
          new Promise<void>((resolve) => {
            resolveClipboard = resolve
          }),
      },
    },
  })
  try {
    const api = commands(async (id) => {
      if (id === 'node.list') return { items: [], nextCursor: null }
      if (id === 'node.invite')
        return { code: '12345678', name: 'first invite', expiresAt: 100, fingerprint: 'SHA256:' + 'A'.repeat(43) }
      throw new Error(`Unexpected ${id}`)
    })
    const model = createNodeManagementSettingsModel(api, 'host-a', true, true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    model.setInviteName('first invite')
    await model.createInvite()
    const clipboardPending = model.copy('12345678', 'code')
    model.setInviteName('replacement invite')
    resolveClipboard?.()
    await clipboardPending
    expect(model.store.getState().invite).toBeNull()
    expect(model.store.getState().copied).toBeNull()
    expect(model.store.getState().copyError).toBe(false)
    model.dispose()
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})

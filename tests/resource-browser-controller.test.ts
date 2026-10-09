import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { ResourceCandidate } from '@hbar/contracts/resources'
import { createResourceBrowserController, type NativeResourceBridge } from '../apps/web/src/resource-browser-controller'
const candidate: ResourceCandidate = {
  id: 'a'.repeat(64),
  kind: 'web',
  name: 'example.com',
  location: 'https://example.com/',
  directory: 'https://example.com',
  workspacePath: null,
  mime: null,
  size: null,
}

test('closing a view while native creation is pending also releases the late native instance', async () => {
  const gate = Promise.withResolvers<unknown>()
  const actions: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'pending-resource-browser',
    hostId: 'host',
    directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
  })
  await runtime.ready
  const controller = createResourceBrowserController(runtime.view, {
    invoke(_command, args) {
      actions.push(String(args.action))
      return args.action === 'create' ? gate.promise : Promise.resolve(null)
    },
  })
  try {
    const creating = controller.ensure('pending', candidate.location)
    await controller.close('pending')
    gate.resolve({ url: candidate.location, title: candidate.name, loading: false, canBack: false, canForward: false })
    await creating
    expect(controller.store.getState().entries).toEqual({})
    expect(actions).toEqual(['create', 'close', 'close'])
  } finally {
    gate.resolve(null)
    await controller.closeAll()
    runtime.dispose()
  }
})
test('browser tabs reuse exact source and URL, share capacity, and release their native view after closing', async () => {
  const operations: string[] = []
  const native: NativeResourceBridge = {
    invoke(_command, input) {
      operations.push(String(input.action))
      return Promise.resolve(
        input.action === 'close'
          ? null
          : { url: candidate.location, title: candidate.name, loading: false, canBack: false, canForward: false },
      )
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'browser-fixture',
    hostId: 'host',
    surfaces: { canRender: (id) => ['browser', 'resource-file'].includes(id) },
    directory: {
      execute: (name) =>
        Promise.resolve(
          name === 'workspace.get'
            ? { id: 'w', name: 'Workspace', path: '/workspace', createdAt: 1 }
            : name === 'session.get'
              ? {
                  id: 's',
                  workspaceId: 'w',
                  title: 'Session',
                  createdAt: 1,
                  updatedAt: 1,
                  seq: 1,
                  archived: false,
                  parentId: null,
                }
              : { items: [], nextCursor: null },
        ),
    },
  })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 's' })
  const sourceTab = runtime.view.state.workspaceTabs.getSnapshot().items[0]!
  const source = { workspaceId: 'w', sessionId: 's', messageId: 'm', sourceTabInstanceKey: sourceTab.instanceKey }
  const controller = createResourceBrowserController(runtime.view, native)
  try {
    await controller.openBrowser(candidate, source)
    await controller.openBrowser(candidate, source)
    expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(2)
    expect(operations.filter((action) => action === 'create')).toHaveLength(1)
    const active = runtime.view.state.workspaceTabs.getSnapshot().activeId!
    await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture([active]), new AbortController().signal)
    const instance = Object.values(runtime.view.state.surfaces.getSnapshot().panels)[0]!
    await runtime.view.commands.execute('app.closePanel', { instanceId: instance.instanceId })
    await controller.releaseRemoved()
    expect(operations).toContain('close')
    expect(controller.store.getState().entries).toEqual({})
    await controller.openText(
      { ...candidate, kind: 'file', location: '/outside/file.txt', name: 'file.txt' },
      'external text',
      source,
      { kind: 'file', path: '/outside/file.txt', line: 2 },
    )
    expect(Object.values(controller.store.getState().files)[0]).toMatchObject({ text: 'external text', line: 2 })
    expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(2)
  } finally {
    await controller.closeAll()
    runtime.dispose()
  }
})

import { expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAppRuntime } from '@hbar/app-runtime'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startWebSessionHost, stopWebSessionHost } from '../e2e/support/web-session-host'
import { createWorkspaceNavigationActions } from '../packages/app-react/src/workspace-navigation-actions'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-validation-'))
  const reservation = Bun.serve({ port: 0, fetch: () => new Response(null, { status: 204 }) })
  const port = reservation.port
  await reservation.stop(true)
  if (!port) throw new Error('No temporary Host port was allocated')
  const host = await startWebSessionHost({ root, port })
  const commands = createWorkspaceSessionCommandClient(host.client)
  const original = (await commands.execute('workspace.list', {})).items[0]
  if (!original) throw new Error('Fixture workspace is missing')
  const session = await commands.execute('session.get', { sessionId: host.ready.sessionId })
  if (!session) throw new Error('Fixture session is missing')
  return {
    root,
    commands,
    original,
    session,
    async close() {
      await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    },
  }
}

for (const invalid of ['missing-directory', 'file-as-directory'] as const) {
  test(`real Host ${invalid} is a correctable workspace failure without storage or selection changes`, async () => {
    const host = await fixture()
    const runtime = createAppRuntime({
      instanceId: invalid,
      hostId: 'validation-host',
      directory: host.commands,
      workspaces: host.commands,
    })
    const actions = createWorkspaceNavigationActions(runtime.view, () => {})
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: host.session.id })
      const beforeWorkspaces = (await host.commands.execute('workspace.list', {})).items
      const beforeSessions = (await host.commands.execute('session.list', { workspaceId: host.original.id })).items
      const path = join(host.root, invalid)
      if (invalid === 'file-as-directory') await writeFile(path, 'Fixture file, not a directory')
      await expect(host.commands.execute('workspace.create', { path })).rejects.toMatchObject({
        code: 'INVALID_WORKSPACE',
      })
      expect(await actions.run({ kind: 'open-workspace', path, createSession: true })).toBeNull()
      expect(actions.getSnapshot()).toMatchObject({ status: 'failed', error: 'INVALID_WORKSPACE' })
      expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
        workspaceId: host.original.id,
        sessionId: host.session.id,
      })
      expect((await host.commands.execute('workspace.list', {})).items).toEqual(beforeWorkspaces)
      expect((await host.commands.execute('session.list', { workspaceId: host.original.id })).items).toEqual(
        beforeSessions,
      )
      expect(Object.keys(runtime.view.state.directory.getSnapshot().workspaces)).toEqual([host.original.id])
      const validPath = join(host.root, 'corrected-directory')
      await mkdir(validPath)
      const selected = await actions.run({ kind: 'open-workspace', path: validPath, createSession: true })
      expect(selected).not.toBeNull()
      if (!selected) throw new Error('Corrected workspace did not open')
      expect(actions.getSnapshot()).toEqual({ status: 'idle', action: null, error: null })
      expect(runtime.view.state.navigation.getSnapshot()).toMatchObject(selected)
      expect(
        (await host.commands.execute('workspace.list', {})).items.find((item) => item.id === selected.workspaceId)
          ?.path,
      ).toBe(await realpath(validPath))
      expect((await host.commands.execute('workspace.list', {})).items).toHaveLength(beforeWorkspaces.length + 1)
      expect((await host.commands.execute('session.list', { workspaceId: selected.workspaceId })).items).toHaveLength(1)
      expect((await host.commands.execute('session.list', { workspaceId: host.original.id })).items).toEqual(
        beforeSessions,
      )
    } finally {
      actions.dispose()
      runtime.dispose()
      await host.close()
    }
  })
}

test('a workspace result lost after real Host acceptance stays unknown and never automatically replays or retargets', async () => {
  const host = await fixture()
  let writes = 0
  const runtime = createAppRuntime({
    instanceId: 'workspace-unknown',
    hostId: 'validation-host',
    directory: host.commands,
    workspaces: {
      async execute(name, input, options) {
        if (name !== 'workspace.create') throw new Error('Unexpected mutation')
        writes += 1
        await host.commands.execute(name, workspaceSessionCommands[name].input.parse(input), options)
        throw new HbarError('RESULT_UNKNOWN', 'Accepted result was lost')
      },
    },
  })
  const actions = createWorkspaceNavigationActions(runtime.view, () => {})
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: host.session.id })
    const path = join(host.root, 'accepted-directory')
    await mkdir(path)
    const originalAction = { kind: 'open-workspace' as const, path, createSession: true }
    expect(await actions.run(originalAction)).toBeNull()
    expect(actions.getSnapshot()).toEqual({ status: 'unknown', action: originalAction, error: 'RESULT_UNKNOWN' })
    expect(await actions.run(originalAction)).toBeNull()
    expect(await actions.run({ kind: 'open-workspace', path: host.root, createSession: false })).toBeNull()
    expect(writes).toBe(1)
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: host.original.id,
      sessionId: host.session.id,
    })
    const stored = (await host.commands.execute('workspace.list', {})).items
    expect(stored).toHaveLength(2)
    for (const item of stored)
      expect((await host.commands.execute('session.list', { workspaceId: item.id })).items).toHaveLength(
        item.id === host.original.id ? 1 : 0,
      )
    expect(Object.keys(runtime.view.state.directory.getSnapshot().workspaces)).toEqual([host.original.id])
  } finally {
    actions.dispose()
    runtime.dispose()
    await host.close()
  }
})

test('filesystem validation does not relabel a storage write failure as an invalid workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-storage-failure-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const failure = new Error('Storage write result is unknown')
  const storage = spyOn(kernel.storage, 'call')
  try {
    storage.mockRejectedValueOnce(failure)
    await expect(kernel.createWorkspace(root)).rejects.toBe(failure)
  } finally {
    storage.mockRestore()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

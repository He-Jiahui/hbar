import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  createAppRuntime,
  type NavigationState,
  type PresentationState,
  type SurfaceState,
  type WorkspaceTabsState,
} from '@hbar/app-runtime'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import { fileCommands } from '@hbar/contracts/commands/files'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { createSessionTools } from '../packages/app-runtime/src/session-tools'
import { createState } from '../packages/app-runtime/src/state'

function fixture() {
  const workspaces: Workspace[] = ['w', 'other'].map((id) => ({ id, name: id, path: `D:/${id}`, createdAt: 1 }))
  const sessions = new Map<string, Session>(
    Array.from({ length: 40 }, (_, index) => {
      const id = `s${index}`
      return [
        id,
        {
          id,
          title: id,
          workspaceId: index === 2 ? 'other' : 'w',
          archived: false,
          parentId: null,
          createdAt: 1,
          updatedAt: 1,
          seq: 1,
        },
      ]
    }),
  )
  let queryGate: Promise<void> | undefined
  let writeGate: Promise<void> | undefined
  let writeUnknown = false
  const disk = new Map<string, string>()
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')
  const directory: CommandExecutor = {
    async execute(name, raw) {
      if (name === 'session.get') {
        if (queryGate) await queryGate
        return sessions.get(directoryCommands['session.get'].input.parse(raw).sessionId) ?? null
      }
      if (name === 'workspace.get')
        return (
          workspaces.find((item) => item.id === directoryCommands['workspace.get'].input.parse(raw).workspaceId) ?? null
        )
      if (name === 'workspace.list') return { items: workspaces, nextCursor: null }
      if (name === 'session.list') {
        const input = directoryCommands['session.list'].input.parse(raw)
        return {
          items: [...sessions.values()].filter(
            (item) => item.workspaceId === input.workspaceId && (input.includeArchived || !item.archived),
          ),
          nextCursor: null,
        }
      }
      throw new Error(`Unexpected directory read ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'session-tools',
    directory,
    surfaces: { canRender: () => true },
    workspaces: {
      execute(name, raw) {
        if (name !== 'session.archive') throw new Error(`Unexpected write ${name}`)
        const input = workspaceSessionCommands['session.archive'].input.parse(raw)
        const prior = sessions.get(input.sessionId)
        if (!prior) throw new Error('Missing session')
        const next = { ...prior, archived: input.archived, updatedAt: prior.updatedAt + 1, seq: prior.seq + 1 }
        sessions.set(prior.id, next)
        return Promise.resolve(next)
      },
    },
    files: {
      async execute(name, raw) {
        if (name === 'file.list') return { items: [{ name: 'draft.txt', path: 'draft.txt', directory: false }] }
        if (name === 'file.read') {
          const input = fileCommands['file.read'].input.parse(raw)
          const text = disk.get(input.path) ?? 'baseline'
          return { workspaceId: input.workspaceId, path: input.path, text, size: text.length, sha256: sha(text) }
        }
        if (name === 'file.write') {
          const input = fileCommands['file.write'].input.parse(raw)
          if (writeGate) await writeGate
          disk.set(input.path, input.text)
          if (writeUnknown) throw new CommandError('RESULT_UNKNOWN', 'Accepted write lost its receipt')
          return {
            workspaceId: input.workspaceId,
            path: input.path,
            created: false,
            beforeSha256: input.expectedSha256 ?? null,
            afterSha256: sha(input.text),
            size: input.text.length,
          }
        }
        throw new Error(`Unexpected file command ${name}`)
      },
    },
  })
  const commands = runtime.view.commands
  const select = (sessionId: string) =>
    commands.execute('app.setSession', {
      sessionId,
      workspaceId: sessions.get(sessionId)?.workspaceId ?? 'w',
    })
  const source = (panelId: 'files' | 'monitoring' | 'agents' | 'goals') => {
    const selected = runtime.view.state.navigation.getSnapshot()
    if (!selected.sessionId || !selected.workspaceId) throw new Error('No selected session')
    return {
      panelId,
      sessionId: selected.sessionId,
      workspaceId: selected.workspaceId,
      sourceTabInstanceKey:
        runtime.view.state.workspaceTabs
          .getSnapshot()
          .items.find((item) => item.kind === 'session' && item.sessionId === selected.sessionId)?.instanceKey ?? null,
    }
  }
  const open = (kind: 'files' | 'monitoring' | 'agents' | 'goals') =>
    commands.execute('sessionTools.open', source(kind))
  const visible = () => runtime.view.state.presentation.getSnapshot().toolInstanceId
  const closeTab = (sessionId: string) =>
    runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture([sessionId]), new AbortController().signal)
  const read = async (instanceId: string, path = 'draft.txt') => {
    await commands.execute('fileWorkspace.refresh', { instanceId })
    await commands.execute('fileWorkspace.openEntry', { instanceId, path, directory: false })
  }
  return {
    runtime,
    commands,
    sessions,
    disk,
    select,
    source,
    open,
    visible,
    closeTab,
    read,
    setQueryGate(value: Promise<void> | undefined) {
      queryGate = value
    },
    setWriteGate(value: Promise<void> | undefined) {
      writeGate = value
    },
    setWriteUnknown(value: boolean) {
      writeUnknown = value
    },
  }
}

test('session tools isolate A/B/C, preserve exact surfaces and drafts, and close only their own selection', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.select('s0')
    const a = await f.open('files')
    const original = f.runtime.view.state.surfaces.getSnapshot().panels[a.instanceId]
    await f.read(a.instanceId)
    await f.commands.execute('fileWorkspace.setText', { instanceId: a.instanceId, text: 'unsaved A' })
    await f.select('s1')
    expect(f.visible()).toBeNull()
    const b = await f.open('monitoring')
    await f.select('s2')
    expect(f.visible()).toBeNull()
    const c = await f.open('goals')
    await f.select('s0')
    expect(f.visible()).toBe(a.instanceId)
    expect(f.runtime.view.state.surfaces.getSnapshot().panels[a.instanceId]).toBe(original)
    expect(original).toMatchObject({ binding: 'pinned', sessionTool: true, sessionId: 's0', workspaceId: 'w' })
    expect(f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.document?.draft).toBe('unsaved A')
    expect(await f.commands.execute('sessionTools.toggle', f.source('files'))).toEqual({ ...a, visible: false })
    expect(f.visible()).toBeNull()
    await f.select('s1')
    expect(f.visible()).toBe(b.instanceId)
    await f.select('s2')
    expect(f.visible()).toBe(c.instanceId)
    await f.select('s0')
    expect(f.visible()).toBeNull()
    expect(await f.open('files')).toEqual(a)
    expect(f.disk.size).toBe(0)
  } finally {
    f.runtime.dispose()
  }
})

test('Settings/Status preserve return context; failed/loading navigation and stale tab captures cannot move tools', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.select('s0')
    const a = await f.open('files')
    const oldSource = f.source('agents')
    await f.commands.execute('app.openSettings', { scope: 'global' })
    expect(f.visible()).toBeNull()
    await f.commands.execute('app.back', {})
    expect(f.visible()).toBe(a.instanceId)
    await f.commands.execute('app.openStatus', { section: 'dashboard' })
    await expect(f.select('missing')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' })
    expect(f.runtime.view.state.presentation.getSnapshot().page.kind).toBe('status')
    await f.commands.execute('app.back', {})
    await f.commands.execute('app.closePanel', { instanceId: a.instanceId })
    expect(await f.open('files')).toEqual(a)
    await f.commands.execute('app.openStatus', { section: 'dashboard' })
    const gate = Promise.withResolvers<void>()
    f.setQueryGate(gate.promise)
    const selecting = f.select('s1')
    await Bun.sleep(0)
    await expect(f.commands.execute('sessionTools.open', oldSource)).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(f.runtime.view.state.presentation.getSnapshot().page.kind).toBe('status')
    gate.resolve()
    await selecting
    f.setQueryGate(undefined)
    expect(f.visible()).toBeNull()
    await f.closeTab('s0')
    await f.select('s0')
    expect(f.visible()).toBeNull()
    await expect(f.commands.execute('sessionTools.open', oldSource)).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    expect(await f.open('files')).toEqual(a)
    await expect(
      f.commands.execute('app.openPanel', {
        panelId: 'files',
        instanceId: a.instanceId,
        workspaceId: 'other',
        sessionId: 's2',
        binding: 'pinned',
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
  } finally {
    f.runtime.dispose()
  }
})

test('project Files remains explicit while expanded session Files stays bound and Back keeps its dock closed', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.select('s0')
    const a = await f.open('files')
    await f.read(a.instanceId)
    await f.commands.execute('fileWorkspace.setText', { instanceId: a.instanceId, text: 'workbench draft' })
    const expanded = await f.commands.execute('workspaceTabs.openWorkbench', {
      panelInstanceId: a.instanceId,
      sourceSessionId: 's0',
      workspaceId: 'w',
    })
    expect(f.visible()).toBeNull()
    await f.select('s0')
    expect(await f.open('files')).toEqual({ ...a, visible: false })
    expect(f.runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe(expanded.id)
    await f.select('s1')
    const b = await f.open('agents')
    await f.commands.execute('workspaceTabs.select', { id: expanded.id })
    expect(f.visible()).toBeNull()
    const tab = f.runtime.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === expanded.id)
    if (!tab) throw new Error('Missing workbench')
    await f.commands.execute('workspaceTabs.returnToSource', { id: tab.id, instanceKey: tab.instanceKey })
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s0')
    expect(f.visible()).toBeNull()
    expect(f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.document?.draft).toBe('workbench draft')
    await f.select('s1')
    expect(f.visible()).toBe(b.instanceId)
    const project = await f.commands.execute('app.openPanel', { panelId: 'files', workspaceId: 'w', binding: 'pinned' })
    await f.select('s2')
    expect(f.visible()).toBe(project.instanceId)
    expect(f.runtime.view.state.surfaces.getSnapshot().panels[project.instanceId]).toMatchObject({
      workspaceId: 'w',
      sessionId: null,
      binding: 'pinned',
    })
    await f.commands.execute('app.closePanel', { instanceId: project.instanceId })
    expect(f.visible()).toBeNull()
    await f.select('s1')
    expect(f.visible()).toBe(b.instanceId)
  } finally {
    f.runtime.dispose()
  }
})

test('Workbench preview open/select/refresh remembers the exact source dock across B and tab updates', async () => {
  for (const operation of ['open', 'select', 'refresh'] as const) {
    const f = fixture()
    try {
      await f.runtime.ready
      await f.select('s0')
      const a = await f.open('files')
      await f.read(a.instanceId)
      const panel = f.runtime.view.state.surfaces.getSnapshot().panels[a.instanceId]
      const expanded = await f.commands.execute('workspaceTabs.openWorkbench', {
        panelInstanceId: a.instanceId,
        sourceSessionId: 's0',
        workspaceId: 'w',
      })
      expect(f.visible()).toBeNull()
      await f.select('s1')
      const b = await f.open('monitoring')
      await f.commands.execute('workspaceTabs.select', { id: expanded.id })
      expect(f.visible()).toBeNull()
      if (operation === 'open') {
        await f.commands.execute('fileWorkspace.openEntry', {
          instanceId: a.instanceId,
          path: 'another.txt',
          directory: false,
        })
      } else {
        const previewId = f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.activePreviewId
        if (!previewId) throw new Error('Missing preview')
        await f.commands.execute(
          operation === 'select' ? 'fileWorkspace.selectPreview' : 'fileWorkspace.refreshPreview',
          { instanceId: a.instanceId, workspaceId: 'w', previewId },
        )
      }
      expect(f.visible()).toBeNull()
      await f.commands.execute('workspaceTabs.move', { id: expanded.id, beforeId: 's0' })
      expect(f.visible()).toBeNull()
      const tab = f.runtime.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === expanded.id)
      if (!tab) throw new Error('Missing workbench')
      await f.commands.execute('workspaceTabs.returnToSource', { id: tab.id, instanceKey: tab.instanceKey })
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s0')
      expect(f.visible()).toBe(a.instanceId)
      expect(f.runtime.view.state.surfaces.getSnapshot().panels[a.instanceId]).toBe(panel)
      await f.select('s1')
      expect(f.visible()).toBe(b.instanceId)
      await f.select('s0')
      expect(f.visible()).toBe(a.instanceId)
      expect(f.disk.size).toBe(0)
    } finally {
      f.runtime.dispose()
    }
  }
})

test('archive and restore close session visibility without dropping its in-flight and unknown Files write', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.select('s0')
    const a = await f.open('files')
    await f.read(a.instanceId)
    await f.commands.execute('fileWorkspace.setText', { instanceId: a.instanceId, text: 'submitted A' })
    const gate = Promise.withResolvers<void>()
    f.setWriteGate(gate.promise)
    f.setWriteUnknown(true)
    const saving = f.commands
      .execute('fileWorkspace.save', { instanceId: a.instanceId })
      .catch((reason: unknown) => reason)
    await Bun.sleep(0)
    await f.select('s1')
    const b = await f.open('monitoring')
    await f.commands.execute('app.archiveSession', { sessionId: 's0', archived: true })
    expect(f.visible()).toBe(b.instanceId)
    expect(f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.document?.status).toBe('submitting')
    gate.resolve()
    expect(await saving).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.document).toMatchObject({
      status: 'unknown',
      draft: 'submitted A',
      pendingText: 'submitted A',
    })
    await f.commands.execute('app.archiveSession', { sessionId: 's0', archived: false })
    expect(f.visible()).toBe(b.instanceId)
    await f.select('s0')
    expect(f.visible()).toBeNull()
    expect(await f.open('files')).toEqual(a)
    expect(f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.document?.status).toBe('unknown')
    expect(f.disk.get('draft.txt')).toBe('submitted A')
  } finally {
    f.runtime.dispose()
  }
})

test('32 owner capacity evicts only closed clean owners and preserves dirty closed sessions', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.select('s0')
    const protectedA = await f.open('files')
    await f.read(protectedA.instanceId)
    await f.commands.execute('fileWorkspace.setText', { instanceId: protectedA.instanceId, text: 'protected' })
    await f.closeTab('s0')
    let cleanId = ''
    for (let index = 1; index < 33; index++) {
      await f.select(`s${index}`)
      const opened = await f.open('files')
      await f.read(opened.instanceId, `clean-${index}.txt`)
      if (index === 1) cleanId = opened.instanceId
      await f.closeTab(`s${index}`)
    }
    const panels = f.runtime.view.state.surfaces.getSnapshot().panels
    expect(Object.values(panels).filter((panel) => panel.sessionTool)).toHaveLength(32)
    expect(panels[cleanId]).toBeUndefined()
    expect(f.runtime.view.state.files.getSnapshot().entries[cleanId]).toBeUndefined()
    expect(panels[protectedA.instanceId]).toBeDefined()
    await f.select('s0')
    expect(f.visible()).toBeNull()
    expect(await f.open('files')).toEqual(protectedA)
    expect(f.runtime.view.state.files.getSnapshot().entries[protectedA.instanceId]?.document?.draft).toBe('protected')
  } finally {
    f.runtime.dispose()
  }
})

test('observational archive retains the current reading tool and page return context, not future auto-open memory', async () => {
  for (const page of ['session', 'settings', 'status'] as const) {
    const f = fixture()
    try {
      await f.runtime.ready
      await f.select('s0')
      const a = await f.open('files')
      await f.read(a.instanceId)
      await f.commands.execute('fileWorkspace.setText', { instanceId: a.instanceId, text: 'archived original draft' })
      if (page === 'settings') await f.commands.execute('app.openSettings', { scope: 'global' })
      if (page === 'status') await f.commands.execute('app.openStatus', { section: 'dashboard' })
      const before = f.runtime.view.state.presentation.getSnapshot()
      const original = f.sessions.get('s0')
      if (!original) throw new Error('Missing original session')
      f.sessions.set('s0', { ...original, archived: true, seq: 2, updatedAt: 2 })
      await f.commands.execute('session.list', { workspaceId: 'w', includeArchived: true })
      expect(f.runtime.view.state.workspaceTabs.getSnapshot().items.some((tab) => tab.id === 's0')).toBe(false)
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s0')
      expect(f.runtime.view.state.presentation.getSnapshot()).toEqual(before)
      if (page !== 'session') await f.commands.execute('app.back', {})
      expect(f.visible()).toBe(a.instanceId)
      expect(f.runtime.view.state.files.getSnapshot().entries[a.instanceId]?.document?.draft).toBe(
        'archived original draft',
      )
      f.sessions.set('s0', { ...original, archived: false, seq: 3, updatedAt: 3 })
      await f.commands.execute('session.list', { workspaceId: 'w', includeArchived: true })
      expect(f.visible()).toBe(a.instanceId)
      expect(f.runtime.view.state.workspaceTabs.getSnapshot().items.some((tab) => tab.id === 's0')).toBe(false)
      await f.select('s1')
      expect(f.visible()).toBeNull()
      await f.select('s0')
      expect(f.visible()).toBeNull()
      expect(await f.open('files')).toEqual(a)
    } finally {
      f.runtime.dispose()
    }
  }
})

test('all protected owners fail capacity explicitly without mutating surfaces or dropping drafts', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    for (let index = 0; index < 32; index++) {
      await f.select(`s${index}`)
      const opened = await f.open('files')
      await f.read(opened.instanceId, `draft-${index}.txt`)
      await f.commands.execute('fileWorkspace.setText', { instanceId: opened.instanceId, text: `dirty ${index}` })
      await f.closeTab(`s${index}`)
    }
    await f.select('s32')
    const before = f.runtime.view.state.surfaces.getSnapshot()
    await expect(f.open('files')).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.runtime.view.state.surfaces.getSnapshot()).toBe(before)
    expect(
      Object.values(f.runtime.view.state.files.getSnapshot().entries).filter((entry) =>
        entry.document?.draft.startsWith('dirty'),
      ),
    ).toHaveLength(32)
    expect(f.visible()).toBeNull()
  } finally {
    f.runtime.dispose()
  }
})

function toolOwnerFixture() {
  const errors: unknown[] = []
  const error = (reason: unknown) => errors.push(reason)
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: 'a', status: 'idle', error: null },
    error,
  )
  const sourceTabs = ['a', 'b'].map((sessionId) => ({
    kind: 'session' as const,
    id: sessionId,
    sessionId,
    workspaceId: 'w',
    instanceKey: crypto.randomUUID(),
  }))
  const tabs = createState<WorkspaceTabsState>(
    { items: sourceTabs, activeId: 'a', revision: 0, restoreStatus: 'ready', restoreError: null, persistError: null },
    error,
  )
  const surfaces = createState<SurfaceState>(
    { panels: {}, windows: {}, focusedPanelId: null, focusedWindowId: null },
    error,
  )
  const presentation = createState<PresentationState>(
    { page: { kind: 'session' }, toolInstanceId: null, modalInstanceId: null, returnContext: null, sidebarOpen: false },
    error,
  )
  const archived = new Set<string>()
  const local = new CommandRegistry({ execution: 'client' })
  const tools = createSessionTools(local, {
    navigation: navigation.reader,
    tabs: tabs.reader,
    surfaces,
    presentation,
    canRender: () => true,
    isArchived: (_workspaceId, sessionId) => archived.has(sessionId),
    isProtected: () => false,
    onSubscriberError: error,
  })
  const open = async (sessionId: string, panelId: 'files' | 'agents' = 'files') => {
    const tab = sourceTabs.find((item) => item.sessionId === sessionId)
    if (!tab) throw new Error('Missing fixture source')
    navigation.replace({ ...navigation.reader.getSnapshot(), sessionId })
    tabs.replace({ ...tabs.reader.getSnapshot(), activeId: sessionId })
    await local.execute('sessionTools.open', {
      panelId,
      workspaceId: 'w',
      sessionId,
      sourceTabInstanceKey: tab.instanceKey,
    })
    const instanceId = presentation.reader.getSnapshot().toolInstanceId
    if (!instanceId) throw new Error('Missing opened fixture tool')
    return instanceId
  }
  const expand = (panelInstanceId: string, sourceSessionId: string) => {
    const workbench = {
      kind: 'workbench' as const,
      id: `workbench:${panelInstanceId}`,
      instanceKey: crypto.randomUUID(),
      panelInstanceId,
      sourceSessionId,
      workspaceId: 'w',
    }
    const before = tabs.reader.getSnapshot()
    tabs.replace({ ...before, items: [...before.items, workbench], activeId: workbench.id })
    return workbench
  }
  const remembered = (sessionId: string) =>
    tools.navigationTool(
      { workspaceId: 'w', sessionId, status: 'idle', error: null },
      { ...presentation.reader.getSnapshot(), toolInstanceId: null, returnContext: null },
    )
  return { tools, tabs, surfaces, presentation, archived, errors, open, expand, remembered }
}

test('only a matching owned Files preview remembers the source dock and existing Workbench updates retain it', async () => {
  const f = toolOwnerFixture()
  try {
    const a = await f.open('a')
    const workbench = f.expand(a, 'a')
    expect(f.remembered('a')).toBeNull()
    expect(f.presentation.reader.getSnapshot().toolInstanceId).toBeNull()
    const before = f.presentation.reader.getSnapshot()
    f.tools.previewOpened(a)
    expect(f.remembered('a')).toBe(a)
    expect(f.presentation.reader.getSnapshot()).toBe(before)
    f.tools.previewOpened(a)
    f.tabs.replace({ ...f.tabs.reader.getSnapshot(), revision: 1 })
    expect(f.remembered('a')).toBe(a)
    const b = await f.open('b', 'agents')
    const atB = f.presentation.reader.getSnapshot()
    f.tools.previewOpened(a)
    expect(f.presentation.reader.getSnapshot()).toBe(atB)
    expect(f.remembered('b')).toBe(b)
    expect(f.remembered('a')).toBe(a)
    // Closing a background Workbench preserves A's remembered dock and does not switch B.
    const tabs = f.tabs.reader.getSnapshot()
    f.tabs.replace({ ...tabs, items: tabs.items.filter((item) => item.instanceKey !== workbench.instanceKey) })
    expect(f.presentation.reader.getSnapshot()).toBe(atB)
    expect(f.remembered('a')).toBe(a)
    // A later new Workbench instance is a new Expand and starts closed again.
    f.expand(a, 'a')
    expect(f.remembered('a')).toBeNull()
    expect(f.remembered('b')).toBe(b)
    expect(f.errors).toEqual([])
  } finally {
    f.tools.dispose()
  }
})

test('preview callbacks cannot revive archived/closed owners or affect generic, foreign and non-Files panels', async () => {
  const f = toolOwnerFixture()
  try {
    const a = await f.open('a')
    f.tools.hide(a)
    f.tools.previewOpened(a)
    expect(f.remembered('a')).toBeNull()
    const workbench = f.expand(a, 'a')
    f.archived.add('a')
    f.tools.previewOpened(a)
    expect(f.remembered('a')).toBeNull()
    f.archived.delete('a')
    const correct = f.tabs.reader.getSnapshot()
    f.tabs.replace({
      ...correct,
      items: correct.items.map((item) => (item === workbench ? { ...workbench, sourceSessionId: 'b' } : item)),
    })
    f.tools.previewOpened(a)
    expect(f.remembered('a')).toBeNull()
    f.tabs.replace(correct)
    f.tabs.replace({ ...correct, items: correct.items.filter((item) => item.id !== 'a') })
    f.tools.previewOpened(a)
    expect(f.remembered('a')).toBeNull()
    const agents = await f.open('b', 'agents')
    f.expand(agents, 'b')
    f.tools.previewOpened(agents)
    expect(f.remembered('b')).toBeNull()
    const surfaces = f.surfaces.reader.getSnapshot()
    const generic = {
      instanceId: 'generic-files',
      panelId: 'files',
      workspaceId: 'w',
      sessionId: null,
      binding: 'pinned' as const,
      params: {},
    }
    f.surfaces.replace({ ...surfaces, panels: { ...surfaces.panels, [generic.instanceId]: generic } })
    f.tools.previewOpened(generic.instanceId)
    expect(
      f.tools.navigationTool(
        { workspaceId: 'w', sessionId: 'b', status: 'idle', error: null },
        { ...f.presentation.reader.getSnapshot(), toolInstanceId: generic.instanceId },
      ),
    ).toBe(generic.instanceId)
    f.tabs.replace(correct)
    f.tools.dispose()
    f.tools.previewOpened(a)
    expect(f.remembered('a')).toBeNull()
    expect(f.errors).toEqual([])
  } finally {
    f.tools.dispose()
  }
})

import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, extensionWorkspacePage } from '@hbar/app-runtime'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'

const plugin = (index: number): PluginInfo => ({
  id: `plugin-${index}`,
  name: `${index < 45 ? 'Alpha' : 'Beta'} ${index}`,
  version: '1.0.0',
  required: false,
  status: 'active',
  description: 'Fixture',
  provides: [],
  requires: [],
  config: {},
})
const skill = (index: number): SkillDescriptor => ({
  id: `skill-${index}`,
  path: `D:/fixture/${index < 45 ? 'Gamma' : 'Delta'}/${index}`,
  scope: 'global',
})
const outcome = (request: Promise<unknown>) =>
  request.then(
    () => null,
    (reason: unknown) => reason,
  )

function fixture() {
  let plugins = Array.from({ length: 65 }, (_, index) => plugin(index))
  let skills = Array.from({ length: 65 }, (_, index) => skill(index))
  let pluginGate: Promise<void> | null = null
  let detailGate: Promise<void> | null = null
  let unknownWrite = false
  const calls: { name: string; signal: AbortSignal | undefined }[] = []
  const runtime = createAppRuntime({
    instanceId: 'extension-navigation-test',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name, input, options) {
        calls.push({ name, signal: options?.signal })
        if (name === 'plugin.list') {
          const result = plugins
          await pluginGate
          return result
        }
        if (name === 'skill.list') return skills
        if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string')
          throw new Error('Fixture requires a plugin identity')
        if (name === 'plugin.inspect') {
          const result = plugins.find((item) => item.id === input.id) ?? null
          await detailGate
          return result
        }
        if (name === 'plugin.disable') {
          plugins = plugins.map((item) => (item.id === input.id ? { ...item, status: 'disabled' } : item))
          if (unknownWrite) throw new CommandError('RESULT_UNKNOWN', 'Fixture lost write reply')
          return plugins
        }
        throw new Error('Unexpected fixture command')
      },
    },
    surfaces: { canRender: () => true },
  })
  return {
    runtime,
    calls,
    setPlugins(value: PluginInfo[]) {
      plugins = value
    },
    setSkills(value: SkillDescriptor[]) {
      skills = value
    },
    holdPlugins(value: Promise<void> | null) {
      pluginGate = value
    },
    holdDetail(value: Promise<void> | null) {
      detailGate = value
    },
    setUnknownWrite() {
      unknownWrite = true
    },
    open(section = 'extensions') {
      return runtime.view.commands.execute('app.openSettings', { scope: 'global', section, instanceId: 'settings' })
    },
    refresh(collection?: 'plugins' | 'skills') {
      return runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings', collection })
    },
    query(query: string, collection?: 'plugins' | 'skills') {
      return runtime.view.commands.execute('extensionWorkspace.setQuery', { instanceId: 'settings', query, collection })
    },
    page(collection: 'plugins' | 'skills', page: number) {
      return runtime.view.commands.execute('extensionWorkspace.setPage', { instanceId: 'settings', collection, page })
    },
    inspect(pluginId: string) {
      return runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId: 'settings', pluginId })
    },
    entry() {
      const value = runtime.view.state.extensions.getSnapshot().entries.settings
      if (!value) throw new Error('Expected loaded extension entry')
      return value
    },
    dispose() {
      runtime.dispose()
    },
  }
}

test('a targeted Plugins query leaves the Skills query and page unchanged', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    await f.runtime.view.commands.execute('extensionWorkspace.setPage', {
      instanceId: 'settings',
      collection: 'skills',
      page: 2,
    })
    const request = { instanceId: 'settings', collection: 'plugins' as const, query: ' alpha ' }
    await f.runtime.view.commands.execute('extensionWorkspace.setQuery', request)
    const projected = extensionWorkspacePage(f.entry())
    expect(projected.pluginCount).toBe(45)
    expect(projected.skillCount).toBe(65)
    expect(projected.skillPage).toBe(2)
    expect(projected.skills[0]?.id).toBe('skill-40')
    expect(f.entry().queries).toEqual({ plugins: ' alpha ', skills: '' })
    expect('query' in f.entry()).toBe(false)
  } finally {
    f.dispose()
  }
})

test('direct Skills and Plugins section roundtrips preserve independent queries, pages and plugin detail', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh('plugins')
    await f.query(' ALPHA ', 'plugins')
    await f.page('plugins', 1)
    await f.inspect('plugin-25')
    const detail = f.entry().detail
    await f.open('skills')
    await f.refresh('skills')
    await f.query(' GAMMA ', 'skills')
    await f.page('skills', 2)
    expect(f.entry()).toMatchObject({
      queries: { plugins: ' ALPHA ', skills: ' GAMMA ' },
      pluginPage: 1,
      skillPage: 2,
      selectedPluginId: 'plugin-25',
    })
    expect(f.entry().detail).toBe(detail)
    expect(extensionWorkspacePage(f.entry())).toMatchObject({
      pluginCount: 45,
      skillCount: 45,
      pluginPage: 1,
      skillPage: 2,
    })
    expect(extensionWorkspacePage(f.entry()).skills.map((item) => item.id)).toEqual([
      'skill-40',
      'skill-41',
      'skill-42',
      'skill-43',
      'skill-44',
    ])
    await f.open()
    expect(f.entry().detail).toBe(detail)
    expect(extensionWorkspacePage(f.entry()).plugins[0]?.id).toBe('plugin-20')
    const skillsReadCount = f.calls.filter((call) => call.name === 'skill.list').length
    await f.refresh('plugins')
    expect(f.calls.filter((call) => call.name === 'skill.list')).toHaveLength(skillsReadCount)
    expect(f.entry()).toMatchObject({
      queries: { plugins: ' ALPHA ', skills: ' GAMMA ' },
      pluginPage: 1,
      skillPage: 2,
      detail: { pluginId: 'plugin-25', status: 'ready' },
    })
    await f.runtime.view.commands.execute('extensionWorkspace.back', { instanceId: 'settings' })
    expect(f.entry().detail).toBeNull()
    expect(f.entry().queries.skills).toBe(' GAMMA ')
    expect(f.entry().skillPage).toBe(2)
  } finally {
    f.dispose()
  }
})

test('changing one filter resets only its page; omitted collection preserves the legacy both-filter behavior', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    await f.query('alpha', 'plugins')
    await f.query('gamma', 'skills')
    await f.page('plugins', 2)
    await f.page('skills', 2)
    await f.query('beta', 'plugins')
    expect(f.entry()).toMatchObject({ queries: { plugins: 'beta', skills: 'gamma' }, pluginPage: 0, skillPage: 2 })
    expect(extensionWorkspacePage(f.entry()).pluginCount).toBe(20)
    await f.page('plugins', 1) // the filtered single page clamps independently
    expect(f.entry().pluginPage).toBe(0)
    await f.query('delta', 'skills')
    expect(f.entry()).toMatchObject({ queries: { plugins: 'beta', skills: 'delta' }, pluginPage: 0, skillPage: 0 })
    await f.query('fixture')
    expect(f.entry()).toMatchObject({ queries: { plugins: 'fixture', skills: 'fixture' }, pluginPage: 0, skillPage: 0 })
    expect(extensionWorkspacePage(f.entry())).toMatchObject({ pluginCount: 65, skillCount: 65 })
    await f.query('')
    expect(f.entry().queries).toEqual({ plugins: '', skills: '' })
  } finally {
    f.dispose()
  }
})

test('bounded query validation rejects oversized or invalid collection input without mutating either page', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    await f.page('skills', 2)
    await f.query('x'.repeat(200), 'plugins')
    const before = f.entry()
    expect(await outcome(f.query('x'.repeat(201), 'plugins'))).toMatchObject({ code: 'INVALID_INPUT' })
    const invalid = { instanceId: 'settings', query: 'bad', collection: 'tools' }
    expect(extensionWorkspaceCommands['extensionWorkspace.setQuery'].input.safeParse(invalid).success).toBe(false)
    expect(f.entry()).toBe(before)
    expect(f.entry().skillPage).toBe(2)
    expect(f.calls).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

test('filtered count and stale page clamp are independent after a collection refresh', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    await f.query('alpha', 'plugins')
    await f.query('gamma', 'skills')
    await f.page('plugins', 2)
    await f.page('skills', 1)
    f.setPlugins([plugin(0)])
    await f.refresh('plugins')
    expect(extensionWorkspacePage(f.entry())).toMatchObject({
      pluginCount: 1,
      skillCount: 45,
      pluginPage: 0,
      skillPage: 1,
    })
    expect(f.entry()).toMatchObject({ queries: { plugins: 'alpha', skills: 'gamma' }, pluginPage: 2, skillPage: 1 })
    f.setSkills([])
    await f.refresh('skills')
    expect(extensionWorkspacePage(f.entry())).toMatchObject({
      pluginCount: 1,
      skillCount: 0,
      pluginPage: 0,
      skillPage: 0,
    })
    expect(f.entry().queries).toEqual({ plugins: 'alpha', skills: 'gamma' })
  } finally {
    f.dispose()
  }
})

test('late Plugins list after a Skills roundtrip cannot replace fresh facts or either navigation state', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh()
    await f.query('alpha', 'plugins')
    await f.page('plugins', 1)
    f.holdPlugins(gate.promise)
    const old = outcome(f.refresh('plugins'))
    await f.open('skills')
    expect(await old).toMatchObject({ code: 'CANCELLED' })
    expect(f.calls.filter((call) => call.name === 'plugin.list').at(-1)?.signal?.aborted).toBe(true)
    await f.query('gamma', 'skills')
    await f.page('skills', 2)
    await f.refresh('skills')
    await f.open()
    f.holdPlugins(null)
    f.setPlugins([plugin(1)])
    await f.refresh('plugins')
    gate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.entry().plugins.map((item) => item.id)).toEqual(['plugin-1'])
    expect(f.entry()).toMatchObject({ queries: { plugins: 'alpha', skills: 'gamma' }, pluginPage: 1, skillPage: 2 })
    expect(f.entry().collections.plugins).toEqual({
      status: 'ready',
      error: null,
      hasSnapshot: true,
      requestInFlight: false,
    })
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('Skills never adopts a pending plugin detail and returning Plugins can explicitly recover the captured detail', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh('plugins')
    f.holdDetail(gate.promise)
    const detail = outcome(f.inspect('plugin-25'))
    await f.open('skills')
    await f.refresh('skills')
    expect(f.entry().detail).toMatchObject({ pluginId: 'plugin-25', status: 'error', error: 'CANCELLED', plugin: null })
    expect(f.entry().selectedPluginId).toBe('plugin-25')
    expect(await outcome(f.inspect('skill-25'))).toMatchObject({ code: 'COMMAND_NOT_FOUND' })
    await f.query('gamma', 'skills')
    await f.open()
    f.holdDetail(null)
    await f.inspect('plugin-25')
    gate.resolve()
    expect(await detail).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry().detail).toMatchObject({ pluginId: 'plugin-25', status: 'ready', plugin: { id: 'plugin-25' } })
    expect(f.entry().queries.skills).toBe('gamma')
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('Skills navigation and read-only recovery cannot unlock an unknown plugin write or replay it', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    await f.query('alpha', 'plugins')
    await f.page('plugins', 1)
    await f.inspect('plugin-25')
    f.setUnknownWrite()
    const input = { instanceId: 'settings', pluginId: 'plugin-25', enabled: false }
    expect(await outcome(f.runtime.view.commands.execute('extensionWorkspace.setEnabled', input))).toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await f.open('skills')
    await f.query('gamma', 'skills')
    await f.page('skills', 2)
    await f.refresh('skills')
    await f.open()
    await f.refresh('plugins')
    expect(f.entry().actions['plugin-25']?.status).toBe('unknown')
    expect(f.entry()).toMatchObject({ queries: { plugins: 'alpha', skills: 'gamma' }, pluginPage: 1, skillPage: 2 })
    expect(await outcome(f.runtime.view.commands.execute('extensionWorkspace.setEnabled', input))).toMatchObject({
      code: 'BUSY',
    })
    expect(f.calls.filter((call) => call.name === 'plugin.disable')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { SkillDetail, SkillDescriptor, SkillFileReadResult } from '@hbar/contracts/commands/extensions'

const descriptor = (id: string): SkillDescriptor => ({ id, path: `/skills/${id}`, scope: 'global' })
const detail = (id: string, files = ['SKILL.md', 'references/a.md']): SkillDetail => ({
  id,
  path: `/skills/${id}`,
  scope: 'global',
  entryPath: 'SKILL.md',
  displayName: `Skill ${id}`,
  description: 'Fixture skill',
  body: `# ${id}`,
  files: files.map((path) => ({ path, size: path.length })),
  filesTruncated: false,
  entryTruncated: false,
})
const file = (id: string, path: string): SkillFileReadResult => ({
  id,
  path,
  text: `# ${path}`,
  truncated: false,
})

function fixture() {
  const skills = [descriptor('skill-a'), descriptor('skill-b')]
  const calls: string[] = []
  const inspectGates = new Map<string, Promise<void>>()
  const fileGates = new Map<string, Promise<void>>()
  const inspectReplies = new Map<string, SkillDetail | null>()
  const fileReplies = new Map<string, SkillFileReadResult | null>()
  const runtime = createAppRuntime({
    instanceId: 'skill-detail-runtime',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name, input) {
        calls.push(name)
        if (name === 'skill.list') return skills
        if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string')
          throw new Error('Fixture target required')
        const id = input.id
        if (name === 'skill.inspect') {
          await inspectGates.get(id)
          return inspectReplies.has(id) ? inspectReplies.get(id) : detail(id)
        }
        if (name === 'skill.file.read') {
          const path = 'path' in input && typeof input.path === 'string' ? input.path : ''
          await fileGates.get(`${id}:${path}`)
          return fileReplies.has(`${id}:${path}`) ? fileReplies.get(`${id}:${path}`) : file(id, path)
        }
        throw new Error(`Unexpected fixture command ${name}`)
      },
    },
    surfaces: { canRender: () => true },
  })
  const entry = (instanceId = 'settings') => {
    const value = runtime.view.state.extensions.getSnapshot().entries[instanceId]
    if (!value) throw new Error('Expected extension entry')
    return value
  }
  const open = (section = 'skills') =>
    runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      section,
      instanceId: 'settings',
    })
  const refresh = (instanceId = 'settings') =>
    runtime.view.commands.execute('extensionWorkspace.refresh', {
      instanceId,
      collection: 'skills',
    })
  return {
    runtime,
    calls,
    inspectGates,
    fileGates,
    inspectReplies,
    fileReplies,
    entry,
    open,
    refresh,
    inspect: (skillId: string, instanceId = 'settings') =>
      runtime.view.commands.execute('extensionWorkspace.inspectSkill', { instanceId, skillId }),
    file: (path: string, instanceId = 'settings') =>
      runtime.view.commands.execute('extensionWorkspace.openSkillFile', { instanceId, path }),
    dispose: () => runtime.dispose(),
  }
}

const outcome = (request: Promise<unknown>) =>
  request.then(
    () => null,
    (error: unknown) => error,
  )

test('skill detail runtime loads overview/files and Back preserves list selection', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    await f.inspect('skill-a')
    expect(f.entry().skillDetail).toMatchObject({ skillId: 'skill-a', status: 'ready', view: 'overview', filesPage: 0 })
    await f.runtime.view.commands.execute('extensionWorkspace.selectSkillView', {
      instanceId: 'settings',
      view: 'files',
    })
    await f.file('references/a.md')
    expect(f.entry().skillDetail).toMatchObject({
      skillId: 'skill-a',
      view: 'files',
      selectedPath: 'references/a.md',
      file: { status: 'ready', file: { id: 'skill-a', path: 'references/a.md' } },
    })
    await f.runtime.view.commands.execute('extensionWorkspace.backSkill', { instanceId: 'settings' })
    expect(f.entry()).toMatchObject({ selectedSkillId: 'skill-a', skillDetail: null, skillPage: 0 })
  } finally {
    f.dispose()
  }
})

test('late A inspect cannot overwrite a newer B selection', async () => {
  const f = fixture()
  const a = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh()
    f.inspectGates.set('skill-a', a.promise)
    const old = outcome(f.inspect('skill-a'))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await f.inspect('skill-b')
    a.resolve()
    expect(await old).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry().skillDetail).toMatchObject({ skillId: 'skill-b', status: 'ready', skill: { id: 'skill-b' } })
  } finally {
    a.resolve()
    f.dispose()
  }
})

test('leaving Skills cancels loading while late Host data cannot publish', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh()
    f.inspectGates.set('skill-a', gate.promise)
    const pending = outcome(f.inspect('skill-a'))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await f.open('extensions')
    expect(await pending).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry().skillDetail).toMatchObject({ skillId: 'skill-a', status: 'error', error: 'CANCELLED' })
    gate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.entry().skillDetail).toMatchObject({ status: 'error', error: 'CANCELLED' })
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('wrong-target and duplicate file replies are rejected without publishing data', async () => {
  const wrong = fixture()
  try {
    await wrong.open()
    await wrong.refresh()
    wrong.inspectReplies.set('skill-a', { ...detail('skill-b') })
    expect(await outcome(wrong.inspect('skill-a'))).toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(wrong.entry().skillDetail).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT', skill: null })
  } finally {
    wrong.dispose()
  }
  const duplicate = fixture()
  try {
    await duplicate.open()
    await duplicate.refresh()
    duplicate.inspectReplies.set('skill-a', detail('skill-a', ['a.md', 'a.md']))
    expect(await outcome(duplicate.inspect('skill-a'))).toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(duplicate.entry().skillDetail).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT' })
  } finally {
    duplicate.dispose()
  }
})

test('missing inspect and missing file remain explicit retryable states', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    f.inspectReplies.set('skill-a', null)
    await f.inspect('skill-a')
    expect(f.entry().skillDetail).toMatchObject({ status: 'missing', skill: null, error: null })

    f.inspectReplies.set('skill-a', detail('skill-a', ['missing.md']))
    await f.inspect('skill-a')
    await f.runtime.view.commands.execute('extensionWorkspace.selectSkillView', {
      instanceId: 'settings',
      view: 'files',
    })
    f.fileReplies.set('skill-a:missing.md', null)
    await f.file('missing.md')
    expect(f.entry().skillDetail?.file).toEqual({ status: 'missing', file: null, error: null })
    f.fileReplies.set('skill-a:missing.md', file('skill-a', 'missing.md'))
    await f.file('missing.md')
    expect(f.entry().skillDetail?.file).toMatchObject({ status: 'ready', file: { text: '# missing.md' } })
  } finally {
    f.dispose()
  }
})

test('late file A cannot overwrite a newer file B selection', async () => {
  const f = fixture()
  const a = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh()
    f.inspectReplies.set('skill-a', detail('skill-a', ['a.md', 'b.md']))
    await f.inspect('skill-a')
    await f.runtime.view.commands.execute('extensionWorkspace.selectSkillView', {
      instanceId: 'settings',
      view: 'files',
    })
    f.fileGates.set('skill-a:a.md', a.promise)
    const old = outcome(f.file('a.md'))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await f.file('b.md')
    a.resolve()
    expect(await old).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry().skillDetail).toMatchObject({
      selectedPath: 'b.md',
      file: { status: 'ready', file: { path: 'b.md' } },
    })
  } finally {
    a.resolve()
    f.dispose()
  }
})

test('Back and dispose settle cancelled detail requests before an ignored late Host reply', async () => {
  const backFixture = fixture()
  const backGate = Promise.withResolvers<void>()
  try {
    await backFixture.open()
    await backFixture.refresh()
    backFixture.inspectGates.set('skill-a', backGate.promise)
    const pending = outcome(backFixture.inspect('skill-a'))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await backFixture.runtime.view.commands.execute('extensionWorkspace.backSkill', { instanceId: 'settings' })
    expect(await pending).toMatchObject({ code: 'CANCELLED' })
    expect(backFixture.entry().skillDetail).toBeNull()
    backGate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(backFixture.entry().skillDetail).toBeNull()
  } finally {
    backGate.resolve()
    backFixture.dispose()
  }

  const disposeFixture = fixture()
  const disposeGate = Promise.withResolvers<void>()
  try {
    await disposeFixture.open()
    await disposeFixture.refresh()
    disposeFixture.inspectGates.set('skill-a', disposeGate.promise)
    const pending = outcome(disposeFixture.inspect('skill-a'))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    disposeFixture.dispose()
    expect(await pending).toMatchObject({ code: 'RESULT_UNKNOWN' })
    disposeGate.resolve()
  } finally {
    disposeGate.resolve()
    disposeFixture.dispose()
  }
})

test('eight cancelled physical detail reads retain capacity until Host settlement', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh()
    f.inspectGates.set('skill-a', gate.promise)
    for (let index = 0; index < 8; index++) {
      const pending = outcome(f.inspect('skill-a'))
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      await f.runtime.view.commands.execute('extensionWorkspace.backSkill', { instanceId: 'settings' })
      expect(await pending).toMatchObject({ code: 'CANCELLED' })
      if (index < 7) {
        await f.open()
        await f.refresh()
      }
    }
    await f.open()
    await f.refresh()
    expect(await outcome(f.inspect('skill-a'))).toMatchObject({ code: 'BUSY' })
    expect(f.calls.filter((name) => name === 'skill.inspect')).toHaveLength(8)
    gate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  } finally {
    gate.resolve()
    f.dispose()
  }
})

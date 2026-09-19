import { expect, test } from 'bun:test'
import { z } from 'zod'
import { defineCommand, describeCommand, type CommandDescriptor, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime, type CommandCatalogPort } from '@hbar/app-runtime'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import type { Session, Workspace } from '@hbar/contracts/directory'

const workspace: Workspace = { id: 'workspace-1', name: 'Project', path: 'D:/project', createdAt: 1 }
const session: Session = {
  id: 'session-1',
  workspaceId: workspace.id,
  title: 'Session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}

const secretCommand = defineCommand(
  {
    id: 'sample.saveSecret',
    version: 1,
    owner: 'test',
    kind: 'command',
    execution: 'host',
    stateEffect: 'persistent',
    category: 'settings.providers',
    titleKey: 'commands.sample.saveSecret.title',
    descriptionKey: 'commands.sample.saveSecret.description',
    scope: 'global',
    surfaces: ['palette'],
  },
  z.strictObject({ secret: z.string().min(1).meta({ writeOnly: true }) }),
  z.strictObject({ saved: z.boolean() }),
)

function directory(): CommandExecutor {
  return {
    async execute(name, input) {
      if (name === 'workspace.get')
        return (input as { workspaceId: string }).workspaceId === workspace.id ? workspace : null
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      if (name === 'session.get') return (input as { sessionId: string }).sessionId === session.id ? session : null
      if (name === 'session.list') return { items: [session], nextCursor: null }
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }
}

test('command palette projects categorized host and client commands through command-owned state', async () => {
  const descriptors: CommandDescriptor[] = [
    describeCommand(budgetCommands['session.setBudget']),
    describeCommand(secretCommand),
  ]
  const executions: { id: string; input: Readonly<Record<string, unknown>>; idempotencyKey?: string }[] = []
  const catalog: CommandCatalogPort = {
    async list({ after }) {
      return after
        ? { revision: 7, items: [descriptors[1]!] }
        : { revision: 7, items: [descriptors[0]!], nextCursor: descriptors[0]!.metadata.id }
    },
    async execute(descriptor, input, options) {
      executions.push({
        id: descriptor.metadata.id,
        input,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      })
      return descriptor.metadata.id === 'sample.saveSecret'
        ? { saved: true }
        : { status: 'succeeded', budget: { limit: input.tokens } }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'palette-test',
    hostId: 'host-test',
    directory: directory(),
    commandCatalog: catalog,
    commandText: {
      resolve: (key) =>
        key === 'commands.session.setBudget.title'
          ? '设置预算'
          : key === 'commands.categories.model.budget'
            ? '模型与预算'
            : key,
    },
    surfaces: { canRender: () => true },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const refreshed = await runtime.view.commands.execute('commandPalette.refresh', {})
    expect(refreshed.status).toBe('ready')
    const initial = runtime.view.state.commandPalette.getSnapshot()
    expect(initial.revision).toBe(
      7 + Object.values(initial.items).filter((item) => item.descriptor.metadata.execution !== 'host').length,
    )
    expect(initial.categories.map((item) => item.id)).toContain('model.budget')
    expect(initial.visibleIds).toContain('app.openPanel')
    expect(initial.visibleIds).toContain('session.setBudget')
    expect(initial.visibleIds).not.toContain('commandPalette.setQuery')

    await runtime.view.commands.execute('commandPalette.setQuery', { query: '设置预算' })
    let state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.visibleIds).toEqual(['session.setBudget'])
    expect(state.selectedId).toBe('session.setBudget')
    expect(state.draft?.values).toMatchObject({ sessionId: session.id })
    expect(state.draft?.issues).toContainEqual({ field: 'tokens', code: 'required' })
    await runtime.view.commands.execute('commandPalette.setParameter', { field: 'tokens', value: '120000' })
    await runtime.view.commands.execute('commandPalette.execute', {})
    state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.execution).toMatchObject({ status: 'succeeded', commandId: 'session.setBudget' })
    expect(executions[0]).toMatchObject({
      id: 'session.setBudget',
      input: { sessionId: session.id, tokens: 120000 },
    })
    expect(executions[0]?.idempotencyKey).toBeString()

    await runtime.view.commands.execute('commandPalette.setQuery', { query: 'sample.saveSecret' })
    await runtime.view.commands.execute('commandPalette.setParameter', { field: 'secret', value: 'never-project-me' })
    state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.draft?.values).toEqual({})
    expect(state.draft?.sensitiveFields).toEqual(['secret'])
    expect(JSON.stringify(state)).not.toContain('never-project-me')
    const resetRevision = state.sensitiveResetRevision
    await runtime.view.commands.execute('commandPalette.execute', {})
    state = runtime.view.state.commandPalette.getSnapshot()
    expect(executions[1]).toMatchObject({ id: 'sample.saveSecret', input: { secret: 'never-project-me' } })
    expect(state.draft?.sensitiveFields).toEqual([])
    expect(state.sensitiveResetRevision).toBe(resetRevision + 1)
    expect(JSON.stringify(state)).not.toContain('never-project-me')

    await runtime.view.commands.execute('commandPalette.setQuery', { query: 'app.openPanel' })
    await runtime.view.commands.execute('commandPalette.setParameter', { field: 'panelId', value: 'status' })
    await runtime.view.commands.execute('commandPalette.execute', {})
    expect(runtime.view.state.surfaces.getSnapshot().focusedPanelId).not.toBeNull()
    expect(Object.values(runtime.view.state.surfaces.getSnapshot().panels)[0]?.panelId).toBe('status')
  } finally {
    runtime.dispose()
  }
})

test('palette keeps local commands usable when catalog discovery fails and marks superseded refreshes', async () => {
  const delayed = Promise.withResolvers<{ revision: number; items: CommandDescriptor[] }>()
  let calls = 0
  const runtime = createAppRuntime({
    instanceId: 'palette-race',
    hostId: 'host-test',
    directory: directory(),
    commandCatalog: {
      list: () =>
        ++calls === 1 ? delayed.promise : Promise.reject(Object.assign(new Error('offline'), { code: 'DISCONNECTED' })),
      execute: () => Promise.reject(new Error('unexpected')),
    },
  })
  try {
    const old = runtime.view.commands.execute('commandPalette.refresh', {})
    const latest = await runtime.view.commands.execute('commandPalette.refresh', {})
    expect(latest).toMatchObject({ status: 'error', error: 'DISCONNECTED' })
    expect(runtime.view.state.commandPalette.getSnapshot().visibleIds).toContain('app.openPanel')
    delayed.resolve({ revision: 1, items: [] })
    await expect(old).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(runtime.view.state.commandPalette.getSnapshot()).toMatchObject({ status: 'error', error: 'DISCONNECTED' })
  } finally {
    runtime.dispose()
  }
})

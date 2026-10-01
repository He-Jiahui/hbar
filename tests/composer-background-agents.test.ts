import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { composerBackgroundAgentsCommands, COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS } from '@hbar/app-runtime'
import { createComposerBackgroundAgents } from '../packages/app-runtime/src/composer-background-agents'
import { createState } from '../packages/app-runtime/src/state'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import type { Session, Workspace } from '@hbar/contracts/directory'
import type { DirectoryState, NavigationState } from '../packages/app-runtime/src/types'
import type { WorkspaceTabsState } from '../packages/app-runtime/src/workspace-tabs-runtime'

const workspace: Workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session: Session = {
  id: 'parent',
  workspaceId: workspace.id,
  title: 'Parent',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}
const sourceTabInstanceKey = '00000000-0000-4000-8000-000000000001'
const target = { sessionId: session.id, workspaceId: workspace.id, sourceTabInstanceKey }

function record(agentId: string, status: AgentRecord['status'] = 'running'): AgentRecord {
  return {
    agentId,
    parentSessionId: session.id,
    sessionId: `child-${agentId}`,
    runId: `run-${agentId}`,
    requestId: `request-${agentId}`,
    objective: `Inspect ${agentId}`,
    modelId: 'local-fixture',
    tokenBudget: null,
    status,
    error: null,
    patch: null,
    resultSummary: null,
    isolated: true,
    createdAt: 1,
    updatedAt: 1,
  }
}

function fixture(initial: readonly AgentRecord[]) {
  let records = [...initial]
  const calls: Array<{ readonly name: string; readonly input: unknown }> = []
  const commands: CommandExecutor = {
    async execute(name, input) {
      calls.push({ name, input })
      if (name === 'agent.list') {
        const value = input as { parentSessionId: string; limit: number; after?: string }
        const start = value.after ? records.findIndex((item) => item.agentId === value.after) + 1 : 0
        const items = records.slice(start, start + value.limit)
        const last = items.at(-1)
        return { items, nextCursor: start + items.length < records.length ? (last?.agentId ?? null) : null }
      }
      if (name === 'agent.result.get') {
        const value = input as { agentId: string }
        const item = records.find((candidate) => candidate.agentId === value.agentId)
        if (!item) throw new CommandError('NOT_FOUND', 'Agent not found')
        return item
      }
      if (name === 'agent.cancel') {
        const value = input as { agentId: string }
        const item = records.find((candidate) => candidate.agentId === value.agentId)
        if (!item) throw new CommandError('NOT_FOUND', 'Agent not found')
        records = records.map((candidate) =>
          candidate.agentId === item.agentId ? { ...candidate, status: 'cancelRequested' as const } : candidate,
        )
        return records.find((candidate) => candidate.agentId === item.agentId)!
      }
      throw new Error(`Unexpected command: ${name}`)
    },
  }
  return {
    commands,
    calls,
    set(next: readonly AgentRecord[]) {
      records = [...next]
    },
  }
}

function runtimeAgents(commands: CommandExecutor) {
  const local = new CommandRegistry({ execution: 'client' })
  const navigation = createState<NavigationState>(
    { workspaceId: workspace.id, sessionId: session.id, status: 'idle', error: null },
    () => undefined,
  )
  const tabs = createState<WorkspaceTabsState>(
    {
      items: [
        {
          kind: 'session',
          id: session.id,
          sessionId: session.id,
          workspaceId: workspace.id,
          instanceKey: sourceTabInstanceKey,
        },
      ],
      activeId: session.id,
      revision: 1,
      restoreStatus: 'ready',
      restoreError: null,
      persistError: null,
    },
    () => undefined,
  )
  const directory = createState<DirectoryState>(
    { workspaces: { [workspace.id]: workspace }, sessions: { [session.id]: session } },
    () => undefined,
  )
  const module = createComposerBackgroundAgents(
    local,
    { instanceId: 'test', hostId: 'host', directory: commands, agents: commands },
    {
      navigation: navigation.reader,
      tabs: tabs.reader,
      directory: directory.reader,
      onSubscriberError: () => undefined,
      isDisposed: () => false,
    },
  )
  const client = createCommandClient(composerBackgroundAgentsCommands, local)
  return { client, module, navigation, tabs, directory }
}

test('refreshes the bounded 100+28 direct-agent pages and cancels only captured children', async () => {
  const records = Array.from({ length: COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS }, (_, index) => record(`agent-${index}`))
  const host = fixture(records)
  const runtime = runtimeAgents(host.commands)
  try {
    const entry = await runtime.client.execute('composerBackgroundAgents.refresh', target)
    expect(entry.items).toHaveLength(COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS)
    expect(
      host.calls.filter((call) => call.name === 'agent.list').map((call) => (call.input as { limit: number }).limit),
    ).toEqual([100, 28])
    const action = await runtime.client.execute('composerBackgroundAgents.cancel', target)
    expect(action.status).toBe('requested')
    expect(action.targets).toHaveLength(COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS)
    expect(host.calls.filter((call) => call.name === 'agent.cancel')).toHaveLength(COMPOSER_BACKGROUND_AGENTS_MAX_ITEMS)
  } finally {
    runtime.module.dispose()
  }
})

test('requested targets settle from a strict refresh, then a new Stop captures only the new child', async () => {
  const first = record('first')
  const host = fixture([first])
  const runtime = runtimeAgents(host.commands)
  try {
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    const requested = await runtime.client.execute('composerBackgroundAgents.cancel', target)
    expect(requested.status).toBe('requested')
    host.set([{ ...first, status: 'cancelled' }])
    const settled = await runtime.client.execute('composerBackgroundAgents.refresh', target)
    expect(settled.action.status).toBe('settled')
    const next = record('next')
    host.set([{ ...first, status: 'cancelled' }, next])
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    const nextAction = await runtime.client.execute('composerBackgroundAgents.cancel', target)
    expect(nextAction.targets.map((item) => item.agentId)).toEqual(['next'])
  } finally {
    runtime.module.dispose()
  }
})

test('unknown cancellation cannot be retried as a new target and reconcile does not resend cancel', async () => {
  const first = record('unknown')
  const host = fixture([first])
  const original = host.commands.execute
  host.commands.execute = async (name, input, options) => {
    if (name === 'agent.cancel') throw new CommandError('TIMEOUT', 'cancel result unknown')
    return original(name, input, options)
  }
  const runtime = runtimeAgents(host.commands)
  try {
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    await expect(runtime.client.execute('composerBackgroundAgents.cancel', target)).resolves.toMatchObject({
      status: 'unknown',
    })
    await expect(runtime.client.execute('composerBackgroundAgents.cancel', target)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    const before = host.calls.filter((call) => call.name === 'agent.cancel').length
    const action = await runtime.client.execute('composerBackgroundAgents.reconcile', {
      ...target,
      actionId: runtime.module.reader.getSnapshot().entries[session.id]!.action.id!,
    })
    expect(action.status).toBe('failed')
    expect(host.calls.filter((call) => call.name === 'agent.cancel')).toHaveLength(before)
  } finally {
    runtime.module.dispose()
  }
})

test('dispose aborts an adapter that ignores AbortSignal and does not publish late state', async () => {
  let resolveList: ((value: unknown) => void) | undefined
  const ignored: CommandExecutor = {
    execute(name) {
      if (name === 'agent.list') return new Promise((resolve) => (resolveList = resolve))
      return Promise.resolve(record('late'))
    },
  }
  const runtime = runtimeAgents(ignored)
  const pending = runtime.client.execute('composerBackgroundAgents.refresh', target)
  runtime.module.dispose()
  resolveList?.({ items: [record('late')], nextCursor: null })
  await expect(pending).rejects.toMatchObject({ code: 'DISPOSED' })
  expect(runtime.module.reader.getSnapshot().entries.parent?.items).toEqual([])
})

test('rejects foreign, duplicate, and over-capacity direct-agent pages before cancellation', async () => {
  const host = fixture([record('a'), record('b')])
  const original = host.commands.execute
  host.commands.execute = async (name, input, options) => {
    if (name === 'agent.list') {
      const value = input as { limit: number }
      if (value.limit === 100) {
        const tooMany = Array.from({ length: 129 }, (_, index) => record(`over-${index}`))
        return { items: tooMany.slice(0, 100), nextCursor: 'over-99' }
      }
      return {
        items: Array.from({ length: 28 }, (_, index) => record(`over-${index + 100}`)),
        nextCursor: 'over-127',
      }
    }
    return original(name, input, options)
  }
  const runtime = runtimeAgents(host.commands)
  try {
    await expect(runtime.client.execute('composerBackgroundAgents.refresh', target)).rejects.toMatchObject({
      code: 'AGENT_LIMIT_EXCEEDED',
    })
  } finally {
    runtime.module.dispose()
  }

  const foreign = fixture([{ ...record('foreign'), parentSessionId: 'other-parent' }])
  const foreignRuntime = runtimeAgents(foreign.commands)
  try {
    await expect(foreignRuntime.client.execute('composerBackgroundAgents.refresh', target)).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    })
  } finally {
    foreignRuntime.module.dispose()
  }

  const duplicate = fixture([record('duplicate'), record('duplicate')])
  const duplicateRuntime = runtimeAgents(duplicate.commands)
  try {
    await expect(duplicateRuntime.client.execute('composerBackgroundAgents.refresh', target)).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    })
  } finally {
    duplicateRuntime.module.dispose()
  }
})

test('failed retry uses its immutable failed target and never cancels a newly refreshed child', async () => {
  const first = record('first')
  const host = fixture([first])
  const original = host.commands.execute
  let firstAttempt = true
  host.commands.execute = async (name, input, options) => {
    if (name === 'agent.cancel' && firstAttempt) {
      firstAttempt = false
      throw new CommandError('DENIED', 'fixture rejection')
    }
    return original(name, input, options)
  }
  const runtime = runtimeAgents(host.commands)
  try {
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    const failed = await runtime.client.execute('composerBackgroundAgents.cancel', target)
    expect(failed.status).toBe('failed')
    const next = record('next')
    host.set([first, next])
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    await runtime.client.execute('composerBackgroundAgents.cancel', { ...target, actionId: failed.id! })
    expect(
      host.calls
        .filter((call) => call.name === 'agent.cancel')
        .map((call) => (call.input as { agentId: string }).agentId),
    ).toEqual(['first'])
  } finally {
    runtime.module.dispose()
  }
})

test('created Agents without a persisted Run are visible but never included in Stop', async () => {
  const created = { ...record('created', 'created'), runId: null }
  const active = record('active')
  const host = fixture([created, active])
  const runtime = runtimeAgents(host.commands)
  try {
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    const action = await runtime.client.execute('composerBackgroundAgents.cancel', target)
    expect(action.targets.map((item) => item.agentId)).toEqual(['active'])
    expect(
      host.calls
        .filter((call) => call.name === 'agent.cancel')
        .map((call) => (call.input as { agentId: string }).agentId),
    ).toEqual(['active'])
  } finally {
    runtime.module.dispose()
  }
})

test('a superseded refresh cannot overwrite the newer ready snapshot', async () => {
  const host = fixture([record('newer')])
  const original = host.commands.execute
  let resolveOld: ((value: unknown) => void) | undefined
  let first = true
  host.commands.execute = (name, input, options) => {
    if (name === 'agent.list' && first) {
      first = false
      return new Promise((resolve) => (resolveOld = resolve))
    }
    return original(name, input, options)
  }
  const runtime = runtimeAgents(host.commands)
  try {
    const old = runtime.client.execute('composerBackgroundAgents.refresh', target).catch((reason: unknown) => reason)
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    expect(await old).toMatchObject({ code: 'QUERY_SUPERSEDED' })
    resolveOld?.({ items: [record('older')], nextCursor: null })
    await Promise.resolve()
    const latest = runtime.module.reader.getSnapshot().entries.parent!
    expect(latest.readStatus).toBe('ready')
    expect(latest.items.map((item) => item.agentId)).toEqual(['newer'])
  } finally {
    runtime.module.dispose()
  }
})

test('a refresh during Stop preserves busy ownership and excludes newly arriving children', async () => {
  const first = record('first')
  const host = fixture([first])
  const original = host.commands.execute
  let release: ((value: unknown) => void) | undefined
  host.commands.execute = (name, input, options) => {
    if (name === 'agent.cancel') return new Promise((resolve) => (release = resolve))
    return original(name, input, options)
  }
  const runtime = runtimeAgents(host.commands)
  try {
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    const pending = runtime.client.execute('composerBackgroundAgents.cancel', target)
    // The result read is asynchronous, so allow its cancellation to start.
    for (let index = 0; index < 10 && !release; index++) await Promise.resolve()
    expect(release).toBeDefined()
    host.set([first, record('newcomer')])
    const refreshed = await runtime.client.execute('composerBackgroundAgents.refresh', target)
    expect(refreshed.action).toMatchObject({ status: 'busy', phase: 'cancel' })
    expect(refreshed.items.map((item) => item.agentId)).toEqual(['first', 'newcomer'])
    release!({ ...first, status: 'cancelRequested' })
    const result = await pending
    expect(result.targets.map((item) => item.agentId)).toEqual(['first'])
  } finally {
    runtime.module.dispose()
  }
})

test('reconcile is single-flight and dispose aborts a result adapter that ignores AbortSignal', async () => {
  const host = fixture([record('unknown')])
  const original = host.commands.execute
  let checking = false
  let release: ((value: unknown) => void) | undefined
  host.commands.execute = (name, input, options) => {
    if (name === 'agent.cancel') return Promise.reject(new CommandError('TIMEOUT', 'lost cancellation result'))
    if (name === 'agent.result.get' && checking) return new Promise((resolve) => (release = resolve))
    return original(name, input, options)
  }
  const runtime = runtimeAgents(host.commands)
  try {
    await runtime.client.execute('composerBackgroundAgents.refresh', target)
    const unknown = await runtime.client.execute('composerBackgroundAgents.cancel', target)
    checking = true
    const input = { ...target, actionId: unknown.id! }
    const pending = runtime.client.execute('composerBackgroundAgents.reconcile', input)
    await expect(runtime.client.execute('composerBackgroundAgents.reconcile', input)).rejects.toMatchObject({
      code: 'BUSY',
    })
    const beforeDispose = runtime.module.reader.getSnapshot()
    expect(beforeDispose.entries.parent?.action).toMatchObject({ status: 'busy', phase: 'reconcile' })
    runtime.module.dispose()
    expect(await pending).toMatchObject({ status: 'failed' })
    release?.(record('unknown', 'cancelled'))
    await Promise.resolve()
    expect(runtime.module.reader.getSnapshot()).toBe(beforeDispose)
  } finally {
    runtime.module.dispose()
  }
})

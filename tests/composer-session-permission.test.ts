import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { composerPermissionCommands, createComposerPermission } from '../packages/app-runtime/src/composer-permission'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState } from '../packages/app-runtime/src/types'

test('session approval choice is Host-confirmed, persists across sends, isolates sessions, and reconciles a lost write reply', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-composer-session-approval-'))
  const home = join(root, 'data')
  await mkdir(join(root, 'workspace'))
  const kernel = await Kernel.create({
    home,
    demo: true,
    workspace: join(root, 'workspace'),
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const first = await kernel.createSession(workspace.id, 'first')
  const second = await kernel.createSession(workspace.id, 'second')
  const service = new SettingsService(kernel.storage)
  const navigation = createState<NavigationState>(
    { workspaceId: workspace.id, sessionId: first.id, status: 'idle', error: null },
    () => {},
  )
  let loseNextReply = false
  let hideReceipt = false
  let runActive = false
  const settings: CommandExecutor = {
    async execute(id, raw, options) {
      if (id === 'settings.get') return service.get((raw as { scope: { kind: 'session'; targetId: string } }).scope)
      if (id === 'settings.receipt') {
        if (hideReceipt) return null
        const input = raw as {
          idempotencyKey: string
          commandId: 'settings.set' | 'settings.unset'
          input: {
            scope: { kind: 'session'; targetId: string }
            schemaVersion: number
            baselineRevisions: Record<string, number>
            path: [{ kind: 'field'; name: string }]
            value?: string
          }
        }
        const original = input.input
        return service.getReceipt(original.scope, 'device-a', input.idempotencyKey, {
          schemaVersion: original.schemaVersion,
          scope: original.scope,
          baselineRevisions: original.baselineRevisions,
          changes:
            input.commandId === 'settings.set'
              ? [{ op: 'set', path: original.path, value: original.value }]
              : [{ op: 'unset', path: original.path }],
        })
      }
      if (id === 'settings.set' || id === 'settings.unset') {
        const input = raw as {
          scope: { kind: 'session'; targetId: string }
          schemaVersion: number
          baselineRevisions: Record<string, number>
          path: [{ kind: 'field'; name: string }]
          value?: string
        }
        const receipt = await service.apply({
          schemaVersion: input.schemaVersion,
          scope: input.scope,
          baselineRevisions: input.baselineRevisions,
          changes:
            id === 'settings.set'
              ? [{ op: 'set', path: input.path, value: input.value }]
              : [{ op: 'unset', path: input.path }],
          actorId: 'device-a',
          idempotencyKey: options?.idempotencyKey ?? '',
        })
        if (loseNextReply) {
          loseNextReply = false
          throw new CommandError('RESULT_UNKNOWN', 'The Host committed before the reply was lost')
        }
        return receipt
      }
      throw new Error(`Unexpected settings command: ${id}`)
    },
  }
  const configuration: CommandExecutor = {
    async execute(id) {
      if (id !== 'permission.get') throw new Error(`Unexpected configuration command: ${id}`)
      return { mode: 'ask' }
    },
  }
  const registry = new CommandRegistry()
  const permission = createComposerPermission(registry, {
    settings,
    configuration,
    navigation: navigation.reader,
    isSubmissionLocked: () => false,
    isRunActive: () => runActive,
    onSubscriberError: () => {},
  })
  const commands = createCommandClient(composerPermissionCommands, registry)
  const ready = async (sessionId: string) => {
    for (let count = 0; count < 100; count++) {
      const entry = permission.reader.getSnapshot().entries[sessionId]
      if (entry?.status === 'idle') return entry
      await Bun.sleep(5)
    }
    throw new Error(`Session approval never became ready: ${sessionId}`)
  }
  try {
    let entry = await ready(first.id)
    expect(entry.choice).toBe('inherit')
    runActive = true
    await expect(
      commands.execute('composerPermission.setChoice', {
        sessionId: first.id,
        choice: 'allow',
        expectedRevision: entry.revision,
        confirmAllow: true,
      }),
    ).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
    expect(permission.reader.getSnapshot().entries[first.id]).toEqual(entry)
    expect(await kernel.sessionPermissionMode(first.id)).toBe('ask')
    runActive = false
    const stopRace = permission.reader.subscribe(() => {
      if (permission.reader.getSnapshot().entries[first.id]?.status === 'preparing') runActive = true
    })
    try {
      await expect(
        commands.execute('composerPermission.setChoice', {
          sessionId: first.id,
          choice: 'allow',
          expectedRevision: entry.revision,
          confirmAllow: true,
        }),
      ).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
    } finally {
      stopRace()
    }
    expect(permission.reader.getSnapshot().entries[first.id]).toEqual(entry)
    expect(await kernel.sessionPermissionMode(first.id)).toBe('ask')
    runActive = false
    await commands.execute('composerPermission.setChoice', {
      sessionId: first.id,
      choice: 'allow',
      expectedRevision: entry.revision,
      confirmAllow: true,
    })
    entry = await ready(first.id)
    expect(entry.choice).toBe('allow')
    const firstRun = await permission.prepareSubmission(first.id, entry.revision)
    expect(firstRun.approval).toBe('allow')
    expect(permission.settleSubmission(firstRun, 'accepted')).toBe(true)
    expect(permission.reader.getSnapshot().entries[first.id]?.choice).toBe('allow')
    const secondRun = await permission.prepareSubmission(first.id, entry.revision)
    expect(secondRun.approval).toBe('allow')
    permission.settleSubmission(secondRun, 'accepted')
    navigation.replace({ ...navigation.reader.getSnapshot(), sessionId: second.id })
    expect((await ready(second.id)).choice).toBe('inherit')
    navigation.replace({ ...navigation.reader.getSnapshot(), sessionId: first.id })
    entry = await ready(first.id)
    expect(entry.choice).toBe('allow')
    loseNextReply = true
    try {
      await commands.execute('composerPermission.setChoice', {
        sessionId: first.id,
        choice: 'deny',
        expectedRevision: entry.revision,
      })
      throw new Error('Expected the original write reply to be lost')
    } catch (error) {
      expect(error).toMatchObject({ code: 'RESULT_UNKNOWN' })
    }
    expect(permission.reader.getSnapshot().entries[first.id]).toMatchObject({
      choice: 'allow',
      status: 'unknown',
      locked: true,
      writeUnknown: true,
    })
    expect(await kernel.sessionPermissionMode(first.id)).toBe('deny')
    hideReceipt = true
    try {
      await commands.execute('composerPermission.reconcile', { sessionId: first.id })
      throw new Error('Expected the original receipt to be unavailable')
    } catch (error) {
      expect(error).toMatchObject({ code: 'RESULT_UNKNOWN' })
    }
    expect(permission.reader.getSnapshot().entries[first.id]).toMatchObject({ status: 'unknown', locked: true })
    hideReceipt = false
    await commands.execute('composerPermission.reconcile', { sessionId: first.id })
    entry = await ready(first.id)
    expect(entry).toMatchObject({ choice: 'deny', locked: false, writeUnknown: false })
    expect((await service.get({ kind: 'session', targetId: second.id })).resolution.reports).toBeDefined()
  } finally {
    permission.dispose()
    navigation.dispose()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('stored sandbox session approval can be loaded and then changed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-composer-session-sandbox-'))
  const home = join(root, 'data')
  await mkdir(join(root, 'workspace'))
  const kernel = await Kernel.create({
    home,
    demo: true,
    workspace: join(root, 'workspace'),
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'sandbox-session')
  const service = new SettingsService(kernel.storage)
  const scope = { kind: 'session' as const, targetId: session.id }
  const path = [{ kind: 'field' as const, name: 'session.approval' }]
  const before = await service.get(scope)
  await service.apply({
    schemaVersion: before.schemaVersion,
    scope,
    changes: [{ op: 'set', path, value: 'sandbox' }],
    baselineRevisions: before.revisions,
    actorId: 'device-a',
    idempotencyKey: 'seed-sandbox',
  })
  const navigation = createState<NavigationState>(
    { workspaceId: workspace.id, sessionId: session.id, status: 'idle', error: null },
    () => {},
  )
  const settings: CommandExecutor = {
    async execute(id, raw, options) {
      if (id === 'settings.get') return service.get((raw as { scope: { kind: 'session'; targetId: string } }).scope)
      if (id === 'settings.set' || id === 'settings.unset') {
        const input = raw as {
          scope: { kind: 'session'; targetId: string }
          schemaVersion: number
          baselineRevisions: Record<string, number>
          path: [{ kind: 'field'; name: string }]
          value?: string
        }
        return service.apply({
          schemaVersion: input.schemaVersion,
          scope: input.scope,
          baselineRevisions: input.baselineRevisions,
          changes:
            id === 'settings.set'
              ? [{ op: 'set', path: input.path, value: input.value }]
              : [{ op: 'unset', path: input.path }],
          actorId: 'device-a',
          idempotencyKey: options?.idempotencyKey ?? '',
        })
      }
      throw new Error(`Unexpected settings command: ${id}`)
    },
  }
  const configuration: CommandExecutor = {
    async execute(id) {
      if (id !== 'permission.get') throw new Error(`Unexpected configuration command: ${id}`)
      return { mode: 'ask' }
    },
  }
  const registry = new CommandRegistry()
  const permission = createComposerPermission(registry, {
    settings,
    configuration,
    navigation: navigation.reader,
    isSubmissionLocked: () => false,
    onSubscriberError: () => {},
  })
  const commands = createCommandClient(composerPermissionCommands, registry)
  const ready = async () => {
    for (let count = 0; count < 100; count++) {
      const entry = permission.reader.getSnapshot().entries[session.id]
      if (entry?.status === 'idle') return entry
      if (entry?.status === 'failed') throw new Error(`Session approval load failed: ${entry.error}`)
      await Bun.sleep(5)
    }
    throw new Error('Session approval never became ready')
  }
  try {
    const loaded = await ready()
    expect(loaded.choice).toBe('sandbox')
    await commands.execute('composerPermission.setChoice', {
      sessionId: session.id,
      choice: 'ask',
      expectedRevision: loaded.revision,
    })
    const changed = await ready()
    expect(changed).toMatchObject({ choice: 'ask', status: 'idle', locked: false })
    expect(await kernel.sessionPermissionMode(session.id)).toBe('ask')
    await permission.refreshSession(session.id)
    expect((await ready()).choice).toBe('ask')
  } finally {
    permission.dispose()
    navigation.dispose()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

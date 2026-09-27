import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import { createState } from '../packages/app-runtime/src/state'
import { composerPlanModeCommands, type ComposerPlanModeState } from '../packages/app-runtime/src/composer-plan-mode'
import {
  composerPermissionCommands,
  type ComposerPermissionState,
} from '../packages/app-runtime/src/composer-permission'
import { registerComposerPlanChoice } from '../packages/app-runtime/src/composer-plan-choice'
import type { NavigationState } from '@hbar/app-runtime'

function fixture(modeWrite?: () => Promise<'default' | 'plan'>) {
  const local = new CommandRegistry({ execution: 'client' })
  const nav = createState<NavigationState>(
    { workspaceId: 'workspace', sessionId: 'session', status: 'idle', error: null },
    () => {},
  )
  const plan = createState<ComposerPlanModeState>(
    {
      available: true,
      entries: { session: { sessionId: 'session', mode: 'plan', status: 'ready', revision: 3, error: null } },
    },
    () => {},
  )
  const permission = createState<ComposerPermissionState>(
    {
      available: true,
      hostDefault: { status: 'ready', mode: 'ask', error: null },
      entries: {
        session: { sessionId: 'session', choice: 'inherit', revision: 5, status: 'idle', locked: false, error: null },
      },
    },
    () => {},
  )
  const calls: string[] = []
  local.register(
    composerPlanModeCommands['composerPlanMode.setMode'],
    async ({ sessionId, mode, expectedRevision }) => {
      calls.push(`mode:${mode}:${expectedRevision}`)
      const confirmed = modeWrite ? await modeWrite() : mode
      plan.replace({
        available: true,
        entries: { session: { sessionId, mode: confirmed, status: 'ready', revision: 4, error: null } },
      })
      return { sessionId, mode: confirmed }
    },
  )
  local.register(
    composerPermissionCommands['composerPermission.setChoice'],
    ({ sessionId, choice, expectedRevision, confirmAllow }) => {
      calls.push(`choice:${choice}:${expectedRevision}:${Boolean(confirmAllow)}`)
      if (permission.reader.getSnapshot().entries.session?.revision !== expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'Permission draft changed')
      permission.replace({
        ...permission.reader.getSnapshot(),
        entries: {
          session: { sessionId, choice, revision: expectedRevision + 1, status: 'idle', locked: false, error: null },
        },
      })
      return { sessionId, revision: expectedRevision + 1 }
    },
  )
  registerComposerPlanChoice(local, nav.reader, plan.reader, permission.reader)
  return {
    local,
    nav,
    plan,
    permission,
    calls,
    input: { sessionId: 'session', choice: 'deny' as const, expectedPermissionRevision: 5, expectedModeRevision: 3 },
    dispose() {
      local.dispose()
      nav.dispose()
      plan.dispose()
      permission.dispose()
    },
  }
}

test('one selection leaves durable Plan before applying next-send approval', async () => {
  const f = fixture()
  try {
    expect(await f.local.execute('composerPlanChoice.selectOrdinary', f.input)).toEqual({
      sessionId: 'session',
      revision: 6,
    })
    expect(f.calls).toEqual(['mode:default:3', 'choice:deny:5:false'])
    expect(f.plan.reader.getSnapshot().entries.session?.mode).toBe('default')
    expect(f.permission.reader.getSnapshot().entries.session?.choice).toBe('deny')
  } finally {
    f.dispose()
  }
})

test('confirmed auto-approval still exits Plan before changing the one-send choice', async () => {
  const f = fixture()
  try {
    await f.local.execute('composerPlanChoice.selectOrdinary', { ...f.input, choice: 'allow', confirmAllow: true })
    expect(f.calls).toEqual(['mode:default:3', 'choice:allow:5:true'])
    expect(f.permission.reader.getSnapshot().entries.session?.choice).toBe('allow')
  } finally {
    f.dispose()
  }
})

test('unconfirmed Plan exit never changes the approval draft', async () => {
  const f = fixture(async () => 'plan')
  try {
    await expect(f.local.execute('composerPlanChoice.selectOrdinary', f.input)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.calls).toEqual(['mode:default:3'])
    expect(f.permission.reader.getSnapshot().entries.session?.choice).toBe('inherit')
  } finally {
    f.dispose()
  }
})

test('stale session, versions and auto-approval confirmation fail before Plan write', async () => {
  const f = fixture()
  try {
    await expect(
      f.local.execute('composerPlanChoice.selectOrdinary', { ...f.input, expectedModeRevision: 2 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(
      f.local.execute('composerPlanChoice.selectOrdinary', { ...f.input, choice: 'allow' }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' })
    f.nav.replace({ workspaceId: 'workspace', sessionId: 'other', status: 'idle', error: null })
    await expect(f.local.execute('composerPlanChoice.selectOrdinary', f.input)).rejects.toMatchObject({
      code: 'STALE_TARGET',
    })
    expect(f.calls).toEqual([])
  } finally {
    f.dispose()
  }
})

test('switching sessions during Host confirmation does not apply approval to the old target', async () => {
  let resolve!: (mode: 'default') => void
  const pending = new Promise<'default'>((done) => {
    resolve = done
  })
  const f = fixture(() => pending)
  try {
    const action = f.local.execute('composerPlanChoice.selectOrdinary', f.input)
    await Promise.resolve()
    f.nav.replace({ workspaceId: 'workspace', sessionId: 'other', status: 'idle', error: null })
    resolve('default')
    await expect(action).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.calls).toEqual(['mode:default:3'])
    expect(f.permission.reader.getSnapshot().entries.session?.choice).toBe('inherit')
  } finally {
    f.dispose()
  }
})

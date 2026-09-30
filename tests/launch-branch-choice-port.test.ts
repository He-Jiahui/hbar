import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { Session, SessionSnapshot } from '@hbar/contracts'
import type { SessionLaunchTargetPreparationManager } from '@hbar/contracts/commands/session-launch-target'
import type {
  SessionLaunchBranchesManager,
  SessionLaunchBranchesPage,
} from '@hbar/contracts/commands/session-launch-branches'
import {
  createPreSessionLaunchBranchCreation,
  sessionLaunchBranchCreationCommands,
  type LaunchBranchChoice,
  type LaunchBranchChoicePort,
} from '../packages/app-runtime/src/pre-session-launch-branch-creation'

const oid = 'a'.repeat(40)
const sessionId = 'existing-session'
const workspaceId = 'workspace-a'

function page(name: string): SessionLaunchBranchesPage {
  return {
    workspaceId,
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'branch', name: 'main', ref: 'refs/heads/main', oid },
    },
    branches: [
      {
        name,
        ref: `refs/heads/${name}`,
        tipOid: oid,
        current: name === 'main',
        availability: { sharedCurrent: { state: 'available' }, isolatedBase: { state: 'available' } },
      },
    ],
    nextCursor: null,
    incomplete: false,
  }
}

function fixture(unknown: boolean) {
  let current: LaunchBranchChoice = {
    workspaceId,
    revision: 0,
    launchSelection: { mode: 'shared-current' },
    editError: null,
  }
  let writes = 0
  let reads = 0
  let created = false
  const choice: LaunchBranchChoicePort = {
    read: (id) => (id === sessionId ? current : undefined),
    async setSelection(id, selection, expectedRevision) {
      if (id !== sessionId || current.revision !== expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'Wrong launch-choice owner')
      if (current.editError) throw new CommandError(current.editError, 'Locked choice')
      if (JSON.stringify(selection) === JSON.stringify(current.launchSelection)) return
      current = { ...current, launchSelection: selection, revision: current.revision + 1 }
    },
  }
  const manager: SessionLaunchBranchesManager = {
    async list(input) {
      reads += 1
      if (input.workspaceId !== workspaceId) throw new Error('Wrong workspace')
      return page(created && input.search === 'feature/created' ? 'feature/created' : 'main')
    },
    async create(input) {
      writes += 1
      created = true
      if (unknown) throw new CommandError('RESULT_UNKNOWN', 'Response lost')
      return {
        workspaceId,
        name: input.name,
        createdRef: `refs/heads/${input.name}`,
        createdOid: oid,
        baseRef: input.baseRef,
        baseOid: input.expectedBaseOid,
      }
    },
  }
  const local = new CommandRegistry({ execution: 'client' })
  const feature = createPreSessionLaunchBranchCreation(local, {
    commandFamily: 'session',
    choice,
    reader: manager,
    manager,
    onSubscriberError: (error) => {
      throw error
    },
    isDisposed: () => false,
  })
  return {
    commands: createCommandClient(sessionLaunchBranchCreationCommands, local),
    feature,
    current: () => current,
    writes: () => writes,
    reads: () => reads,
  }
}

test('existing Session branch creation updates its typed launch choice without a composer draft', async () => {
  const fixtureOwner = fixture(false)
  try {
    await fixtureOwner.commands.execute('sessionLaunchBranchCreation.capture', {
      draftId: sessionId,
      expectedRevision: 0,
    })
    const created = await fixtureOwner.commands.execute('sessionLaunchBranchCreation.create', {
      draftId: sessionId,
      expectedRevision: 0,
      name: 'feature/created',
    })
    expect(created.phase).toBe('selected')
    expect(created.draftId).toBe(sessionId)
    expect(fixtureOwner.current()).toEqual({
      workspaceId,
      revision: 1,
      editError: null,
      launchSelection: { mode: 'shared-branch', branch: { ref: 'refs/heads/feature/created', tipOid: oid } },
    })
    expect(fixtureOwner.writes()).toBe(1)
  } finally {
    fixtureOwner.feature.dispose()
  }
})

test('the Session choice port shares one-write unknown verification and explicit adoption', async () => {
  const fixtureOwner = fixture(true)
  try {
    await fixtureOwner.commands.execute('sessionLaunchBranchCreation.capture', {
      draftId: sessionId,
      expectedRevision: 0,
    })
    const created = await fixtureOwner.commands.execute('sessionLaunchBranchCreation.create', {
      draftId: sessionId,
      expectedRevision: 0,
      name: 'feature/created',
    })
    expect(created.phase).toBe('unknown')
    expect(fixtureOwner.current().revision).toBe(0)
    const readsBefore = fixtureOwner.reads()
    const verified = await fixtureOwner.commands.execute('sessionLaunchBranchCreation.reconcile', {
      draftId: sessionId,
      expectedRevision: 0,
    })
    expect(verified.phase).toBe('verified')
    expect(fixtureOwner.reads()).toBeGreaterThan(readsBefore)
    expect(fixtureOwner.writes()).toBe(1)
    expect(fixtureOwner.current().revision).toBe(0)
    await fixtureOwner.commands.execute('sessionLaunchBranchCreation.adopt', {
      draftId: sessionId,
      expectedRevision: 0,
    })
    expect(fixtureOwner.current().revision).toBe(1)
    expect(fixtureOwner.writes()).toBe(1)
  } finally {
    fixtureOwner.feature.dispose()
  }
})

test('Runtime routes existing Session branch creation to its launch owner and preserves composer content', async () => {
  const session: Session = {
    id: sessionId,
    workspaceId,
    title: 'Empty session',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
  const workspace = { id: workspaceId, path: 'D:/fixture', name: 'Fixture', createdAt: 1 }
  const snapshot: SessionSnapshot = {
    session,
    messages: [],
    runs: [],
    approvals: [],
    userInputs: [],
    streams: [],
    hasOlder: false,
    cursor: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  }
  let launchWrites = 0
  const unexpectedLaunchWrite = () => {
    launchWrites += 1
    return Promise.reject(new Error('Branch creation must not prepare a checkout'))
  }
  const preparation: SessionLaunchTargetPreparationManager = {
    async readTarget() {
      return {
        sessionId,
        workspaceId,
        revision: 0,
        selection: { mode: 'shared-current' },
        locked: false,
        resolution: { status: 'idle' },
        updatedAt: 1,
      }
    },
    setSelection: unexpectedLaunchWrite,
    startPreparation: unexpectedLaunchWrite,
    readPreparation: unexpectedLaunchWrite,
    cancelPreparation: unexpectedLaunchWrite,
    reconcilePreparation: unexpectedLaunchWrite,
    readSelectionReceipt: unexpectedLaunchWrite,
  }
  let branchWrites = 0
  const branches: SessionLaunchBranchesManager = {
    async list() {
      return page('main')
    },
    async create(input) {
      branchWrites += 1
      return {
        workspaceId,
        name: input.name,
        createdRef: `refs/heads/${input.name}`,
        createdOid: oid,
        baseRef: input.baseRef,
        baseOid: input.expectedBaseOid,
      }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'launch-owner-integration',
    hostId: 'fixture-host',
    directory: {
      async execute(name): Promise<unknown> {
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.get') return workspace
        if (name === 'session.get') return session
        throw new Error(`Unexpected directory command: ${name}`)
      },
    },
    timeline: {
      async snapshot() {
        return snapshot
      },
      async watch() {
        return () => undefined
      },
    },
    sessionLaunchTargetPreparation: preparation,
    sessionLaunchBranches: branches,
    sessionLaunchBranchCreation: branches,
  })
  try {
    await runtime.ready
    await runtime.view.commands.execute('app.setSession', { sessionId, workspaceId })
    await runtime.view.commands.execute('draft.setText', { sessionId, text: 'Keep the existing Session composer' })
    const before = runtime.view.state.drafts.getSnapshot()[sessionId]
    await runtime.view.commands.execute('sessionLaunchDraft.open', { sessionId, workspaceId })
    await runtime.view.commands.execute('sessionLaunchBranchCreation.capture', {
      draftId: sessionId,
      expectedRevision: 0,
    })
    const created = await runtime.view.commands.execute('sessionLaunchBranchCreation.create', {
      draftId: sessionId,
      expectedRevision: 0,
      name: 'feature/created',
    })
    expect(created.phase).toBe('selected')
    expect(runtime.view.state.sessionLaunchDrafts.getSnapshot().entries[sessionId]?.selection).toEqual({
      mode: 'shared-branch',
      branch: { ref: 'refs/heads/feature/created', tipOid: oid },
    })
    expect(runtime.view.state.drafts.getSnapshot()[sessionId]).toBe(before)
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(sessionId)
    expect(branchWrites).toBe(1)
    expect(launchWrites).toBe(0)
  } finally {
    runtime.dispose()
  }
})

import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type {
  SessionLaunchBranchesManager,
  SessionLaunchBranchesPage,
  SessionLaunchBranchesRequest,
} from '@hbar/contracts/commands/session-launch-branches'

const baseOid = 'a'.repeat(40)

function emptyDirectory(): CommandExecutor {
  return {
    execute(name) {
      if (name === 'workspace.list') return Promise.resolve({ items: [], nextCursor: null })
      if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
      return Promise.reject(new Error(`Unexpected directory command: ${name}`))
    },
  }
}

function branchPage(workspaceId: string, name: string | null): SessionLaunchBranchesPage {
  return {
    workspaceId,
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'branch', ref: 'refs/heads/main', name: 'main', oid: baseOid },
    },
    branches: name
      ? [
          {
            name,
            ref: `refs/heads/${name}`,
            tipOid: baseOid,
            current: name === 'main',
            availability: {
              sharedCurrent: { state: 'available' },
              isolatedBase: { state: 'available' },
            },
          },
        ]
      : [],
    nextCursor: null,
    incomplete: false,
  }
}

async function openDraft(runtime: ReturnType<typeof createAppRuntime>, draftId: string) {
  await runtime.view.commands.execute('preSessionDraft.open', { draftId, workspaceId: 'workspace-a' })
  const draft = runtime.view.state.preSessionDrafts.getSnapshot()[draftId]
  if (!draft) throw new Error('Pre-session draft did not open')
  return draft
}

test('new branch uses the captured isolated base and updates only the draft selection', async () => {
  const requests: SessionLaunchBranchesRequest[] = []
  const creates: Array<Parameters<SessionLaunchBranchesManager['create']>[0]> = []
  const manager: SessionLaunchBranchesManager = {
    async list(input) {
      requests.push(input)
      return branchPage(
        input.workspaceId,
        input.search === 'feature/base' ? 'feature/base' : input.search === 'main' ? 'main' : null,
      )
    },
    async create(input) {
      creates.push(input)
      return {
        workspaceId: input.workspaceId,
        name: input.name,
        createdRef: `refs/heads/${input.name}`,
        createdOid: input.expectedBaseOid,
        baseRef: input.baseRef,
        baseOid: input.expectedBaseOid,
      }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'branch-create-isolated',
    hostId: 'branch-host',
    directory: emptyDirectory(),
    sessionLaunchBranches: manager,
    sessionLaunchBranchCreation: manager,
  })
  const draftId = '67c9f696-43b9-47f1-b88f-7cbdf0c92402'

  try {
    await runtime.ready
    let draft = await openDraft(runtime, draftId)
    await runtime.view.commands.execute('preSessionDraft.setText', {
      draftId,
      text: 'preserve this message',
      expectedRevision: draft.revision,
    })
    const afterText = runtime.view.state.preSessionDrafts.getSnapshot()[draftId]
    if (!afterText) throw new Error('Pre-session draft disappeared after editing text')
    draft = afterText
    await runtime.view.commands.execute('preSessionDraft.setLaunchSelection', {
      draftId,
      selection: { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: 'refs/heads/feature/base' } },
      expectedRevision: draft.revision,
    })
    const afterSelection = runtime.view.state.preSessionDrafts.getSnapshot()[draftId]
    if (!afterSelection) throw new Error('Pre-session draft disappeared after selecting a base')
    draft = afterSelection

    const capture = await runtime.view.commands.execute('preSessionLaunchBranchCreation.capture', {
      draftId,
      expectedRevision: draft.revision,
    })
    expect(capture).toMatchObject({
      phase: 'ready',
      workspaceId: 'workspace-a',
      draftRevision: draft.revision,
      baseRef: 'refs/heads/feature/base',
      baseOid,
    })
    expect(requests.map(({ search }) => search)).toEqual(['feature/base'])

    const created = await runtime.view.commands.execute('preSessionLaunchBranchCreation.create', {
      draftId,
      expectedRevision: draft.revision,
      name: 'feature/created',
    })
    expect(created.phase).toBe('selected')
    expect(creates).toEqual([
      {
        workspaceId: 'workspace-a',
        name: 'feature/created',
        baseRef: 'refs/heads/feature/base',
        expectedBaseOid: baseOid,
      },
    ])
    expect(runtime.view.state.preSessionDrafts.getSnapshot()[draftId]).toMatchObject({
      workspaceId: 'workspace-a',
      text: 'preserve this message',
      launchSelection: {
        mode: 'isolated-worktree',
        branch: { kind: 'derived', baseRef: 'refs/heads/feature/created' },
      },
    })
    expect(runtime.view.state.directory.getSnapshot().sessions).toEqual({})
  } finally {
    runtime.dispose()
  }
})

test('unknown branch creation is read-only reconciled and requires explicit adoption', async () => {
  const requests: SessionLaunchBranchesRequest[] = []
  let createCalls = 0
  const manager: SessionLaunchBranchesManager = {
    async list(input) {
      requests.push(input)
      return branchPage(
        input.workspaceId,
        input.search === 'main' ? 'main' : input.search === 'feature/created' ? 'feature/created' : null,
      )
    },
    async create() {
      createCalls++
      throw new CommandError('GIT_BRANCH_RESULT_UNKNOWN', 'response lost')
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'branch-create-unknown',
    hostId: 'branch-host',
    directory: emptyDirectory(),
    sessionLaunchBranches: manager,
    sessionLaunchBranchCreation: manager,
  })
  const draftId = '301cb960-6ee7-4125-92ce-1dc4cc86055d'

  try {
    await runtime.ready
    let draft = await openDraft(runtime, draftId)
    const capture = await runtime.view.commands.execute('preSessionLaunchBranchCreation.capture', {
      draftId,
      expectedRevision: draft.revision,
    })
    expect(capture).toMatchObject({ phase: 'ready', baseRef: 'refs/heads/main', baseOid })

    const unknown = await runtime.view.commands.execute('preSessionLaunchBranchCreation.create', {
      draftId,
      expectedRevision: draft.revision,
      name: 'feature/created',
    })
    expect(unknown).toMatchObject({ phase: 'unknown', name: 'feature/created', createdRef: null })
    await expect(
      runtime.view.commands.execute('preSessionLaunchBranchCreation.create', {
        draftId,
        expectedRevision: draft.revision,
        name: 'feature/created',
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(createCalls).toBe(1)
    expect(runtime.view.state.preSessionDrafts.getSnapshot()[draftId]?.launchSelection).toEqual({
      mode: 'shared-current',
    })

    const afterUnknown = runtime.view.state.preSessionDrafts.getSnapshot()[draftId]
    if (!afterUnknown) throw new Error('Pre-session draft disappeared after unknown result')
    draft = afterUnknown
    const verified = await runtime.view.commands.execute('preSessionLaunchBranchCreation.reconcile', {
      draftId,
      expectedRevision: draft.revision,
    })
    expect(verified).toMatchObject({
      phase: 'verified',
      checkResult: 'matched',
      createdRef: 'refs/heads/feature/created',
      createdOid: baseOid,
    })
    expect(requests.at(-1)?.search).toBe('feature/created')
    expect(runtime.view.state.preSessionDrafts.getSnapshot()[draftId]?.launchSelection).toEqual({
      mode: 'shared-current',
    })

    const adopted = await runtime.view.commands.execute('preSessionLaunchBranchCreation.adopt', {
      draftId,
      expectedRevision: draft.revision,
    })
    expect(adopted.phase).toBe('selected')
    expect(runtime.view.state.preSessionDrafts.getSnapshot()[draftId]?.launchSelection).toEqual({
      mode: 'shared-branch',
      branch: { ref: 'refs/heads/feature/created', tipOid: baseOid },
    })
    expect(createCalls).toBe(1)
    expect(runtime.view.state.directory.getSnapshot().sessions).toEqual({})
  } finally {
    runtime.dispose()
  }
})

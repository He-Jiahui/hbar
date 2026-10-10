import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime, type WorkspaceOrganizationState } from '@hbar/app-runtime'
import { HbarRuntimeProvider, HbarWorkspaceShell } from '@hbar/app-react'
import { WorkspaceOrganizationFeedback } from '../packages/app-react/src/workspace-organization'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceOrganizationCopy } from '../apps/web/src/workspace-organization-copy'
import { sessionActivityListInputSchema } from '@hbar/contracts/directory'
import { workspaceSidebarListInputSchema } from '@hbar/contracts/sidebar-directory'

const first = {
  id: 'organization-A',
  name: '项目 A — a very long shared project display name',
  path: 'D:/A',
  createdAt: 1,
}
const second = { ...first, id: 'organization-B', path: 'D:/B' }
const session = {
  id: 'organization-session',
  workspaceId: first.id,
  title: 'Original session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 0,
}

async function shell(hidden: string[], locale: ShellLocale) {
  const runtime = createAppRuntime({
    instanceId: 'organization-render',
    hostId: 'confirmed-fixture-host',
    directory: {
      async execute(id, input) {
        if (id === 'workspace.sidebar.list') {
          const target = workspaceSidebarListInputSchema.parse(input)
          const visible = [first, second].filter((workspace) => !hidden.includes(workspace.id))
          const item = (workspace: typeof first) => ({
            workspace,
            displayName: workspace.name,
            latestSessionCreatedAt: workspace.id === first.id ? session.createdAt : null,
            latestSessionUpdatedAt: workspace.id === first.id ? session.updatedAt : null,
          })
          return {
            displayNamesRevision: 0,
            organizationRevision: 3,
            revision: 1,
            items: visible.map(item),
            includedItems: [first, second]
              .filter((workspace) => target.includeWorkspaceIds?.includes(workspace.id))
              .map(item),
            nextCursor: null,
          }
        }
        if (id === 'session.sidebar.list') {
          const target = sessionActivityListInputSchema.parse(input)
          return {
            revision: 1,
            items:
              target.workspaceId === first.id
                ? [{ session, execution: { state: 'idle', activeCount: 0, queuedCount: 0 } }]
                : [],
            nextCursor: null,
          }
        }
        if (id === 'workspace.list') return { items: [first, second], nextCursor: null }
        if (id === 'workspace.get') {
          const target =
            typeof input === 'object' && input !== null && 'workspaceId' in input ? input.workspaceId : null
          return target === first.id ? first : target === second.id ? second : null
        }
        if (id === 'session.get') return session
        if (id === 'session.list') return { items: [session], nextCursor: null }
        throw new Error(`Unexpected fixture query ${id}`)
      },
    },
    workspaceOrganization: {
      commands: {
        async execute(id) {
          if (id !== 'workspaceOrganization.get') throw new Error('Render fixture must never mutate visibility')
          return { schemaVersion: 1, revision: 3, hiddenWorkspaceIds: hidden }
        },
      },
    },
  })
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    await runtime.view.commands.execute('session.list', { workspaceId: first.id, limit: 100 })
    await runtime.view.commands.execute('app.setSession', { workspaceId: first.id, sessionId: session.id })
    await runtime.view.commands.execute('workspaceSidebar.refresh', {})
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    await runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: first.id })
    const before = runtime.view.state.navigation.getSnapshot()
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarWorkspaceShell
          labels={getShellCopy(locale).shell}
          mobileNavigationLabel="Session tools and tabs"
          sidebarWidthRem={17}
          connection="connected"
          onReconnect={() => {}}
        >
          <p>Original main content and draft stay mounted</p>
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>,
    )
    expect(runtime.view.state.navigation.getSnapshot()).toBe(before)
    expect(before).toMatchObject({ workspaceId: first.id, sessionId: session.id })
    expect(
      runtime.view.state.workspaceTabs
        .getSnapshot()
        .items.some((tab) => tab.kind === 'session' && tab.sessionId === session.id),
    ).toBe(true)
    return html
  } finally {
    runtime.dispose()
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale} filters only the sidebar by stable ID, preserves active content and retains all-hidden recovery`, async () => {
    const labels = workspaceOrganizationCopy(locale)
    const zero = await shell([], locale)
    expect(zero).toContain(`data-workspace-id="${first.id}"`)
    expect(zero).toContain(`data-workspace-id="${second.id}"`)
    expect(zero).toContain(getShellCopy(locale).shell.sort.menu)
    expect(zero).not.toContain(labels.restore(0))
    const one = await shell([first.id], locale)
    expect(one).not.toContain(`data-workspace-id="${first.id}"`)
    expect(one).toContain(`data-workspace-id="${second.id}"`)
    expect(one).toContain(labels.restore(1))
    expect(one).toContain('Original main content and draft stay mounted')
    const all = await shell([first.id, second.id], locale)
    expect(all).not.toContain('data-workspace-id=')
    expect(all).toContain(labels.allHidden)
    expect(all).toContain(labels.restore(2))
    expect(all).not.toContain(getShellCopy(locale).shell.noWorkspaces)
    const maximum = await shell(
      [first.id, second.id, ...Array.from({ length: 1_998 }, (_, index) => `not-in-directory-${index}`)],
      locale,
    )
    expect(maximum).toContain(labels.restore(2_000))
    expect(maximum).not.toContain('data-workspace-id=')
  })
}

const idle: WorkspaceOrganizationState['action'] = {
  status: 'idle',
  request: null,
  key: null,
  receipt: null,
  error: null,
}
const request = {
  expectedRevision: 0,
  change: { kind: 'setHidden' as const, workspaceId: first.id, expectedHidden: false, hidden: true },
}
const receipt = { commitId: 'fixture-commit', revision: 1, request, changed: true }
function feedback(
  state: Omit<WorkspaceOrganizationState, 'requestInFlight'> & { requestInFlight?: boolean },
  locale: ShellLocale,
  connected = true,
) {
  return renderToStaticMarkup(
    <WorkspaceOrganizationFeedback
      state={{ requestInFlight: false, ...state }}
      labels={workspaceOrganizationCopy(locale)}
      targetName={first.name}
      connected={connected}
      onRefresh={() => {}}
      onReconcile={() => {}}
    />,
  )
}

test('unknown feedback survives a missing/hidden row and offers only exact receipt checking', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = workspaceOrganizationCopy(locale)
    const state: WorkspaceOrganizationState = {
      requestInFlight: false,
      status: 'ready',
      error: null,
      snapshot: { schemaVersion: 1, revision: 1, hiddenWorkspaceIds: [first.id] },
      action: { status: 'unknown', request, key: 'original-key', receipt: null, error: 'RESULT_UNKNOWN' },
    }
    const html = feedback(state, locale)
    expect(html).toContain('data-testid="workspace-organization-feedback"')
    expect(html).toContain('role="alert"')
    expect(html).toContain(labels.unknown)
    expect(html).toContain(labels.reconcile)
    expect(html).not.toContain(labels.refresh)
    expect(html).not.toContain('original-key')
    expect(feedback(state, locale, false)).toBe('')
  }
})

test('confirmed ACK plus failed refresh is distinct from an unknown write and never claims the stale row is gone', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = workspaceOrganizationCopy(locale)
    const html = feedback(
      {
        status: 'error',
        error: 'TIMEOUT',
        snapshot: { schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] },
        action: { status: 'succeeded', request, key: 'original-key', receipt, error: null },
      },
      locale,
    )
    expect(html).toContain(labels.saved)
    expect(html).toContain(labels.readFailure('TIMEOUT'))
    expect(html).toContain(labels.refresh)
    expect(html).not.toContain(labels.unknown)
    expect(html).not.toContain(labels.reconcile)
    expect(html).not.toContain(labels.hidden(first.name))
  }
})

test('loading, offline and capacity feedback use host copy without leaking opaque error payloads', () => {
  const labels = workspaceOrganizationCopy('zh-CN')
  expect(feedback({ status: 'loading', error: null, snapshot: null, action: idle }, 'zh-CN')).toContain(labels.loading)
  expect(feedback({ status: 'offline', error: 'DISCONNECTED', snapshot: null, action: idle }, 'zh-CN', false)).toBe('')
  expect(feedback({ status: 'error', error: 'TIMEOUT', snapshot: null, action: idle }, 'zh-CN')).toContain(
    labels.initialReadFailure,
  )
  const html = feedback(
    {
      status: 'ready',
      error: null,
      snapshot: null,
      action: { ...idle, status: 'failed', request, error: 'INPUT_TOO_LARGE' },
    },
    'zh-CN',
  )
  expect(html).toContain(labels.failure('INPUT_TOO_LARGE'))
  expect(html).not.toContain('INPUT_TOO_LARGE')
  const privateError = 'provider-secret-must-not-render'
  expect(feedback({ status: 'error', error: privateError, snapshot: null, action: idle }, 'zh-CN')).not.toContain(
    privateError,
  )
})

test('a newer opposite device change cannot leave an old action claiming the current sidebar effect', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = workspaceOrganizationCopy(locale)
    const reversedHide = feedback(
      {
        status: 'ready',
        error: null,
        snapshot: { schemaVersion: 1, revision: 2, hiddenWorkspaceIds: [] },
        action: { status: 'succeeded', request, key: 'hide-A', receipt, error: null },
      },
      locale,
    )
    expect(reversedHide).toContain(labels.saved)
    expect(reversedHide).not.toContain(labels.hidden(first.name))
    const restoreRequest = { expectedRevision: 1, change: { kind: 'restoreHidden' as const } }
    const restoredThenHidden = feedback(
      {
        status: 'ready',
        error: null,
        snapshot: { schemaVersion: 1, revision: 3, hiddenWorkspaceIds: [second.id] },
        action: {
          status: 'succeeded',
          request: restoreRequest,
          key: 'restore-all',
          receipt: { commitId: 'restore-commit', revision: 2, request: restoreRequest, changed: true },
          error: null,
        },
      },
      locale,
    )
    expect(restoredThenHidden).toContain(labels.saved)
    expect(restoredThenHidden).not.toContain(labels.restored)
  }
})

test('an unresolved physical request explains why receipt checking is not available yet', () => {
  const state: WorkspaceOrganizationState = {
    requestInFlight: true,
    status: 'ready',
    error: null,
    snapshot: { schemaVersion: 1, revision: 1, hiddenWorkspaceIds: [first.id] },
    action: { status: 'unknown', request, key: 'original-key', receipt: null, error: 'DISCONNECTED' },
  }
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = workspaceOrganizationCopy(locale)
    const waiting = feedback(state, locale)
    expect(waiting).toContain(labels.waiting)
    expect(waiting).toContain(labels.reconcile)
    expect(waiting).toContain('disabled=""')
    const settled = feedback({ ...state, requestInFlight: false }, locale)
    expect(settled).toContain(labels.unknown)
    expect(settled).not.toContain('disabled=""')
  }
})

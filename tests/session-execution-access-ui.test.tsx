import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarGoalPlanWorkspace, HbarRuntimeProvider, HbarSessionWorkspace } from '@hbar/app-react'
import { createAppRuntime, type SessionExecutionAccess, type SessionTimelinePort } from '@hbar/app-runtime'
import type { ThreadGoal } from '@hbar/contracts'
import { HbarComposerGoal } from '../packages/app-react/src/composer-intent-controls'
import { HbarComposerModelPicker } from '../packages/app-react/src/composer-model-picker'
import { HbarComposerPermissionPicker } from '../packages/app-react/src/composer-permission-picker'
import {
  HbarSessionExecutionNotice,
  sessionPreparationStatus,
} from '../packages/app-react/src/session-execution-notice'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'original-workspace', path: 'D:/fixture', name: '原项目 — Original project', createdAt: 1 }
const firstSession = {
  id: 'session-a',
  workspaceId: workspace.id,
  title: '原会话 — Original session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 4,
}
const secondSession = { ...firstSession, id: 'session-b', title: 'Other session' }

/** Semantic UI fixture, not a claim that a real Host permits archiving an active Run. */
function fixture(status: ThreadGoal['status'] = 'paused') {
  let session = firstSession
  const goal: ThreadGoal = {
    threadId: session.id,
    goalId: 'original-goal',
    objective: 'Preserve this original Goal and draft',
    status,
    tokenBudget: 100,
    tokensUsed: 10,
    timeUsedSeconds: 20,
    createdAt: 1,
    updatedAt: 2,
  }
  const model = {
    id: 'fixture/model',
    providerId: 'fixture',
    providerName: 'Fixture',
    modelId: 'model',
    modelName: 'Read-only model',
    contextWindow: 10_000,
    maxOutput: 1000,
    imageInput: true,
    reasoning: true,
    thinkingLevels: ['low', 'high'],
    defaultThinkingLevel: 'low',
    hasKey: true,
  }
  const timeline: SessionTimelinePort = {
    snapshot: () =>
      Promise.resolve({
        session,
        messages: [
          {
            id: 'original-message',
            sessionId: session.id,
            runId: 'old-run',
            role: 'assistant',
            content: [{ type: 'text', text: 'Preserved historical message' }],
            seq: 1,
            createdAt: 1,
          },
        ],
        runs: [
          {
            id: 'old-run',
            sessionId: session.id,
            requestId: 'old-request',
            input: { text: 'old request', images: [], files: [] },
            modelId: model.id,
            status: 'failed',
            createdAt: 1,
            startedAt: 1,
            endedAt: 2,
            error: 'Fixture old failure',
          },
          {
            id: 'original-active-run',
            sessionId: session.id,
            requestId: 'active-request',
            input: { text: 'already accepted', images: [], files: [] },
            modelId: model.id,
            status: 'running',
            createdAt: 2,
            startedAt: 2,
            endedAt: null,
            error: null,
          },
        ],
        approvals: [],
        userInputs: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        cursor: 4,
        hasOlder: false,
        streams: [],
      }),
    watch: () => Promise.resolve(() => undefined),
  }
  const runtime = createAppRuntime({
    instanceId: 'execution-access-ui',
    hostId: 'fixture-host',
    directory: {
      execute(name, input) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        if (name === 'session.get')
          return Promise.resolve(
            input && typeof input === 'object' && 'sessionId' in input && input.sessionId === secondSession.id
              ? secondSession
              : session,
          )
        if (name === 'session.list')
          return Promise.resolve({ items: [session, secondSession].filter((item) => !item.archived), nextCursor: null })
        return Promise.reject(new Error(`Unexpected fixture directory query: ${name}`))
      },
    },
    timeline,
    models: {
      execute(name) {
        if (name === 'model.list') return Promise.resolve([model])
        return Promise.resolve({
          sessionId: session.id,
          status: 'configured',
          modelId: model.id,
          model,
          thinkingLevel: 'low',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'session' },
        })
      },
    },
    goals: {
      snapshot: (sessionId) =>
        Promise.resolve({
          sessionId,
          goal: sessionId === session.id ? goal : null,
          goalSeq: 1,
          remainingTokens: 90,
          plan: null,
          planSeq: 0,
        }),
      execute(name) {
        if (name === 'goal.get') return Promise.resolve({ goal, remainingTokens: 90 })
        if (name === 'plan.get') return Promise.resolve(null)
        return Promise.reject(new Error(`Unexpected fixture Goal command: ${name}`))
      },
    },
    surfaces: { canRender: () => true },
  })
  return {
    runtime,
    async open() {
      await runtime.ready
      await runtime.view.commands.execute('app.setSession', { sessionId: firstSession.id, workspaceId: workspace.id })
      for (let tick = 0; tick < 100; tick++) {
        if (
          runtime.view.state.timeline.getSnapshot().status === 'ready' &&
          runtime.view.state.controls.getSnapshot().status === 'ready' &&
          runtime.view.state.composerIntent.getSnapshot().facts.status === 'ready'
        )
          break
        await Bun.sleep(1)
      }
      expect(runtime.view.state.timeline.getSnapshot().status).toBe('ready')
      expect(runtime.view.state.composerIntent.getSnapshot().facts.status).toBe('ready')
      await runtime.view.commands.execute('composerModel.refresh', { sessionId: firstSession.id })
      await runtime.view.commands.execute('draft.setText', {
        sessionId: firstSession.id,
        text: 'Original unsent draft',
      })
      await runtime.view.commands.execute('draft.setAttachments', {
        sessionId: firstSession.id,
        expectedRevision: runtime.view.state.drafts.getSnapshot()[firstSession.id]?.revision ?? 0,
        attachments: [
          { kind: 'file', artifact: { id: 'a'.repeat(64), name: '原附件.txt', mime: 'text/plain', size: 4 } },
        ],
      })
    },
    async archive() {
      session = { ...session, archived: true, seq: 5, updatedAt: 3 }
      await runtime.view.commands.execute('sessionRoster.refresh', { workspaceId: workspace.id })
      expect(runtime.view.state.sessionExecutionAccess.getSnapshot().kind).toBe('archived')
    },
  }
}

async function buttons(html: string) {
  const values: { label: string; text: string; disabled: boolean; className: string }[] = []
  await new HTMLRewriter()
    .on('button', {
      element(element) {
        values.push({
          label: element.getAttribute('aria-label') ?? '',
          text: '',
          disabled: element.hasAttribute('disabled'),
          className: element.getAttribute('class') ?? '',
        })
      },
      text(chunk) {
        const current = values.at(-1)
        if (current) current.text += chunk.text
      },
    })
    .transform(new Response(html))
    .text()
  return values
}

test('UI preparation access requires the exact session and workspace, never foreign ready or archive facts', () => {
  const target = { sessionId: firstSession.id, workspaceId: workspace.id }
  const ready: SessionExecutionAccess = { kind: 'ready', target, seq: 4, updatedAt: 2 }
  expect(sessionPreparationStatus(ready, target)).toBe('ready')
  expect(sessionPreparationStatus({ ...ready, kind: 'archived' }, target)).toBe('archived')
  expect(sessionPreparationStatus(ready, { ...target, sessionId: secondSession.id })).toBe('unverified')
  expect(sessionPreparationStatus(ready, { ...target, workspaceId: 'other-project' })).toBe('unverified')
  expect(sessionPreparationStatus({ ...ready, kind: 'archived' }, null)).toBe('unverified')
  expect(sessionPreparationStatus({ kind: 'unverified', target, reason: 'missing_fact' }, target)).toBe('unverified')
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`archived retained composer forbids new preparation but preserves Stop, original draft, attachments and Files: ${locale}`, async () => {
    const f = fixture()
    const copy = getShellCopy(locale)
    try {
      await f.open()
      await f.archive()
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={f.runtime.view}>
          <HbarSessionWorkspace
            sessionTitle={firstSession.title}
            workspaceName={workspace.name}
            sessionWorkspaceId={workspace.id}
            labels={copy.session}
            connected
            prepareAttachment={() => Promise.reject(new Error('New attachment intake must remain disabled'))}
          />
        </HbarRuntimeProvider>,
      )
      expect(html).toContain(copy.session.executionAccess.archived)
      expect(html).toContain('Original unsent draft')
      expect(html).toContain('原附件.txt')
      expect(html).toContain('Preserved historical message')
      const controls = await buttons(html)
      expect(controls.find((control) => control.label === copy.session.prompt.stop)?.disabled).toBe(false)
      expect(controls.find((control) => control.className.includes('lumen-composer-queue-action'))?.disabled).toBe(true)
      expect(controls.find((control) => control.label === copy.session.tools.files)?.disabled).toBe(false)
      expect(controls.find((control) => control.label === copy.session.intent.resume)?.disabled).toBe(true)
      expect(controls.find((control) => control.label === copy.session.intent.clear)?.disabled).toBe(false)
      expect(controls.find((control) => control.label === copy.session.intent.expand)?.disabled).toBe(false)
      expect(controls.find((control) => control.className.includes('hbar-composer-model-trigger'))?.disabled).toBe(
        false,
      )
      const modelOptions = controls.filter((control) => control.className.includes('hbar-composer-model-option'))
      expect(modelOptions).toHaveLength(1)
      expect(modelOptions.every((control) => control.disabled)).toBe(true)
      expect(controls.find((control) => control.className.includes('hbar-composer-thinking-trigger'))?.disabled).toBe(
        true,
      )
      expect(controls.find((control) => control.text === copy.session.runs.retryLabel)).toBeUndefined()
      expect(
        controls.find(
          (control) =>
            control.label ===
            copy.session.prompt.removeAttachment({
              id: 'a'.repeat(64),
              kind: 'file',
              name: '原附件.txt',
            }),
        )?.disabled,
      ).toBe(false)
      expect(f.runtime.view.state.drafts.getSnapshot()[firstSession.id]?.attachments).toHaveLength(1)
    } finally {
      f.runtime.dispose()
    }
  })
}

test('archived active Goal keeps Pause and Clear, rather than using preparation access as a Goal control gate', async () => {
  const f = fixture('active')
  const labels = getShellCopy('en-US').session.intent
  try {
    await f.open()
    await f.archive()
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={f.runtime.view}>
        <HbarComposerGoal
          sessionId={firstSession.id}
          workspaceId={workspace.id}
          connected
          canPrepare={false}
          labels={labels}
        />
      </HbarRuntimeProvider>,
    )
    const controls = await buttons(html)
    expect(controls.find((control) => control.label === labels.pause)?.disabled).toBe(false)
    expect(controls.find((control) => control.label === labels.clear)?.disabled).toBe(false)
    expect(controls.find((control) => control.label === labels.expand)?.disabled).toBe(false)
  } finally {
    f.runtime.dispose()
  }
})

test('unverified and long host-owned copy never claim archive or offer an unproven restore entry', () => {
  const labels = getShellCopy('zh-CN').session.executionAccess
  const long = `${labels.unverified} ${'需要自然换行的原目标说明'.repeat(20)}`
  const html = renderToStaticMarkup(
    <HbarSessionExecutionNotice
      status="unverified"
      workspaceName={workspace.name}
      connected={false}
      labels={{ ...labels, unverified: long }}
      onOpenArchived={() => Promise.reject(new Error('Unverified state has no archive action'))}
    />,
  )
  expect(html).toContain(long)
  expect(html).toContain('data-session-execution-access="unverified"')
  expect(html).not.toContain(labels.archived)
  expect(html).not.toContain('<button')
  expect(
    renderToStaticMarkup(
      <HbarSessionExecutionNotice
        status="ready"
        workspaceName={workspace.name}
        connected
        labels={labels}
        onOpenArchived={() => Promise.resolve()}
      />,
    ),
  ).toBe('')
})

test('read-only model recovery stays discoverable while its original result is unknown', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.archive()
    const original = f.runtime.view.state.composerModel.getSnapshot()
    // Render-only unknown DTO; receipt truth and reconciliation I/O are covered by the runtime/Host tests.
    const unknown = { ...original, action: { ...original.action, status: 'unknown' as const, error: 'RESULT_UNKNOWN' } }
    const view = {
      ...f.runtime.view,
      state: {
        ...f.runtime.view.state,
        composerModel: { getSnapshot: () => unknown, subscribe: () => () => undefined },
      },
    }
    const labels = getShellCopy('en-US').session.modelPicker
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={view}>
        <HbarComposerModelPicker sessionId={firstSession.id} connected disabled canSelect={false} labels={labels} />
      </HbarRuntimeProvider>,
    )
    const controls = await buttons(html)
    expect(controls.find((control) => control.className.includes('hbar-composer-model-trigger'))?.disabled).toBe(false)
    expect(controls.filter((control) => control.text === labels.reconcile)).toHaveLength(2)
    expect(controls.filter((control) => control.text === labels.reconcile).every((control) => !control.disabled)).toBe(
      true,
    )
    expect(
      controls
        .filter((control) => control.className.includes('hbar-composer-model-option'))
        .every((control) => control.disabled),
    ).toBe(true)
  } finally {
    f.runtime.dispose()
  }
})

test('read-only permission menu disables all bounded new choices and Plan writes, but retains original Plan recheck', async () => {
  const labels = getShellCopy('zh-CN').session.permissionPicker
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      sessionId={firstSession.id}
      sessionLabel={firstSession.title}
      entry={undefined}
      hostDefault={{ status: 'ready', mode: 'ask', error: null }}
      connected
      disabled={false}
      canPrepare={false}
      labels={labels}
      onRefresh={() => Promise.resolve()}
      onSelect={() => Promise.reject(new Error('No preparation writes in the read-only UI fixture'))}
      plan={{
        entry: { sessionId: firstSession.id, mode: null, status: 'unknown', revision: 2, error: 'RESULT_UNKNOWN' },
        onSetMode: () => Promise.reject(new Error('No Plan writes in the read-only UI fixture')),
        onSelectOrdinary: () => Promise.reject(new Error('No Plan choice writes in the read-only UI fixture')),
        onRefresh: () => Promise.resolve(),
        onReconcile: () => Promise.resolve(),
      }}
    />,
  )
  expect(html.match(/role="menuitemradio"/g)).toHaveLength(4)
  expect(html.match(/role="menuitemcheckbox"/g)).toHaveLength(1)
  expect(html.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toHaveLength(4)
  expect(html.match(/<button[^>]*role="menuitemcheckbox"[^>]*disabled=""/g)).toHaveLength(1)
  const controls = await buttons(html)
  expect(controls.find((control) => control.text === labels.plan.recheck)?.disabled).toBe(false)
  expect(controls.find((control) => control.className.includes('hbar-composer-permission-trigger'))?.disabled).toBe(
    false,
  )
})

test('pinned archived Goal editor remains read-only when current navigation is another ready session', async () => {
  const f = fixture()
  const copy = getShellCopy('en-US')
  try {
    await f.open()
    const panel = await f.runtime.view.commands.execute('app.openPanel', {
      panelId: 'goals',
      sessionId: firstSession.id,
      workspaceId: workspace.id,
      binding: 'pinned',
      instanceId: 'pinned-goal-a',
    })
    await f.runtime.view.commands.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
    await f.runtime.view.commands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: panel.instanceId })
    await f.runtime.view.commands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: panel.instanceId,
      field: 'objective',
      value: 'Original dirty Goal editor',
    })
    await f.archive()
    await f.runtime.view.commands.execute('app.setSession', { sessionId: secondSession.id, workspaceId: workspace.id })
    expect(f.runtime.view.state.sessionExecutionAccess.getSnapshot().kind).toBe('ready')
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={f.runtime.view}>
        <HbarGoalPlanWorkspace labels={copy.goals} connected instanceId={panel.instanceId} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain(copy.goals.executionAccess.archived)
    expect(html).toContain('Original dirty Goal editor')
    expect(html).toContain('<fieldset disabled=""')
    const controls = await buttons(html)
    expect(controls.find((control) => control.text === copy.goals.goal.save)?.disabled).toBe(true)
    expect(controls.find((control) => control.text === copy.goals.goal.cancel)?.disabled).toBe(false)
  } finally {
    f.runtime.dispose()
  }
})

test('workspace routes unknown recovery only for the exact retry command, never cancel unknown or other failed Runs', async () => {
  const f = fixture()
  const copy = getShellCopy('en-US')
  try {
    await f.open()
    await f.archive()
    const timeline = f.runtime.view.state.timeline.getSnapshot()
    const original = timeline.runs.find((run) => run.id === 'old-run')
    if (!original) throw new Error('Expected the original failed Run fixture')
    const withAnotherFailure = { ...timeline, runs: [...timeline.runs, { ...original, id: 'cancel-unknown' }] }
    const render = (status: 'unknown' | 'submitting') =>
      renderToStaticMarkup(
        <HbarRuntimeProvider
          view={{
            ...f.runtime.view,
            state: {
              ...f.runtime.view.state,
              timeline: { getSnapshot: () => withAnotherFailure, subscribe: () => () => undefined },
              // Render-only accepted action DTOs test per-command UI routing, not receipt I/O.
              runActions: {
                getSnapshot: () => ({
                  'old-run': {
                    operationId: 'old-run',
                    commandId: 'run.retry' as const,
                    phase: status === 'submitting' ? ('receipt' as const) : ('request' as const),
                    status,
                    error: 'RESULT_UNKNOWN',
                  },
                  'cancel-unknown': {
                    operationId: 'cancel-unknown',
                    commandId: 'operation.cancel' as const,
                    status: 'unknown' as const,
                    error: 'RESULT_UNKNOWN',
                  },
                }),
                subscribe: () => () => undefined,
              },
            },
          }}
        >
          <HbarSessionWorkspace
            sessionTitle={firstSession.title}
            workspaceName={workspace.name}
            sessionWorkspaceId={workspace.id}
            labels={copy.session}
            connected
          />
        </HbarRuntimeProvider>,
      )
    const unknown = await buttons(render('unknown'))
    expect(unknown.filter((control) => control.text === copy.session.runs.recheckLabel)).toHaveLength(1)
    expect(unknown.find((control) => control.text === copy.session.runs.recheckLabel)?.disabled).toBe(false)
    expect(unknown.find((control) => control.text === copy.session.runs.retryLabel)).toBeUndefined()
    const pending = await buttons(render('submitting'))
    expect(pending.filter((control) => control.text === copy.session.runs.recheckingLabel)).toHaveLength(1)
    expect(pending.find((control) => control.text === copy.session.runs.recheckingLabel)?.disabled).toBe(true)
  } finally {
    f.runtime.dispose()
  }
})

test('a normal new Retry request still says Retrying, not Checking result', async () => {
  const f = fixture()
  const copy = getShellCopy('en-US')
  try {
    await f.open()
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider
        view={{
          ...f.runtime.view,
          state: {
            ...f.runtime.view.state,
            runActions: {
              getSnapshot: () => ({
                'old-run': {
                  operationId: 'old-run',
                  commandId: 'run.retry' as const,
                  phase: 'request' as const,
                  status: 'submitting' as const,
                  error: null,
                },
              }),
              subscribe: () => () => undefined,
            },
          },
        }}
      >
        <HbarSessionWorkspace
          sessionTitle={firstSession.title}
          workspaceName={workspace.name}
          sessionWorkspaceId={workspace.id}
          labels={copy.session}
          connected
        />
      </HbarRuntimeProvider>,
    )
    const controls = await buttons(html)
    expect(controls.find((control) => control.text === copy.session.runs.retryingLabel)?.disabled).toBe(true)
    expect(controls.find((control) => control.text === copy.session.runs.recheckingLabel)).toBeUndefined()
  } finally {
    f.runtime.dispose()
  }
})

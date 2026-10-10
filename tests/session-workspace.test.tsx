import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarSessionMonitoring, HbarSessionWorkspace } from '@hbar/app-react'
import { createAppRuntime, type BudgetCommandPort, type SessionTimelinePort } from '@hbar/app-runtime'
import type { UsageQueryResult } from '@hbar/contracts/commands/usage'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Rich session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}

function usage(): UsageQueryResult {
  const metric = (value: number, unit: 'USD' | 'ratio' | 'tokens_per_second') => ({
    value,
    unit,
    availability: 'available' as const,
    reason: null,
    source: 'test',
    estimated: false,
    sampleCount: 1,
  })
  const latency = {
    p50: 10,
    p95: 10,
    unit: 'milliseconds' as const,
    availability: 'available' as const,
    reason: null,
    sampleCount: 1,
  }
  return {
    accountingVersion: 1,
    scope: { kind: 'session', sessionId: session.id, includeDescendants: false },
    window: { from: 0, to: 60_000, bucketMs: 60_000 },
    observedAt: 60_000,
    gap: false,
    totals: { attempts: 1, runs: 1, input: 10, output: 10, cacheRead: 2, cacheWrite: 0, billableTokens: 18 },
    cost: metric(0.01, 'USD'),
    cacheHitRate: metric(0.2, 'ratio'),
    rates: {
      input: metric(2, 'tokens_per_second'),
      output: metric(3, 'tokens_per_second'),
      total: metric(5, 'tokens_per_second'),
    },
    latency: { firstProviderEvent: latency, firstThinking: latency, firstText: latency, response: latency },
    models: [],
    series: [
      {
        start: 0,
        end: 60_000,
        attempts: 1,
        runs: 1,
        input: 10,
        output: 10,
        cacheRead: 2,
        cacheWrite: 0,
        billableTokens: 18,
        cost: metric(0.01, 'USD'),
      },
    ],
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('session workspace renders sanitized timeline, command-owned forms and reliable usage from host content', async () => {
  const labels = getShellCopy('en-US').session
  const timeline: SessionTimelinePort = {
    async snapshot() {
      return {
        session,
        messages: [
          {
            id: 'message',
            sessionId: session.id,
            runId: 'run',
            role: 'assistant' as const,
            content: [{ type: 'text' as const, text: '**safe** <script>unsafe()</script>' }],
            seq: 1,
            createdAt: 1,
          },
        ],
        runs: [
          {
            id: 'run',
            sessionId: session.id,
            requestId: 'request',
            input: { text: 'hello', images: [], files: [] },
            modelId: 'provider:model',
            status: 'completed' as const,
            createdAt: 1,
            startedAt: 1,
            endedAt: 2,
            error: null,
          },
        ],
        approvals: [
          {
            id: 'approval',
            sessionId: session.id,
            runId: 'run',
            callId: 'call',
            tool: 'write_file',
            args: { path: 'notes.txt' },
            status: 'pending' as const,
            createdAt: 2,
          },
        ],
        userInputs: [
          {
            requestId: 'questionnaire',
            sessionId: session.id,
            runId: 'run',
            callId: 'question',
            questions: [
              {
                id: 'continue',
                header: 'Choice',
                question: 'Should we continue?',
                options: [{ label: 'Yes', description: 'Continue the run' }],
                isOther: true,
                isSecret: false,
              },
            ],
            isBlocking: true,
          },
        ],
        usage: { input: 10, output: 10, cacheRead: 2, cacheWrite: 0, cost: 0.01 },
        cursor: 4,
        hasOlder: true,
        streams: [],
      }
    },
    async plan() {
      return {
        sessionId: session.id,
        revision: 1,
        turnId: 'run',
        explanation: 'Keep the plan attached to its run.',
        plan: [
          { step: 'Inspect the change', status: 'completed' as const },
          { step: 'Run verification', status: 'in_progress' as const },
        ],
        updatedAt: 4,
      }
    },
    async watch() {
      return () => undefined
    },
  }
  const directory = {
    async execute(name: string) {
      if (name === 'session.get') return session
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: [session], nextCursor: null }
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      throw new Error(`Unsupported query: ${name}`)
    },
  }
  const budget = {
    async execute() {
      return {
        sessionId: session.id,
        budgetId: 'budget',
        limit: 100,
        phase: 'active',
        usedTokens: 20,
        remainingTokens: 80,
        revision: 1,
        createdAt: 1,
        updatedAt: 2,
      }
    },
    async getReceipt() {
      return null
    },
  } as unknown as BudgetCommandPort
  const runtime = createAppRuntime({
    instanceId: 'session-workspace',
    hostId: 'host',
    directory,
    timeline,
    budget,
    models: {
      async execute() {
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: 'provider:model',
          model: {
            id: 'provider:model',
            providerId: 'provider',
            providerName: 'Provider',
            modelId: 'model',
            modelName: 'Fixture Model',
            contextWindow: 100_000,
            maxOutput: 10_000,
            imageInput: true,
            reasoning: true,
            thinkingLevels: ['low'],
            defaultThinkingLevel: 'low',
            contextTiers: [
              { id: 'max', contextWindow: 200_000, inputTokensAbove: 100_000, inputPrice: 1, outputPrice: 2 },
            ],
            hasKey: true,
          },
          thinkingLevel: 'low',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'session' },
        }
      },
    },
    usage: {
      async execute() {
        return usage()
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(
      () =>
        runtime.view.state.timeline.getSnapshot().status === 'ready' &&
        runtime.view.state.controls.getSnapshot().status === 'ready',
    )
    await runtime.view.commands.execute('draft.setText', { sessionId: session.id, text: 'next prompt' })
    await runtime.view.commands.execute('questionnaire.setAnswer', {
      sessionId: session.id,
      requestId: 'questionnaire',
      questionId: 'continue',
      answer: { kind: 'option', value: 'Yes' },
    })
    const workspaceHtml = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionWorkspace
          sessionTitle={session.title}
          workspaceName="Workspace 1"
          sessionWorkspaceId={workspace.id}
          labels={labels}
          connected
          prepareAttachment={async () => {
            throw new Error('not invoked during static rendering')
          }}
        />
      </HbarRuntimeProvider>,
    )
    // Run history and its plan now belong to the session status tool pane.
    // Render that host-owned surface alongside the workspace so this test
    // keeps validating the plan projection without requiring a browser click.
    const monitoringHtml = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionMonitoring labels={getShellCopy('en-US').monitoring} connected />
      </HbarRuntimeProvider>,
    )
    const html = `${workspaceHtml}${monitoringHtml}`
    expect(html).toContain('Session: Rich session')
    expect(html).toContain('<strong>safe</strong>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('next prompt')
    expect(html).toContain('aria-label="Choose model: Fixture Model"')
    expect(html).toContain(`aria-label="${labels.modelPicker.maxMode.menu}"`)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain(getShellCopy('en-US').session.decisions.approval)
    expect(html).toContain('Agent plan')
    expect(html).toContain('1 of 2 completed')
    expect(html).toContain('Keep the plan attached to its run.')
    expect(html).toContain('Should we continue?')
    expect(html).toContain(getShellCopy('en-US').monitoring.title)
    expect(html).toContain(getShellCopy('en-US').monitoring.models)
    expect(html).toContain(labels.loadOlder)
    expect(html).toContain(`aria-label="${labels.addMenu.open}"`)
    expect(html).toContain(labels.addMenu.files)
    expect(html).toMatch(new RegExp(`<dt[^>]*>${getShellCopy('en-US').monitoring.totals.tokens}</dt><dd>20</dd>`))
    expect(html).toContain('Workspace 1')
    let composerBoundary: string | null = null
    let composerIndicators = 0
    await new HTMLRewriter()
      .on('form.lumen-prompt-composer-surface', {
        element(element) {
          composerBoundary = element.getAttribute('data-boundary')
        },
      })
      .on('form.lumen-prompt-composer-surface > span[data-edge]', {
        element() {
          composerIndicators++
        },
      })
      .transform(new Response(html))
      .text()
    expect(composerBoundary as string | null).toBe('none')
    expect(composerIndicators).toBe(0)
  } finally {
    runtime.dispose()
  }
})

test('an unconfigured session exposes a localized model recovery action instead of a dead instruction', async () => {
  const runtime = createAppRuntime({
    instanceId: 'model-entry-empty',
    hostId: 'model-entry-host',
    directory: {
      async execute(name) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        throw new Error(`Unexpected directory query: ${name}`)
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const labels = {
      ...getShellCopy('zh-CN').session,
      modelPicker: {
        ...getShellCopy('zh-CN').session.modelPicker,
        trigger: (currentModel: string) => `为当前会话选择模型与思考等级，保留尚未发送的长文本草稿：${currentModel}`,
      },
    }
    for (const connected of [true, false]) {
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionWorkspace
            sessionTitle={session.title}
            workspaceName={workspace.name}
            sessionWorkspaceId={workspace.id}
            labels={labels}
            connected={connected}
          />
        </HbarRuntimeProvider>,
      )
      const control = { count: 0, label: '', disabled: false, text: '' }
      await new HTMLRewriter()
        .on('button.hbar-composer-model-trigger', {
          element(element) {
            control.count++
            control.label = element.getAttribute('aria-label') ?? ''
            control.disabled = element.hasAttribute('disabled')
          },
          text(chunk) {
            control.text += chunk.text
          },
        })
        .transform(new Response(html))
        .text()
      expect(control).toEqual({
        count: 1,
        label: labels.modelPicker.trigger('选择模型'),
        disabled: !connected,
        text: '选择模型',
      })
      expect(html).not.toContain('Session settings first')
    }
  } finally {
    runtime.dispose()
  }
})

type SessionToolControl = {
  text: string
  label: string | null
  title: string | null
  pressed: string | null
  selected: string | null
  disabled: boolean
  type: string | null
  tabIndex: string | null
  hiddenIcons: number
}

async function toolControls(html: string) {
  const controls: SessionToolControl[] = []
  const group: { label: string | null } = { label: null }
  await new HTMLRewriter()
    .on('.lumen-page-actions', {
      element(element) {
        group.label = element.getAttribute('aria-label')
      },
    })
    .on('button.hbar-app-react-session-tool', {
      element(element) {
        controls.push({
          text: '',
          label: element.getAttribute('aria-label'),
          title: element.getAttribute('title'),
          pressed: element.getAttribute('aria-pressed'),
          selected: element.getAttribute('data-selected'),
          disabled: element.hasAttribute('disabled'),
          type: element.getAttribute('type'),
          tabIndex: element.getAttribute('tabindex'),
          hiddenIcons: 0,
        })
      },
      text(chunk) {
        const control = controls.at(-1)
        if (control) control.text += chunk.text
      },
    })
    .on('button.hbar-app-react-session-tool svg[aria-hidden="true"]', {
      element() {
        const control = controls.at(-1)
        if (control) control.hiddenIcons++
      },
    })
    .transform(new Response(html))
    .text()
  return { groupLabel: group.label, controls }
}

function toolRuntime() {
  return createAppRuntime({
    instanceId: 'session-tool-navigation',
    hostId: 'host',
    directory: {
      async execute(name) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        throw new Error(`Unexpected directory query: ${name}`)
      },
    },
    surfaces: { canRender: () => true },
  })
}

test('Find and session tools expose host-owned names, hints and semantic icons, including long translated labels', async () => {
  const runtime = toolRuntime()
  try {
    const base = getShellCopy('zh-CN').session
    const labels = {
      ...base,
      find: { ...base.find, entry: '仅在当前会话中查找已加载的用户与助手正文' },
      tools: {
        ...base.tools,
        files: '当前项目中的文件与目录，包括具有很长名称的文档及附件',
        goals: '当前会话的目标、执行计划与待完成的工作流程',
      },
    }
    const render = (showFilesInHeader = true) =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionWorkspace
            sessionTitle={session.title}
            workspaceName={workspace.name}
            sessionWorkspaceId={workspace.id}
            labels={labels}
            connected
            showFilesInHeader={showFilesInHeader}
          />
        </HbarRuntimeProvider>,
      )
    for (const hasSession of [false, true]) {
      if (hasSession) await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
      const result = await toolControls(render())
      expect(result.groupLabel).toBe(labels.tools.label)
      expect(result.controls.map((control) => control.label)).toEqual([
        labels.find.entry,
        labels.tools.files,
        labels.tools.activity,
        labels.tools.more,
      ])
      expect(result.controls).toHaveLength(4)
      for (const [index, control] of result.controls.entries()) {
        expect(control.title).toBe(control.label)
        expect(control.text).toBe(index === 3 ? labels.tools.more : '')
        expect(control).toMatchObject({
          // The local Find owner is created on client mount, never during SSR.
          disabled: index === 0 || !hasSession,
          pressed: index > 0 && index < result.controls.length - 1 ? 'false' : null,
          type: 'button',
          tabIndex: null,
          hiddenIcons: 1,
        })
      }
      const tabOwned = await toolControls(render(false))
      expect(tabOwned.controls.map((control) => control.label)).toEqual([
        labels.find.entry,
        labels.tools.activity,
        labels.tools.more,
      ])
    }
  } finally {
    runtime.dispose()
  }
})

test('tool pressed states track only the matching workspace and session and clear after closing', async () => {
  const runtime = toolRuntime()
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const labels = getShellCopy('en-US').session
    const read = async () =>
      (
        await toolControls(
          renderToStaticMarkup(
            <HbarRuntimeProvider view={runtime.view}>
              <HbarSessionWorkspace
                sessionTitle={session.title}
                workspaceName={workspace.name}
                sessionWorkspaceId={workspace.id}
                labels={labels}
                connected
              />
            </HbarRuntimeProvider>,
          ),
        )
      ).controls.map((control) => control.pressed ?? control.selected)
    const panelIds = ['files', 'activity', 'monitoring', 'agents', 'goals'] as const
    const pressedStates = (activePanelId: (typeof panelIds)[number] | null) => [
      null,
      activePanelId === 'files' ? 'true' : 'false',
      activePanelId === 'activity' ? 'true' : 'false',
      activePanelId && ['monitoring', 'agents', 'goals'].includes(activePanelId) ? 'true' : 'false',
    ]
    for (const panelId of panelIds) {
      await runtime.view.commands.execute('app.openPanel', {
        panelId,
        workspaceId: workspace.id,
        sessionId: session.id,
        binding: 'followActive',
      })
      expect(await read()).toEqual(pressedStates(panelId))
      const instanceId = runtime.view.state.presentation.getSnapshot().toolInstanceId
      if (!instanceId) throw new Error('Tool was not opened')
      await runtime.view.commands.execute('app.closePanel', { instanceId })
      expect(await read()).toEqual(pressedStates(null))
    }
    await runtime.view.commands.execute('app.openPanel', {
      panelId: 'files',
      workspaceId: 'another-workspace',
      binding: 'pinned',
    })
    expect(await read()).toEqual(pressedStates(null))
    await runtime.view.commands.execute('app.openPanel', {
      panelId: 'goals',
      workspaceId: workspace.id,
      sessionId: 'another-session',
      binding: 'pinned',
    })
    expect(await read()).toEqual(pressedStates(null))
  } finally {
    runtime.dispose()
  }
})

import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarSessionMonitoring } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { sessionMonitoringUsage } from './fixtures/session-monitoring-fixture'
import type { Run } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Measured session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session status owns scoped run history and keeps unavailable usage independent: ${locale}`, async () => {
    const failed: Run = {
      id: 'original-failure',
      sessionId: session.id,
      requestId: 'original-request',
      input: { text: 'Original prompt', images: [] },
      modelId: 'original-model',
      status: 'failed',
      createdAt: 10,
      startedAt: 10,
      endedAt: 20,
      error: 'Original provider failure',
    }
    const runtime = createAppRuntime({
      instanceId: `session-history-${locale}`,
      hostId: 'host',
      directory: {
        async execute(name: string) {
          if (name === 'session.get') return session
          if (name === 'workspace.get') return workspace
          if (name === 'session.list') return { items: [session], nextCursor: null }
          if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
          throw new Error(`Unsupported query: ${name}`)
        },
      },
      timeline: {
        async snapshot() {
          return {
            session,
            messages: [],
            runs: [failed],
            approvals: [],
            userInputs: [],
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
            cursor: 4,
            hasOlder: false,
            streams: [],
          }
        },
        async watch() {
          return () => {}
        },
      },
      surfaces: { canRender: (id) => id === 'monitoring' },
    })
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
      await waitFor(() => runtime.view.state.timeline.getSnapshot().status === 'ready')
      await runtime.view.commands.execute('app.openPanel', { panelId: 'monitoring' })
      const labels = getShellCopy(locale).monitoring
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionMonitoring labels={labels} connected />
        </HbarRuntimeProvider>,
      )
      expect(html).toContain('Original provider failure')
      expect(html).toContain(labels.history.runs.details(1))
      expect(html).toContain('data-run-id="original-failure"')
      expect(html).toContain(labels.empty)
      expect((html.match(/role="tab"/g) ?? []).length).toBe(3)
      expect(html).toContain(labels.tabs.overview)
      expect(html).not.toContain('data-usage-id=')
      const paired = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionMonitoring labels={labels} connected />
          <HbarSessionMonitoring labels={labels} connected />
        </HbarRuntimeProvider>,
      )
      const ids = [...paired.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
      expect(new Set(ids).size).toBe(ids.length)
      expect((html.match(/hbar-session-run-activity/g) ?? []).length).toBe(1)
      const offline = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionMonitoring labels={labels} connected={false} />
        </HbarRuntimeProvider>,
      )
      expect(offline).toContain('Original provider failure')
      expect(offline).not.toContain(labels.history.runs.retryLabel)
      const stale = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSessionMonitoring labels={labels} connected instanceId="missing-pane" />
        </HbarRuntimeProvider>,
      )
      expect(stale).not.toContain('Original provider failure')
      expect(stale).not.toContain('data-run-id="original-failure"')
    } finally {
      runtime.dispose()
    }
  })
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

test('session monitoring renders only the runtime usage projection and closes through a command', async () => {
  const runtime = createAppRuntime({
    instanceId: 'session-monitoring',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    usage: {
      async execute() {
        return sessionMonitoringUsage()
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'monitoring' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(() => runtime.view.state.controls.getSnapshot().usage !== null)
    await runtime.view.commands.execute('app.openPanel', { panelId: 'monitoring' })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionMonitoring labels={getShellCopy('en-US').monitoring} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Session status')
    expect(html).toContain('140')
    expect(html).toContain('$0.125')
    expect(html).toContain('provider / model')
    expect(html).toContain('Token timeline')
    expect(html).toContain('Execution statistics')
    expect(html).toContain('1 succeeded · 0 failed · 0 unknown')
    expect(html).toContain('lumen-compact-metrics')
    expect(html).toContain('role="img" aria-label="Token timeline"')
    expect(html).not.toContain('<details open')
    expect(html).not.toContain('hbar-app-ui-metrics')
    const stale = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionMonitoring labels={getShellCopy('en-US').monitoring} instanceId="missing-pane" />
      </HbarRuntimeProvider>,
    )
    expect(stale).not.toContain('provider / model')
    expect(stale).not.toContain('data-chart-bucket')

    const panelId = runtime.view.state.surfaces.getSnapshot().focusedPanelId
    expect(panelId).not.toBeNull()
    await runtime.view.commands.execute('app.closePanel', { instanceId: panelId! })
    expect(runtime.view.state.surfaces.getSnapshot().focusedPanelId).toBeNull()
  } finally {
    runtime.dispose()
  }
})

import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAgentWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'parent',
  workspaceId: workspace.id,
  title: 'Parent',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}
const agent: AgentRecord = {
  agentId: 'child',
  parentSessionId: session.id,
  sessionId: 'child-session',
  runId: 'child-run',
  requestId: 'child-request',
  objective: 'Verify the release candidate',
  modelId: 'provider:model',
  tokenBudget: 12_000,
  status: 'running',
  error: null,
  createdAt: 10,
  updatedAt: 11,
}

test('child agent panel renders Host records and a command-owned creation draft', async () => {
  const runtime = createAppRuntime({
    instanceId: 'agent-react',
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
    agents: {
      async execute(name: string) {
        if (name === 'agent.list') return { items: [agent], nextCursor: null }
        throw new Error(`Unsupported agent command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'agents' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: panel.instanceId })
    const listHtml = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarAgentWorkspace labels={getShellCopy('en-US').agents} connected />
      </HbarRuntimeProvider>,
    )
    expect(listHtml).toContain('Child agent management')
    expect(listHtml).toContain('Verify the release candidate')
    expect(listHtml).toContain('provider:model')
    expect(listHtml).toContain('12,000 tokens')
    expect(listHtml).toContain('View details for Verify the release candidate')

    await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: panel.instanceId })
    await runtime.view.commands.execute('agentWorkspace.setField', {
      instanceId: panel.instanceId,
      field: 'objective',
      value: 'Draft child task',
    })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarAgentWorkspace labels={getShellCopy('en-US').agents} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Create child agent')
    expect(html).toContain('Draft child task')
    expect(html).toContain('Back to child agents')
    expect(html).not.toContain('Verify the release candidate')

    await runtime.view.commands.execute('agentWorkspace.showAgent', {
      instanceId: panel.instanceId,
      agentId: agent.agentId,
    })
    const detailHtml = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarAgentWorkspace labels={getShellCopy('en-US').agents} connected />
      </HbarRuntimeProvider>,
    )
    expect(detailHtml).toContain('Child agent details')
    expect(detailHtml).toContain('Current session')
    expect(detailHtml).toContain('Open child session')
    expect(detailHtml).toContain('Cancel agent')
    const chineseDetail = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarAgentWorkspace labels={getShellCopy('zh-CN').agents} connected />
      </HbarRuntimeProvider>,
    )
    expect(chineseDetail).toContain('打开子会话')
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const labels = getShellCopy(locale).agents
      expect(labels.openSessionError('CONNECTION_CLOSED')).toBe(labels.openSessionError('DISCONNECTED'))
      expect(labels.returnError('CONNECTION_CLOSED')).toBe(labels.returnError('DISCONNECTED'))
    }
  } finally {
    runtime.dispose()
  }
})

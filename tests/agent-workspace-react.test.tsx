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
    expect(html).toContain('Child agent management')
    expect(html).toContain('Draft child task')
    expect(html).toContain('Verify the release candidate')
    expect(html).toContain('provider:model')
    expect(html).toContain('12,000 tokens')
    expect(html).toContain('Open session')
    expect(html).toContain('Cancel agent')
  } finally {
    runtime.dispose()
  }
})

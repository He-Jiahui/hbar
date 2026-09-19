import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarGoalPlanWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { PlanState, ThreadGoal } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Goal session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}
const goal: ThreadGoal = {
  threadId: session.id,
  goalId: 'goal',
  objective: 'Ship the modular workbench',
  status: 'active',
  tokenBudget: 30_000,
  tokensUsed: 4_000,
  timeUsedSeconds: 120,
  createdAt: 4,
  updatedAt: 5,
}
const plan: PlanState = {
  sessionId: session.id,
  turnId: null,
  explanation: 'Keep every slice reviewable.',
  plan: [
    { step: 'Build the runtime', status: 'completed' },
    { step: 'Connect the renderer', status: 'in_progress' },
  ],
  updatedAt: 6,
}

test('goal and plan panel renders authoritative Host state through controlled editors', async () => {
  const runtime = createAppRuntime({
    instanceId: 'goal-plan-react',
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
    goals: {
      async execute(name: string) {
        if (name === 'goal.get') return { goal, remainingTokens: 26_000 }
        if (name === 'plan.get') return plan
        throw new Error(`Unsupported goal command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await runtime.view.commands.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarGoalPlanWorkspace labels={getShellCopy('en-US').goals} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Goals and plans')
    expect(html).toContain('Ship the modular workbench')
    expect(html).toContain('26,000')
    expect(html).toContain('Keep every slice reviewable.')
    expect(html).toContain('Build the runtime')
    expect(html).toContain('Connect the renderer')
    expect(html).toContain('Save 2 steps')
  } finally {
    runtime.dispose()
  }
})

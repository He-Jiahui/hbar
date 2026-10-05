import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { AgentPolicyEditor, HbarRuntimeProvider } from '@hbar/app-react'
import { agentPolicySetInputSchema, type AgentPolicySnapshot } from '@hbar/contracts/commands/agents'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/fixture', name: 'Fixture', createdAt: 1 }
const session = {
  id: 'parent',
  workspaceId: workspace.id,
  title: 'Parent',
  parentId: null,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}
async function fixture(mode: 'normal' | 'unknown' | 'conflict' = 'normal') {
  let snapshot: AgentPolicySnapshot = {
    parentSessionId: session.id,
    candidates: [],
    revisions: { session: 0 },
    sourceLayer: 'default',
    inherited: true,
  }
  const attempts: { input: unknown; key: string | undefined }[] = []
  const runtime = createAppRuntime({
    instanceId: 'policy-fixture',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(name)
      },
    },
    agents: {
      async execute(name: string, input: unknown, options?: ExecuteOptions) {
        if (name === 'agent.policy.get') return snapshot
        if (name !== 'agent.policy.set') throw new Error(name)
        const parsed = agentPolicySetInputSchema.parse(input)
        attempts.push({ input: parsed, key: options?.idempotencyKey })
        if (mode === 'conflict' && attempts.length === 1) {
          snapshot = { ...snapshot, revisions: { session: 1 } }
          throw new CommandError('REVISION_CONFLICT', 'Changed elsewhere')
        }
        snapshot = {
          parentSessionId: session.id,
          candidates: parsed.candidates ?? [],
          revisions: { session: 2 },
          sourceLayer: parsed.candidates === null ? 'default' : 'settings:session:parent',
          inherited: parsed.candidates === null,
        }
        if (mode === 'unknown' && attempts.length === 1) throw new CommandError('DISCONNECTED', 'Unknown result')
        return snapshot
      },
    },
    surfaces: { canRender: () => true },
  })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
  const target = { instanceId: panel.instanceId, parentSessionId: session.id }
  await runtime.view.commands.execute('agentPolicy.load', target)
  return { runtime, target, attempts }
}

test('policy draft uses stable row targets, validates capacity and saves explicit weighted candidates', async () => {
  const f = await fixture()
  try {
    await f.runtime.view.commands.execute('agentPolicy.add', f.target)
    const row = f.runtime.view.state.agentPolicies.getSnapshot().entries.parent!.rows[0]!
    for (const [field, value] of [
      ['difficulty', 'complex'],
      ['modelId', 'model'],
      ['thinkingLevel', 'max'],
      ['weight', '200'],
    ] as const)
      await f.runtime.view.commands.execute('agentPolicy.change', { ...f.target, rowId: row.id, field, value })
    await f.runtime.view.commands.execute('agentPolicy.save', f.target)
    expect(f.attempts[0]?.input).toMatchObject({
      candidates: [{ difficulty: 'complex', modelId: 'model', thinkingLevel: 'max', weight: 200 }],
    })
    expect(f.runtime.view.state.agentPolicies.getSnapshot().entries.parent?.dirty).toBe(false)
    const stale = await f.runtime.view.commands
      .execute('agentPolicy.change', { ...f.target, rowId: row.id, field: 'weight', value: '1' })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(stale).toMatchObject({ code: 'STALE_TARGET' })
    for (let index = 1; index < 32; index++) await f.runtime.view.commands.execute('agentPolicy.add', f.target)
    const over = await f.runtime.view.commands.execute('agentPolicy.add', f.target).then(
      () => null,
      (error: unknown) => error,
    )
    expect(over).toMatchObject({ code: 'CAPACITY_EXCEEDED' })
    expect(f.runtime.view.state.agentPolicies.getSnapshot().entries.parent?.rows).toHaveLength(32)
    const ids = f.runtime.view.state.agentPolicies.getSnapshot().entries.parent!.rows.map((value) => value.id)
    expect(new Set(ids).size).toBe(32)
    await f.runtime.view.commands.execute('agentPolicy.remove', { ...f.target, rowId: ids[0]! })
    expect(f.runtime.view.state.agentPolicies.getSnapshot().entries.parent?.rows[0]?.id).toBe(ids[1])
  } finally {
    f.runtime.dispose()
  }
})

for (const mode of ['unknown', 'conflict'] as const)
  test(`policy ${mode} preserves the draft and reconciles the exact save`, async () => {
    const f = await fixture(mode)
    try {
      await f.runtime.view.commands.execute('agentPolicy.save', f.target).then(
        () => null,
        () => null,
      )
      expect(f.runtime.view.state.agentPolicies.getSnapshot().entries.parent?.status).toBe(
        mode === 'unknown' ? 'unknown' : 'error',
      )
      if (mode === 'unknown') {
        const blocked = await f.runtime.view.commands.execute('agentPolicy.add', f.target).then(
          () => null,
          (error: unknown) => error,
        )
        expect(blocked).toMatchObject({ code: 'BUSY' })
      } else await f.runtime.view.commands.execute('agentPolicy.load', f.target)
      await f.runtime.view.commands.execute('agentPolicy.save', f.target)
      expect(f.attempts).toHaveLength(2)
      if (mode === 'unknown') expect(f.attempts[1]).toEqual(f.attempts[0])
      else expect(f.attempts[1]?.input).toMatchObject({ baselineRevisions: { session: 1 } })
      expect(f.runtime.view.state.agentPolicies.getSnapshot().entries.parent?.status).toBe('ready')
      await f.runtime.view.commands.execute('agentPolicy.save', { ...f.target, inherit: true })
      expect(f.runtime.view.state.agentPolicies.getSnapshot().entries.parent?.snapshot?.inherited).toBe(true)
    } finally {
      f.runtime.dispose()
    }
  })

test('policy surface renders Chinese and long Host copy, empty and boundary rows without embedded sample models', async () => {
  const f = await fixture()
  const copy = getShellCopy('zh-CN').agents
  const render = () =>
    renderToStaticMarkup(
      <HbarRuntimeProvider view={f.runtime.view}>
        <AgentPolicyEditor
          {...f.target}
          labels={{ ...copy.policy, title: `${copy.policy.title} — 非常长的策略标题用于窄屏换行边界验证` }}
          modelLabels={copy.modelPicker}
          catalog={{ status: 'ready', models: [], error: null }}
          connected
          refreshModels={() => {}}
        />
      </HbarRuntimeProvider>,
    )
  try {
    expect(render()).toContain(copy.policy.empty)
    for (let index = 0; index < 32; index++) await f.runtime.view.commands.execute('agentPolicy.add', f.target)
    const html = render()
    expect(html).toContain('非常长的策略标题')
    expect(html).toContain(copy.policy.unsaved)
    expect(html.match(/hbar-agent-policy-row"/g)).toHaveLength(32)
    expect(html).toContain('移除候选 32')
    expect(html).not.toContain('gpt-6')
  } finally {
    f.runtime.dispose()
  }
})

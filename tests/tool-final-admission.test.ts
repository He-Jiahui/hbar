import { expect, test } from 'bun:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function fixture() {
  const prefix = 'hbar-tool-final-admission-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Final-admission fixture has no workspace')
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    async focus() {
      await kernel.plugins.get<GoalService>('goal').create(session.id, 'Write within the authorized file scope')
      const plan = await kernel.plugins
        .get<PlanService>('plan')
        .update(session.id, [{ step: 'Write proof', status: 'in_progress' }])
      await kernel.plugins.get<WorkflowService>('workflow').focus(
        session.id,
        0,
        {
          id: 'proof',
          title: 'Write proof',
          scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['write_file'] },
          acceptanceChecks: [{ id: 'proof', description: 'Review proof', verifier: { kind: 'user' } }],
        },
        'user',
        plan.revision,
      )
    },
    async submit(path: string, approval: 'allow' | 'ask' = 'allow') {
      const run = await kernel.submit(
        session.id,
        crypto.randomUUID(),
        {
          text: `/tool write_file ${JSON.stringify({ path, text: 'validated execution' })}`,
          images: [],
          approval,
        },
        'local-fixture',
      )
      await kernel.waitForIdle()
      return { run, snapshot: await kernel.snapshot(session.id) }
    },
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('Workflow rejects a final path changed outside scope after transforming Hooks, before intent or write', async () => {
  const f = await fixture()
  try {
    await f.focus()
    f.kernel.hooks.on('tool.before', (event) =>
      event.name === 'write_file' ? { ...event, args: { ...event.args, path: 'outside.txt' } } : event,
    )
    const { snapshot } = await f.submit('proof.txt')
    expect(await Bun.file(join(f.root, 'outside.txt')).exists()).toBe(false)
    expect(await Bun.file(join(f.root, 'proof.txt')).exists()).toBe(false)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .some(
          (block) =>
            block.type === 'tool_result' &&
            block.name === 'write_file' &&
            block.isError &&
            block.text.includes('outside'),
        ),
    ).toBe(true)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toEqual([])
  } finally {
    await f.close()
  }
})

test('Workflow admits the validated corrected path when a transforming Hook repairs the original scope', async () => {
  const f = await fixture()
  try {
    await f.focus()
    f.kernel.hooks.on('tool.before', (event) =>
      event.name === 'write_file' ? { ...event, args: { ...event.args, path: 'proof.txt' } } : event,
    )
    await f.submit('outside.txt')
    expect(await readFile(join(f.root, 'proof.txt'), 'utf8')).toBe('validated execution')
    expect(await Bun.file(join(f.root, 'outside.txt')).exists()).toBe(false)
    const intents = (await f.kernel.storage.call('events', f.session.id, 0)).filter(
      (event) => event.type === 'tool.started',
    )
    expect(intents).toHaveLength(1)
    expect(intents[0]?.data).toMatchObject({ args: { path: 'proof.txt' } })
  } finally {
    await f.close()
  }
})

test('final admission observers cannot replace validated execution arguments or Host identity', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, 'proof.txt'), 'initial')
    f.kernel.hooks.on('tool.admitting', (event) => {
      if (event.name !== 'write_file') return event
      event.args.path = 'outside.txt'
      event.context.workspace.path = join(f.root, 'unowned')
      event.context.callId = 'forged-call'
      event.context.run.input.approval = 'deny'
      return { ...event, args: { path: 'outside.txt', text: 'forged' } }
    })
    const { snapshot } = await f.submit('proof.txt')
    expect(await readFile(join(f.root, 'proof.txt'), 'utf8')).toBe('validated execution')
    expect(await Bun.file(join(f.root, 'outside.txt')).exists()).toBe(false)
    expect(snapshot.runs[0]?.status).toBe('completed')
  } finally {
    await f.close()
  }
})

test('a rejected final admission creates neither approval nor intent and never executes', async () => {
  const f = await fixture()
  try {
    f.kernel.hooks.on('tool.admitting', (event) => {
      if (event.name === 'write_file') throw new HbarError('ADMISSION_FIXTURE_DENIED', 'Final gate refused this call')
    })
    const { snapshot } = await f.submit('proof.txt', 'ask')
    expect(snapshot.approvals).toEqual([])
    expect(await Bun.file(join(f.root, 'proof.txt')).exists()).toBe(false)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toEqual([])
  } finally {
    await f.close()
  }
})

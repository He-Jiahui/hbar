import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { userInputAutomaticDecisionSchema } from '@hbar/contracts'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function until<Result>(read: () => Promise<Result | undefined>): Promise<Result> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const result = await read()
    if (result !== undefined) return result
    if (Date.now() >= deadline) throw new Error('Managed question did not reach its expected boundary')
    await Bun.sleep(10)
  }
}

test('owned Plan questions preserve purpose across IPC, audit recommended decisions and wait for human facts', async () => {
  const prefix = 'hbar-managed-input-decisions-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  try {
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected managed question workspace')
    const session = await runtime.storage.call('createSession', workspace.id)
    await runtime.kernel.automationSet(session.id, true)
    const question = {
      id: 'scope',
      header: 'Scope',
      question: 'Which scope?',
      options: [
        { label: 'App', description: 'Cover the app.', recommended: true },
        { label: 'API', description: 'Cover the API.' },
      ],
    }
    const submit = (purpose: 'decision' | 'fact') =>
      runtime.kernel.submit(
        session.id,
        crypto.randomUUID(),
        {
          text: `/tool request_user_input ${JSON.stringify({ questions: [{ ...question, purpose }] })}`,
          images: [],
        },
        'local-fixture',
      )
    const automatic = await submit('decision')
    await runtime.waitForIdle()
    const audit = (await runtime.storage.call('events', session.id, 0, 2_000)).filter(
      (event) => event.type === 'user_input.autoDecided',
    )
    expect(audit).toHaveLength(1)
    expect(userInputAutomaticDecisionSchema.parse(audit[0]?.data)).toMatchObject({
      request: { runId: automatic.id, questions: [{ purpose: 'decision' }] },
      response: { answers: { scope: { answers: ['App'] } } },
    })
    const manual = await submit('fact')
    const pending = await until(async () =>
      (await runtime.kernel.snapshot(session.id)).userInputs.find((request) => request.runId === manual.id),
    )
    expect(pending.questions[0]?.purpose).toBe('fact')
    expect(await runtime.kernel.resolveUserInput(pending.requestId, { scope: { answers: ['API'] } })).toBe(true)
    await runtime.waitForIdle()
    const snapshot = await runtime.kernel.snapshot(session.id)
    const answer = snapshot.messages
      .filter((message) => message.runId === manual.id)
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
    expect(answer?.type === 'tool_result' ? JSON.parse(answer.text) : null).toEqual({
      answers: { scope: { answers: ['API'] } },
    })
    expect(snapshot.userInputs).toHaveLength(0)
    expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    await runtime.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)

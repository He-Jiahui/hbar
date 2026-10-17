import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import type { ApprovalMode } from '@hbar/contracts'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const cases = [
  ['browser.status', {}],
  ['browser.navigate', { url: 'https://fixture.invalid/' }],
  ['browser.snapshot', {}],
  ['browser.click', { selector: '#button' }],
  ['browser.type', { selector: '#field', text: 'hello' }],
  ['browser.press', { key: 'Enter' }],
  ['browser.screenshot', {}],
  ['browser.evaluate', { expression: '2' }],
  ['browser.close', {}],
  ['browser.history', {}],
  ['computer.status', {}],
  ['computer.screenshot', {}],
  ['computer.click', { x: 1, y: 2 }],
  ['computer.doubleClick', { x: 1, y: 2 }],
  ['computer.type', { text: 'hello' }],
  ['computer.key', { key: 'Enter' }],
  ['computer.scroll', { deltaY: 2 }],
  ['computer.move', { x: 1, y: 2 }],
  ['computer.wait', { milliseconds: 1 }],
  ['computer.launch', { appId: 'fixture-app' }],
] satisfies Array<[string, Record<string, unknown>]>

test('managed interaction commands preserve original actor, Session, native effects and physical receipts without a UI', async () => {
  const prefix = 'hbar-managed-command-interaction-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profileModule: join(process.cwd(), 'tests/fixtures/interaction-command-profile.ts'),
    })
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    const device = await host.auth.createDevice('Interaction command owner')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    const workspace = (await runtime.storage.call('workspaces'))[0]!
    const session = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: 'interaction-session' },
    )
    const current = runtime
    const runs = createRunCommandClient(client)
    async function batch(approval: ApprovalMode, values = cases) {
      const calls = values.map(([commandId, input]) => ({
        commandId,
        input,
        commandVersion: 1,
        operationKey: crypto.randomUUID(),
      }))
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId: session.id,
          modelId: 'local-fixture',
          input: { text: JSON.stringify(calls), images: [], approval, mode: 'default' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await current.waitForIdle()
      const snapshot = await current.kernel.snapshot(session.id)
      expect(snapshot.runs.find((run) => run.id === accepted.operationId)?.status).toBe('completed')
      const result = snapshot.messages
        .filter((message) => message.runId === accepted.operationId && message.role === 'assistant')
        .flatMap((message) => message.content)
        .find((block) => block.type === 'text')
      if (!result || result.type !== 'text') throw new Error('Interaction fixture batch returned no result')
      return {
        calls,
        runId: accepted.operationId,
        results: z
          .array(z.object({ isError: z.boolean().optional(), text: z.string() }))
          .parse(JSON.parse(result.text)),
      }
    }
    const allowed = await batch('allow')
    expect(allowed.results).toHaveLength(20)
    for (const [index, result] of allowed.results.entries()) {
      expect({
        commandId: allowed.calls[index]?.commandId,
        error: result.isError,
        message: result.isError ? result.text : undefined,
      }).toEqual({ commandId: allowed.calls[index]?.commandId, error: false, message: undefined })
      expect(JSON.parse(result.text)).toMatchObject({ status: 'succeeded', physical: 'succeeded', acknowledged: true })
      const receipt = await current.storage.call('commandExecutionRead', {
        sessionId: session.id,
        actorId: device.device.id,
        operationKey: allowed.calls[index]!.operationKey,
      })
      expect(receipt).toMatchObject({
        actorId: device.device.id,
        runId: allowed.runId,
        physical: { status: 'succeeded' },
        invocation: { input: { sessionId: session.id } },
      })
    }
    const denied = await batch('deny')
    expect(denied.results).toHaveLength(20)
    for (const [index, result] of denied.results.entries()) {
      const readable = denied.calls[index]?.commandId === 'computer.status'
      expect(result.isError).toBe(!readable)
      const receipt = await current.storage.call('commandExecutionRead', {
        sessionId: session.id,
        actorId: device.device.id,
        operationKey: denied.calls[index]!.operationKey,
      })
      if (!readable) expect(receipt).toBeNull()
    }
    const borrowed = await batch('allow', [['browser.status', { sessionId: 'another-session' }]])
    expect(borrowed.results[0]?.isError).toBe(true)
    expect(borrowed.results[0]?.text).toContain('original Session')
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    client?.disconnect()
    await host?.close()
    await runtime?.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)

import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunCommandClient } from '@hbar/client'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { removeOwnedTestDirectory } from '../tests/owned-temp-directory'

test('a real browser publishes one restored runtime and Session commands change its actual sidebar', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const prefix = 'hbar-web-client-command-e2e-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      fixture: 'client-commands',
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
    })
    const current = host
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const entry = page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })
    await expect(entry).toBeVisible()
    await entry.click()
    await expect.poll(async () => (await current.client.call('command.client.list', {})).items.length).toBe(1)
    const published = (await current.client.call('command.client.list', {})).items[0]
    if (!published) throw new Error('The browser did not publish its actual runtime')
    const original = published
    expect(original.clientId).toMatch(/^web:/)
    expect(original.commands).toHaveLength(7)
    expect(original.commands).not.toContain('app.openWindow')
    const runs = createRunCommandClient(host.client)
    async function sidebar(visible: boolean, target = original) {
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId: current.ready.sessionId,
          modelId: 'local-fixture',
          input: {
            text: JSON.stringify([
              {
                commandId: 'app.setSidebarVisible',
                commandVersion: 1,
                operationKey: crypto.randomUUID(),
                input: { visible },
                target: { clientId: target.clientId, generation: target.generation },
              },
            ]),
            images: [],
            approval: 'allow',
            mode: 'default',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await current.client.call('session.snapshot', { sessionId: current.ready.sessionId })).runs.find(
              (run) => run.id === accepted.operationId,
            )?.status,
        )
        .toBe('completed')
      const snapshot = await current.client.call('session.snapshot', { sessionId: current.ready.sessionId })
      const output = snapshot.messages
        .filter((message) => message.runId === accepted.operationId && message.role === 'assistant')
        .flatMap((message) => message.content)
        .find((block) => block.type === 'text')
      if (!output || output.type !== 'text') throw new Error('The client command returned no fixture result')
      return z
        .object({ results: z.array(z.object({ text: z.string(), isError: z.boolean().optional() })) })
        .parse(JSON.parse(output.text)).results[0]
    }
    expect((await sidebar(false))?.isError).toBe(false)
    await expect(entry).not.toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('sidebar-hidden.png'), fullPage: true })
    expect((await sidebar(true))?.isError).toBe(false)
    await expect(entry).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('sidebar-restored.png'), fullPage: true })
    await page.reload()
    await expect(entry).toBeVisible()
    await expect
      .poll(async () => {
        const targets = (await current.client.call('command.client.list', {})).items
        return targets.length === 1 && targets[0]?.clientId !== original.clientId
      })
      .toBe(true)
    expect((await sidebar(false))?.isError).toBe(true)
    await expect(entry).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedTestDirectory(root, prefix)
  }
})

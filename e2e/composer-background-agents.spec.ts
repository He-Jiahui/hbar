import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith('hbar-composer-background-'))
    throw new Error('Refusing to remove an unexpected background Agent fixture')
  await rm(exact, { recursive: true, force: true })
}

test('composer stops its captured background Agents without replacing Send or cancelling another session', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-composer-background-'))
  const context = await browser.newContext({
    locale: 'zh-CN',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
  })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const agents = createAgentCommandClient(host.client)
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const parent = host.ready.sessionId
    const other = await sessions.execute(
      'session.create',
      { workspaceId: host.ready.workspaceId, title: '其他会话 · 不可取消其后台任务' },
      { idempotencyKey: crypto.randomUUID() },
    )
    const createWaiting = async (parentSessionId: string, title: string, path: string) => {
      const item = await agents.execute(
        'agent.create',
        {
          parentSessionId,
          title,
          modelId: 'local-fixture',
          approval: 'ask',
          objective: `/tool write_file ${JSON.stringify({ path, text: 'Never approve this fixture write.' })}`,
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await agents.execute('agent.result.get', { parentSessionId, agentId: item.agentId })).status)
        .toBe('waiting_approval')
      return item
    }
    const first = await createWaiting(parent, '后台核对一', 'first.txt')
    const second = await createWaiting(parent, '后台核对二', 'second.txt')
    const foreign = await createWaiting(other.id, '其他会话后台核对', 'foreign.txt')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const copy = getShellCopy('zh-CN')
    const labels = copy.session.backgroundAgents
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const envelope = z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        params: z
          .object({
            commandId: z.string().optional(),
            input: z.object({ agentId: z.string().optional() }).passthrough().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
    const sentCancels: string[] = []
    const cancelRequests = new Map<string | number, string>()
    let hold = true
    let lose = false
    let release: (() => void) | undefined
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.params?.commandId === 'agent.cancel' && parsed.data.id !== undefined) {
            const id = parsed.data.params.input?.agentId
            if (id) {
              sentCancels.push(id)
              cancelRequests.set(parsed.data.id, id)
            }
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.id !== undefined && cancelRequests.has(parsed.data.id)) {
            cancelRequests.delete(parsed.data.id)
            if (lose) {
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Owned fixture lost cancellation response', data: 'DISCONNECTED' },
                }),
              )
              return
            }
            if (hold) {
              hold = false
              release = () => socket.send(message)
              return
            }
          }
        }
        socket.send(message)
      })
    })
    await page.goto(base)
    const open = (title: string) => page.getByRole('treeitem', { name: title, exact: true }).click()
    await open(host.ready.sessionTitle)
    const composer = page.locator('.lumen-prompt-composer')
    const input = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const send = composer.getByRole('button', { name: copy.session.prompt.send, exact: true })
    const backgroundStop = composer.locator('.hbar-composer-background-stop')
    const draft = '后台任务运行时继续输入；切回来后必须保留。'
    await expect(input).toBeEditable()
    await input.pressSequentially(draft)
    await expectComposerText(input, draft)
    await expect(send).toBeEnabled()
    await expect(composer.getByRole('button', { name: copy.session.prompt.stop, exact: true })).toHaveCount(0)
    await expect(backgroundStop).toHaveAccessibleName(labels.stop(2))
    await expect(backgroundStop).toHaveAttribute('type', 'button')
    await expect(backgroundStop).toHaveCSS('background-color', 'rgb(183, 53, 72)')
    expect((await host.client.call('session.snapshot', { sessionId: parent })).runs).toHaveLength(0)
    await page.screenshot({ path: info.outputPath('background-stop-alongside-send-1440.png') })
    await page.setViewportSize({ width: 320, height: 900 })
    await expect(backgroundStop).toBeEnabled()
    const [stopBox, sendBox] = await Promise.all([backgroundStop.boundingBox(), send.boundingBox()])
    expect(stopBox).not.toBeNull()
    expect(sendBox).not.toBeNull()
    expect(stopBox!.x + stopBox!.width <= sendBox!.x + 1 || stopBox!.y + stopBox!.height <= sendBox!.y + 1).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
    await page.screenshot({ path: info.outputPath('background-stop-alongside-send-320.png') })
    await backgroundStop.focus()
    await page.keyboard.press('Space')
    await expect.poll(() => Boolean(release)).toBe(true)
    await expect(backgroundStop).toBeDisabled()
    await expect(send).toBeEnabled()
    await expectComposerText(input, draft)
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await open(other.title)
    release?.()
    for (const item of [first, second])
      await expect
        .poll(
          async () =>
            (await agents.execute('agent.result.get', { parentSessionId: parent, agentId: item.agentId })).status,
        )
        .toBe('cancelled')
    expect(
      (await agents.execute('agent.result.get', { parentSessionId: other.id, agentId: foreign.agentId })).status,
    ).toBe('waiting_approval')
    expect(sentCancels.sort()).toEqual([first.agentId, second.agentId].sort())
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await open(host.ready.sessionTitle)
    await expectComposerText(input, draft)
    await expect(send).toBeEnabled()
    await expect(backgroundStop).toHaveCount(0)

    // A lost response is not permission to cancel newly arriving Agents.
    const original = await createWaiting(parent, '停止结果待核对', 'unknown.txt')
    await expect(backgroundStop).toHaveAccessibleName(labels.stop(1))
    await expect(backgroundStop).toBeEnabled()
    lose = true
    await backgroundStop.click()
    await expect.poll(() => sentCancels.includes(original.agentId)).toBe(true)
    await composer.locator('.hbar-composer-feedback-trigger').scrollIntoViewIfNeeded()
    await composer.locator('.hbar-composer-feedback-trigger').click()
    const feedback = page
      .getByRole('dialog', { name: copy.session.composerFeedback.title, exact: true })
      .locator('.hbar-composer-background-feedback')
    await expect(feedback).toHaveAttribute('data-state', 'unknown')
    await expect(feedback).toContainText(labels.unknown)
    const newcomer = await createWaiting(parent, '稍后创建 · 不属于原停止请求', 'newcomer.txt')
    const sentBeforeCheck = [...sentCancels]
    lose = false
    await feedback.getByRole('button', { name: labels.reconcile, exact: true }).click()
    await expect(feedback).toHaveAttribute('data-state', 'settled')
    expect(sentCancels).toEqual(sentBeforeCheck)
    expect(sentCancels).toContain(original.agentId)
    expect(sentCancels).not.toContain(newcomer.agentId)
    expect(
      (await agents.execute('agent.result.get', { parentSessionId: parent, agentId: newcomer.agentId })).status,
    ).toBe('waiting_approval')
    await expect(send).toBeEnabled()
    await expectComposerText(input, draft)
    await page.screenshot({ path: info.outputPath('background-original-result-checked-320.png') })
    for (const path of ['first.txt', 'second.txt', 'foreign.txt', 'unknown.txt', 'newcomer.txt'])
      await expect(access(join(root, path))).rejects.toThrow()
    expect((await host.client.call('session.snapshot', { sessionId: parent })).runs).toHaveLength(0)
    await send.click()
    await expect
      .poll(async () => {
        const snapshot = await host!.client.call('session.snapshot', { sessionId: parent })
        return snapshot.runs.filter((run) => run.input.text === draft && run.status === 'completed').length
      })
      .toBe(1)
    await expectComposerText(input, '')
    await input.pressSequentially('主运行已结束，后台任务仍可单独停止。')
    await expect(backgroundStop).toHaveAccessibleName(labels.stop(1))
    await expect(backgroundStop).toBeEnabled()
    await expect(send).toBeEnabled()
    expect(
      (await agents.execute('agent.result.get', { parentSessionId: parent, agentId: newcomer.agentId })).status,
    ).toBe('waiting_approval')
    expect(errors).toEqual([])
  } finally {
    try {
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await cleanupFixture(root)
      }
    }
  }
})

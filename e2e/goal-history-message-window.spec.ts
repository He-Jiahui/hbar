import { expect, test, type Page } from '@playwright/test'
import { HbarClient, createGoalPlanCommandClient } from '@hbar/client'
import { goalHistoryFactSchema } from '@hbar/contracts/commands/goal-history'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'

const readySchema = z.object({
  token: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionTitle: z.string().min(1),
  facts: z.array(goalHistoryFactSchema),
  messages: z.array(z.object({ id: z.string(), seq: z.number().int(), text: z.string() })),
  runId: z.string(),
  emptyInputId: z.string(),
  outputId: z.string(),
  cursor: z.number().int(),
})
const rpc = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({
        commandId: z.string().optional(),
        input: z.object({ beforeSeq: z.number().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
function bunExecutable() {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun executable is unavailable for the Goal window fixture')
  return executable
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill()
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5000))])
  if (child.exitCode === null) child.kill('SIGKILL')
}
async function cleanup(root: string) {
  const path = resolve(root)
  if (dirname(path) !== resolve(tmpdir()) || !basename(path).startsWith('hbar-goal-message-window-'))
    throw new Error('Refusing to remove an unexpected Goal window fixture path')
  await rm(path, { recursive: true, force: true })
}
async function collect(
  page: Page,
  messages: readonly { id: string; seq: number; text: string }[],
  continuation: { runId: string; emptyInputId: string },
) {
  const viewport = page.locator('.lumen-conversation-messages')
  const seen = new Map<string, { kind: string; seq: number | null; text: string }>()
  const byMessage = new Map(messages.map((message) => [message.id, message.seq]))
  // A downward gesture cancels initial/follow-latest measurement corrections
  // without requesting an older page. Read the loaded window only after its
  // first virtual row has actually rendered at the requested position.
  await viewport.hover()
  await page.mouse.wheel(0, 1)
  await expect
    .poll(() =>
      viewport.evaluate(async (node) => {
        node.scrollTo({ top: 0 })
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return node.scrollTop < 1 && node.querySelector('[data-index="0"]') !== null
      }),
    )
    .toBe(true)
  for (let step = 0; step < 150; step += 1) {
    const visible = await page
      .locator('[data-message-id], [data-goal-event-id], [data-goal-continuation-run]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const goal = node.getAttribute('data-goal-event-id')
          const run = node.getAttribute('data-goal-continuation-run')
          return {
            id: goal ?? run ?? node.getAttribute('data-message-id') ?? '',
            kind: goal ? 'goal' : run ? 'continuation' : 'message',
            seq: goal ? Number(node.getAttribute('data-goal-seq')) : null,
            text: node.textContent ?? '',
          }
        }),
      )
    const continuationRows = visible.filter((item) => item.kind === 'continuation')
    expect(continuationRows).toHaveLength(new Set(continuationRows.map((item) => item.id)).size)
    for (const item of visible)
      seen.set(`${item.kind}:${item.id}`, {
        kind: item.kind,
        seq: item.seq ?? byMessage.get(item.id === continuation.runId ? continuation.emptyInputId : item.id) ?? null,
        text: item.text,
      })
    const complete = await viewport.evaluate(async (node) => {
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 1) return true
      node.scrollBy({ top: Math.max(1, node.clientHeight / 2) })
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      return false
    })
    if (complete) return seen
  }
  throw new Error('Conversation scroll did not finish within its test bound')
}

async function loadEarlier(page: Page) {
  const viewport = page.locator('.lumen-conversation-messages')
  await viewport.hover()
  const distance = await viewport.evaluate((node) => node.scrollHeight + node.clientHeight)
  await page.mouse.wheel(0, -distance)
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`message pagination restores canonical Goal facts without crossing unread windows: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-message-window-'))
    const context = await browser.newContext({ locale })
    const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 44915)
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44917}`
    const child = spawn(bunExecutable(), ['e2e/support/goal-history-message-host.ts'], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HBAR_GOAL_WINDOW_ROOT: root,
        HBAR_E2E_HOST_PORT: String(port),
        HBAR_GOAL_WINDOW_ORIGIN: base,
      },
    })
    let client: HbarClient | undefined
    let errors = ''
    child.stderr?.on('data', (chunk) => {
      errors += String(chunk)
    })
    try {
      if (!child.stdout) throw new Error('Missing fixture stdout')
      const output = createInterface({ input: child.stdout })
      const ready = await new Promise<z.output<typeof readySchema>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Goal window Host startup timed out: ${errors}`)), 60_000)
        output.on('line', (line) => {
          try {
            const value = readySchema.safeParse(JSON.parse(line))
            if (value.success) {
              clearTimeout(timeout)
              resolve(value.data)
            }
          } catch {
            /* Ignore non-protocol startup diagnostics. */
          }
        })
        child.once('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`Goal window Host exited ${code}: ${errors}`))
        })
        child.once('error', (reason) => {
          clearTimeout(timeout)
          reject(reason)
        })
      })
      output.close()
      client = new HbarClient(`http://127.0.0.1:${port}`, ready.token)
      await client.connect()
      const copy = getShellCopy(locale)
      const goals = createGoalPlanCommandClient(client)
      const authoritativeGoal = (await goals.execute('goal.get', { sessionId: ready.sessionId })).goal
      expect(authoritativeGoal?.objective).toBe('Current different objective — 当前不同目标')
      expect(ready.facts).toHaveLength(108)
      expect((await client.call('session.snapshot', { sessionId: ready.sessionId, limit: 200 })).messages).toHaveLength(
        142,
      )
      expect((await context.request.post(`${base}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      let failNextOlder = false
      let failures = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
          if (
            parsed?.success &&
            parsed.data.params?.commandId === 'goal.history' &&
            parsed.data.params.input?.beforeSeq !== undefined &&
            failNextOlder
          ) {
            failNextOlder = false
            failures += 1
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Injected Goal-only read failure', data: 'READ_FAILED' },
              }),
            )
          } else server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      await page.goto(base)
      await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
      const list = page.locator('[data-hbar-app-ui-list-strategy="virtualized"]')
      // Run boundaries belong to status; only the sixty actual messages occupy this window.
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '60')
      await expect(page.locator('[data-goal-event-id]')).toHaveCount(0)
      const firstWindow = await collect(page, ready.messages, ready)
      expect([...firstWindow.values()].filter((item) => item.kind === 'goal')).toEqual([])
      expect(firstWindow.has('message:fixture-message-81')).toBe(true)
      expect(firstWindow.has('message:fixture-message-80')).toBe(false)
      await expect(page.locator('.hbar-session-current-goal')).toContainText('Current different objective')
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Unsent source draft — 原会话未发送草稿'
      await prompt.fill(draft)
      failNextOlder = true
      await loadEarlier(page)
      await expect(page.locator('[data-goal-history-gap="error"]')).toBeVisible()
      expect(failures).toBe(1)
      const partial = await collect(page, ready.messages, ready)
      expect(partial.has('message:fixture-message-23')).toBe(true)
      expect(partial.has(`message:${ready.emptyInputId}`)).toBe(false)
      expect(partial.has(`continuation:${ready.runId}`)).toBe(false)
      expect(partial.has(`message:${ready.outputId}`)).toBe(true)
      const firstFact = ready.facts[0]
      if (!firstFact) throw new Error('Missing oldest Goal fact')
      expect(partial.has(`goal:${firstFact.eventId}`)).toBe(false)
      const countBeforeRecovery = await list.getAttribute('data-hbar-app-ui-message-count')
      await page.getByRole('button', { name: copy.session.goalHistory.refresh, exact: true }).click()
      await expect(page.locator('[data-goal-history-gap]')).toHaveCount(0)
      const recovered = await collect(page, ready.messages, ready)
      expect(recovered.has('message:fixture-message-23')).toBe(true)
      expect(recovered.has(`goal:${firstFact.eventId}`)).toBe(false)
      expect(Number(await list.getAttribute('data-hbar-app-ui-message-count'))).toBeGreaterThanOrEqual(
        Number(countBeforeRecovery),
      )
      await loadEarlier(page)
      await expect(page.getByRole('button', { name: copy.session.loadOlder, exact: true })).toHaveCount(0)
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '249')
      const all = await collect(page, ready.messages, ready)
      expect(all.has('message:fixture-message-1')).toBe(true)
      expect(all.has('message:fixture-message-140')).toBe(true)
      const goalFacts = [...all].filter(([key]) => key.startsWith('goal:'))
      expect(goalFacts.map(([key, value]) => ({ id: key.slice(5), seq: value.seq }))).toEqual(
        ready.facts.map((fact) => ({ id: fact.eventId, seq: fact.seq })),
      )
      expect(all.get(`goal:${firstFact.eventId}`)?.text).toContain('Historical original objective')
      expect(all.get(`goal:${firstFact.eventId}`)?.text).not.toContain('Current different objective')
      const ordered = [...all.values()].filter((item) => item.seq !== null).map((item) => item.seq)
      expect(ordered).toEqual([...ordered].sort((left, right) => (left ?? 0) - (right ?? 0)))
      expect([...all.keys()].filter((key) => key === `continuation:${ready.runId}`)).toHaveLength(0)
      expect(all.has(`message:${ready.emptyInputId}`)).toBe(false)
      await expect(prompt).toHaveText(draft)
      const saved = await client.call('session.snapshot', { sessionId: ready.sessionId, limit: 200 })
      expect(saved.runs.find((run) => run.id === ready.runId)?.input).toMatchObject({ source: 'goal', text: '' })
      expect(saved.messages.find((message) => message.id === ready.emptyInputId)?.content).toEqual([
        { type: 'text', text: '' },
      ])
      await mkdir('artifacts/goal-lifecycle/message-window', { recursive: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await page.locator('.lumen-conversation-messages').evaluate((node) => node.scrollTo({ top: 0 }))
        await expect(page.locator(`[data-goal-event-id="${firstFact.eventId}"]`)).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/goal-lifecycle/message-window/${locale}-${width}.png` })
      }
      expect(pageErrors).toEqual([])
    } finally {
      client?.disconnect()
      await context.close()
      await stop(child)
      await cleanup(root)
    }
  })
}

import { expect, test } from '@playwright/test'
import { createBudgetCommandClient } from '@hbar/client'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { usageFeatureCopy } from '../apps/web/src/usage-feature-copy'
import { expectComposerText } from './support/composer-text'
import { removeOwnedTempDirectory } from './support/owned-temp-directory'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpc = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({
        commandId: z.string().optional(),
        input: z.object({ sessionId: z.string().optional(), tokens: z.number().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
const reply = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    error: z.object({ message: z.string(), data: z.unknown().optional() }).optional(),
  })
  .passthrough()
for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`actual Host budget failure recovery retains the original draft and session ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-usage-feedback-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4408),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4407}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      const writes: { readonly sessionId: string | undefined; readonly tokens: number | undefined }[] = []
      const writeIds = new Set<string | number>()
      const writeReplies: { readonly message: string | null; readonly code: string | null }[] = []
      let rejectNextWrite = true
      page.on('pageerror', (error) => errors.push(error.message))
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          const parsed = typeof message === 'string' ? rpc.safeParse(JSON.parse(message)) : null
          if (parsed?.success && parsed.data.params?.commandId === 'session.setBudget') {
            writes.push({ sessionId: parsed.data.params.input?.sessionId, tokens: parsed.data.params.input?.tokens })
            if (rejectNextWrite) {
              rejectNextWrite = false
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Owned write rejected before dispatch', data: 'COMMAND_CONFLICT' },
                }),
              )
              return
            }
            if (parsed.data.id !== undefined) writeIds.add(parsed.data.id)
          }
          server.send(message)
        })
        server.onMessage((message) => {
          const parsed = typeof message === 'string' ? reply.safeParse(JSON.parse(message)) : null
          if (parsed?.success && parsed.data.id !== undefined && writeIds.delete(parsed.data.id)) {
            const code = parsed.data.error?.data
            writeReplies.push({
              message: parsed.data.error?.message ?? null,
              code: typeof code === 'string' ? code : null,
            })
          }
          socket.send(message)
        })
      })
      const copy = getShellCopy(locale)
      const labels = usageFeatureCopy(locale).budget
      await page.goto(base)
      const session = page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })
      await session.focus()
      await page.keyboard.press('Enter')
      const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Original usage inspection draft — 保留原输入'
      await composer.click()
      await expect(composer).toBeFocused()
      await page.keyboard.insertText(draft)
      await expectComposerText(composer, draft)
      await page.getByRole('button', { name: copy.shell.status, exact: true }).click()
      const status = page.locator('.hbar-app-react-status-workspace')
      await status
        .getByRole('navigation', { name: copy.status.tabs, exact: true })
        .getByRole('button', { name: copy.status.sections.usage, exact: true })
        .click()
      const budget = status
        .locator('.hbar-usage-feedback')
        .filter({ has: page.getByRole('heading', { name: labels.title, exact: true }) })
      const cap = budget.getByRole('spinbutton', { name: labels.cap, exact: true })
      await expect(cap).toBeEnabled()
      const budgetClient = createBudgetCommandClient(host.client)
      const originalSessionId = host.ready.sessionId
      const original = await budgetClient.execute('session.getBudget', { sessionId: originalSessionId })
      const rejectedTokens = (original?.limit ?? 0) + 1000
      const savedTokens = (original?.limit ?? 0) + 2000
      await page.setViewportSize({ width: 320, height: 1000 })
      await cap.fill(String(rejectedTokens))
      await budget.getByRole('button', { name: labels.save, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(budget.getByRole('alert')).toHaveText(labels.error('COMMAND_CONFLICT'))
      await expect(cap).toHaveValue(String(rejectedTokens))
      expect(await budgetClient.execute('session.getBudget', { sessionId: host.ready.sessionId })).toEqual(original)
      await budget.getByRole('button', { name: labels.retry, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(cap).toBeEnabled()
      await expect(budget.getByRole('alert')).toHaveCount(0)
      await expect(cap).toHaveValue(original ? String(original.limit) : '')
      await cap.fill(String(savedTokens))
      await expect(cap).toHaveValue(String(savedTokens))
      const save = budget.getByRole('button', { name: labels.save, exact: true })
      await expect(save).toBeEnabled()
      await save.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => writes.length).toBe(2)
      await expect.poll(() => writeReplies.length).toBe(1)
      expect(writeReplies).toEqual([{ message: null, code: null }])
      await info.attach('owned-budget-facts.json', {
        body: JSON.stringify({
          writes,
          writeReplies,
          value: await cap.inputValue(),
          feedback: await budget.getByRole('alert').allTextContents(),
        }),
        contentType: 'application/json',
      })
      await writeFile(
        info.outputPath('owned-budget-facts.json'),
        JSON.stringify({
          writes,
          writeReplies,
          value: await cap.inputValue(),
          feedback: await budget.getByRole('alert').allTextContents(),
        }),
      )
      await expect
        .poll(async () => (await budgetClient.execute('session.getBudget', { sessionId: originalSessionId }))?.limit)
        .toBe(savedTokens)
      await expect(cap).toHaveValue(String(savedTokens))
      expect(writes).toEqual([
        { sessionId: originalSessionId, tokens: rejectedTokens },
        { sessionId: originalSessionId, tokens: savedTokens },
      ])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`usage-budget-host-${locale}-320.png`) })
      await page.setViewportSize({ width: 1440, height: 1000 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'true')
      const project = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
      if ((await project.getAttribute('aria-expanded')) === 'false') {
        await project.focus()
        await page.keyboard.press('ArrowRight')
      }
      await session.focus()
      await page.keyboard.press('Enter')
      await expectComposerText(composer, draft)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await removeOwnedTempDirectory(root, 'hbar-usage-feedback-')
        }
      }
    }
  })
}

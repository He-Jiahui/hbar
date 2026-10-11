import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-message-appearance-')
  )
    throw new Error('Non-owned message appearance fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

test('message reading surfaces stay quiet while tool disclosures retain keyboard feedback', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-message-appearance-'))
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const sessionId = host.ready.sessionId
    const goals = createGoalPlanCommandClient(host.client)
    await createRunCommandClient(host.client).execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: '/tool update_plan {"plan":[{"step":"Verify the conversation reading surface","status":"in_progress"}]}',
          images: [],
        },
      },
      { idempotencyKey: 'message-appearance-plan' },
    )
    await expect
      .poll(async () => (await goals.execute('plan.get', { sessionId }))?.plan[0]?.step)
      .toBe('Verify the conversation reading surface')
    const session = await createWorkspaceSessionCommandClient(host.client).execute('session.get', { sessionId })
    if (!session) throw new Error('Missing message appearance session')

    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 900, 390, 320]) {
        const context = await browser.newContext({
          locale: 'zh-CN',
          colorScheme: theme,
          viewport: { width, height: 960 },
          permissions: ['clipboard-read', 'clipboard-write'],
        })
        try {
          const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
          expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
            true,
          )
          const page = await context.newPage()
          page.setDefaultTimeout(15_000)
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          await page.addInitScript((value) => localStorage.setItem('hbar:web:theme', value), theme)
          await page.goto(base)
          if (width < 1024) await page.getByRole('button', { name: '显示工程与会话侧栏' }).click()
          await page.getByRole('treeitem', { name: session.title, exact: true }).click()
          const messages = page.locator('.lumen-message-transcript')
          await expect(messages).toHaveCount(3)
          await expect(messages.locator('[data-edge]')).toHaveCount(0)
          await expect(messages.locator('.lumen-message-avatar')).toHaveCount(0)

          const labels = getShellCopy('zh-CN').session
          const trigger = page.getByRole('button', { name: `update_plan ${labels.messageBlocks.resultAvailable}` })
          const disclosure = page.locator('.hbar-session-tool').filter({ has: trigger })
          await expect(trigger).toHaveAttribute('aria-expanded', 'false')
          await trigger.focus()
          await page.keyboard.press('Enter')
          await expect(trigger).toHaveAttribute('aria-expanded', 'true')
          await expect(disclosure.locator('pre').first()).toContainText('Verify the conversation reading surface')
          await expect(disclosure.locator('pre')).toHaveCount(2)
          await expect(trigger).toBeFocused()
          expect(await trigger.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
          await page.screenshot({ path: testInfo.outputPath(`message-expanded-${theme}-${width}.png`) })
          await page.keyboard.press('Space')
          await expect(trigger).toHaveAttribute('aria-expanded', 'false')
          await expect(disclosure.locator('pre')).toHaveCount(0)
          const snapshot = await host.client.call('session.snapshot', { sessionId })
          const lastReply = snapshot.messages.findLast((message) => message.role === 'assistant')
          expect(lastReply).toBeDefined()
          const reply = page
            .locator('.lumen-message-transcript[data-role="assistant"]')
            .filter({ has: page.locator('.hbar-session-message-actions') })
          await expect(reply).toHaveCount(1)
          await reply.getByRole('button', { name: labels.messageActions.copy, exact: true }).click()
          await expect(reply.getByRole('status')).toHaveText(labels.messageActions.copied)
          const expectedText = lastReply?.content
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n\n')
          // Windows normalizes clipboard line endings; Markdown content must otherwise be unchanged.
          expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(
            expectedText,
          )
          await page.getByRole('textbox', { name: '提示词' }).focus()
          await page.screenshot({ path: testInfo.outputPath(`message-reading-${theme}-${width}.png`) })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          const viewport = page.locator('.lumen-conversation-messages')
          expect(await viewport.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto')
          expect(errors).toEqual([])
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    if (host) await stopWebSessionHost(host)
    await cleanup(root)
  }
})

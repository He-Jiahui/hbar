import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('message reading surfaces stay quiet while tool disclosures retain keyboard feedback', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-message-appearance-'))
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root })
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

    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({
          locale: 'zh-CN',
          colorScheme: theme,
          viewport: { width, height: 960 },
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
          if (width < 768) await page.getByRole('button', { name: '显示工程与会话侧栏' }).click()
          await page.getByRole('button', { name: /^打开会话 / }).click()
          const messages = page.locator('.lumen-message-surface')
          await expect(messages).toHaveCount(4)
          await expect(messages.locator('[data-edge]')).toHaveCount(0)
          expect(
            await messages.evaluateAll((elements) => elements.every((element) => element.dataset.boundary === 'none')),
          ).toBe(true)

          const trigger = page.getByRole('button', { name: '调用工具：update_plan' })
          const disclosure = page.locator('.hbar-app-react-tool-block').filter({ has: trigger })
          await expect(trigger).toHaveAttribute('aria-expanded', 'false')
          await trigger.focus()
          await page.keyboard.press('Enter')
          await expect(trigger).toHaveAttribute('aria-expanded', 'true')
          await expect(disclosure.locator('pre')).toContainText('Verify the conversation reading surface')
          await expect(trigger).toBeFocused()
          expect(await trigger.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
          await page.screenshot({ path: testInfo.outputPath(`message-expanded-${theme}-${width}.png`) })
          await page.keyboard.press('Space')
          await expect(trigger).toHaveAttribute('aria-expanded', 'false')
          await expect(disclosure.locator('pre')).toBeHidden()
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
    await rm(root, { recursive: true, force: true })
  }
})

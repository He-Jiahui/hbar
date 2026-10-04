import { expect, test, type Locator } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeOwnedRoot(root: string): Promise<void> {
  if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-composer-density-'))
    throw new Error('Unexpected composer fixture cleanup root')
  await rm(root, { recursive: true, force: true })
}

async function singleLineControls(toolbar: Locator) {
  await expect(toolbar).toBeVisible()
  await expect.poll(() => toolbar.locator('button:visible').count()).toBeGreaterThanOrEqual(4)
  const controls = await toolbar.locator('button').evaluateAll((elements) =>
    elements
      .filter((element) => element.getClientRects().length > 0 && !element.closest('[popover], dialog'))
      .map((element) => {
        const style = getComputedStyle(element)
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const lines: number[] = []
        while (walker.nextNode()) {
          const text = walker.currentNode
          if (!text.textContent?.trim() || text.parentElement?.closest('svg')) continue
          const range = document.createRange()
          range.selectNodeContents(text)
          lines.push(...Array.from(range.getClientRects(), (rect) => rect.top + rect.height / 2))
        }
        return {
          label: element.getAttribute('aria-label') ?? element.textContent,
          whiteSpace: style.whiteSpace,
          spread: lines.length ? Math.max(...lines) - Math.min(...lines) : 0,
          height: element.getBoundingClientRect().height,
        }
      }),
  )
  expect(controls.length).toBeGreaterThanOrEqual(4)
  for (const control of controls) {
    expect(control.whiteSpace, String(control.label)).toBe('nowrap')
    expect(control.spread, String(control.label)).toBeLessThanOrEqual(6)
  }
  return controls
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer control captions stay on one line through run updates: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(90_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-composer-density-')))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const copy = getShellCopy(locale)
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const composer = page.locator('.hbar-prompt-composer')
      const toolbar = composer.locator('.lumen-composer-toolbar')
      const input = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Original unsent draft — 控件文本变化不得发送或清除草稿'
      await input.fill(draft)
      const runs = createRunCommandClient(host.client)
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"must-not-write.txt","text":"do not approve"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('waiting_approval')
      const queue = composer.locator('.lumen-composer-queue-action')
      await expect(queue).toBeVisible()
      await expect(queue).toHaveText(copy.session.runningActions.queueLabel)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await singleLineControls(toolbar)
        // A fixture-only long translated caption verifies single-line clipping;
        // the original title still identifies the real queue action.
        const dimensions = await queue.evaluate(
          (element, caption) => {
            const toolbar = element.closest('.lumen-composer-toolbar')
            if (!toolbar) throw new Error('Queue action has no owning toolbar')
            const before = {
              queue: element.getBoundingClientRect().height,
              toolbar: toolbar.getBoundingClientRect().height,
            }
            element.textContent = caption
            return {
              before,
              after: { queue: element.getBoundingClientRect().height, toolbar: toolbar.getBoundingClientRect().height },
            }
          },
          locale === 'zh-CN'
            ? '在当前任务完成后继续处理这条保留原草稿的消息'.repeat(3)
            : 'Queue this original draft after the current task finishes '.repeat(3),
        )
        await singleLineControls(toolbar)
        expect(dimensions.after).toEqual(dimensions.before)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`composer-single-line-${locale}-${width}.png`) })
        await queue.evaluate((element, caption) => {
          element.textContent = caption
        }, copy.session.runningActions.queueLabel)
        await expectComposerText(input, draft)
      }
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(1)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedRoot(root)
    }
  })
}

import { expect, test, type Locator } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { existsSync } from 'node:fs'
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
  await expect.poll(() => toolbar.locator('button:visible').count()).toBeGreaterThan(0)
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
          label: element.getAttribute('aria-label') ?? element.textContent ?? '',
          textLines: lines.length,
          whiteSpace: style.whiteSpace,
          spread: lines.length ? Math.max(...lines) - Math.min(...lines) : 0,
          height: element.getBoundingClientRect().height,
          textOverflow: style.textOverflow,
          clipped: element.scrollWidth > element.clientWidth + 1,
        }
      }),
  )
  expect(controls.length).toBeGreaterThan(0)
  expect(controls.some((control) => control.textLines > 0)).toBe(true)
  for (const control of controls) {
    expect(control.label.trim().length).toBeGreaterThan(0)
    expect(control.height, control.label).toBeGreaterThan(0)
    if (control.textLines > 0) {
      expect(control.whiteSpace, control.label).toBe('nowrap')
      expect(control.spread, control.label).toBeLessThanOrEqual(6)
      expect(control.textOverflow, control.label).not.toBe('ellipsis')
    }
    expect(control.clipped, String(control.label)).toBe(false)
  }
  return controls
}

async function completeAdaptiveControls(toolbar: Locator, moreLabel: string): Promise<void> {
  const ids = await toolbar.locator('[data-toolbar-item]').evaluateAll((elements) =>
    elements.map((element) => {
      const id = element.getAttribute('data-toolbar-item')
      if (!id) throw new Error('Adaptive control has no declared identity')
      return id
    }),
  )
  expect(ids).toContain('model')
  const hidden = []
  for (const id of ids) {
    const inline = toolbar.locator(`[data-toolbar-item=${JSON.stringify(id)}]`)
    if (await inline.isVisible()) await expect(inline.locator(':scope > *')).toBeVisible()
    else hidden.push(id)
  }
  if (hidden.length === 0) return
  const more = toolbar.getByRole('button', { name: moreLabel, exact: true })
  await expect(more).toBeInViewport()
  await more.click()
  const overflow = toolbar.page().getByRole('dialog', { name: moreLabel, exact: true })
  await expect(overflow).toBeVisible()
  for (const id of hidden) {
    const item = overflow.locator(`[data-toolbar-overflow=${JSON.stringify(id)}]`)
    await expect(item).toBeVisible()
    await expect(item.locator(':scope > *')).toBeVisible()
  }
  await toolbar.page().keyboard.press('Escape')
  await expect(overflow).toBeHidden()
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
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
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
        await completeAdaptiveControls(toolbar, copy.session.addMenu.menu)
        // A long translated label must stay complete inside a scrollable rail.
        // Send/stop retain a visible target outside that rail.
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
        await completeAdaptiveControls(toolbar, copy.session.addMenu.menu)
        expect(dimensions.after).toEqual(dimensions.before)
        const rail = toolbar.locator('.lumen-composer-control-rail')
        expect(await rail.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
        // Waiting approval can disable Queue. The owning rail must still be
        // keyboard-scrollable so disabled captions remain readable.
        await rail.focus()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => rail.evaluate((element) => element.scrollLeft > 0)).toBe(true)
        const stop = toolbar.getByRole('button', { name: copy.session.prompt.stop, exact: true })
        await expect(stop).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`composer-single-line-${locale}-${width}.png`) })
        await queue.evaluate((element, caption) => {
          element.textContent = caption
        }, copy.session.runningActions.queueLabel)
        await rail.evaluate((element) => {
          element.scrollLeft = 0
        })
        await expectComposerText(input, draft)
      }
      await toolbar.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('cancelled')
      const finalSnapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
      expect(finalSnapshot.runs).toHaveLength(1)
      expect(finalSnapshot.runs[0]?.status).toBe('cancelled')
      expect(existsSync(join(root, 'must-not-write.txt'))).toBe(false)
      await expectComposerText(input, draft)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedRoot(root)
    }
  })
}

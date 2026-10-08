import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'
import { imageFile } from './support/image-file'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

async function removeFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-tool-output-images-'))
    throw new Error('Unsafe fixture cleanup target')
  await rm(target, { recursive: true, force: true })
}

for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 320],
] as const)
  test(`real read_file image output loads, retries, opens and survives reload: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-tool-output-images-'))
    const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir('artifacts/tool-output-images', { recursive: true })
      await writeFile(join(root, 'output.png'), imageFile(0).buffer)
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const copy = getShellCopy(locale)
      const images = sessionImageCopy(locale)
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let reads = 0
      let rejectRead = true
      await page.route('**/api/artifacts/*', async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        reads++
        if (rejectRead) await route.fulfill({ status: 503, body: 'private-error-body' })
        else await route.continue()
      })
      await page.goto(origin)
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await page.locator(`[data-session-id="${host.ready.sessionId}"] .hbar-app-react-session-target`).click()
      const run = await createRunCommandClient(host.client).execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: '/tool read_file {"path":"output.png"}', images: [], approval: 'allow' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const source = page.locator('.hbar-session-tool[data-tool-name="read_file"]')
      await expect(source).toHaveCount(1)
      const group = page.locator('.hbar-session-activity-summary')
      if ((await group.count()) && (await group.getAttribute('aria-expanded')) === 'false') await group.click()
      await source
        .locator(
          ':scope > .hbar-session-disclosure-trigger, :scope > .hbar-session-disclosure-heading > .hbar-session-disclosure-trigger',
        )
        .click()
      const output = source.locator('[data-content-kind="output"]')
      await expect(output).toContainText('Read image file output.png')
      const tile = output.locator('.lumen-image-tile')
      await expect(tile.getByRole('alert')).toHaveText(images.error('READ_FAILED'))
      expect(reads).toBe(1)
      await expect(page.getByText('private-error-body')).toHaveCount(0)
      rejectRead = false
      await tile.getByRole('button', { name: images.retry, exact: true }).click()
      await expect(tile.locator('img')).toBeVisible()
      await expect
        .poll(() => tile.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0)
      const open = tile.getByRole('button', { name: images.open('read_file-1.png'), exact: true })
      await open.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: images.gallery.title, exact: true })
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      await expect
        .poll(() =>
          dialog.locator('.lumen-image-gallery-media img').evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(480)
      await page.keyboard.press('Escape')
      await expect(open).toBeFocused()
      await expect(tile.locator('img')).toBeVisible()
      await page.screenshot({ path: `artifacts/tool-output-images/output-${locale}-${width}.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
      const result = snapshot.messages
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result')
      if (result?.type !== 'tool_result') throw new Error('Missing durable image result')
      expect(result.images).toHaveLength(1)
      expect(snapshot.runs.find((item) => item.id === run.operationId)?.status).toBe('completed')
      await page.reload()
      if ((await group.count()) && (await group.getAttribute('aria-expanded')) === 'false') await group.click()
      await source
        .locator(
          ':scope > .hbar-session-disclosure-trigger, :scope > .hbar-session-disclosure-heading > .hbar-session-disclosure-trigger',
        )
        .click()
      await expect(tile.locator('img')).toBeVisible()
      await open.click()
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      await page.keyboard.press('Escape')
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        await removeFixture(root)
      }
    }
  })

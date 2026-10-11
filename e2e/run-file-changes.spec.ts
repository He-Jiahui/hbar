import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createRunCommandClient } from '@hbar/client'
import { runFileChangesCopy } from '../apps/web/src/run-file-changes-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-file-changes-browser-')
  )
    throw new Error('Non-owned file summary fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}
for (const locale of ['zh-CN', 'en-US'] as const)
  test(`terminal file summary expands, reviews, survives reload and safely undoes in ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-file-changes-browser-'))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        fixture: 'file-changes',
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      const { client, ready } = host,
        labels = runFileChangesCopy(locale),
        shell = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage(),
        errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
      const textbox = page.getByRole('textbox', { name: shell.session.prompt.input, exact: true })
      await expect(textbox).toBeEditable()
      const runs = createRunCommandClient(client)
      const submitted = await runs.execute(
        'run.submit',
        {
          sessionId: ready.sessionId,
          modelId: 'local-fixture',
          input: { text: '/tool file_change_fixture {}', images: [], approval: 'allow' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const card = page.getByRole('region', { name: labels.edited(10), exact: true })
      await expect
        .poll(
          async () =>
            (await client.call('session.snapshot', { sessionId: ready.sessionId })).runs.find(
              (run) => run.id === submitted.operationId,
            )?.fileChanges?.totalFiles,
        )
        .toBe(10)
      await expect(card).toBeVisible()
      await expect(card.locator('li')).toHaveCount(3)
      await expect(card).toContainText(labels.added(20))
      await expect(card).toContainText(labels.removed(1))
      const cardBounds = await card.boundingBox(),
        copyBounds = await page
          .getByRole('button', { name: shell.session.messageActions.copy, exact: true })
          .boundingBox()
      if (!cardBounds || !copyBounds) throw new Error('Missing final reply action geometry')
      expect(copyBounds.y).toBeGreaterThanOrEqual(cardBounds.y + cardBounds.height)
      await card.screenshot({ path: info.outputPath('file-summary-desktop.png') })
      await card.getByRole('button', { name: labels.more(7), exact: true }).click()
      await expect(card.locator('li')).toHaveCount(10)
      await card.getByRole('button', { name: labels.openFile('existing.ts'), exact: true }).click()
      const diff = card.getByRole('region', { name: labels.diff('existing.ts'), exact: true })
      await expect(diff).toContainText('const value = 1')
      await expect(diff).toContainText('const value = 2')
      await page.reload()
      await expect(card).toBeVisible()
      await expect(card.locator('li')).toHaveCount(3)
      await expect(card.getByRole('button', { name: labels.undo, exact: true })).toBeEnabled()
      await page.setViewportSize({ width: 640, height: 960 })
      await card.evaluate((element) => {
        element.style.maxInlineSize = '20rem'
      })
      await card.scrollIntoViewIfNeeded()
      const geometry = await card.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          width: bounds.width,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          right: bounds.right,
          viewport: document.documentElement.clientWidth,
        }
      })
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
      expect(geometry.width).toBeLessThanOrEqual(320.1)
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1)
      await card.screenshot({ path: info.outputPath('file-summary-narrow.png') })
      await card.getByRole('button', { name: labels.more(7), exact: true }).click()
      await expect(card.locator('li')).toHaveCount(10)
      const paths = await card
        .locator('.hbar-run-file-change-path')
        .evaluateAll((buttons) =>
          buttons.map((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })),
        )
      expect(paths.every((value) => value.scrollWidth <= value.clientWidth + 1)).toBe(true)
      await card.getByRole('button', { name: labels.less, exact: true }).click()
      await card.evaluate((element) => {
        element.style.maxInlineSize = ''
      })
      await page.setViewportSize({ width: 1440, height: 960 })
      await writeFile(join(root, 'existing.ts'), 'later user edit\n', 'utf8')
      await card.getByRole('button', { name: labels.undo, exact: true }).click()
      await expect(card.getByRole('alert')).toContainText(labels.error('FILE_CONFLICT', 'undo'))
      expect(await readFile(join(root, 'existing.ts'), 'utf8')).toBe('later user edit\n')
      await writeFile(join(root, 'existing.ts'), 'const value = 2\n// file summary test 0\n', 'utf8')
      await card.getByRole('button', { name: labels.retry, exact: true }).click()
      await expect(card).toHaveAttribute('data-undone', 'true')
      await expect(card).toContainText(labels.undone)
      expect(await readFile(join(root, 'existing.ts'), 'utf8')).toBe('const value = 1\n')
      await expect
        .poll(
          async () =>
            (await client.call('session.snapshot', { sessionId: ready.sessionId })).runs.find(
              (run) => run.id === submitted.operationId,
            )?.fileChanges?.undoneAt,
        )
        .toBeTruthy()
      await card.getByRole('button', { name: labels.view, exact: true }).click()
      await expect(card.getByRole('region', { name: labels.diff('existing.ts'), exact: true })).toContainText(
        'const value = 2',
      )
      await page.reload()
      await expect(card).toHaveAttribute('data-undone', 'true')
      const next = await runs.execute(
        'run.submit',
        {
          sessionId: ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'No file changes in this turn.', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await client.call('session.snapshot', { sessionId: ready.sessionId })).runs.find(
              (run) => run.id === next.operationId,
            )?.status,
        )
        .toBe('completed')
      await expect(page.locator('[data-run-file-change-summary]')).toHaveCount(1)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })

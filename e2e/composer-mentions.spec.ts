import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText, readComposerText } from './support/composer-text'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`workspace mentions are structured, scoped, and submitted only as quoted paths: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-mentions-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      await mkdir(join(root, 'src'))
      await mkdir(join(root, 'pages'))
      await writeFile(join(root, 'src', 'alpha.ts'), 'export const alpha = true\n')
      await writeFile(join(root, 'src', 'beta.ts'), 'export const beta = true\n')
      for (let index = 0; index < 58; index += 1)
        await writeFile(join(root, 'pages', `page-${String(index).padStart(2, '0')}.md`), `Page ${index}\n`)
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base()}${process.env.HBAR_MENTION_E2E_ENTRY ?? '/'}`)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: host.ready.sessionTitle, exact: true })).toBeVisible()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const menu = page.getByRole('listbox', { name: copy.session.mentions.menu })
      await prompt.fill('Review @alpha')
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('option').filter({ hasText: 'alpha.ts' })).toBeVisible()
      await prompt.press('Enter')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@alpha.ts')
      await expect(menu).toHaveCount(0)
      await prompt.press('ControlOrMeta+z')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveCount(0)
      await prompt.press('ControlOrMeta+y')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@alpha.ts')
      await prompt.press('ControlOrMeta+a')
      await prompt.press('Backspace')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveCount(0)
      await prompt.press('ControlOrMeta+z')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@alpha.ts')
      await prompt.press('Home')
      await prompt.type('Start ')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@alpha.ts')

      // Switching targets never projects a pill or a late result into another draft.
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Session 001', exact: true })).toBeVisible()
      const otherPrompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await otherPrompt.fill('Other @beta')
      await expect(menu.getByRole('option').filter({ hasText: 'beta.ts' })).toBeVisible()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@alpha.ts')
      await expectComposerText(prompt, 'Start Review @alpha.ts')

      // A typed lookalike remains plain text. Shift+Enter inserts a newline, not a Run.
      await prompt.press('End')
      await prompt.type(' and @alpha.ts')
      await prompt.press('Escape')
      await prompt.press('Shift+Enter')
      await expectComposerText(prompt, 'Start Review @alpha.ts and @alpha.ts\n')
      const before = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })
      expect(before.runs.filter((run) => run.input.source === 'user')).toHaveLength(0)
      await prompt.type('Now')
      await prompt.press('Enter')
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 60 })).runs.filter(
              (run) => run.input.source === 'user',
            ).length,
        )
        .toBe(1)
      const submitted = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })
      const input = submitted.runs.find((run) => run.input.source === 'user')?.input
      expect(input?.text).toBe('Start Review @"src/alpha.ts" and @alpha.ts\nNow')
      expect(input?.files ?? []).toHaveLength(0)
      await expectComposerText(prompt, '')

      await prompt.fill('Browse @')
      await expect(menu).toBeVisible()
      await menu.getByRole('option').filter({ hasText: /^src/ }).click()
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@src')
      await prompt.press('End')
      await prompt.type(' and @')
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: copy.session.mentions.browse('src') }).click()
      await expect(menu.getByRole('option').filter({ hasText: 'beta.ts' })).toBeVisible()
      await prompt.press('ArrowDown')
      await expect(menu.getByRole('option').filter({ hasText: 'beta.ts' })).toHaveAttribute('aria-selected', 'true')
      await prompt.press('Tab')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveCount(2)
      const directoryDraft = await readComposerText(prompt)

      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 960 : 760 })
        await prompt.press('End')
        await prompt.type(' @')
        await expect(menu.getByRole('option').first()).toBeVisible()
        const bounds = await menu.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(-1)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-mentions/composer-${locale}-${width}.png` })
        await prompt.press('Escape')
        await prompt.press('Backspace')
        await prompt.press('Backspace')
      }
      await expectComposerText(prompt, directoryDraft)
      await prompt.dispatchEvent('compositionstart', { data: '中' })
      await prompt.dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      await prompt.dispatchEvent('compositionend', { data: '中' })
      await prompt.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })).runs.filter(
          (run) => run.input.source === 'user',
        ),
      ).toHaveLength(1)
      await page.waitForTimeout(90)
      await prompt.press('Enter')
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 60 })).runs.filter(
              (run) => run.input.source === 'user',
            ).length,
        )
        .toBe(2)
      const withDirectory = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })
      expect(
        withDirectory.runs.find((run) => run.input.source === 'user' && run.input.text.startsWith('Browse '))?.input
          .text,
      ).toBe('Browse @"src" and @"src/beta.ts"')
      await prompt.fill('@page')
      await expect(menu.getByText(copy.session.mentions.truncated)).toBeVisible()
      await prompt.fill('Page @pages')
      await expect(menu.getByRole('option').filter({ hasText: /^pages/ })).toBeVisible()
      await prompt.press('ArrowRight')
      await expect(menu).toContainText(copy.session.mentions.browsing('pages'))
      await expect(menu.getByRole('button', { name: copy.session.mentions.more })).toBeVisible()
      await menu.getByRole('button', { name: copy.session.mentions.more }).click()
      await expect(menu.getByRole('option').filter({ hasText: 'page-54.md' })).toBeVisible()
      await prompt.fill('Plain text via Send')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 60 })).runs.filter(
              (run) => run.input.source === 'user',
            ).length,
        )
        .toBe(3)
      await prompt.fill('@')
      await expect(menu.getByRole('option').first()).toBeVisible()
      await stopWebSessionHost(host)
      host = undefined
      await expect(menu.getByText(copy.session.mentions.disconnected)).toBeVisible()
      await prompt.press('Enter')
      await expectComposerText(prompt, '@')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixtureDirectory(root, 'hbar-composer-mentions-')
    }
  })
}

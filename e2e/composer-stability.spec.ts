import { expect, test, type Locator } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'

const root = join(process.cwd(), 'artifacts/composer-stability/browser')
const origin = 'http://127.0.0.1:65293'
let server: PreviewServer
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/composer-stability-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 65293, strictPort: true },
  })
})
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    )
})

async function geometry(form: Locator) {
  return form.evaluate((element) => {
    const editor = element.querySelector('[role="textbox"]')
    if (!editor) throw new Error('Missing fixture editor')
    const box = element.getBoundingClientRect()
    const input = editor.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height, editorY: input.y, editorHeight: input.height }
  })
}
for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`transient composer feedback cannot resize the input or steal a draft: ${locale}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin)
    const labels = getShellCopy(locale).session
    const form = page.locator('.lumen-prompt-composer-surface')
    const input = form.getByRole('textbox', { name: labels.prompt.input, exact: true })
    const phases = ['loading', 'error', 'unknown', 'offline', 'settled', 'ready'] as const
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(
        (locale) => window.composerStability.render({ phase: 'ready', locale, theme: 'dark', sessionId: 'A' }),
        locale,
      )
      await input.fill('保留草稿 — original unsent draft')
      await input.focus()
      const before = await geometry(form)
      for (const phase of [...phases, ...phases]) {
        await page.evaluate(
          ({ phase, locale }) =>
            window.composerStability.render({ phase, locale, theme: 'dark', sessionId: 'A', long: true }),
          { phase, locale },
        )
        expect(await geometry(form), `${width}: ${phase}`).toEqual(before)
        await expectComposerText(input, '保留草稿 — original unsent draft')
        await expect(input).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
      }
      const trigger = form.locator('.hbar-composer-feedback-trigger')
      await trigger.focus()
      await page.keyboard.press('Enter')
      const panel = page.getByRole('dialog', { name: labels.composerFeedback.title, exact: true })
      await expect(panel).toBeVisible()
      expect(await geometry(form)).toEqual(before)
      await page.keyboard.press('Escape')
      await expect(panel).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await page.screenshot({ path: info.outputPath(`stable-input-${locale}-${width}.png`) })
    }
    expect(errors).toEqual([])
  })

  test(`persistent content grows while feedback scrolls outside the form and remains session-owned: ${locale}`, async ({
    page,
  }, info) => {
    await page.goto(origin)
    const labels = getShellCopy(locale).session
    await page.setViewportSize({ width: 390, height: 720 })
    const render = async (input: {
      phase: 'ready' | 'error' | 'offline'
      attachments?: number
      queued?: number
      notices?: number
      long?: boolean
      sessionId?: string
    }) =>
      page.evaluate(
        ({ input, locale }) =>
          window.composerStability.render({ ...input, sessionId: input.sessionId ?? 'A', locale, theme: 'light' }),
        { input, locale },
      )
    await render({ phase: 'ready' })
    const form = page.locator('.lumen-prompt-composer-surface')
    const input = form.getByRole('textbox', { name: labels.prompt.input, exact: true })
    const empty = await geometry(form)
    await input.fill(Array.from({ length: 8 }, (_, index) => `持久草稿第 ${index + 1} 行`).join('\n'))
    await expect.poll(async () => (await geometry(form)).height).toBeGreaterThan(empty.height)
    await input.fill('持久草稿')
    await render({ phase: 'ready', attachments: 1, queued: 1 })
    const content = await geometry(form)
    expect(content.height).toBeGreaterThan(empty.height)
    for (const phase of ['error', 'offline', 'ready'] as const) {
      await render({ phase, attachments: 1, queued: 1, long: true })
      expect(await geometry(form), phase).toEqual(content)
      await expect(form.locator('.hbar-queued-user-run-text')).toHaveText('已保存的排队消息 1')
      if (phase !== 'ready') await expect(form.locator('.hbar-queued-user-run-edit')).toBeDisabled()
    }
    for (const notices of [0, 1, 32, 33]) {
      await render({ phase: 'error', attachments: 1, queued: 1, long: true, notices })
      expect(await geometry(form)).toEqual(content)
    }
    const trigger = form.locator('.hbar-composer-feedback-trigger')
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    const panel = page.getByRole('dialog', { name: labels.composerFeedback.title, exact: true })
    await expect(panel).toBeVisible()
    expect(await panel.evaluate((element) => Boolean(element.closest('form')))).toBe(false)
    const list = panel.locator('.hbar-composer-feedback-list')
    await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await panel.getByRole('button', { name: labels.backgroundAgents.refresh, exact: true }).click()
    expect(await page.evaluate(() => window.composerStability.actions())).toContain('retry:A')
    expect(await geometry(form)).toEqual(content)
    await page.screenshot({ path: info.outputPath(`feedback-wrap-scroll-${locale}-390.png`) })
    await render({ phase: 'ready', sessionId: 'B' })
    await expect(panel).not.toBeVisible()
    await expect(page.locator('.hbar-composer-feedback-item')).toHaveCount(0)
    await form.locator('.hbar-composer-feedback-trigger').click()
    await expect(panel).toBeVisible()
    await expect(panel).not.toContainText('DISCONNECTED')
    await page.locator('main').click({ position: { x: 5, y: 5 } })
    await expect(panel).not.toBeVisible()
  })
}

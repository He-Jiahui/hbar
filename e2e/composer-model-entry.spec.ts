import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer selects models and reasoning locally, preserving draft and focus: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-model-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    const labels = copy.session.modelPicker
    const longModelName = '模型选择回归测试 — A deliberately long model display name that must not hide the send action'
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      await createConfigurationCommandClient(host.client).execute('provider.save', {
        provider: {
          id: 'composer-fixture',
          name: 'Composer fixture',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'alternate',
          models: [
            { id: 'alternate', name: longModelName },
            ...Array.from({ length: 64 }, (_, index) => ({
              id: `fixture-${index}`,
              name: `Catalog fixture ${index}`,
            })),
          ],
          thinkingLevels: ['low', 'high'],
          defaultThinkingLevel: 'high',
        },
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Draft remains attached to this session — 尚未发送的草稿'
      await prompt.fill(draft)
      const model = page.locator('.hbar-composer-model-trigger')
      const popup = page.getByRole('dialog', { name: labels.title, exact: true })
      const search = popup.getByRole('searchbox', { name: labels.search })
      await expect(model).toContainText('fixture')
      await model.focus()
      await page.keyboard.press('Enter')
      await expect(popup).toBeVisible()
      await expect(search).toBeFocused()
      await expect(popup.getByRole('option')).toHaveCount(60)
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      expect(
        await popup
          .locator('.hbar-composer-model-list')
          .evaluate((element) => element.scrollHeight > element.clientHeight),
      ).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-model-open-${locale}.png` })
      await search.fill('no matching model 123')
      await expect(popup.getByText(labels.noMatches)).toBeVisible()
      await search.fill('回归测试')
      await expect(popup.getByRole('option')).toHaveCount(1)
      await page.keyboard.press('ArrowDown')
      await expect(popup.getByRole('option')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(popup).not.toBeVisible()
      await expect(model).toContainText(longModelName)
      await expectComposerText(prompt, draft)
      await expect(model).toBeFocused()

      const thinking = page.locator('.hbar-composer-thinking-trigger')
      await thinking.click()
      const effort = page.getByRole('dialog', { name: labels.thinking, exact: true })
      const slider = effort.getByRole('slider', { name: labels.thinking })
      await slider.focus()
      await page.keyboard.press('Home')
      await expect(thinking).toHaveText(labels.thinkingLevel('low'))
      const savedModel = await createModelCommandClient(host.client).execute('session.getModel', {
        sessionId: host.ready.sessionId,
      })
      expect(savedModel.thinkingLevel).toBe('low')
      expect(savedModel.model?.modelName).toBe(longModelName)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-${locale}.png` })
      await page.keyboard.press('Escape')
      await expect(effort).not.toBeVisible()

      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 900, height: 600 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(model).toBeVisible()
        await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await model.click()
        await expect(search).toHaveValue('')
        await expect(popup.getByRole('option')).toHaveCount(60)
        const bounds = await popup.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
        await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-model-${locale}-${viewport.width}.png` })
        await popup.getByRole('button', { name: labels.close, exact: true }).click()
        await expect(popup).not.toBeVisible()
        await expectComposerText(prompt, draft)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await model.click()
      await prompt.click({ position: { x: 10, y: 10 } })
      await expect(popup).not.toBeVisible()
      await model.click()
      await page.keyboard.press('Escape')
      await expect(popup).not.toBeVisible()
      await expect(model).toContainText(longModelName)
      await expectComposerText(prompt, draft)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

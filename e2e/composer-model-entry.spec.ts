import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer model entry opens its session settings and preserves the draft: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-model-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    const longModelName =
      '模型选择回归测试 — A deliberately long model display name that must wrap without hiding the send action'
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      await createConfigurationCommandClient(host.client).execute('provider.save', {
        provider: {
          id: 'composer-fixture',
          name: 'Composer fixture',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'alternate',
          models: [{ id: 'alternate', name: longModelName }],
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
      await prompt.fill('Draft remains attached to this session — 尚未发送的草稿')
      const model = page.getByRole('button', { name: locale === 'zh-CN' ? /^模型设置：/ : /^Model settings:/ })
      await expect(model).toContainText('fixture')
      await model.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
      const modelField = page.getByRole('combobox', { name: locale === 'zh-CN' ? '模型' : 'Model', exact: true })
      await expect(modelField).toHaveValue('Local fixture · fixture')
      await modelField.click()
      await page.getByRole('option', { name: `Composer fixture · ${longModelName}`, exact: true }).click()
      const thinking = page.getByRole('combobox', { name: locale === 'zh-CN' ? '思考等级' : 'Thinking level' })
      await thinking.click()
      await page.getByRole('option', { name: locale === 'zh-CN' ? '低' : 'Low', exact: true }).click()
      await page.getByRole('button', { name: copy.settings.save, exact: true }).click()
      await expect(page.getByText(copy.settings.saved, { exact: true })).toBeVisible()
      const savedModel = await createModelCommandClient(host.client).execute('session.getModel', {
        sessionId: host.ready.sessionId,
      })
      expect(savedModel.thinkingLevel).toBe('low')
      expect(savedModel.model?.modelName).toBe(longModelName)
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect(prompt).toHaveValue('Draft remains attached to this session — 尚未发送的草稿')
      await expect(model).toContainText(locale === 'zh-CN' ? '思考 低' : 'thinking Low')
      await expect(model).toContainText(longModelName)

      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 900, height: 600 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(model).toBeVisible()
        expect(
          await model.evaluate((element) => {
            const control = element.getBoundingClientRect()
            const composer = element.closest('.lumen-prompt-composer')?.getBoundingClientRect()
            return {
              fits: element.scrollWidth <= element.clientWidth + 1,
              inside: Boolean(composer && control.left >= composer.left && control.right <= composer.right + 1),
            }
          }),
        ).toEqual({ fits: true, inside: true })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-experience/composer-${locale}-${viewport.width}.png` })
        await model.click()
        await expect(modelField).toBeVisible()
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expect(prompt).toHaveValue('Draft remains attached to this session — 尚未发送的草稿')
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
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
          thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
          defaultThinkingLevel: 'high',
        },
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const envelope = z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
        })
        .passthrough()
      let responseMode: 'normal' | 'failure' | 'unknown' = 'normal'
      const thinkingRequestIds = new Set<string | number>()
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = envelope.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.params?.commandId === 'session.setThinkingLevel') {
              if (responseMode === 'failure') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture rejects this change', data: 'INVALID_INPUT' },
                  }),
                )
                return
              }
              if (parsed.data.id !== undefined) thinkingRequestIds.add(parsed.data.id)
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = envelope.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.id !== undefined && thinkingRequestIds.delete(parsed.data.id)) {
              if (responseMode === 'unknown') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture hides the accepted reply', data: 'RESULT_UNKNOWN' },
                  }),
                )
                return
              }
            }
          }
          socket.send(message)
        })
      })
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
      const scale = effort.locator('.hbar-composer-thinking-scale')
      const stops = scale.locator('.hbar-composer-thinking-stop')
      await expect(stops).toHaveCount(5)
      await expect(scale).toHaveAttribute('style', /--hbar-thinking-progress: 50%/)
      await expect(scale.locator('.hbar-composer-thinking-stop[data-reached="true"]')).toHaveCount(3)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-scale-${locale}-1440.png` })
      await slider.focus()
      const modelClient = createModelCommandClient(host.client)
      const beforeThinking = await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })
      await page.keyboard.press('Home')
      await expect(effort.locator('.hbar-composer-thinking-value')).toHaveText(labels.thinkingLevel('low'))
      await expect(slider).toHaveAttribute('aria-valuetext', labels.thinkingLevel('low'))
      await expect(scale).toHaveAttribute('style', /--hbar-thinking-progress: 0%/)
      await expect(scale.locator('.hbar-composer-thinking-stop[data-reached="true"]')).toHaveCount(1)
      await expect(thinking).toHaveText(labels.thinkingLevel('high'))
      await page.keyboard.press('End')
      await page.keyboard.press('ArrowLeft')
      await expect(effort.locator('.hbar-composer-thinking-value')).toHaveText(labels.thinkingLevel('xhigh'))
      await expect(scale).toHaveAttribute('style', /--hbar-thinking-progress: 75%/)
      await expect(scale.locator('.hbar-composer-thinking-stop[data-reached="true"]')).toHaveCount(4)
      expect((await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })).revisions).toEqual(
        beforeThinking.revisions,
      )
      await page.keyboard.press('Escape')
      await expect(effort).not.toBeVisible()
      await expect(thinking).toHaveText(labels.thinkingLevel('high'))
      expect((await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })).revisions).toEqual(
        beforeThinking.revisions,
      )
      await thinking.click()
      await slider.focus()
      await page.keyboard.press('Home')
      await page.keyboard.press('Enter')
      await expect(thinking).toHaveText(labels.thinkingLevel('low'))
      const savedModel = await modelClient.execute('session.getModel', {
        sessionId: host.ready.sessionId,
      })
      expect(savedModel.thinkingLevel).toBe('low')
      expect(savedModel.model?.modelName).toBe(longModelName)
      expect(Object.values(savedModel.revisions).reduce((sum, revision) => sum + revision, 0)).toBe(
        Object.values(beforeThinking.revisions).reduce((sum, revision) => sum + revision, 0) + 1,
      )
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-${locale}.png` })
      await page.keyboard.press('Escape')
      await expect(effort).not.toBeVisible()

      await page.setViewportSize({ width: 320, height: 720 })
      await thinking.click()
      const bounds = await slider.boundingBox()
      expect(bounds).not.toBeNull()
      const y = bounds!.y + bounds!.height / 2
      await page.mouse.move(bounds!.x + bounds!.width * 0.05, y)
      await page.mouse.down()
      await page.mouse.move(bounds!.x + bounds!.width * 0.5, y, { steps: 8 })
      await expect(effort.locator('.hbar-composer-thinking-value')).toHaveText(labels.thinkingLevel('high'))
      await expect(slider).toHaveAttribute('aria-valuetext', labels.thinkingLevel('high'))
      await expect(scale).toHaveAttribute('style', /--hbar-thinking-progress: 50%/)
      await expect(scale.locator('.hbar-composer-thinking-stop[data-reached="true"]')).toHaveCount(3)
      expect((await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })).thinkingLevel).toBe(
        'low',
      )
      await page.mouse.move(bounds!.x + bounds!.width * 0.95, y, { steps: 8 })
      await expect(effort.locator('.hbar-composer-thinking-value')).toHaveText(labels.thinkingLevel('max'))
      await expect(scale).toHaveAttribute('style', /--hbar-thinking-progress: 100%/)
      await expect(scale.locator('.hbar-composer-thinking-stop[data-reached="true"]')).toHaveCount(5)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-drag-preview-${locale}-320.png` })
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-scale-${locale}-320.png` })
      await page.mouse.up()
      await expect(thinking).toHaveText(labels.thinkingLevel('max'))
      const afterDrag = await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })
      expect(afterDrag.thinkingLevel).toBe('max')
      expect(Object.values(afterDrag.revisions).reduce((sum, revision) => sum + revision, 0)).toBe(
        Object.values(savedModel.revisions).reduce((sum, revision) => sum + revision, 0) + 1,
      )
      await page.keyboard.press('Escape')
      await expect(effort).not.toBeVisible()
      await thinking.click()
      await slider.focus()
      await page.keyboard.press('End')
      await page.keyboard.press('Tab')
      expect((await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })).revisions).toEqual(
        afterDrag.revisions,
      )
      await effort.getByRole('button', { name: labels.close, exact: true }).click()
      await thinking.click()
      await slider.focus()
      await page.keyboard.press('Home')
      await page.keyboard.press('Tab')
      await expect(thinking).toHaveText(labels.thinkingLevel('low'))
      const afterBlur = await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })
      expect(Object.values(afterBlur.revisions).reduce((sum, revision) => sum + revision, 0)).toBe(
        Object.values(afterDrag.revisions).reduce((sum, revision) => sum + revision, 0) + 1,
      )
      await effort.getByRole('button', { name: labels.close, exact: true }).click()
      await thinking.click()
      await slider.focus()
      await page.keyboard.press('End')
      responseMode = 'failure'
      await page.keyboard.press('Enter')
      await expect(effort.getByRole('alert')).toBeVisible()
      await expect(effort.locator('.hbar-composer-thinking-value')).toHaveText(labels.thinkingLevel('low'))
      await expect(thinking).toHaveText(labels.thinkingLevel('low'))
      expect((await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })).revisions).toEqual(
        afterBlur.revisions,
      )
      responseMode = 'unknown'
      await slider.focus()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await expect(effort.getByText(labels.unknown)).toBeVisible()
      await expect(effort.getByRole('button', { name: labels.reconcile })).toBeVisible()
      const acceptedUnknown = await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })
      expect(acceptedUnknown.thinkingLevel).toBe('max')
      responseMode = 'normal'
      await effort.getByRole('button', { name: labels.reconcile }).click()
      await expect(thinking).toHaveText(labels.thinkingLevel('max'))
      expect((await modelClient.execute('session.getModel', { sessionId: host.ready.sessionId })).revisions).toEqual(
        acceptedUnknown.revisions,
      )
      await effort.getByRole('button', { name: labels.close, exact: true }).click()
      await page.setViewportSize({ width: 1440, height: 960 })

      await page.setViewportSize({ width: 390, height: 844 })
      await thinking.click()
      await expect(stops).toHaveCount(5)
      await expect(scale).toHaveAttribute('style', /--hbar-thinking-progress: 100%/)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-scale-${locale}-390.png` })
      const valueLabel = effort.locator('.hbar-composer-thinking-value')
      const originalLabel = await valueLabel.textContent()
      await valueLabel.evaluate((element) => {
        element.textContent = 'A deliberately long localized reasoning level — 超长本地化推理强度档位名称'
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await expect(valueLabel).toBeInViewport()
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-scale-long-label-${locale}-390.png` })
      await valueLabel.evaluate((element, value) => {
        element.textContent = value
      }, originalLabel)
      await effort.getByRole('button', { name: labels.close, exact: true }).click()
      await thinking.click()
      await slider.focus()
      await page.emulateMedia({ forcedColors: 'active' })
      await expect(stops).toHaveCount(5)
      await expect(valueLabel).toHaveText(labels.thinkingLevel('max'))
      expect(
        await slider.evaluate((element) => getComputedStyle(element).backgroundImage.includes('linear-gradient')),
      ).toBe(true)
      expect(await slider.evaluate((element) => getComputedStyle(element).forcedColorAdjust)).toBe('none')
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-effort-scale-high-contrast-${locale}-390.png` })
      await page.emulateMedia({ forcedColors: 'none' })
      await effort.getByRole('button', { name: labels.close, exact: true }).click()
      await page.setViewportSize({ width: 1440, height: 960 })

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

      // A configured selection from beyond the first page must be visible on reopen.
      await model.click()
      const lateModel = popup.getByRole('option').filter({ hasText: 'Catalog fixture 63' })
      await expect(lateModel).toHaveCount(0)
      await search.fill('Catalog fixture 63')
      await expect(lateModel).toHaveCount(1)
      await lateModel.click()
      await expect(popup).not.toBeVisible()
      await expect(model).toContainText('Catalog fixture 63')
      await model.click()
      await expect(search).toHaveValue('')
      await expect(popup.getByRole('option')).toHaveCount(60)
      await expect(popup.getByRole('option').first()).toContainText('Catalog fixture 63')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await expect(popup.getByRole('option').first()).toBeInViewport()
      await popup.locator('.hbar-composer-model-list > button').click()
      await expect(lateModel).toHaveCount(1)
      await expect(popup.getByRole('option').first()).toContainText('Catalog fixture 63')
      await popup.getByRole('button', { name: labels.close, exact: true }).click()
      await page.setViewportSize({ width: 320, height: 720 })
      await model.click()
      await expect(popup.getByRole('option').first()).toContainText('Catalog fixture 63')
      await expect(popup.getByRole('option').first()).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-model-selected-late-${locale}-320.png` })
      await popup.getByRole('button', { name: labels.close, exact: true }).click()
      await expectComposerText(prompt, draft)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

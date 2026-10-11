import { expect, test } from '@playwright/test'
import { createModelCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { revealComposerControl } from './support/composer-controls'
import { expectComposerText } from './support/composer-text'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { measureVisibleLumenContrast } from './support/text-contrast'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const phase = process.env.HBAR_VISUAL_PHASE === 'before' ? 'before' : 'after'
for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['dark', 'light'] as const) {
    test(`first-send capacity and deferred creation: ${phase} ${locale} ${theme}`, async ({ browser }) => {
      test.setTimeout(120_000)
      const prefix = 'hbar-first-send-capacity-'
      const root = await mkdtemp(join(tmpdir(), prefix))
      const context = await browser.newContext({ locale, colorScheme: theme })
      const copy = getShellCopy(locale)
      const labels = preSessionCopy(locale)
      const location = preSessionLaunchCopy(locale).location
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4377), goalAutoContinue: false,
          ...(phase === 'before' ? { sourceRoot: resolve('artifacts/visual-upgrade/baseline-source') } : {}) })
        const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4375}`
        expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
        await context.addInitScript((theme) => localStorage.setItem('hbar:web:theme', theme), theme)
        const page = await context.newPage()
        page.setDefaultTimeout(10_000)
        await page.goto(origin)
        const landing = page.locator('.hbar-pre-session-landing')
        await expect(landing).toBeVisible()
        await expect(page.getByText(copy.shell.connected, { exact: true })).toBeVisible()
        for (const width of [320, 768, 1088, 1440, 1920]) {
          await page.setViewportSize({ width, height: width === 768 ? 480 : 900 })
          const directory = `artifacts/visual-upgrade/screenshots/${phase}/${locale}-${theme}-${width}`
          await mkdir(directory, { recursive: true })
          const facts = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            singleLine: [...document.querySelectorAll('[data-text-flow="single"]')].filter(node => (node as HTMLElement).checkVisibility()).map(node => ({ wrap: getComputedStyle(node).whiteSpace, ellipsis: getComputedStyle(node).textOverflow === 'ellipsis' })) }))
          const contrast = phase === 'after' ? await page.evaluate(measureVisibleLumenContrast) : []
          await page.screenshot({ path: `${directory}/pre-session.png` })
          await writeFile(`${directory}/pre-session.json`, JSON.stringify({ ...facts, contrast }, null, 2))
          if (phase === 'after') {
            expect(facts.scrollWidth).toBeLessThanOrEqual(facts.width + 1)
            expect(facts.singleLine.filter(node => node.wrap !== 'nowrap' || node.ellipsis)).toEqual([])
            expect(contrast.filter(sample => sample.ratio < sample.minimum)).toEqual([])
            await expect(landing.locator('.lumen-composer-control-rail')).toHaveCount(0)
            await expect(landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true })).toBeInViewport()
          }
        }
        if (phase === 'before') return
        await page.setViewportSize({ width: 320, height: 720 })
        const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
        const message = `First-send complete draft — ${locale}`
        await prompt.fill(message)
        await prompt.evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })))
        const sessions = createWorkspaceSessionCommandClient(host.client)
        const count = async () => (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
        expect(await count()).toBe(1)
        const locationTrigger = page.locator('.hbar-pre-session-location-picker > button')
        await revealComposerControl(page, locationTrigger, copy.session.addMenu)
        await locationTrigger.click()
        const rootPicker = page.getByRole('dialog', { name: location.title, exact: true })
        if (await rootPicker.isVisible()) await rootPicker.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
        await page.getByRole('dialog', { name: location.chooseDirectory, exact: true }).getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
        await rootPicker.getByRole('button', { name: location.close, exact: true }).click()
        const modelTrigger = page.locator('.hbar-web-pre-session-model-controls .hbar-pre-session-choice-picker > button')
        await revealComposerControl(page, modelTrigger, copy.session.addMenu)
        await modelTrigger.click()
        const model = (await createModelCommandClient(host.client).execute('model.list', {})).find(item => item.id === 'local-fixture')!
        await page.getByRole('dialog', { name: labels.model.title, exact: true }).getByRole('button', { name: new RegExp(model.modelName) }).click()
        await expect(modelTrigger).toBeFocused()
        await expectComposerText(prompt, message)
        for (const width of [1440, 320, 1088, 320]) { await page.setViewportSize({ width, height: 720 }); await expectComposerText(prompt, message) }
        await page.keyboard.press('Escape')
        await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
        await expect.poll(count).toBe(2)
      } finally {
        await context.close()
        if (host) await stopWebSessionHost(host)
        await removeOwnedFixtureDirectory(root, prefix)
      }
    })
  }

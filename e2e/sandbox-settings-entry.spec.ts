import { expect, test, type Locator, type Page } from '@playwright/test'
import { createSandboxCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue, selectLumenOption } from './support/lumen-controls'

async function removeFixture(root: string): Promise<void> {
  const target = await realpath(root)
  if (
    target !== resolve(root) ||
    dirname(target) !== (await realpath(tmpdir())) ||
    !basename(target).startsWith('hbar-sandbox-entry-')
  )
    throw new Error('Unexpected Sandbox fixture path')
  await rm(target, { recursive: true, force: true })
}

async function expectSandboxFlowFits(page: Page, panel: Locator) {
  const overflow = await panel
    .locator(
      '.hbar-sandbox-profiles, .hbar-sandbox-profiles-body, .hbar-sandbox-profiles-list, .hbar-sandbox-profiles-editor',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        overflow: node.scrollWidth - node.clientWidth,
      })),
    )
  expect(
    overflow.every((entry) => entry.overflow <= 1),
    JSON.stringify(overflow),
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`sandbox Settings remains reachable after loading and persists edits: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-sandbox-entry-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const sandbox = createSandboxCommandClient(host.client)
      const copy = getShellCopy(locale)
      const labels = copy.sandbox
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      const settings = page.getByRole('button', { name: copy.shell.settings, exact: true })
      await expect(settings.or(showSidebar)).toBeVisible()
      if (!(await settings.isVisible())) await showSidebar.click()
      await settings.click()
      await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
      const groups = page.getByRole('navigation', { name: copy.settings.groups, exact: true })
      await groups.getByRole('button', { name: labels.title, exact: true }).click()
      const panel = page.locator('.hbar-sandbox-profiles')
      await expect(panel).toBeVisible()
      await expect(panel.locator('.hbar-sandbox-profiles-item')).toHaveCount(2)
      await panel.getByRole('button', { name: labels.create, exact: true }).click()
      await panel.getByRole('textbox', { name: labels.fields.id, exact: true }).fill('entry-profile')
      const name = locale === 'zh-CN' ? '沙盒入口保存与恢复' : 'Sandbox entry save and restore'
      await panel.getByRole('textbox', { name: labels.fields.name, exact: true }).fill(name)
      await selectLumenOption(panel.getByRole('combobox', { name: labels.fields.network, exact: true }), 'disabled')
      await selectLumenOption(
        panel.getByRole('combobox', { name: labels.fields.osConfinement, exact: true }),
        'enabled',
      )
      await expect(panel.getByRole('combobox', { name: labels.fields.osConfinementMode, exact: true })).toBeVisible()
      await panel.getByRole('button', { name: labels.grants.add, exact: true }).click()
      await panel.getByRole('textbox', { name: labels.grants.path, exact: true }).fill('src')
      await selectLumenOption(panel.getByRole('combobox', { name: labels.grants.access, exact: true }), 'read')
      await panel.getByRole('button', { name: labels.commands.add, exact: true }).click()
      await panel.getByRole('textbox', { name: labels.commands.pattern, exact: true }).fill('bun test *')
      await selectLumenOption(panel.getByRole('combobox', { name: labels.commands.decision, exact: true }), 'allow')
      await panel.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(panel.getByText(labels.saved, { exact: true })).toBeVisible()
      const saved = await sandbox.execute('sandbox.get', { id: 'entry-profile' })
      expect(saved?.profile.name).toBe(name)
      expect(saved?.profile.extends).toBe(':workspace-write')
      expect(saved?.resolved?.network.enabled).toBe(false)
      await page.reload()
      await expect(settings.or(showSidebar)).toBeVisible()
      if (!(await settings.isVisible())) await showSidebar.click()
      await settings.click()
      await expect(panel).toBeVisible()
      await panel.locator('.hbar-sandbox-profiles-item').filter({ hasText: name }).click()
      await expect(panel.getByRole('textbox', { name: labels.fields.name, exact: true })).toHaveValue(name)
      await expectLumenValue(panel.getByRole('combobox', { name: labels.fields.network, exact: true }), 'disabled')
      const popupControls = panel.getByRole('combobox')
      await expect(popupControls).toHaveCount(8)
      for (let index = 0, count = 8; index < count; index += 1) {
        const control = popupControls.nth(index)
        await expect(control).toHaveAccessibleName(/.+/)
        await control.click()
        await expect(control).toHaveAttribute('aria-expanded', 'true')
        const listboxId = await control.getAttribute('aria-controls')
        expect(listboxId).toBeTruthy()
        const listbox = page.locator(`[id=${JSON.stringify(listboxId)}]`)
        await expect(listbox).toBeVisible()
        expect(await listbox.getByRole('option').count()).toBeGreaterThan(0)
        expect(await listbox.evaluate((node) => node.closest('.hbar-sandbox-profiles') === null)).toBe(true)
        expect(
          await listbox.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            return rect.top >= 0 && rect.bottom <= innerHeight + 1 && rect.left >= 0 && rect.right <= innerWidth + 1
          }),
        ).toBe(true)
        await page.keyboard.press('Escape')
        await expect(control).toHaveAttribute('aria-expanded', 'false')
        await expect(control).toBeFocused()
        expect(
          await control
            .locator('.lumen-popup-select-label')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        ).toBe(true)
      }

      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 })
        await expect(panel).toBeVisible()
        await expect(panel.getByRole('textbox', { name: labels.fields.name, exact: true })).toBeVisible()
        await expectSandboxFlowFits(page, panel)
      }

      await page.setViewportSize({ width: 1440, height: 900 })
      await panel.evaluate((node) => {
        node.style.inlineSize = '30rem'
        node.style.maxInlineSize = '100%'
      })
      const stacked = await panel.evaluate((node) => {
        const list = node.querySelector<HTMLElement>('.hbar-sandbox-profiles-list')
        const editor = node.querySelector<HTMLElement>('.hbar-sandbox-profiles-editor')
        if (!list || !editor) return null
        const listRect = list.getBoundingClientRect()
        const editorRect = editor.getBoundingClientRect()
        return { listBottom: listRect.bottom, editorTop: editorRect.top }
      })
      expect(stacked).not.toBeNull()
      if (!stacked) throw new Error('Missing owned Sandbox stacked layout bounds')
      expect(stacked.editorTop).toBeGreaterThanOrEqual(stacked.listBottom - 1)
      await expectSandboxFlowFits(page, panel)
      await panel.evaluate((node) => {
        node.style.removeProperty('inline-size')
        node.style.removeProperty('max-inline-size')
      })

      await page.setViewportSize({ width: 320, height: 844 })
      await expectLumenValue(page.getByRole('combobox', { name: copy.settings.groups, exact: true }), 'sandbox')
      await expectSandboxFlowFits(page, panel)
      await page.screenshot({ path: `artifacts/ui-repair/sandbox-${locale}-320.png` })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
}

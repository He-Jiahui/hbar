import { expect, test, type Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { globalFeatureCopy, type GlobalFeaturePageId } from '../apps/web/src/global-feature-copy'
import { storageLocationCopy } from '../apps/web/src/storage-location-copy'
import { chatDatabaseCopy } from '../apps/web/src/chat-database-copy'
import { selectLumenOption } from './support/lumen-controls'
import { openSessionTool } from './support/session-tools-menu'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const phase = process.env.HBAR_VISUAL_PHASE === 'before' ? 'before' : 'after'
const output = `artifacts/visual-upgrade/screenshots/${phase}`
const settings = [
  'general',
  'appearance',
  'model',
  'session',
  'providers',
  'sandbox',
  'storage',
  'chat-database',
  'skills',
  'extensions',
  'usage',
  'diagnostics',
] as const

async function capture(page: Page, path: string) {
  await mkdir(path.substring(0, path.lastIndexOf('/')), { recursive: true })
  const facts = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-text-context]')].filter(
      (node) =>
        node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        node.getBoundingClientRect().width > 0,
    )
    const single = nodes
      .filter((node) => node.dataset.textFlow === 'single')
      .map((node) => ({
        context: node.dataset.textContext,
        text: node.textContent?.trim(),
        wrap: getComputedStyle(node).whiteSpace,
        ellipsis: getComputedStyle(node).textOverflow === 'ellipsis',
      }))
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      semanticSlots: nodes.length,
      singleLine: single,
      visibleControls: document.querySelectorAll('button:not([disabled]), [role="tab"]').length,
      toolPresentation: document.querySelector('[data-tool-presentation]')?.getAttribute('data-tool-presentation'),
      theme: document.documentElement.dataset.lumenMode,
    }
  })
  await page.screenshot({ path: `${path}.png` })
  await writeFile(`${path}.json`, JSON.stringify(facts, null, 2))
  if (phase === 'after') {
    expect(facts.scrollWidth, path).toBeLessThanOrEqual(facts.width + 1)
    expect(
      facts.singleLine.filter((node) => node.wrap !== 'nowrap' || node.ellipsis),
      path,
    ).toEqual([])
  }
}

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['dark', 'light'] as const) {
    test(`all production page families: ${phase} ${locale} ${theme}`, async ({ browser }) => {
      test.setTimeout(180_000)
      const prefix = 'hbar-visual-upgrade-'
      const root = await mkdtemp(join(tmpdir(), prefix))
      const context = await browser.newContext({ locale, colorScheme: theme })
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({
          root,
          port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4361),
          historyCount: 12,
          goalAutoContinue: false,
          budgetAutoContinue: false,
          ...(phase === 'before'
            ? {
                sourceRoot:
                  process.env.HBAR_VISUAL_BASELINE_SOURCE ?? resolve('artifacts/visual-upgrade/baseline-source'),
              }
            : {}),
        })
        const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4359}`
        expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
          true,
        )
        await context.addInitScript(
          ({ theme, locale }) => {
            localStorage.setItem('hbar:web:theme', theme)
            localStorage.setItem('hbar:web:language', locale)
          },
          { theme, locale },
        )
        const page = await context.newPage()
        page.setDefaultTimeout(10000)
        const errors: string[] = []
        page.on('pageerror', (error) => {
          errors.push(error.message)
          if (phase === 'before') console.error('Baseline render error:', error.stack)
        })
        const copy = getShellCopy(locale)
        const globals = globalFeatureCopy(locale)
        const showSidebar = async () => {
          if (phase === 'after')
            await expect(page.locator('[data-hbar-layout-state]')).toHaveAttribute('data-hbar-layout-state', 'ready')
          if (
            (await page.locator('[data-hbar-sidebar-expanded]').getAttribute('data-hbar-sidebar-expanded')) !== 'true'
          )
            await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
          await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute(
            'data-hbar-sidebar-expanded',
            'true',
          )
        }
        const openGlobal = async (id: GlobalFeaturePageId) => {
          await page.keyboard.press('Control+Shift+P')
          const catalog = page.getByRole('dialog', { name: copy.commandPalette.title, exact: true })
          await expect(catalog).toBeVisible()
          const resultBack = catalog
            .getByRole('button', { name: copy.commandPalette.backToParameters, exact: true })
            .first()
          if (await resultBack.isVisible()) {
            await resultBack.click()
            await expect(catalog.locator('.hbar-app-react-command-palette')).toHaveAttribute('data-view', 'parameters')
          }
          const commandBack = catalog
            .getByRole('button', { name: copy.commandPalette.backToCommands, exact: true })
            .first()
          if (await commandBack.isVisible()) {
            await commandBack.click()
            await expect(catalog.locator('.hbar-app-react-command-palette')).toHaveAttribute('data-view', 'search')
          }
          await catalog.getByRole('searchbox', { name: copy.commandPalette.search, exact: true }).fill('app.openPanel')
          await catalog.locator('[role="option"][id$="-app.openPanel"]').click()
          await catalog.locator('#hbar-command-panelId').fill(id)
          await catalog.getByRole('button', { name: copy.commandPalette.execute, exact: true }).click()
          if (await catalog.isVisible())
            await catalog.getByRole('button', { name: copy.commandPalette.close, exact: true }).click()
          await expect(page.locator(`[data-global-page="${id}"]`)).toBeVisible()
        }
        for (const width of [1440, 320]) {
          await page.setViewportSize({ width, height: width === 320 ? 720 : 960 })
          await page.goto(origin)
          await showSidebar()
          await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
          await expect(
            page.getByRole('heading', { level: 1, name: host.ready.sessionTitle, exact: true }),
          ).toBeVisible()
          const directory = `${output}/${locale}-${theme}-${width}`
          await capture(page, `${directory}/conversation`)
          await showSidebar()
          await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
          await expect(page.locator('.hbar-app-react-settings-workspace')).toBeVisible()
          const navigation = page.getByRole('navigation', { name: copy.settings.groups, exact: true })
          for (const group of settings) {
            const label =
              group === 'storage'
                ? storageLocationCopy(locale).title
                : group === 'chat-database'
                  ? chatDatabaseCopy(locale).title
                  : group === 'general'
                    ? copy.general.group
                    : group === 'appearance'
                      ? copy.appearance.group
                      : group === 'usage'
                        ? copy.settingsUsage.title
                        : group === 'diagnostics'
                          ? copy.diagnostics.title
                          : copy.settings.resolve(`i18n:settings.groups.${group}`)
            if (await navigation.isVisible()) await navigation.getByRole('button', { name: label, exact: true }).click()
            else await selectLumenOption(page.getByRole('combobox', { name: copy.settings.groups, exact: true }), group)
            await expect(page.locator('.hbar-app-react-settings-content')).toBeVisible()
            await expect(page.locator('.hbar-app-react-settings-state')).toHaveCount(0)
            await capture(page, `${directory}/settings-${group}`)
          }
          await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
          for (const id of ['run-board', 'schedules', 'prompt-templates', 'onboarding', 'notifications'] as const) {
            await openGlobal(id)
            await capture(page, `${directory}/${id}`)
            await page
              .locator(`[data-global-page="${id}"]`)
              .getByRole('button', { name: globals.back, exact: true })
              .click()
          }
          await showSidebar()
          await page.getByRole('button', { name: copy.shell.status, exact: true }).click()
          await expect(page.locator('.hbar-app-react-status-workspace')).toBeVisible()
          await capture(page, `${directory}/status-center`)
          await page.getByRole('button', { name: copy.status.close, exact: true }).click()
          await page.keyboard.press('Control+K')
          await expect(page.getByRole('dialog')).toBeVisible()
          await capture(page, `${directory}/chat-search`)
          await page.keyboard.press('Escape')
          for (const tool of ['files', 'activity', 'monitoring', 'agents', 'goals', 'settings'] as const) {
            await openSessionTool(page, copy.session.tools, tool)
            await capture(page, `${directory}/session-${tool}`)
            // Reloading restores the saved panel ID and width, then returns to a predictable reading entry.
            await page.goto(origin)
            await page.keyboard.press('Escape')
            await showSidebar()
            await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
          }
        }
        for (const width of [768, 1088, 1920]) {
          await page.setViewportSize({ width, height: width === 768 ? 480 : 960 })
          await page.goto(origin)
          await showSidebar()
          if (phase === 'after')
            await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
          await capture(page, `${output}/${locale}-${theme}-${width}/conversation`)
        }
        expect(errors).toEqual([])
      } finally {
        try {
          await context.close()
        } finally {
          if (host) await stopWebSessionHost(host)
          await removeOwnedFixtureDirectory(root, prefix)
        }
      }
    })
  }

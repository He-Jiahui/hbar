import { expect, test, type Locator, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  assertReadOnly,
  capture,
  composer,
  openSession,
  openSettingsGroup,
  selectExtensionCollection,
  setDraft,
  startExtensionCollections,
  stopExtensionCollections,
  type ExtensionCollectionsFixture,
} from './support/extension-collections-fixture'
import { expectComposerText } from './support/composer-text'
import { openSessionTool } from './support/session-tools-menu'

const configurations = (['en-US', 'zh-CN'] as const).flatMap((locale) =>
  [1440, 320].map((width) => ({ locale, width, height: 900 })),
)
const evidenceRoot = resolve(process.env.HBAR_EXTENSION_NAVIGATION_EVIDENCE ?? 'artifacts/extension-navigation/browser')
const panel = (f: ExtensionCollectionsFixture) => f.page.locator('.hbar-app-react-extension-workspace')
const skills = (f: ExtensionCollectionsFixture) => panel(f).locator('.hbar-app-react-extension-skill-list li')
const filter = (f: ExtensionCollectionsFixture, collection: 'plugins' | 'skills') =>
  panel(f).getByRole('textbox', { name: f.copy.extensions.navigation[collection].filter, exact: true })
async function ready(f: ExtensionCollectionsFixture, collection: 'plugins' | 'skills') {
  await expect(
    panel(f).locator(`[data-extension-collection="${collection}"] [data-collection-status]`),
  ).toHaveAttribute('data-collection-status', 'ready')
}
async function whollyInPane(f: ExtensionCollectionsFixture, target: Locator) {
  const pane = await f.page.locator('.hbar-app-react-settings-scroll').boundingBox()
  const box = await target.boundingBox()
  if (!pane || !box) throw new Error('Expected actual rendered pane and direct entry content')
  expect(box.x).toBeGreaterThanOrEqual(pane.x)
  expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width + 1)
  expect(box.y).toBeGreaterThanOrEqual(pane.y)
  expect(box.y + box.height).toBeLessThanOrEqual(pane.y + pane.height + 1)
}
async function screenshot(f: ExtensionCollectionsFixture, directory: string, name: string) {
  await capture(f, directory, name)
  expect(
    await f.page
      .locator('.hbar-app-react-settings-scroll')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
}
async function finish(f: ExtensionCollectionsFixture, directory: string, info: TestInfo) {
  const cleanup = await stopExtensionCollections(f)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'cleanup.json')
  await writeFile(path, JSON.stringify(cleanup, null, 2))
  await info.attach('owned-host-cleanup', { path, contentType: 'application/json' })
}
async function openGlobalSettings(f: ExtensionCollectionsFixture) {
  const sidebar = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
  if (!(await sidebar.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  await f.page.getByRole('button', { name: f.copy.shell.settings, exact: true }).click()
}

for (const config of configurations) {
  test(`sidebar Extensions and skills opens real Skills without losing the conversation ${config.locale} ${config.width}`, async ({
    browser,
  }, info) => {
    const f = await startExtensionCollections(browser, { ...config, skillCount: 21 })
    const directory = join(evidenceRoot, `sidebar-${config.locale}-${config.width}`)
    const draft = `Skills sidebar original draft — ${config.locale} ${config.width}`
    try {
      await setDraft(f, draft)
      const sidebar = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
      if (!(await sidebar.isVisible()))
        await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
      const entry = sidebar.getByRole('button', { name: f.copy.shell.extensionsAndSkills, exact: true })
      await entry.click()
      await ready(f, 'skills')
      await expect(panel(f).getByRole('heading', { name: f.copy.extensions.navigation.skills.title })).toBeVisible()
      await expect(filter(f, 'skills')).toBeVisible()
      await expect(panel(f)).toContainText(f.copy.extensions.skillCount(21))
      expect(f.faults.count('plugin.list')).toBe(0)
      await screenshot(f, directory, 'skills-from-sidebar')
      if (!(await sidebar.isVisible()))
        await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
      await expect(entry).toHaveAttribute('aria-current', 'page')
      await expect(sidebar.getByRole('button', { name: f.copy.shell.settings, exact: true })).not.toHaveAttribute(
        'aria-current',
        'page',
      )
      await screenshot(f, directory, 'selected-sidebar-entry')
      if (config.width < 1024)
        await sidebar.getByRole('button', { name: f.copy.shell.hideSidebar, exact: true }).click()
      await selectExtensionCollection(f, 'plugins')
      await ready(f, 'plugins')
      await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
      await expectComposerText(composer(f), draft)
      await assertReadOnly(f)
    } finally {
      await finish(f, directory, info)
    }
  })
  for (const skillCount of [0, 21]) {
    test(`direct Skills entry and saved category ${skillCount} ${config.locale} ${config.width}`, async ({
      browser,
    }, info) => {
      const f = await startExtensionCollections(browser, { ...config, skillCount })
      const directory = join(evidenceRoot, `entry-${skillCount}-${config.locale}-${config.width}`)
      const draft = `Direct Skills original draft — ${config.locale} ${config.width}`
      try {
        await setDraft(f, draft)
        await openGlobalSettings(f)
        await selectExtensionCollection(f, 'skills')
        await ready(f, 'skills')
        const title = panel(f).getByRole('heading', { name: f.copy.extensions.navigation.skills.title, exact: true })
        await expect(title).toHaveCount(1)
        await whollyInPane(f, title)
        await expect(filter(f, 'skills')).toBeVisible()
        await expect(panel(f)).toContainText(f.copy.extensions.skillCount(skillCount))
        await expect(panel(f).locator('[data-extension-collection="plugins"]')).toHaveCount(0)
        await expect(
          panel(f).getByRole('button', { name: f.copy.extensions.openSystemCommands, exact: true }),
        ).toHaveCount(0)
        await expect(f.page.getByRole('combobox', { name: f.copy.settings.scopes, exact: true })).toHaveCount(0)
        expect(f.faults.count('plugin.list')).toBe(0)
        expect(f.faults.count('skill.list')).toBe(1)
        const entry = skillCount ? skills(f).first() : panel(f).getByText(f.copy.extensions.noSkills, { exact: true })
        // No scrolling before this assertion: the direct category must expose
        // meaningful first content in its initial viewport, not below Plugins.
        await whollyInPane(f, entry)
        await screenshot(f, directory, 'direct-skills')
        const chooser = f.page.getByRole('combobox', { name: f.copy.settings.groups, exact: true })
        if (await chooser.isVisible()) await expect(chooser).toHaveValue('skills')
        else
          await expect(
            f.page
              .getByRole('navigation', { name: f.copy.settings.groups, exact: true })
              .getByRole('button', { name: f.copy.settings.resolve('i18n:settings.groups.skills'), exact: true }),
          ).toHaveAttribute('aria-current', 'page')
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
        await expectComposerText(composer(f), draft)
        await openGlobalSettings(f)
        await ready(f, 'skills')
        await expect(title).toBeVisible()
        expect(f.faults.count('plugin.list')).toBe(0)
        await f.page.reload()
        await openSession(f)
        await openGlobalSettings(f)
        await ready(f, 'skills')
        await expect(title).toHaveCount(1)
        await expect(filter(f, 'skills')).toHaveValue('')
        expect(f.faults.count('plugin.list')).toBe(0)
        await screenshot(f, directory, 'saved-skills-category')
        // A global preference must not hijack the explicitly session-scoped entry.
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
        await openSessionTool(f.page, f.copy.session.tools, 'settings')
        await expect(f.page.getByRole('combobox', { name: f.copy.settings.scopes, exact: true })).toHaveValue('session')
        await expect(panel(f)).toHaveCount(0)
        await assertReadOnly(f)
      } finally {
        await finish(f, directory, info)
      }
    })
  }
  test(`category round trip retains independent query page and plugin detail ${config.locale} ${config.width}`, async ({
    browser,
  }, info) => {
    const f = await startExtensionCollections(browser, { ...config, skillCount: 21 })
    const directory = join(evidenceRoot, `round-trip-${config.locale}-${config.width}`)
    const draft = `Separate collection context — ${config.locale} ${config.width}`
    try {
      await setDraft(f, draft)
      await openSettingsGroup(f, 'extensions')
      await ready(f, 'plugins')
      const plugin = f.ready.plugins[0]
      if (!plugin) throw new Error('Expected an actual Host plugin')
      await filter(f, 'plugins').fill(plugin.id)
      const opener = panel(f)
        .locator(`[data-plugin-id="${plugin.id}"]`)
        .getByRole('button', { name: f.copy.extensions.inspect(plugin.name), exact: true })
      await opener.focus()
      await f.page.keyboard.press('Enter')
      const detail = panel(f).locator('.hbar-app-react-plugin-detail')
      await expect(detail.getByRole('heading', { name: plugin.name, exact: true })).toBeVisible()
      await selectExtensionCollection(f, 'skills')
      await ready(f, 'skills')
      await expect(detail).toHaveCount(0)
      await expect(filter(f, 'skills')).toHaveValue('')
      await filter(f, 'skills').fill('fixture')
      await panel(f).getByRole('button', { name: f.copy.extensions.pagination.next, exact: true }).click()
      await expect(skills(f)).toHaveCount(1)
      await expect(skills(f).first()).toContainText('fixture-skill-021')
      await screenshot(f, directory, 'skills-own-page')
      await selectExtensionCollection(f, 'plugins')
      await expect(detail.getByRole('heading', { name: plugin.name, exact: true })).toBeVisible()
      expect(f.faults.count('plugin.inspect')).toBe(1)
      await detail.getByRole('button', { name: f.copy.extensions.detail.back, exact: true }).click()
      await expect(filter(f, 'plugins')).toHaveValue(plugin.id)
      await expect(opener).toBeFocused()
      await expect(opener).toHaveAttribute('aria-current', 'true')
      await screenshot(f, directory, 'restored-plugin-row')
      await selectExtensionCollection(f, 'skills')
      await ready(f, 'skills')
      await expect(filter(f, 'skills')).toHaveValue('fixture')
      await expect(skills(f)).toHaveCount(1)
      await expect(skills(f).first()).toContainText('fixture-skill-021')
      await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
      await expectComposerText(composer(f), draft)
      await assertReadOnly(f)
    } finally {
      await finish(f, directory, info)
    }
  })
}

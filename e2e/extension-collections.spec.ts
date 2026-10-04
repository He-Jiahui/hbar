import { expect, test, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  assertReadOnly,
  capture as captureFixture,
  composer,
  openSettingsGroup,
  selectExtensionCollection,
  setDraft,
  startExtensionCollections,
  stopExtensionCollections,
  type ExtensionCollectionsFixture,
} from './support/extension-collections-fixture'
import { expectComposerText } from './support/composer-text'

type Collection = 'plugins' | 'skills'
const configurations = (['en-US', 'zh-CN'] as const).flatMap((locale) =>
  [1440, 320].map((width) => ({ locale, width, height: 900 })),
)
const evidenceRoot = resolve(
  process.env.HBAR_EXTENSION_COLLECTIONS_EVIDENCE ?? 'artifacts/extension-collections/browser',
)
const group = (collection: Collection) => (collection === 'plugins' ? 'extensions' : 'skills')
const command = (collection: Collection) => (collection === 'plugins' ? 'plugin.list' : 'skill.list')
const panel = (f: ExtensionCollectionsFixture) => f.page.locator('.hbar-app-react-extension-workspace')
const section = (f: ExtensionCollectionsFixture, collection: Collection) =>
  panel(f).locator(`[data-extension-collection="${collection}"]`)
const rows = (f: ExtensionCollectionsFixture, collection: Collection) =>
  section(f, collection).locator(
    collection === 'plugins' ? '[data-plugin-id]' : '.hbar-app-react-extension-skill-list li',
  )
const feedback = (f: ExtensionCollectionsFixture, collection: Collection) =>
  section(f, collection).locator('.hbar-app-react-extension-collection-feedback')
const retry = (f: ExtensionCollectionsFixture, collection: Collection) => feedback(f, collection).getByRole('button')
const filter = (f: ExtensionCollectionsFixture, collection: Collection) =>
  panel(f).getByRole('textbox', { name: f.copy.extensions.navigation[collection].filter, exact: true })
const state = async (f: ExtensionCollectionsFixture, collection: Collection, value: string) =>
  expect(feedback(f, collection)).toHaveAttribute('data-collection-status', value)

async function capture(f: ExtensionCollectionsFixture, directory: string, name: string) {
  await captureFixture(f, directory, name)
  const geometry = await f.page.locator('.hbar-app-react-settings-scroll').evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      left: box.left + element.clientLeft,
      right: box.left + element.clientLeft + element.clientWidth,
      fits: element.scrollWidth <= element.clientWidth + 1,
    }
  })
  expect(geometry.fits).toBe(true)
  const badges = await section(f, 'skills')
    .getByText(f.copy.extensions.discovered, { exact: true })
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right }
      }),
    )
  for (const badge of badges) {
    expect(badge.left).toBeGreaterThanOrEqual(geometry.left)
    expect(badge.right).toBeLessThanOrEqual(geometry.right + 1)
  }
}
async function finish(f: ExtensionCollectionsFixture, directory: string, info: TestInfo) {
  const cleanup = await stopExtensionCollections(f)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'cleanup.json')
  await writeFile(path, JSON.stringify(cleanup, null, 2))
  await info.attach('owned-host-cleanup', { path, contentType: 'application/json' })
}
async function returnToDraft(f: ExtensionCollectionsFixture, draft: string) {
  await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
  await expectComposerText(composer(f), draft)
  await assertReadOnly(f)
}

// Production now has two direct Settings categories. The legacy combined View
// and simultaneous independent publication remain covered by runtime/View tests.
for (const config of configurations) {
  for (const failed of ['plugins', 'skills'] as const) {
    test(`independent ${failed} failure and local recovery ${config.locale} ${config.width}`, async ({
      browser,
    }, info) => {
      const f = await startExtensionCollections(browser, { ...config, skillCount: 21 })
      const directory = join(evidenceRoot, `initial-${failed}-${config.locale}-${config.width}`)
      const good = failed === 'plugins' ? 'skills' : 'plugins'
      const draft = `Original draft ${failed} ${config.locale} ${config.width}`
      try {
        await setDraft(f, draft)
        const failure = f.faults.arm({ command: command(failed), kind: 'fail' })
        await openSettingsGroup(f, group(failed))
        await state(f, failed, 'error')
        f.faults.assertMatched(failure)
        await expect(section(f, good)).toHaveCount(0)
        expect(f.faults.count(command(good))).toBe(0)
        await expect(rows(f, failed)).toHaveCount(0)
        await expect(panel(f)).not.toContainText(
          failed === 'plugins' ? f.copy.extensions.noPlugins : f.copy.extensions.noSkills,
        )
        await expect(panel(f)).not.toContainText(
          failed === 'plugins' ? f.copy.extensions.pluginCount(0) : f.copy.extensions.skillCount(0),
        )
        await expect(panel(f)).not.toContainText('PRIVATE')
        await expect(panel(f)).not.toContainText('EXECUTION_FAILED')
        await capture(f, directory, 'initial-failure')
        const held = f.faults.arm({ command: command(failed), kind: 'hold' })
        await retry(f, failed).click()
        await expect.poll(() => f.faults.pending(held)).toBe(1)
        await state(f, failed, 'loading')
        await expect(retry(f, failed)).toBeDisabled()
        await expect(retry(f, failed)).toHaveText(f.copy.extensions.collections[failed].loading)
        await capture(f, directory, 'retry-before-navigation')
        // Leave the captured read owner, then deliver its late failed reply.
        await selectExtensionCollection(f, good)
        await state(f, good, 'ready')
        await expect(section(f, failed)).toHaveCount(0)
        await expect(rows(f, good)).toHaveCount(good === 'plugins' ? f.ready.plugins.length : 20)
        if (good === 'skills') {
          await section(f, good).getByRole('button', { name: f.copy.extensions.pagination.next, exact: true }).click()
          await expect(rows(f, good)).toHaveCount(1)
        } else {
          const plugin = f.ready.plugins[0]
          if (!plugin) throw new Error('Expected an actual Host plugin')
          const opener = section(f, good).getByRole('button', {
            name: f.copy.extensions.inspect(plugin.name),
            exact: true,
          })
          await opener.click()
          const back = panel(f).getByRole('button', { name: f.copy.extensions.detail.back, exact: true })
          await expect(back).toBeFocused()
          await back.click()
          await expect(opener).toBeFocused()
        }
        f.faults.release(held, { fail: true })
        await state(f, good, 'ready')
        f.faults.arm({ command: command(failed), kind: 'fail' })
        await selectExtensionCollection(f, failed)
        await state(f, failed, 'error')
        const siblingReads = f.faults.count(command(good))
        const recovery = f.faults.arm({ command: command(failed), kind: 'hold' })
        await retry(f, failed).click()
        await expect.poll(() => f.faults.pending(recovery)).toBe(1)
        await expect(retry(f, failed)).toBeDisabled()
        await capture(f, directory, 'retry-busy')
        f.faults.release(recovery)
        await state(f, failed, 'ready')
        await expect(rows(f, failed)).toHaveCount(failed === 'plugins' ? f.ready.plugins.length : 20)
        await expect(
          panel(f).getByRole('heading', { name: f.copy.extensions.navigation[failed].title, exact: true }),
        ).toBeFocused()
        expect(f.faults.count(command(good))).toBe(siblingReads)
        expect(f.faults.count(command(failed))).toBe(4)
        await capture(f, directory, 'recovered')
        await selectExtensionCollection(f, good)
        await state(f, good, 'ready')
        await expect(rows(f, good)).toHaveCount(good === 'plugins' ? f.ready.plugins.length : 1)
        await returnToDraft(f, draft)
      } finally {
        await finish(f, directory, info)
      }
    })
  }
  test(`independent loading and confirmed empty ${config.locale} ${config.width}`, async ({ browser }, info) => {
    const f = await startExtensionCollections(browser, { ...config, skillCount: 0 })
    const directory = join(evidenceRoot, `empty-${config.locale}-${config.width}`)
    try {
      const plugins = f.faults.arm({ command: 'plugin.list', kind: 'hold' })
      await openSettingsGroup(f, 'extensions')
      await state(f, 'plugins', 'loading')
      await expect.poll(() => f.faults.pending(plugins)).toBe(1)
      await expect(panel(f)).not.toContainText(f.copy.extensions.noPlugins)
      expect(f.faults.count('skill.list')).toBe(0)
      await capture(f, directory, 'plugins-loading')
      const skills = f.faults.arm({ command: 'skill.list', kind: 'hold' })
      await selectExtensionCollection(f, 'skills')
      await state(f, 'skills', 'loading')
      await expect.poll(() => f.faults.pending(skills)).toBe(1)
      await expect(panel(f)).not.toContainText(f.copy.extensions.noSkills)
      await expect(panel(f)).not.toContainText(f.copy.extensions.skillCount(0))
      f.faults.release(plugins)
      await state(f, 'skills', 'loading')
      await expect(section(f, 'plugins')).toHaveCount(0)
      await capture(f, directory, 'independent-skills-loading')
      f.faults.release(skills)
      await state(f, 'skills', 'ready')
      await expect(panel(f)).toContainText(f.copy.extensions.noSkills)
      await expect(panel(f)).toContainText(f.copy.extensions.skillCount(0))
      await capture(f, directory, 'confirmed-empty')
      await selectExtensionCollection(f, 'plugins')
      await state(f, 'plugins', 'ready')
      await expect(rows(f, 'plugins')).toHaveCount(f.ready.plugins.length)
      const optional = f.ready.plugins.find((plugin) => !plugin.required)
      if (!optional) throw new Error('Expected an optional actual plugin')
      await expect(
        section(f, 'plugins').locator(`[data-plugin-id="${optional.id}"]`).getByRole('button').last(),
      ).toBeEnabled()
      await assertReadOnly(f)
    } finally {
      await finish(f, directory, info)
    }
  })
  test(`failed refresh retains snapshots filter and page ${config.locale} ${config.width}`, async ({
    browser,
  }, info) => {
    const f = await startExtensionCollections(browser, { ...config, skillCount: 21 })
    const directory = join(evidenceRoot, `stale-${config.locale}-${config.width}`)
    const draft = `Retained draft ${config.locale} ${config.width}`
    try {
      await setDraft(f, draft)
      await openSettingsGroup(f, 'extensions')
      await state(f, 'plugins', 'ready')
      await filter(f, 'plugins').fill('a')
      const pluginIds = await rows(f, 'plugins').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-plugin-id')),
      )
      await selectExtensionCollection(f, 'skills')
      await state(f, 'skills', 'ready')
      await expect(filter(f, 'skills')).toHaveValue('')
      await filter(f, 'skills').fill('fixture')
      await section(f, 'skills').getByRole('button', { name: f.copy.extensions.pagination.next, exact: true }).click()
      await expect(rows(f, 'skills')).toHaveCount(1)
      const skillText = await rows(f, 'skills').innerText()
      f.faults.arm({ command: 'skill.list', kind: 'fail' })
      await panel(f).getByRole('button', { name: f.copy.extensions.refresh, exact: true }).click()
      await state(f, 'skills', 'error')
      await expect(panel(f)).toContainText(f.copy.extensions.collections.skills.stale)
      await expect(rows(f, 'skills')).toHaveText(skillText, { useInnerText: true })
      await capture(f, directory, 'stale-skills')
      f.faults.arm({ command: 'plugin.list', kind: 'fail' })
      await selectExtensionCollection(f, 'plugins')
      await state(f, 'plugins', 'error')
      await expect(filter(f, 'plugins')).toHaveValue('a')
      expect(
        await rows(f, 'plugins').evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-plugin-id')),
        ),
      ).toEqual(pluginIds)
      await expect(panel(f)).toContainText(f.copy.extensions.collections.plugins.stale)
      const siblingReads = f.faults.count('skill.list')
      const held = f.faults.arm({ command: 'plugin.list', kind: 'hold' })
      await retry(f, 'plugins').click()
      await expect.poll(() => f.faults.pending(held)).toBe(1)
      await filter(f, 'plugins').focus()
      f.faults.release(held)
      await state(f, 'plugins', 'ready')
      await expect(filter(f, 'plugins')).toBeFocused()
      expect(f.faults.count('skill.list')).toBe(siblingReads)
      f.faults.arm({ command: 'skill.list', kind: 'fail' })
      await selectExtensionCollection(f, 'skills')
      await state(f, 'skills', 'error')
      await expect(filter(f, 'skills')).toHaveValue('fixture')
      await expect(rows(f, 'skills')).toHaveText(skillText, { useInnerText: true })
      await retry(f, 'skills').click()
      await state(f, 'skills', 'ready')
      await expect(rows(f, 'skills')).toHaveText(skillText, { useInnerText: true })
      await capture(f, directory, 'stale-recovered')
      await returnToDraft(f, draft)
    } finally {
      await finish(f, directory, info)
    }
  })
}
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const skillCount of [1, 20]) {
    test(`bounded skill rows ${skillCount} ${locale} 320`, async ({ browser }, info) => {
      const f = await startExtensionCollections(browser, { locale, width: 320, height: 900, skillCount })
      const directory = join(evidenceRoot, `boundary-${skillCount}-${locale}-320`)
      try {
        await openSettingsGroup(f, 'skills')
        await state(f, 'skills', 'ready')
        await expect(rows(f, 'skills')).toHaveCount(skillCount)
        await expect(section(f, 'plugins')).toHaveCount(0)
        expect(f.faults.count('plugin.list')).toBe(0)
        await expect(
          section(f, 'skills').getByRole('button', { name: f.copy.extensions.pagination.next, exact: true }),
        ).toHaveCount(0)
        await rows(f, 'skills').last().scrollIntoViewIfNeeded()
        await capture(f, directory, 'skill-capacity')
        await assertReadOnly(f)
      } finally {
        await finish(f, directory, info)
      }
    })
  }
for (const config of [
  { locale: 'en-US' as const, width: 1440 },
  { locale: 'zh-CN' as const, width: 320 },
]) {
  test(`late read cannot steal focus after settings group changes ${config.locale} ${config.width}`, async ({
    browser,
  }, info) => {
    const f = await startExtensionCollections(browser, { ...config, skillCount: 21 })
    const directory = join(evidenceRoot, `lifetime-${config.locale}-${config.width}`)
    try {
      f.faults.arm({ command: 'skill.list', kind: 'fail' })
      await openSettingsGroup(f, 'skills')
      await state(f, 'skills', 'error')
      const original = f.faults.arm({ command: 'skill.list', kind: 'hold' })
      await retry(f, 'skills').click()
      await expect.poll(() => f.faults.pending(original)).toBe(1)
      const select = f.page.getByRole('combobox', { name: f.copy.settings.groups, exact: true })
      if (await select.isVisible()) await select.selectOption('general')
      else
        await f.page
          .getByRole('navigation', { name: f.copy.settings.groups, exact: true })
          .getByRole('button', { name: f.copy.general.group, exact: true })
          .click()
      await expect(panel(f)).toHaveCount(0)
      await selectExtensionCollection(f, 'skills')
      await state(f, 'skills', 'ready')
      await filter(f, 'skills').fill('fixture-skill-021')
      await expect(rows(f, 'skills')).toHaveCount(1)
      f.faults.release(original)
      await expect(filter(f, 'skills')).toBeFocused()
      await expect(filter(f, 'skills')).toHaveValue('fixture-skill-021')
      await state(f, 'skills', 'ready')
      await expect(rows(f, 'skills')).toHaveCount(1)
      expect(f.faults.count('skill.list')).toBe(3)
      await capture(f, directory, 'late-response-after-remount')
      await assertReadOnly(f)
    } finally {
      await finish(f, directory, info)
    }
  })
}

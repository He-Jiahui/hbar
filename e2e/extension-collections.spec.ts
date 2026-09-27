import { expect, test, type Locator, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  assertReadOnly,
  capture as captureFixture,
  composer,
  openExtensions,
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
function section(f: ExtensionCollectionsFixture, collection: Collection) {
  return f.page.getByRole('region', { name: f.copy.extensions[collection], exact: true })
}
function rows(f: ExtensionCollectionsFixture, collection: Collection) {
  return section(f, collection).locator(
    collection === 'plugins' ? '[data-plugin-id]' : '.hbar-app-react-extension-skill-list li',
  )
}
function feedback(f: ExtensionCollectionsFixture, collection: Collection) {
  return section(f, collection).locator('.hbar-app-react-extension-collection-feedback')
}
function retry(f: ExtensionCollectionsFixture, collection: Collection) {
  return feedback(f, collection).getByRole('button')
}
async function usable(control: Locator) {
  await control.scrollIntoViewIfNeeded()
  await expect(control).toBeEnabled()
  expect(
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return (
        box.left >= 0 &&
        box.right <= innerWidth + 1 &&
        box.top >= 0 &&
        box.bottom <= innerHeight + 1 &&
        hit !== null &&
        (element === hit || element.contains(hit))
      )
    }),
  ).toBe(true)
}
async function state(f: ExtensionCollectionsFixture, collection: Collection, value: string) {
  await expect(feedback(f, collection)).toHaveAttribute('data-collection-status', value)
}
async function capture(f: ExtensionCollectionsFixture, directory: string, name: string) {
  await captureFixture(f, directory, name)
  const scroll = f.page.locator('.hbar-app-react-settings-scroll')
  expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  const bounds = await scroll.boundingBox()
  if (!bounds) throw new Error('Expected the visible Settings scrolling pane')
  const badgeBounds = await section(f, 'skills')
    .getByText(f.copy.extensions.discovered, { exact: true })
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { left: box.left, right: box.right }
      }),
    )
  for (const badge of badgeBounds) {
    expect(badge.left).toBeGreaterThanOrEqual(bounds.x)
    expect(badge.right).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
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

for (const config of configurations) {
  for (const failed of ['plugins', 'skills'] as const) {
    test(`independent ${failed} failure and local recovery ${config.locale} ${config.width}`, async ({
      browser,
    }, info) => {
      const f = await startExtensionCollections(browser, { ...config, skillCount: 21 })
      const directory = join(evidenceRoot, `initial-${failed}-${config.locale}-${config.width}`)
      const good = failed === 'plugins' ? 'skills' : 'plugins'
      const command = failed === 'plugins' ? 'plugin.list' : 'skill.list'
      const siblingCommand = failed === 'plugins' ? 'skill.list' : 'plugin.list'
      const draft = `Original draft ${failed} ${config.locale} ${config.width}`
      try {
        await setDraft(f, draft)
        const failure = f.faults.arm({ command, kind: 'fail' })
        await openExtensions(f)
        await state(f, failed, 'error')
        await state(f, good, 'ready')
        f.faults.assertMatched(failure)
        await expect(rows(f, good)).toHaveCount(good === 'plugins' ? f.ready.plugins.length : 20)
        await expect(rows(f, failed)).toHaveCount(0)
        await expect(section(f, failed)).not.toContainText(
          failed === 'plugins' ? f.copy.extensions.noPlugins : f.copy.extensions.noSkills,
        )
        await expect(section(f, failed)).not.toContainText(
          failed === 'plugins' ? f.copy.extensions.pluginCount(0) : f.copy.extensions.skillCount(0),
        )
        await expect(section(f, failed)).not.toContainText('PRIVATE')
        await expect(section(f, failed)).not.toContainText('EXECUTION_FAILED')
        await usable(retry(f, failed))
        await capture(f, directory, 'initial-failure')
        const siblingReads = f.faults.count(siblingCommand)
        const held = f.faults.arm({ command, kind: 'hold' })
        await retry(f, failed).click()
        await expect.poll(() => f.faults.pending(held)).toBe(1)
        await state(f, failed, 'loading')
        await expect(retry(f, failed)).toBeDisabled()
        await expect(retry(f, failed)).toHaveText(f.copy.extensions.collections[failed].loading)
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
          const back = f.page.getByRole('button', { name: f.copy.extensions.detail.back, exact: true })
          await expect(back).toBeFocused()
          await back.click()
          await expect(opener).toBeFocused()
        }
        expect(f.faults.count(siblingCommand)).toBe(siblingReads)
        f.faults.release(held, { fail: true })
        await state(f, failed, 'error')
        await usable(retry(f, failed))
        const recovery = f.faults.arm({ command, kind: 'hold' })
        await retry(f, failed).click()
        await expect.poll(() => f.faults.pending(recovery)).toBe(1)
        await expect(retry(f, failed)).toBeDisabled()
        await capture(f, directory, 'retry-busy')
        f.faults.release(recovery)
        await state(f, failed, 'ready')
        await expect(rows(f, failed)).toHaveCount(failed === 'plugins' ? f.ready.plugins.length : 20)
        await expect(
          section(f, failed).getByRole('heading', { name: f.copy.extensions[failed], exact: true }),
        ).toBeFocused()
        await expect(rows(f, good)).toHaveCount(good === 'plugins' ? f.ready.plugins.length : 1)
        expect(f.faults.count(siblingCommand)).toBe(siblingReads)
        expect(f.faults.count(command)).toBe(3)
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
        await capture(f, directory, 'recovered')
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
      const skills = f.faults.arm({ command: 'skill.list', kind: 'hold' })
      await openExtensions(f)
      for (const collection of ['plugins', 'skills'] as const) await state(f, collection, 'loading')
      await expect.poll(() => f.faults.pending(plugins) + f.faults.pending(skills)).toBe(2)
      await expect(section(f, 'plugins')).not.toContainText(f.copy.extensions.noPlugins)
      await expect(section(f, 'skills')).not.toContainText(f.copy.extensions.noSkills)
      await expect(section(f, 'skills')).not.toContainText(f.copy.extensions.skillCount(0))
      await capture(f, directory, 'both-loading')
      f.faults.release(plugins)
      await state(f, 'plugins', 'ready')
      await expect(rows(f, 'plugins')).toHaveCount(f.ready.plugins.length)
      await state(f, 'skills', 'loading')
      const optional = f.ready.plugins.find((plugin) => !plugin.required)
      if (!optional) throw new Error('Expected an optional actual plugin')
      await expect(
        section(f, 'plugins').locator(`[data-plugin-id="${optional.id}"]`).getByRole('button').last(),
      ).toBeEnabled()
      await capture(f, directory, 'plugins-ready-skills-loading')
      f.faults.release(skills)
      await state(f, 'skills', 'ready')
      await expect(section(f, 'skills')).toContainText(f.copy.extensions.noSkills)
      await expect(section(f, 'skills')).toContainText(f.copy.extensions.skillCount(0))
      await section(f, 'skills').scrollIntoViewIfNeeded()
      await capture(f, directory, 'confirmed-empty')
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
      await openExtensions(f)
      for (const collection of ['plugins', 'skills'] as const) await state(f, collection, 'ready')
      const filter = f.page.getByRole('textbox', { name: f.copy.extensions.filter, exact: true })
      await filter.fill('a')
      await section(f, 'skills').getByRole('button', { name: f.copy.extensions.pagination.next, exact: true }).click()
      await expect(rows(f, 'skills')).toHaveCount(1)
      const pluginIds = await rows(f, 'plugins').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-plugin-id')),
      )
      const skillText = await rows(f, 'skills').innerText()
      f.faults.arm({ command: 'plugin.list', kind: 'fail' })
      f.faults.arm({ command: 'skill.list', kind: 'fail' })
      await f.page.getByRole('button', { name: f.copy.extensions.refresh, exact: true }).click()
      for (const collection of ['plugins', 'skills'] as const) {
        await state(f, collection, 'error')
        await expect(section(f, collection)).toContainText(f.copy.extensions.collections[collection].stale)
      }
      await expect(filter).toHaveValue('a')
      expect(
        await rows(f, 'plugins').evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-plugin-id')),
        ),
      ).toEqual(pluginIds)
      await expect(rows(f, 'skills')).toHaveText(skillText, { useInnerText: true })
      await usable(retry(f, 'skills'))
      await capture(f, directory, 'stale-skills')
      const held = f.faults.arm({ command: 'plugin.list', kind: 'hold' })
      await retry(f, 'plugins').click()
      await expect.poll(() => f.faults.pending(held)).toBe(1)
      // The user deliberately moves focus during recovery; completion must not steal it.
      await filter.focus()
      f.faults.release(held)
      await state(f, 'plugins', 'ready')
      await expect(filter).toBeFocused()
      await state(f, 'skills', 'error')
      await expect(rows(f, 'skills')).toHaveText(skillText, { useInnerText: true })
      expect(f.faults.count('skill.list')).toBe(2)
      await retry(f, 'skills').click()
      await state(f, 'skills', 'ready')
      await expect(filter).toHaveValue('a')
      await expect(rows(f, 'skills')).toHaveText(skillText, { useInnerText: true })
      await capture(f, directory, 'stale-recovered')
      await returnToDraft(f, draft)
    } finally {
      await finish(f, directory, info)
    }
  })
}
for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const skillCount of [1, 20]) {
    test(`bounded skill rows ${skillCount} ${locale} 320`, async ({ browser }, info) => {
      const f = await startExtensionCollections(browser, { locale, width: 320, height: 900, skillCount })
      const directory = join(evidenceRoot, `boundary-${skillCount}-${locale}-320`)
      try {
        await openExtensions(f)
        await state(f, 'skills', 'ready')
        await expect(rows(f, 'skills')).toHaveCount(skillCount)
        await expect(
          section(f, 'skills').getByRole('button', { name: f.copy.extensions.pagination.next, exact: true }),
        ).toHaveCount(0)
        await rows(f, 'skills').last().scrollIntoViewIfNeeded()
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
        await capture(f, directory, 'skill-capacity')
        await assertReadOnly(f)
      } finally {
        await finish(f, directory, info)
      }
    })
  }
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
    const chooseGroup = async (id: 'general' | 'extensions') => {
      const select = f.page.getByRole('combobox', { name: f.copy.settings.groups, exact: true })
      if (await select.isVisible()) await select.selectOption(id)
      else
        await f.page
          .getByRole('navigation', { name: f.copy.settings.groups, exact: true })
          .getByRole('button', {
            name: id === 'general' ? f.copy.general.group : f.copy.settings.resolve('i18n:settings.groups.extensions'),
            exact: true,
          })
          .click()
    }
    try {
      f.faults.arm({ command: 'skill.list', kind: 'fail' })
      await openExtensions(f)
      await state(f, 'skills', 'error')
      const original = f.faults.arm({ command: 'skill.list', kind: 'hold' })
      await retry(f, 'skills').click()
      await expect.poll(() => f.faults.pending(original)).toBe(1)
      await chooseGroup('general')
      await expect(f.page.locator('.hbar-app-react-extension-workspace')).toHaveCount(0)
      await chooseGroup('extensions')
      await state(f, 'skills', 'ready')
      await expect(rows(f, 'skills')).toHaveCount(20)
      const filter = f.page.getByRole('textbox', { name: f.copy.extensions.filter, exact: true })
      await filter.fill('fixture-skill-021')
      await expect(rows(f, 'skills')).toHaveCount(1)
      f.faults.release(original)
      await expect(filter).toBeFocused()
      await expect(filter).toHaveValue('fixture-skill-021')
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

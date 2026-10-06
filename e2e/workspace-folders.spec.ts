import { expect, test, type Locator } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { start, stop, showSidebar, row, type Fixture } from './support/workspace-display-names-fixture'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { workspaceFoldersCopy } from '../apps/web/src/workspace-folders-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'

const evidence = 'artifacts/ui-repair/workspace-folders-browser'
async function geometry(f: Fixture, dialog: Locator, name: string) {
  const measurements = await dialog.evaluate((root) => {
    const rect = root.getBoundingClientRect()
    return {
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      dialogOverflow: root.scrollWidth > root.clientWidth + 1,
      insideViewport:
        rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      clippedControls: [...root.querySelectorAll<HTMLElement>('input,button')]
        .filter((element) => {
          const box = element.getBoundingClientRect()
          return element.getClientRects().length > 0 && (box.left < rect.left - 1 || box.right > rect.right + 1)
        })
        .map((element) => element.getAttribute('aria-label') ?? element.textContent),
    }
  })
  expect(measurements).toEqual({
    pageOverflow: false,
    dialogOverflow: false,
    insideViewport: true,
    clippedControls: [],
  })
  await f.page.screenshot({ path: `${evidence}/${name}.png` })
}
async function manage(f: Fixture, workspaceId: string) {
  await showSidebar(f)
  const trigger = row(f, workspaceId).locator('.hbar-app-react-project-menu .lumen-action-menu-trigger')
  await trigger.click()
  const menu = await lumenMenuForTrigger(trigger)
  await menu.getByRole('menuitem', { name: workspaceFoldersCopy(f.locale).manage, exact: true }).click()
  const dialog = f.page.getByRole('dialog', { name: workspaceFoldersCopy(f.locale).manage, exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})
for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const width of [1440, 390]) {
    test(`real Host multi-root selection, priority, editing and reference-only removal ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const f = await start(browser, locale, width)
      const labels = workspaceFoldersCopy(locale)
      const api = createWorkspaceSessionCommandClient(f.external)
      const files = createFileCommandClient(f.external)
      const front = join(f.root, 'frontend-' + 'long-directory-name-'.repeat(4))
      const back = join(f.root, 'nested', 'backend')
      const replacement = join(f.root, 'frontend-replacement')
      try {
        await mkdir(front, { recursive: true })
        await mkdir(back, { recursive: true })
        await mkdir(replacement)
        await writeFile(join(front, 'origin.txt'), 'frontend original')
        await writeFile(join(back, 'origin.txt'), 'backend original')
        await writeFile(join(replacement, 'origin.txt'), 'replacement original')
        await showSidebar(f)
        await f.page.getByRole('button', { name: f.copy.shell.openWorkspace, exact: true }).click()
        const picker = f.page.getByRole('dialog', { name: f.copy.shell.openWorkspace, exact: true })
        await picker.getByRole('textbox', { name: f.copy.shell.workspacePath, exact: true }).fill(f.root)
        // The button belongs to the same input row; it opens server browsing directly.
        await picker.getByRole('button', { name: labels.browse, exact: true }).click()
        let dialog = f.page.getByRole('dialog', { name: labels.browse, exact: true })
        await expect(dialog).toBeVisible()
        await expect(f.page.getByRole('dialog')).toHaveCount(1)
        await expect(dialog.locator('select')).toHaveCount(0)
        const frontName = front.split(/[\\/]/).at(-1)!
        await dialog.getByRole('checkbox', { name: labels.selectFolder(frontName), exact: true }).check()
        await dialog.getByRole('button', { name: labels.openFolder('nested'), exact: true }).click()
        await dialog.getByRole('checkbox', { name: labels.selectFolder('backend'), exact: true }).check()
        await expect(dialog).toContainText(labels.selected(2))
        await geometry(f, dialog, `browse-${locale}-${width}`)
        await dialog.getByRole('button', { name: labels.addSelected, exact: true }).click()
        dialog = f.page.getByRole('dialog', { name: labels.create, exact: true })
        const roots = dialog.locator('.hbar-workspace-folder-list > li')
        await expect(roots).toHaveCount(2)
        await roots.nth(0).getByRole('textbox', { name: labels.alias, exact: true }).fill('frontend')
        await roots.nth(1).getByRole('button', { name: labels.moveUp, exact: true }).click()
        await expect(roots.first()).toContainText('backend/')
        await expect(roots.first()).toContainText(labels.primary)
        await geometry(f, dialog, `manage-${locale}-${width}`)
        await dialog.getByRole('button', { name: labels.save, exact: true }).click()
        dialog = f.page.getByRole('dialog', { name: labels.manage, exact: true })
        await expect(dialog).toContainText(labels.status.saved)
        const directory = await api.execute('workspace.list', { limit: 100 })
        const workspace = directory.items.find((item) => item.path === back)
        expect(workspace).toBeDefined()
        const id = workspace!.id
        const snapshot = await api.execute('workspace.folders.get', { workspaceId: id })
        expect(snapshot.folders.map((folder) => folder.alias)).toEqual(['backend', 'frontend'])
        expect((await files.execute('file.read', { workspaceId: id, path: 'origin.txt' })).text).toBe(
          'backend original',
        )
        expect((await files.execute('file.read', { workspaceId: id, path: 'frontend/origin.txt' })).text).toBe(
          'frontend original',
        )
        await dialog.getByRole('button', { name: labels.done, exact: true }).click()
        if (locale === 'en-US' && width === 1440) {
          const location = preSessionLaunchCopy(locale).location
          await f.page.locator('.hbar-pre-session-location-picker > button').click()
          const locationDialog = f.page.getByRole('dialog', { name: location.title, exact: true })
          await locationDialog.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
          const directoryPicker = f.page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
          await expect(directoryPicker.locator('.hbar-workspace-folder-entry-row input')).toBeVisible()
          await directoryPicker.getByRole('button', { name: labels.browse, exact: true }).click()
          const preSessionBrowser = f.page.getByRole('dialog', { name: labels.browse, exact: true })
          await expect(preSessionBrowser).toBeVisible()
          await expect(f.page.getByRole('dialog')).toHaveCount(1)
          await expect(preSessionBrowser.locator('.hbar-workspace-folder-current')).toHaveText(back)
          await preSessionBrowser.getByRole('button', { name: labels.cancel, exact: true }).last().click()
        }
        await f.page.reload()
        dialog = await manage(f, id)
        const loaded = dialog.locator('.hbar-workspace-folder-list > li')
        await expect(loaded.first().getByRole('textbox', { name: labels.alias, exact: true })).toHaveValue('backend')
        await loaded.nth(1).getByRole('textbox', { name: labels.path, exact: true }).fill(replacement)
        await loaded.nth(1).getByRole('textbox', { name: labels.alias, exact: true }).fill('web')
        await loaded.nth(1).getByRole('button', { name: labels.moveUp, exact: true }).click()
        await dialog.getByRole('button', { name: labels.save, exact: true }).click()
        await expect(dialog).toContainText(labels.status.saved)
        expect((await files.execute('file.read', { workspaceId: id, path: 'origin.txt' })).text).toBe(
          'replacement original',
        )
        await dialog.getByRole('button', { name: labels.done, exact: true }).click()
        dialog = await manage(f, id)
        await dialog
          .locator('.hbar-workspace-folder-list > li')
          .nth(1)
          .getByRole('button', { name: labels.remove, exact: true })
          .click()
        await dialog.getByRole('button', { name: labels.save, exact: true }).click()
        await expect(dialog).toContainText(labels.status.saved)
        expect(
          (await api.execute('workspace.folders.get', { workspaceId: id })).folders.map((folder) => folder.alias),
        ).toEqual(['web'])
        expect(await readFile(join(back, 'origin.txt'), 'utf8')).toBe('backend original')
        expect(await readFile(join(front, 'origin.txt'), 'utf8')).toBe('frontend original')
        expect(f.errors).toEqual([])
      } finally {
        await stop(f)
      }
    })
  }
}

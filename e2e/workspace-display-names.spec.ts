import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { expectComposerText } from './support/composer-text'
import {
  evidence,
  start,
  stop,
  row,
  showSidebar,
  hideSidebar,
  composer,
  openEditor,
  capture,
  noExecution,
} from './support/workspace-display-names-fixture'

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})
for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 900, 390, 320]) {
    test(`project display-name editor, global captions, cancel and immediate reset: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(120000)
      const f = await start(browser, locale, width)
      try {
        const api = createWorkspaceSessionCommandClient(f.external)
        const draft = `Original conversation draft ${locale} ${width}`
        await composer(f).fill(draft)
        let dialog = await openEditor(f)
        const input = dialog.getByTestId('workspace-display-name-input')
        await expect(dialog.getByRole('textbox', { name: f.names.path, exact: true })).toHaveValue(
          f.ready.firstWorkspace.path,
        )
        await input.fill('Canceled draft')
        await dialog.getByRole('button', { name: f.names.cancel, exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expect(row(f).locator('.hbar-app-react-project-menu summary')).toBeFocused()
        expect(await api.execute('workspaceDisplayNames.get', {})).toMatchObject({ revision: 0, entries: [] })
        dialog = await openEditor(f)
        await expect(input).toHaveValue(f.ready.firstWorkspace.name)
        await input.fill(' ')
        await dialog.getByRole('button', { name: f.names.save, exact: true }).click()
        await expect(dialog).toContainText(f.names.validation.required)
        await expect(input).toBeFocused()
        await capture(f, `required-${locale}-${width}`)
        await input.fill('😀'.repeat(41))
        await dialog.getByRole('button', { name: f.names.save, exact: true }).click()
        await expect(dialog).toContainText(f.names.validation.tooLong)
        await expect(input).toBeFocused()
        await input.fill('  Alpha    项目  ')
        await input.dispatchEvent('compositionstart')
        await input.press('Enter')
        await expect(dialog).toBeVisible()
        expect(f.commands.filter((name) => name === 'workspaceDisplayNames.apply')).toHaveLength(0)
        await input.dispatchEvent('compositionend')
        await capture(f, `edit-${locale}-${width}`)
        await input.press('Enter')
        await expect(dialog).toHaveCount(0)
        await expect(row(f)).toContainText('Alpha 项目')
        await expect(row(f).locator('.hbar-app-react-project-menu summary')).toBeFocused()
        expect((await api.execute('workspaceDisplayNames.get', {})).entries).toEqual([
          { workspaceId: f.ready.firstWorkspace.id, displayName: 'Alpha 项目' },
        ])
        expect(await api.execute('workspace.get', { workspaceId: f.ready.firstWorkspace.id })).toEqual(
          f.ready.firstWorkspace,
        )
        await hideSidebar(f)
        await expect(f.page.locator('.hbar-session-project-context-name').first()).toHaveText('Alpha 项目')
        await expect(f.page.locator('.hbar-session-project-context-name').first()).toHaveAttribute(
          'title',
          f.ready.firstWorkspace.path,
        )
        await expectComposerText(composer(f), draft)
        await capture(f, `saved-${locale}-${width}`)
        await showSidebar(f)
        await f.page.getByRole('button', { name: f.copy.shell.openWorkspace, exact: true }).click()
        const picker = f.page.getByRole('dialog', { name: f.copy.shell.openWorkspace, exact: true })
        await expect(picker.getByRole('button', { name: 'Alpha 项目', exact: true })).toContainText(
          f.ready.firstWorkspace.path,
        )
        await picker.getByRole('button', { name: f.copy.shell.cancel, exact: true }).last().click()
        dialog = await openEditor(f)
        await expect(input).toHaveValue('Alpha 项目')
        await dialog.getByRole('button', { name: f.names.save, exact: true }).click()
        await expect(dialog).toHaveCount(0)
        expect(f.commands.filter((name) => name === 'workspaceDisplayNames.apply')).toHaveLength(1)
        dialog = await openEditor(f)
        await capture(f, `restore-entry-${locale}-${width}`)
        await dialog.getByRole('button', { name: f.names.restore, exact: true }).click()
        await expect(dialog).toBeVisible()
        await expect(input).toHaveValue(f.ready.firstWorkspace.name)
        await expect(dialog.getByRole('button', { name: f.names.restore, exact: true })).toHaveCount(0)
        await expect(input).toBeFocused()
        await capture(f, `restored-${locale}-${width}`)
        await dialog.getByRole('button', { name: f.names.cancel, exact: true }).click()
        expect((await api.execute('workspaceDisplayNames.get', {})).entries).toEqual([])
        await hideSidebar(f)
        await expectComposerText(composer(f), draft)
        await expect(
          f.page.getByRole('tab', { name: f.ready.firstSession.title, exact: true, includeHidden: true }),
        ).toHaveAttribute('aria-selected', 'true')
        await noExecution(f)
      } finally {
        await stop(f)
      }
    })
  }
}

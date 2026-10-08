import { expect, test, type Locator } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expectComposerText } from './support/composer-text'
import { openSessionTool } from './support/session-tools-menu'
import { expectLumenValue, lumenMenuForTrigger, selectLumenOption } from './support/lumen-controls'
import {
  evidence,
  start,
  stop,
  showSidebar,
  hideSidebar,
  row,
  composer,
  openEditor,
  capture,
  noExecution,
  type Fixture,
} from './support/workspace-display-names-fixture'

const phase = process.env.HBAR_DISPLAY_NAME_CONSUMER_PHASE ?? 'consumers-v1'
if (!/^[A-Za-z0-9_-]+$/.test(phase)) throw new Error('Invalid consumer evidence phase')
const output = `${evidence}/${phase}`
const fileName = 'organization-notes.md'
const dirtyFile = '# Unsaved original material — 保留原文件草稿\n'
const attachmentName = 'alias-consumer-material.md'
const sharedAlias = 'Shared display name — 同名别名'
const captureTrace = process.env.HBAR_DISPLAY_NAMES_TRACE === '1'

function files(f: Fixture) {
  return f.page.locator('.lumen-app-tool-drawer .hbar-app-react-file-workspace')
}
function sessionTab(f: Fixture) {
  return f.page.getByRole('tab', { name: f.ready.firstSession.title, exact: true, includeHidden: true })
}
async function selectGroup(f: Fixture, id: 'model' | 'session' | 'appearance') {
  const mobile = f.page.getByRole('combobox', { name: f.copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, id)
  else
    await f.page
      .getByRole('navigation', { name: f.copy.settings.groups, exact: true })
      .getByRole('button', {
        name: id === 'appearance' ? f.copy.appearance.group : f.copy.settings.resolve(`i18n:settings.groups.${id}`),
        exact: true,
      })
      .click()
}
async function expectLumenOptions(
  control: Locator,
  expected: readonly { readonly value: string; readonly label: string | null }[],
  onlyExpected = false,
): Promise<void> {
  await control.click()
  await expect(control).toHaveAttribute('aria-expanded', 'true')
  const listboxId = await control.getAttribute('aria-controls')
  if (!listboxId) throw new Error('Lumen choice control does not identify its listbox')
  const listbox = control.page().locator(`[id=${JSON.stringify(listboxId)}]`)
  await expect
    .poll(() =>
      listbox
        .getByRole('option')
        .evaluateAll(
          (options, values) =>
            options
              .filter((option) => values === null || values.includes(option.getAttribute('data-value') ?? ''))
              .map((option) => ({ value: option.getAttribute('data-value') ?? '', label: option.textContent })),
          onlyExpected ? expected.map((option) => option.value) : null,
        ),
    )
    .toEqual(expected)
  await control.page().keyboard.press('Escape')
  await expect(control).toHaveAttribute('aria-expanded', 'false')
}
async function openCommand(f: Fixture, command: 'app.setWorkspace' | 'app.setSession') {
  const dialog = f.page.getByRole('dialog', { name: f.copy.commandPalette.title, exact: true })
  if (!(await dialog.isVisible())) await f.page.keyboard.press('ControlOrMeta+Shift+p')
  await expect(dialog).toBeVisible()
  const back = dialog.getByRole('button', { name: f.copy.commandPalette.backToCommands, exact: true })
  if (await back.isVisible()) await back.click()
  const search = dialog.getByRole('searchbox', { name: f.copy.commandPalette.search, exact: true })
  await search.fill(command)
  await expect(dialog.getByRole('option')).toHaveCount(1)
  await search.press('Enter')
  await expect(dialog.getByRole('button', { name: f.copy.commandPalette.execute, exact: true })).toBeVisible()
  return dialog
}
async function expectStableRepositoryOptions(control: Locator, evidencePath: string) {
  await control.click()
  const listboxId = await control.getAttribute('aria-controls')
  if (!listboxId) throw new Error('Repository control does not identify its listbox')
  const option = control
    .page()
    .locator(`[id=${JSON.stringify(listboxId)}]`)
    .getByRole('option')
    .first()
  await expect(option).toBeVisible()
  const frames = await option.evaluate(async (element) => {
    const result: {
      bounds: { x: number; y: number; width: number; height: number }
      layoutWidth: string
      layoutHeight: string
      inlineSize: string
      zoom: string
    }[] = []
    for (let index = 0; index < 24; index++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bounds = element.getBoundingClientRect()
      const surface = element.closest<HTMLElement>('.lumen-floating-surface')
      if (!surface) throw new Error('Repository option lost its owning floating surface')
      const style = getComputedStyle(surface)
      result.push({
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        layoutWidth: style.width,
        layoutHeight: style.height,
        inlineSize: surface.style.inlineSize,
        zoom: style.zoom,
      })
    }
    return result
  })
  await writeFile(evidencePath, JSON.stringify(frames, null, 2))
  expect(new Set(frames.slice(-12).map((frame) => JSON.stringify(frame.bounds))).size).toBe(1)
  await control.page().keyboard.press('Escape')
  await expect(control).toHaveAttribute('aria-expanded', 'false')
}
async function expectWrappedRepositoryName(control: Locator) {
  const title = control.locator('[data-text-context="choice.title"]')
  await expect(title).toBeVisible()
  await expect(title).toHaveAttribute('data-text-flow', 'reading')
  const geometry = await title.evaluate((element) => {
    const nodes: Text[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.trim()) nodes.push(node)
    }
    const first = nodes[0]
    const last = nodes.at(-1)
    if (!first || !last) throw new Error('Repository name has no readable text')
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(first, 1)
    const firstCharacter = range.getBoundingClientRect()
    range.setStart(last, last.length - 1)
    range.setEnd(last, last.length)
    const lastCharacter = range.getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    return {
      wrapped: lastCharacter.top > firstCharacter.top,
      complete:
        lastCharacter.width > 0 &&
        lastCharacter.left >= bounds.left - 1 &&
        lastCharacter.right <= bounds.right + 1 &&
        lastCharacter.bottom <= bounds.bottom + 1,
      noClipping: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }
  })
  expect(geometry).toEqual({ wrapped: true, complete: true, noClipping: true, whiteSpace: 'normal' })
}
async function projectSettings(f: Fixture) {
  await showSidebar(f)
  const trigger = row(f, f.ready.secondWorkspace.id).locator('.hbar-app-react-project-menu .lumen-action-menu-trigger')
  await trigger.click()
  const menu = await lumenMenuForTrigger(trigger)
  await menu.getByRole('menuitem', { name: f.copy.shell.workspaceSettings, exact: true }).click()
  await hideSidebar(f)
  await expect(f.page.locator('.hbar-app-react-settings-workspace')).toBeVisible()
}

test.beforeAll(async () => {
  await mkdir(output, { recursive: true })
})
for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`display aliases update exact command, settings, Git, tab and Files consumers: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(120000)
      const f = await start(browser, locale, width)
      const observations: unknown[] = []
      const externalWrites: { workspaceId: string; displayName: string | null; revision: number }[] = []
      const warnings: string[] = []
      let completed = false
      f.page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text())
      })
      if (captureTrace) await f.context.tracing.start({ screenshots: true, snapshots: true })
      try {
        const api = createWorkspaceSessionCommandClient(f.external)
        const change = async (workspaceId: string, displayName: string | null) => {
          const snapshot = await api.execute('workspaceDisplayNames.get', {})
          const receipt = await api.execute(
            'workspaceDisplayNames.apply',
            {
              expectedRevision: snapshot.revision,
              workspaceId,
              expectedDisplayName:
                snapshot.entries.find((item) => item.workspaceId === workspaceId)?.displayName ?? null,
              displayName,
            },
            { idempotencyKey: crypto.randomUUID() },
          )
          externalWrites.push({ workspaceId, displayName, revision: receipt.revision })
        }
        const originalDraft = `Original composer draft — ${locale} ${width}`
        await composer(f).click()
        await composer(f).press('ControlOrMeta+A')
        await f.page.keyboard.insertText(originalDraft)
        await expectComposerText(composer(f), originalDraft)
        const transfer = await f.page.evaluateHandle((name) => {
          const data = new DataTransfer()
          data.items.add(new File(['Only this temporary fixture material'], name, { type: 'text/markdown' }))
          return data
        }, attachmentName)
        await f.page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: transfer })
        await transfer.dispose()
        await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
        await openSessionTool(f.page, f.copy.session.tools, 'files')
        await files(f).getByRole('button', { name: fileName, exact: true }).click()
        await files(f).getByRole('button', { name: f.copy.files.edit, exact: true }).click()
        const fileEditor = files(f).getByRole('textbox', { name: fileName, exact: true })
        await fileEditor.fill(dirtyFile)
        const originalFileElement = await fileEditor.elementHandle()
        const originalTabElement = await sessionTab(f).elementHandle()
        if (!originalFileElement || !originalTabElement) throw new Error('Original view elements are missing')
        const tabId = await sessionTab(f).getAttribute('id')

        const editor = await openEditor(f)
        await editor.getByTestId('workspace-display-name-input').fill(sharedAlias)
        await editor.getByRole('button', { name: f.names.save, exact: true }).click()
        await expect(editor).toHaveCount(0)
        await hideSidebar(f)
        await expect(files(f).getByText(sharedAlias, { exact: true })).toBeVisible()
        await expect(sessionTab(f)).toHaveAttribute('title', `${f.ready.firstSession.title}\n${sharedAlias}`)
        await change(f.ready.secondWorkspace.id, sharedAlias)
        await fileEditor.focus()
        const updatedAlias = 'Updated project caption — 外部更新'
        await change(f.ready.firstWorkspace.id, updatedAlias)
        await expect(files(f).getByText(updatedAlias, { exact: true })).toBeVisible()
        await expect(fileEditor).toBeFocused()
        expect(
          await originalFileElement.evaluate((element) => element.isConnected && element === document.activeElement),
        ).toBe(true)
        expect(await originalTabElement.evaluate((element) => element.isConnected)).toBe(true)
        expect(await sessionTab(f).getAttribute('id')).toBe(tabId)
        await expect(sessionTab(f)).toHaveAttribute('title', `${f.ready.firstSession.title}\n${updatedAlias}`)
        await expectComposerText(composer(f), originalDraft)
        await expect(fileEditor).toHaveValue(dirtyFile)
        await capture(f, `${phase}/files-live-${locale}-${width}`)
        observations.push({
          stage: 'files-live',
          sameFileElement: true,
          sameTabElement: true,
          focusedOriginalEditor: true,
        })

        let palette = await openCommand(f, 'app.setWorkspace')
        const workspaceChoice = palette.locator('#hbar-command-workspaceId')
        await selectLumenOption(workspaceChoice, f.ready.secondWorkspace.id)
        await workspaceChoice.focus()
        await change(f.ready.firstWorkspace.id, sharedAlias)
        const expectedWorkspaceOptions = [f.ready.firstWorkspace, f.ready.secondWorkspace]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((workspace) => ({
            value: workspace.id,
            label: f.copy.commandPalette.workspaceOption(sharedAlias, workspace.path),
          }))
        await expectLumenOptions(workspaceChoice, expectedWorkspaceOptions, true)
        await expectLumenValue(workspaceChoice, f.ready.secondWorkspace.id)
        await expect(workspaceChoice).toBeFocused()
        await capture(f, `${phase}/commands-duplicate-${locale}-${width}`)
        palette = await openCommand(f, 'app.setSession')
        await expectLumenOptions(
          palette.locator('#hbar-command-sessionId'),
          [
            {
              value: f.ready.firstSession.id,
              label: f.copy.commandPalette.sessionOption(f.ready.firstSession.title, sharedAlias),
            },
          ],
          true,
        )
        await palette.getByRole('button', { name: f.copy.commandPalette.close, exact: true }).click()
        await expect(palette).toHaveCount(0)
        observations.push({
          stage: 'commands',
          duplicateAliasesDistinctPaths: true,
          selectedWorkspaceId: f.ready.secondWorkspace.id,
          activeSessionId: f.ready.firstSession.id,
        })

        await projectSettings(f)
        const scope = f.page.getByRole('combobox', { name: f.copy.settings.scopes, exact: true })
        await expectLumenValue(scope, 'workspace')
        await selectGroup(f, 'session')
        const budget = f.page.getByRole('textbox', {
          name: f.copy.settings.resolve('i18n:settings.session.defaultBudget.label'),
          exact: true,
        })
        await budget.fill('12345')
        await expect(f.page.getByText(f.copy.settings.unsaved(1), { exact: true })).toBeVisible()
        const settingsField = await budget.elementHandle()
        if (!settingsField) throw new Error('Original scoped draft input missing')
        await budget.focus()
        const targetAlias = 'Pinned B 原目标项目名称'
        await change(f.ready.secondWorkspace.id, targetAlias)
        // Compact Settings intentionally omits the duplicate header context;
        // its visible scope control remains the target-identifying entry.
        if (width > 480)
          await expect(f.page.getByText(f.copy.settings.title('workspace', targetAlias), { exact: true })).toBeVisible()
        await expect(scope).toBeVisible()
        await expect(budget).toBeFocused()
        expect(
          await settingsField.evaluate((element) => element.isConnected && document.activeElement === element),
        ).toBe(true)
        await expectLumenOptions(
          scope,
          [{ value: 'workspace', label: f.copy.settings.scopeOption('workspace', targetAlias) }],
          true,
        )
        await budget.focus()
        await expect(budget).toBeFocused()
        await expect(budget).toHaveValue('12345')
        await capture(f, `${phase}/settings-pinned-${locale}-${width}`)
        await change(f.ready.secondWorkspace.id, null)
        if (width > 480)
          await expect(
            f.page.getByText(f.copy.settings.title('workspace', f.ready.secondWorkspace.name), { exact: true }),
          ).toBeVisible()
        await expect(budget).toBeFocused()
        await expectLumenOptions(
          scope,
          [{ value: 'workspace', label: f.copy.settings.scopeOption('workspace', f.ready.secondWorkspace.name) }],
          true,
        )
        await selectGroup(f, 'appearance')
        await selectGroup(f, 'session')
        await expect(budget).toHaveValue('12345')
        await expect(f.page.getByText(f.copy.settings.unsaved(1), { exact: true })).toBeVisible()
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
        await expect(files(f)).toBeVisible()
        await expect(fileEditor).toHaveValue(dirtyFile)
        observations.push({
          stage: 'settings',
          targetWorkspaceId: f.ready.secondWorkspace.id,
          originalSessionId: f.ready.firstSession.id,
          dirtyCount: 1,
          sameInputDuringAliasUpdate: true,
          resetToCanonical: true,
        })

        const side = await showSidebar(f)
        await side.getByRole('button', { name: f.copy.shell.status, exact: true }).click()
        await hideSidebar(f)
        const status = f.page.locator('.hbar-app-react-status-workspace')
        await status
          .getByRole('navigation', { name: f.copy.status.tabs, exact: true })
          .getByRole('button', { name: f.copy.status.sections.git, exact: true })
          .click()
        const repository = status.getByRole('combobox', { name: f.copy.status.git.repositoryFilter, exact: true })
        await expect(repository).toBeEnabled()
        await expectWrappedRepositoryName(repository)
        await expectStableRepositoryOptions(repository, `${output}/option-geometry-${locale}-${width}.json`)
        await selectLumenOption(repository, f.ready.secondWorkspace.id)
        await expect(repository).toBeEnabled()
        await repository.focus()
        await change(f.ready.secondWorkspace.id, sharedAlias)
        await expectLumenOptions(repository, expectedWorkspaceOptions)
        await expectLumenValue(repository, f.ready.secondWorkspace.id)
        await expectWrappedRepositoryName(repository)
        await expect(repository).toBeFocused()
        await capture(f, `${phase}/git-duplicate-${locale}-${width}`)
        await change(f.ready.firstWorkspace.id, null)
        await expectLumenOptions(
          repository,
          [
            ...expectedWorkspaceOptions.filter((option) => option.value !== f.ready.firstWorkspace.id),
            {
              value: f.ready.firstWorkspace.id,
              label: f.copy.status.git.workspaceOption(f.ready.firstWorkspace.name, f.ready.firstWorkspace.path),
            },
          ].sort((a, b) => {
            const nameA = a.value === f.ready.firstWorkspace.id ? f.ready.firstWorkspace.name : sharedAlias
            const nameB = b.value === f.ready.firstWorkspace.id ? f.ready.firstWorkspace.name : sharedAlias
            return nameA.localeCompare(nameB) || a.value.localeCompare(b.value)
          }),
        )
        await expectLumenValue(repository, f.ready.secondWorkspace.id)
        await expect(repository).toBeFocused()
        await status.getByRole('button', { name: f.copy.status.close, exact: true }).click()
        await expect(files(f)).toBeVisible()
        await expect(files(f).getByText(f.ready.firstWorkspace.name, { exact: true })).toBeVisible()
        await expect(fileEditor).toHaveValue(dirtyFile)
        await expectComposerText(composer(f), originalDraft)
        await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toHaveCount(1)
        await expect(sessionTab(f)).toHaveAttribute('aria-selected', 'true')
        await expect(sessionTab(f)).toHaveAttribute(
          'title',
          `${f.ready.firstSession.title}\n${f.ready.firstWorkspace.name}`,
        )
        expect(await originalTabElement.evaluate((element) => element.isConnected)).toBe(true)
        expect(await readFile(join(f.ready.firstWorkspace.path, fileName), 'utf8')).toBe('# Original file on disk\n')
        await noExecution(f)
        expect(f.commands.filter((command) => command === 'settings.apply')).toEqual([])
        expect(f.commands.filter((command) => command === 'workspaceDisplayNames.apply')).toHaveLength(1)
        expect(await api.execute('workspace.get', { workspaceId: f.ready.firstWorkspace.id })).toEqual(
          f.ready.firstWorkspace,
        )
        expect(await api.execute('workspace.get', { workspaceId: f.ready.secondWorkspace.id })).toEqual(
          f.ready.secondWorkspace,
        )
        observations.push({
          stage: 'final',
          zeroRuns: true,
          zeroSettingsApply: true,
          originalFileUnchanged: true,
          draftAndAttachmentPreserved: true,
          canonicalDirectoryUnchanged: true,
        })
        completed = true
      } catch (error) {
        await writeFile(
          `${output}/failure-${locale}-${width}.json`,
          JSON.stringify(
            {
              name: error instanceof Error ? error.name : 'UnknownFailure',
              message: error instanceof Error ? error.message : 'Non-Error failure',
            },
            null,
            2,
          ),
        )
        throw error
      } finally {
        try {
          if (!f.page.isClosed())
            await f.page
              .screenshot({ path: `${output}/last-${locale}-${width}.png`, timeout: 5000 })
              .catch((error: unknown) => {
                warnings.push(error instanceof Error ? error.message : 'Diagnostic screenshot unavailable')
              })
          if (captureTrace) await f.context.tracing.stop({ path: `${output}/trace-${locale}-${width}.zip` })
          await writeFile(
            `${output}/observations-${locale}-${width}.json`,
            JSON.stringify(
              {
                expectedAsset: process.env.HBAR_DISPLAY_NAMES_EXPECTED_ASSET,
                completed,
                observations,
                externalWrites,
                commands: f.commands,
                errors: f.errors,
                warnings,
              },
              null,
              2,
            ),
          )
        } finally {
          await stop(f)
          await writeFile(
            `${output}/cleanup-${locale}-${width}.json`,
            JSON.stringify(
              {
                root: f.root,
                pid: f.child.pid,
                exitCode: f.child.exitCode,
                signalCode: f.child.signalCode,
                removed: !existsSync(f.root),
              },
              null,
              2,
            ),
          )
        }
      }
    })
  }
}

import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const evidence = 'artifacts/workbench-navigation-presentation/final'
const filePath = 'a-long-workbench-navigation-原路径-keep-original-dirty-document.md'
const source = '# Original file\nNo navigation action may save this file.\n'
const fileDraft = '# Unsaved original file\n保留原文件的编辑内容 🐙\n'
const materialName = 'preserved-navigation-material.md'
type Copy = ReturnType<typeof getShellCopy>
type Presentation = 'split' | 'page'

interface Fixture {
  readonly root: string
  readonly context: BrowserContext
  readonly host: WebSessionHost
  readonly page: Page
  readonly copy: Copy
  readonly errors: string[]
}

async function start(browser: Browser, locale: ShellLocale, width = 1440): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-navigation-presentation-'))
  await writeFile(join(root, filePath), source)
  const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port, sessionCount: 2, goalAutoContinue: false })
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy(locale)
    await page.goto(origin)
    await sidebar(page, copy, true)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await sidebar(page, copy, false)
    return { root, context, host, page, copy, errors }
  } catch (error) {
    await context.close()
    if (host) {
      await stopWebSessionHost(host)
      const captured = host
      await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
      await removeRoot(root)
    }
    // If startup never yielded an owned process handle, preserve the directory
    // rather than deleting beneath a possibly still-running fixture Host.
    throw error
  }
}

async function stop(fixture: Fixture): Promise<void> {
  await fixture.context.close()
  await stopWebSessionHost(fixture.host)
  await expect.poll(() => fixture.host.child.exitCode !== null || fixture.host.child.signalCode !== null).toBe(true)
  await removeRoot(fixture.root)
}

async function removeRoot(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith('hbar-navigation-presentation-'))
    throw new Error('Refusing cleanup outside the owned presentation fixture')
  await rm(target, { recursive: true, force: true })
}

async function sidebar(page: Page, copy: Copy, visible: boolean): Promise<void> {
  const button = page.getByRole('button', {
    name: visible ? copy.shell.showSidebar : copy.shell.hideSidebar,
    exact: true,
  })
  if (await button.isVisible()) await button.click()
  await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute(
    'data-hbar-sidebar-expanded',
    String(visible),
  )
}

function tools(copy: Copy) {
  return [
    { id: 'files', open: copy.session.tools.files, close: copy.files.close },
    { id: 'monitoring', open: copy.session.tools.monitoring, close: copy.monitoring.close },
    { id: 'agents', open: copy.session.tools.agents, close: copy.agents.close },
    { id: 'goals', open: copy.session.tools.goals, close: copy.goals.close },
  ] as const
}

async function focusInTool(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.activeElement?.closest('.lumen-app-tool-drawer')))
}

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

async function presentation(page: Page): Promise<Presentation> {
  const shell = page.locator('[data-lumen-shell="app"]')
  await expect
    .poll(async () => {
      const value = await shell.getAttribute('data-tool-presentation')
      const available = await page.locator('.lumen-app-body').evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      }))
      return value === (available.width >= 40.375 * available.rem ? 'split' : 'page')
    })
    .toBe(true)
  const state = await shell.getAttribute('data-tool-presentation')
  if (state !== 'split' && state !== 'page') throw new Error('The active tool must have a real presentation mode')
  const main = page.locator('.lumen-app-main')
  if (state === 'page') {
    await expect(main).toHaveAttribute('inert', '')
    const collapsed = await main.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      hidden: element.hasAttribute('hidden'),
      display: getComputedStyle(element).display,
    }))
    expect(collapsed.width).toBe(0)
    expect(collapsed.hidden).toBe(false)
    expect(collapsed.display).not.toBe('none')
  } else await expect(main).not.toHaveAttribute('inert', '')
  const policy = await page.locator('.lumen-app-body').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  }))
  // Default descriptor: main20rem + tool20rem + flowing separator0.375rem.
  expect(state).toBe(policy.width >= 40.375 * policy.rem ? 'split' : 'page')
  await noOverflow(page)
  return state
}

async function walk(page: Page, mode: Presentation): Promise<void> {
  for (let index = 0; index < 24; index++) {
    await page.keyboard.press('Tab')
    const observed = await page.evaluate(() => {
      const element = document.activeElement
      if (!element || element.tagName === 'BODY') return null
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return {
        inMain: Boolean(element.closest('.lumen-app-main')),
        hitSelf: Boolean(hit && (hit === element || element.contains(hit))),
        tag: element.tagName,
        label: element.getAttribute('aria-label'),
      }
    })
    if (!observed) continue
    if (mode === 'page') expect(observed.inMain, JSON.stringify(observed)).toBe(false)
    expect(observed.hitSelf, JSON.stringify(observed)).toBe(true)
  }
}

async function openTool(page: Page, name: string): Promise<Locator> {
  const directAction = page.getByRole('button', { name, exact: true }).first()
  if (await directAction.isVisible()) await directAction.focus()
  else if (await page.locator('.hbar-mobile-header-menu-trigger').isVisible()) {
    await page.locator('.hbar-mobile-header-menu-trigger').click()
    const menuAction = page.locator('.hbar-mobile-header-menu-content').getByRole('button', { name, exact: true })
    await menuAction.focus()
  } else {
    await page.locator('.hbar-session-tools-menu-trigger').click()
    await page.getByRole('menuitemcheckbox', { name, exact: true }).focus()
  }
  await page.keyboard.press('Enter')
  const pane = page.locator('.lumen-app-tool-drawer')
  await expect(pane).toBeVisible()
  await expect.poll(() => focusInTool(page)).toBe(true)
  return pane
}

async function expectToolEntryFocus(page: Page, name: string): Promise<void> {
  const directAction = page.getByRole('button', { name, exact: true }).first()
  if (await directAction.isVisible()) await expect(directAction).toBeFocused()
  else if (await page.locator('.hbar-mobile-header-menu-trigger').isVisible())
    await expect(page.locator('.hbar-mobile-header-menu-trigger')).toBeFocused()
  else await expect(page.locator('.hbar-session-tools-menu-trigger')).toBeFocused()
}

async function expectWorkbenchReturnFocus(page: Page, sessionTitle: string): Promise<void> {
  const sessionTab = page.getByRole('tab', { name: sessionTitle, exact: true })
  if (await sessionTab.isVisible()) await expect(sessionTab).toBeFocused()
  else
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement
          return active instanceof HTMLElement && active !== document.body && active.getClientRects().length > 0
        }),
      )
      .toBe(true)
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`all real tool entries use available-space flow and preserve keyboard navigation: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const fixture = await start(browser, locale)
    const { page, copy, host, errors } = fixture
    const draft = `Original conversation draft — 原稿 ${locale}`
    try {
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill(draft)
      const observations: object[] = []
      for (const width of [1440, 1280, 1279, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await sidebar(page, copy, true)
        await expect(page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })).toBeVisible()
        await sidebar(page, copy, false)
        for (const tool of tools(copy)) {
          const pane = await openTool(page, tool.open)
          const mode = await presentation(page)
          await pane.getByRole('button', { name: tool.close, exact: true }).focus()
          await walk(page, mode)
          await page.screenshot({ path: `${evidence}/${tool.id}-${locale}-${width}.png` })
          await pane.getByRole('button', { name: tool.close, exact: true }).click()
          await expect(pane).toHaveCount(0)
          await expectToolEntryFocus(page, tool.open)
          await expectComposerText(prompt, draft)
          await noOverflow(page)
          observations.push({ width, tool: tool.id, sidebar: false, presentation: mode, keyboardSteps: 24 })
        }
      }
      // The same900 viewport changes mode when a real17rem sidebar
      // consumes width: not a hard viewport80rem overlay breakpoint.
      await page.setViewportSize({ width: 900, height: 960 })
      const pane = await openTool(page, copy.session.tools.files)
      expect(await presentation(page)).toBe('split')
      await sidebar(page, copy, true)
      expect(await presentation(page)).toBe('page')
      await page.screenshot({ path: `${evidence}/files-sidebar-open-${locale}-900.png` })
      await sidebar(page, copy, false)
      expect(await presentation(page)).toBe('split')
      // The native-modal retention guard does not change ordinary narrow
      // navigation: without a modal, entering320 still closes the sidebar.
      await page.setViewportSize({ width: 1440, height: 960 })
      await sidebar(page, copy, true)
      await page.setViewportSize({ width: 320, height: 960 })
      await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
      expect(await presentation(page)).toBe('page')
      await page.setViewportSize({ width: 900, height: 960 })
      expect(await presentation(page)).toBe('split')
      const separator = page.getByRole('separator', { name: copy.toolLayout.resize, exact: true })
      await expect(separator).toBeVisible()
      const value = async (attribute = 'aria-valuenow') => {
        const raw = await separator.getAttribute(attribute)
        if (raw === null || !Number.isFinite(Number(raw))) throw new Error(`Missing separator ${attribute}`)
        return Number(raw)
      }
      const initial = await value()
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
      await separator.focus()
      await page.keyboard.press('ArrowLeft')
      await expect.poll(() => value()).toBeCloseTo(initial + 32 / rem, 3)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => value()).toBeCloseTo(initial, 3)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await page.keyboard.press('Home')
      await expect.poll(() => value()).toBe(20)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await page.keyboard.press('End')
      await expect.poll(() => value()).toBeCloseTo(await value('aria-valuemax'), 3)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await page.keyboard.press('Home')
      await expect.poll(() => value()).toBe(20)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      const handle = await separator.boundingBox()
      if (!handle) throw new Error('The visible flow separator has no hit area')
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2 - 64, handle.y + handle.height / 2, { steps: 4 })
      await page.mouse.up()
      const saved = 20 + 64 / rem
      await expect.poll(() => value()).toBeCloseTo(saved, 3)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await page.setViewportSize({ width: 320, height: 960 })
      expect(await presentation(page)).toBe('page')
      await expect(separator).toBeHidden()
      await page.setViewportSize({ width: 900, height: 960 })
      expect(await presentation(page)).toBe('split')
      await expect.poll(() => value()).toBeCloseTo(saved, 3)
      await writeFile(
        `${evidence}/resize-focus-${locale}.json`,
        JSON.stringify(
          await page.evaluate(() => {
            const element = document.activeElement
            return {
              tag: element?.tagName,
              role: element?.getAttribute('role'),
              label: element?.getAttribute('aria-label'),
              className: element?.className,
              inTool: Boolean(element?.closest('.lumen-app-tool-drawer')),
            }
          }),
          null,
          2,
        ),
      )
      await page.keyboard.press('Escape')
      await expect(pane).toHaveCount(0)
      await expectToolEntryFocus(page, copy.session.tools.files)
      await expectComposerText(prompt, draft)
      await page.reload()
      await sidebar(page, copy, true)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await sidebar(page, copy, false)
      await openTool(page, copy.session.tools.files)
      await expect.poll(() => value()).toBeCloseTo(saved, 3)
      await page.locator('.lumen-app-tool-drawer').getByRole('button', { name: copy.files.close, exact: true }).click()
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
      await writeFile(
        `${evidence}/flow-${locale}.json`,
        JSON.stringify({ actualHost: true, observations, errors, noRun: true }, null, 2),
      )
    } finally {
      await stop(fixture)
    }
  })

  test(`Files dirty document and original composer survive settings/status/modal/workbench navigation: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const fixture = await start(browser, locale)
    const { page, copy, root, host, errors } = fixture
    const draft = `Unsent navigation draft — 尚未发送 ${locale}`
    const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    try {
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill(draft)
      const data = await page.evaluateHandle((name) => {
        const transfer = new DataTransfer()
        transfer.items.add(new File(['Original unsent material'], name, { type: 'text/markdown' }))
        return transfer
      }, materialName)
      await page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: data })
      await data.dispose()
      const material = page.locator('.lumen-attachment-chip').filter({ hasText: materialName })
      await expect(material).toBeVisible()
      await openTool(page, copy.session.tools.files)
      const files = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await files.getByRole('button', { name: filePath, exact: true }).click()
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const editor = files.getByRole('textbox', { name: filePath, exact: true })
      await editor.fill(fileDraft)
      await expect(files.getByRole('status').filter({ hasText: new RegExp(`^${copy.files.dirty}$`) })).toHaveText(
        copy.files.dirty,
      )
      await page.setViewportSize({ width: 900, height: 960 })
      for (const destination of ['settings', 'status'] as const) {
        await sidebar(page, copy, true)
        await page.getByRole('button', { name: copy.shell[destination], exact: true }).click()
        await expect(files).toHaveCount(0)
        await page
          .getByRole('button', {
            name: destination === 'settings' ? copy.settings.back : copy.status.close,
            exact: true,
          })
          .click()
        await expect(editor).toHaveValue(fileDraft)
        expect(await readFile(join(root, filePath), 'utf8')).toBe(source)
        await sidebar(page, copy, false)
      }
      await editor.focus()
      await sidebar(page, copy, true)
      await page.getByRole('button', { name: copy.shell.extensionsAndSkills, exact: true }).click()
      await sidebar(page, copy, false)
      const settingsGroups = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
      if (await settingsGroups.isVisible()) await selectLumenOption(settingsGroups, 'extensions')
      else
        await page
          .getByRole('navigation', { name: copy.settings.groups, exact: true })
          .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.extensions'), exact: true })
          .click()
      await expect(page.getByRole('button', { name: copy.extensions.openSystemCommands, exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await page.keyboard.press('Control+Shift+p')
      const palette = page.getByRole('dialog', { name: copy.commandPalette.title, exact: true })
      await expect(palette).toBeVisible()
      await expect(palette.getByRole('searchbox', { name: copy.commandPalette.search, exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(palette).toHaveCount(0)
      await expect(files).toBeVisible()
      await expect(editor).toHaveValue(fileDraft)
      await page.getByRole('tab', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(editor).toHaveValue(fileDraft)
      await writeFile(
        `${evidence}/palette-return-focus-${locale}.json`,
        JSON.stringify(
          await page.evaluate(() => ({
            activeTag: document.activeElement?.tagName,
            activeLabel: document.activeElement?.getAttribute('aria-label'),
            inTool: document.activeElement?.closest('.lumen-app-tool-drawer') !== null,
            modalOpen: document.querySelector('dialog:modal') !== null,
          })),
          null,
          2,
        ),
      )
      await expect.poll(() => focusInTool(page)).toBe(true)
      await page.keyboard.press('Escape')
      await expect(files).toHaveCount(0)
      // Settings/Status remounted the conversation header; the original tool
      // trigger is gone, so Close returns to the named main fallback.
      await expect(page.getByRole('main', { name: copy.shell.main, exact: true })).toBeFocused()
      await expectComposerText(prompt, draft)
      await expect(material).toBeVisible()
      await openTool(page, copy.session.tools.files)
      await expect(editor).toHaveValue(fileDraft)
      await files.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      const workbench = page.locator('.hbar-app-react-file-workbench')
      await expect(workbench).toBeVisible()
      await expect(
        page
          .getByRole('region', { name: copy.files.title, exact: true })
          .and(page.locator('.hbar-settings-page-focus')),
      ).toBeFocused()
      await expect(page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(workbench.getByRole('textbox', { name: filePath, exact: true })).toHaveValue(fileDraft)
        if (width === 320)
          await expect(page.locator('.hbar-app-react-shell-header-active-title')).toHaveText(copy.shell.workspaceFiles)
        await noOverflow(page)
        await page.screenshot({ path: `${evidence}/expanded-dirty-${locale}-${width}.png` })
      }
      await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expectWorkbenchReturnFocus(page, host.ready.sessionTitle)
      await expect(page.locator('.hbar-app-react-shell-header-active-title')).toHaveText(host.ready.sessionTitle)
      await expectComposerText(prompt, draft)
      await expect(material).toBeVisible()
      await openTool(page, copy.session.tools.files)
      await expect(editor).toHaveValue(fileDraft)
      expect(await readFile(join(root, filePath), 'utf8')).toBe(source)
      await files.getByRole('button', { name: copy.files.reload, exact: true }).click()
      const discard = page.getByRole('dialog', { name: copy.files.reloadTitle(filePath), exact: true })
      await expect(discard).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(discard).toHaveCount(0)
      await expect(files).toBeVisible()
      await expect(editor).toHaveValue(fileDraft)
      await files.getByRole('button', { name: copy.files.save, exact: true }).click()
      await expect(files.getByRole('status').filter({ hasText: new RegExp(`^${copy.files.saved}$`) })).toHaveText(
        copy.files.saved,
      )
      expect(await readFile(join(root, filePath), 'utf8')).toBe(fileDraft)
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()
      await expectComposerText(prompt, draft)
      await expect(material).toBeVisible()
      expect(errors).toEqual([])
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      await writeFile(
        `${evidence}/state-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            originalSessionId: host.ready.sessionId,
            filePath,
            dirtyPreservedUntilExplicitSave: true,
            composerAndMaterialPreserved: true,
            settingsStatusExtensionReturn: true,
            errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await stop(fixture)
    }
  })

  test(`tool navigation and native close dialog resize preserve the original approval and Stop: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const fixture = await start(browser, locale)
    const { page, copy, root, host, errors } = fixture
    const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    const runs = createRunCommandClient(host.client)
    const target = 'must-not-execute-navigation.txt'
    try {
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = `Unsent during original approval — 未发送 ${locale}`
      await prompt.fill(draft)
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: {
            text: `/tool write_file ${JSON.stringify({ path: target, text: 'Original pending tool; cancel without executing' })}`,
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('waiting_approval')
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
      const approval = snapshot.approvals.find((item) => item.tool === 'write_file' && item.status === 'pending')
      if (!approval) throw new Error('The original real Host approval is missing')
      await expect(page.locator(`[data-decision-id="${approval.id}"]`)).toBeVisible()
      await openTool(page, copy.session.tools.files)
      await page.getByRole('button', { name: tabs.tabs.close(host.ready.sessionTitle), exact: true }).click()
      const close = page.getByRole('dialog', { name: tabs.close.title, exact: true })
      await expect(close.getByRole('button', { name: tabs.close.stopAndClose, exact: true })).toBeVisible()
      await page.setViewportSize({ width: 320, height: 960 })
      await expect(close).toBeVisible()
      await expect(close.getByRole('button', { name: tabs.close.cancel, exact: true }).last()).toBeVisible()
      const modalSize = await close.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        viewport: innerWidth,
        fits: element.scrollWidth <= element.clientWidth + 1,
      }))
      expect(modalSize.width).toBeLessThanOrEqual(modalSize.viewport)
      expect(modalSize.fits).toBe(true)
      await noOverflow(page)
      await page.screenshot({ path: `${evidence}/active-close-dialog-${locale}-320.png` })
      await close.getByRole('button', { name: tabs.close.cancel, exact: true }).last().click()
      await expect(close).toHaveCount(0)
      await expect(page.locator('.lumen-app-tool-drawer')).toBeVisible()
      await expect.poll(() => focusInTool(page)).toBe(true)
      expect((await runs.execute('operation.get', { operationId: accepted.operationId })).status).toBe(
        'waiting_approval',
      )
      // Reopen at split width, then verify native modal Escape at page width
      // consumes only its own dismissal, not the underlying tool.
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.getByRole('button', { name: tabs.tabs.close(host.ready.sessionTitle), exact: true }).click()
      await expect(close).toBeVisible()
      await page.setViewportSize({ width: 320, height: 960 })
      await page.keyboard.press('Escape')
      await expect(close).toHaveCount(0)
      await expect(page.locator('.lumen-app-tool-drawer')).toBeVisible()
      await expect.poll(() => focusInTool(page)).toBe(true)
      await page.setViewportSize({ width: 1440, height: 960 })
      await sidebar(page, copy, true)
      await page.getByRole('button', { name: tabs.tabs.close(host.ready.sessionTitle), exact: true }).click()
      await expect(close).toBeVisible()
      await page.setViewportSize({ width: 320, height: 960 })
      await expect(close.getByRole('button', { name: tabs.close.cancel, exact: true }).last()).toBeVisible()
      await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'true')
      await noOverflow(page)
      await page.screenshot({ path: `${evidence}/active-close-sidebar-${locale}-320.png` })
      await close.getByRole('button', { name: tabs.close.cancel, exact: true }).last().click()
      await expect(close).toHaveCount(0)
      await writeFile(
        `${evidence}/modal-sidebar-focus-${locale}.json`,
        JSON.stringify(
          await page.evaluate(() => {
            const active = document.activeElement
            const node = (selector: string) => {
              const element = document.querySelector(selector)
              const rect = element?.getBoundingClientRect()
              return {
                present: Boolean(element),
                rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
                display: element ? getComputedStyle(element).display : null,
              }
            }
            return {
              active: { tag: active?.tagName, label: active?.getAttribute('aria-label'), className: active?.className },
              frame: node('.lumen-app-frame'),
              sidebar: node('.lumen-app-sidebar-drawer'),
              tool: node('.lumen-app-tool-drawer'),
              modalOpen: document.querySelector('dialog:modal') !== null,
            }
          }),
          null,
          2,
        ),
      )
      await expect
        .poll(() =>
          page.evaluate(() => {
            const element = document.activeElement
            const rect = element?.getBoundingClientRect()
            return Boolean(element?.closest('.lumen-app-sidebar-drawer') && rect && rect.width > 0 && rect.height > 0)
          }),
        )
        .toBe(true)
      await sidebar(page, copy, false)
      await expect(page.locator('.lumen-app-tool-drawer')).toBeVisible()
      await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeFocused()
      // Escape belongs to the focused surface: primary navigation remains
      // available while a generic tool page is open.
      await page.keyboard.press('Escape')
      await expect(page.locator('.lumen-app-tool-drawer')).toBeVisible()
      await page.locator('.lumen-app-tool-drawer').getByRole('button', { name: copy.files.close, exact: true }).focus()
      await page.keyboard.press('Escape')
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      const card = page.locator(`[data-decision-id="${approval.id}"]`)
      await expect(card).toBeVisible()
      await expect(card.getByRole('button', { name: copy.session.decisions.allow, exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: copy.session.prompt.stop, exact: true })).toBeEnabled()
      await expectComposerText(prompt, draft)
      expect((await runs.execute('operation.get', { operationId: accepted.operationId })).status).toBe(
        'waiting_approval',
      )
      for (const width of [900, 320]) {
        await page.setViewportSize({ width, height: 960 })
        const pane = await openTool(page, copy.session.tools.monitoring)
        await pane.getByRole('button', { name: copy.monitoring.close, exact: true }).click()
        await expect(card).toBeVisible()
        await expect(page.getByRole('button', { name: copy.session.prompt.stop, exact: true })).toBeEnabled()
        await page.screenshot({ path: `${evidence}/approval-stop-restored-${locale}-${width}.png` })
      }
      await page.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('cancelled')
      expect(existsSync(join(root, target))).toBe(false)
      expect(errors).toEqual([])
      await writeFile(
        `${evidence}/active-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            provider: 'local-fixture',
            originalOperationId: accepted.operationId,
            originalApprovalId: approval.id,
            originalApprovalRecovered: true,
            toolNeverExecuted: true,
            stopped: true,
            errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await stop(fixture)
    }
  })
}

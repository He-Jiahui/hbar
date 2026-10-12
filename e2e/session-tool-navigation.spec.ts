import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { mobileShellNavigationLabel } from '../apps/web/src/mobile-shell-navigation-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue } from './support/lumen-controls'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session panel shares one dock and preserves drafts at every width: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-tools-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'A draft belongs to this session — 工具切换不应丢失草稿'
      await prompt.fill(draft)
      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await openSessionTool(page, copy.session.tools, 'monitoring')
        const tabs = page.getByRole('tablist', { name: copy.session.tools.panel, exact: true })
        await expect(tabs.getByRole('tab')).toHaveCount(4)
        for (const [section, title] of [
          ['activity', copy.activity.title],
          ['monitoring', copy.monitoring.title],
          ['agents', copy.agents.title],
          ['goals', copy.goals.title],
        ] as const) {
          const tab = tabs.getByRole('tab', { name: copy.session.tools[section], exact: true })
          await tab.click()
          await expect(tab).toHaveAttribute('aria-selected', 'true')
          await expect(
            page.locator('.hbar-session-panel-content').getByRole('heading', { name: title, exact: true }).first(),
          ).toBeVisible()
          await expect(page.locator('.hbar-session-panel')).toHaveCount(1)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        await page.screenshot({ path: info.outputPath(`session-panel-${viewport.width}.png`) })
        await page
          .locator('.hbar-session-panel-content')
          .getByRole('button', { name: copy.goals.close, exact: true })
          .click()
        await expectComposerText(prompt, draft)
        await openSessionTool(page, copy.session.tools, 'settings')
        await expectLumenValue(page.getByRole('combobox', { name: copy.settings.scopes }), 'session')
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expectComposerText(prompt, draft)
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })

  test(`narrow shell consolidates navigation without losing tools, tabs or return focus: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-mobile-navigation-'))
    const evidence = 'artifacts/desktop-experience/mobile-navigation'
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    const tabCopy = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    const title =
      locale === 'zh-CN'
        ? '这是一段很长很长很长的会话标题，用于验证窄屏标题截断、操作入口和本地化导航布局。'
        : 'A very long session title that checks narrow header truncation, localized navigation, and reachable actions.'
    const draft = `Preserve mobile navigation draft — 保持移动端草稿 ${locale}`
    let host: WebSessionHost | undefined
    try {
      await mkdir(evidence, { recursive: true })
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
        sessionId: host.ready.sessionId,
        title,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('treeitem', { name: title, exact: true }).click()
      const hideSidebar = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
      if (await hideSidebar.isVisible()) await hideSidebar.click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill(draft)
      const header = page.locator('.hbar-app-react-shell-header')
      const titleHeading = page.locator('.hbar-app-react-shell-header-active-title')
      const trigger = page.locator('.hbar-mobile-header-menu-trigger')
      const panel = page.locator('.hbar-mobile-header-menu-content')
      const tools = () => panel.getByRole('region', { name: copy.session.tools.label, exact: true })
      const menuTool = (label: string) => tools().getByRole('button', { name: label, exact: true })
      const tabs = () => panel.getByRole('region', { name: tabCopy.tabs.tabs, exact: true })
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 720 },
        { width: 320, height: 560 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(trigger).toHaveAttribute('aria-label', mobileShellNavigationLabel(locale))
        await expect(titleHeading).toHaveText(title)
        await expect(titleHeading).toBeVisible()
        await expect(page.locator('.hbar-app-react-session-workspace > .lumen-page-header')).toBeHidden()
        await expect(page.locator('.hbar-workspace-tabs-bar')).toBeHidden()
        const before = await header.evaluate((element) => element.getBoundingClientRect().height)
        const titleGeometry = await titleHeading.evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflow: getComputedStyle(element).textOverflow,
        }))
        expect(titleGeometry.scrollWidth).toBeGreaterThan(titleGeometry.width)
        expect(titleGeometry.overflow).toBe('clip')
        await expect(titleHeading).toHaveAttribute('title', title)
        expect(before).toBeLessThanOrEqual(64)
        const screenshotSize = viewport.height === 560 ? '320x560' : String(viewport.width)
        await page.screenshot({ path: `${evidence}/shell-${locale}-${screenshotSize}-closed.png` })

        await trigger.focus()
        await page.keyboard.press('Enter')
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        await expect(panel).toBeVisible()
        const openGeometry = await page.evaluate(() => {
          const shellHeader = document.querySelector('.hbar-app-react-shell-header')!
          const menuTrigger = document.querySelector('.hbar-mobile-header-menu-trigger')!
          const menuPanel = document.querySelector('.hbar-mobile-header-menu-content')!
          const headerRect = shellHeader.getBoundingClientRect()
          const triggerRect = menuTrigger.getBoundingClientRect()
          const panelRect = menuPanel.getBoundingClientRect()
          return {
            headerHeight: headerRect.height,
            triggerBottom: triggerRect.bottom,
            panelTop: panelRect.top,
            panelRight: panelRect.right,
            panelBottom: panelRect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            positioning: getComputedStyle(menuPanel).position,
            overflow: menuPanel.scrollHeight > menuPanel.clientHeight,
            scrollHeight: menuPanel.scrollHeight,
            clientHeight: menuPanel.clientHeight,
            documentWidth: document.documentElement.scrollWidth,
            scrollbarWidth: getComputedStyle(menuPanel).scrollbarWidth,
          }
        })
        expect(openGeometry.headerHeight).toBeCloseTo(before, 1)
        expect(openGeometry.positioning).toBe('fixed')
        expect(openGeometry.panelTop).toBeGreaterThanOrEqual(openGeometry.triggerBottom - 1)
        expect(openGeometry.panelRight).toBeLessThanOrEqual(openGeometry.viewportWidth + 1)
        expect(openGeometry.panelBottom).toBeLessThanOrEqual(openGeometry.viewportHeight + 1)
        if (viewport.height <= 720) {
          expect(openGeometry.clientHeight).toBeLessThanOrEqual(viewport.height / 2 + 1)
          expect(openGeometry.scrollbarWidth).toBe('thin')
        }
        expect(openGeometry.documentWidth).toBeLessThanOrEqual(viewport.width + 1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const sendButton = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
        await expect(sendButton).toBeVisible()
        const sendBox = await sendButton.boundingBox()
        if (!sendBox) throw new Error('Expected the session send control to remain rendered')
        const sendOverlappedByMenu =
          openGeometry.panelTop < sendBox.y + sendBox.height && openGeometry.panelBottom > sendBox.y
        expect(sendOverlappedByMenu).toBe(false)
        await expect(tools().getByRole('button')).toHaveCount(4)
        for (const label of [
          copy.session.find.entry,
          copy.session.tools.files,
          copy.session.tools.panel,
          copy.session.tools.settings,
        ]) {
          await expect(menuTool(label)).toBeVisible()
          await expect(menuTool(label)).toBeEnabled()
        }
        await page.screenshot({ path: `${evidence}/shell-${locale}-${screenshotSize}-open.png` })
        if (viewport.height <= 720) {
          await menuTool(copy.session.tools.settings).scrollIntoViewIfNeeded()
          const lastToolBox = await menuTool(copy.session.tools.settings).boundingBox()
          const panelBox = await panel.boundingBox()
          if (!lastToolBox || !panelBox) throw new Error('Expected the last session tool to be reachable in the menu')
          expect(lastToolBox.y).toBeGreaterThanOrEqual(panelBox.y)
          expect(lastToolBox.y + lastToolBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1)
          await expect(sendButton).toBeVisible()
          const sendAfterScroll = await sendButton.boundingBox()
          if (!sendAfterScroll) throw new Error('Expected the session send control after scrolling the menu')
          expect(sendAfterScroll.y).toBe(sendBox.y)
          await page.screenshot({ path: `${evidence}/shell-${locale}-${screenshotSize}-open-scrolled.png` })
        }

        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await trigger.click()
        await prompt.click()
        await expect(panel).toHaveCount(0)
        await expect(prompt).toBeFocused()

        await trigger.click()
        await menuTool(copy.session.find.entry).focus()
        await page.keyboard.press('Enter')
        const findInput = page.getByRole('searchbox', { name: copy.session.find.input, exact: true })
        await expect(findInput).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.locator('[data-session-find-bar]')).toHaveCount(0)
        await expect(trigger).toBeFocused()

        await trigger.click()
        await menuTool(copy.session.tools.files).click()
        const files = page.locator('.lumen-app-tool-content')
        await expect(files).toBeVisible()
        await expect(files.getByRole('button', { name: copy.files.close, exact: true })).toBeVisible()
        await files.getByRole('button', { name: copy.files.close, exact: true }).click()
        await expect(files).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expectComposerText(prompt, draft)

        await trigger.click()
        await menuTool(copy.session.tools.settings).click()
        await expectLumenValue(page.getByRole('combobox', { name: copy.settings.scopes }), 'session')
        await expect(titleHeading).toHaveText(copy.shell.settings)
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expect(titleHeading).toHaveText(title)
        await expectComposerText(prompt, draft)

        await trigger.click()
        await menuTool(copy.session.tools.files).click()
        const fileWorkspace = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
        await expect(fileWorkspace).toBeVisible()
        await fileWorkspace.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
        const workbench = page.locator('.hbar-app-react-file-workbench')
        await expect(workbench).toBeVisible()
        await expect(titleHeading).toHaveText(copy.shell.workspaceFiles)
        await expect(page.locator('.hbar-workspace-tabs-bar')).toBeHidden()

        await trigger.click()
        const activeWorkbenchTab = tabs().getByRole('button', {
          name: `${tabCopy.workbenchTitle} — ${host.ready.workspaceName}`,
          exact: true,
        })
        await expect(activeWorkbenchTab).toHaveAttribute('aria-current', 'page')
        await tabs()
          .getByRole('button', { name: `${title} — ${host.ready.workspaceName}`, exact: true })
          .click()
        await expect(titleHeading).toHaveText(title)
        await trigger.click()
        await expect(
          tabs().getByRole('button', { name: `${title} — ${host.ready.workspaceName}`, exact: true }),
        ).toHaveAttribute('aria-current', 'page')
        await tabs()
          .getByRole('button', { name: `${tabCopy.workbenchTitle} — ${host.ready.workspaceName}`, exact: true })
          .click()
        await expect(titleHeading).toHaveText(copy.shell.workspaceFiles)
        await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
        await expect(titleHeading).toHaveText(title)
        await expectComposerText(prompt, draft)

        await trigger.click()
        await menuTool(copy.session.tools.files).click()
        const returnedFiles = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
        await expect(returnedFiles).toBeVisible()
        await returnedFiles.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
        await expect(workbench).toBeVisible()
        await trigger.click()
        await tabs()
          .getByRole('button', { name: `${title} — ${host.ready.workspaceName}`, exact: true })
          .click()
        await expect(titleHeading).toHaveText(title)
        await trigger.click()
        await tabs()
          .getByRole('button', { name: tabCopy.tabs.close(tabCopy.workbenchTitle), exact: true })
          .click()
        await expect(titleHeading).toHaveText(title)
        await trigger.click()
        await expect(
          tabs().getByRole('button', { name: tabCopy.tabs.close(tabCopy.workbenchTitle), exact: true }),
        ).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await expect(trigger).toBeFocused()
        await expectComposerText(prompt, draft)
        await noOverflowForMobile(page)
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

async function noOverflowForMobile(page: import('@playwright/test').Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

async function cleanupFixture(root: string, ownedPrefix = 'hbar-session-tools-v13-') {
  const resolved = await realpath(root)
  if (
    dirname(resolved).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(resolved).startsWith(ownedPrefix)
  )
    throw new Error('Refusing cleanup outside the owned tool-navigation fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('session panel returns to its original owner without sending or losing drafts', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-tools-v13-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, goalAutoContinue: false })
    const copy = getShellCopy('zh-CN')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '打开工具、返回与切换会话均不能自动发送或清除。'.repeat(4)
    await prompt.fill(draft)
    await openSessionTool(page, copy.session.tools, 'goals')
    const other = await host.client.call('session.create', {
      workspaceId: host.ready.workspaceId,
      title: 'Independent session panel',
    })
    await page.getByRole('treeitem', { name: other.title, exact: true }).click()
    await expect(page.locator('.hbar-session-panel')).toHaveCount(0)
    await expectComposerText(prompt, '')
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await expectComposerText(prompt, draft)
    await expect(
      page
        .getByRole('tablist', { name: copy.session.tools.panel, exact: true })
        .getByRole('tab', { name: copy.session.tools.goals, exact: true }),
    ).toHaveAttribute('aria-selected', 'true')
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})

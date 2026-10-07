import { expect, test, type Locator } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { completeLine } from './support/single-line-layout'

async function removeOwnedRoot(root: string) {
  if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-single-line-navigation-'))
    throw new Error('Unexpected navigation fixture cleanup path')
  await rm(root, { recursive: true, force: true })
}

/** A navigation caption keeps its first character visible and clips only its tail. */
async function clippedCaption(caption: Locator) {
  const metrics = await caption.evaluate((node) => {
    const text = node.querySelector('.hbar-sidebar-caption-text')
    if (!text) throw new Error('Missing navigation caption text')
    const firstText = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode()
    if (!firstText) throw new Error('Missing navigation caption content')
    const first = document.createRange()
    first.setStart(firstText, 0)
    first.setEnd(firstText, 1)
    const all = document.createRange()
    all.selectNodeContents(text)
    const bounds = node.getBoundingClientRect()
    const pane = node.closest('.lumen-app-sidebar-content')?.getBoundingClientRect()
    const rects = [...all.getClientRects()]
    const styles = getComputedStyle(node)
    const ancestors = []
    let ancestor: Element | null = node
    while (ancestor && ancestors.length < 9) {
      const style = getComputedStyle(ancestor)
      const rect = ancestor.getBoundingClientRect()
      ancestors.push({
        class: ancestor.className,
        left: rect.left,
        width: rect.width,
        min: style.minInlineSize,
        flex: style.flex,
        display: style.display,
        align: style.alignItems,
        overflow: style.overflowX,
        scrollLeft: ancestor.scrollLeft,
      })
      ancestor = ancestor.parentElement
    }
    return {
      overflow: styles.overflowX,
      textOverflow: styles.textOverflow,
      whiteSpace: styles.whiteSpace,
      firstOffset: first.getBoundingClientRect().left - bounds.left,
      lineCount: new Set(rects.map((rect) => Math.round(rect.top))).size,
      scrollLeft: node.scrollLeft,
      clipped: text.getBoundingClientRect().right > bounds.right + 1,
      fitsPane: Boolean(pane && bounds.left >= pane.left - 1 && bounds.right <= pane.right + 1),
      ancestors,
    }
  })
  expect(metrics).toMatchObject({ overflow: 'clip', textOverflow: 'clip', whiteSpace: 'nowrap', scrollLeft: 0 })
  expect(metrics.firstOffset).toBeGreaterThanOrEqual(-1)
  expect(metrics.firstOffset).toBeLessThanOrEqual(1)
  expect(metrics.lineCount).toBe(1)
  expect(metrics.clipped, JSON.stringify(metrics)).toBe(true)
  expect(metrics.fitsPane, JSON.stringify(metrics)).toBe(true)
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`left-aligned clipped sidebar and complete workspace captions ${locale} ${theme}`, async ({
      browser,
    }, info) => {
      test.setTimeout(90_000)
      const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-single-line-navigation-')))
      const context = await browser.newContext({ locale, colorScheme: theme, viewport: { width: 1440, height: 960 } })
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
        const title =
          locale === 'zh-CN'
            ? '用于验证完整会话名称不省略也不换行'.repeat(6)
            : 'Complete session label without truncation and line wrapping '.repeat(2).trim()
        await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
          sessionId: host.ready.sessionId,
          title,
        })
        const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
        expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
          true,
        )
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(origin)
        const project = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
        await project.focus()
        if ((await project.getAttribute('aria-expanded')) === 'false') await project.press('ArrowRight')
        const session = page.getByRole('treeitem', { name: title, exact: true })
        await session.click()
        await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
        await completeLine(page.locator('.hbar-workspace-tab-title'))
        const navigation = page
          .locator('.hbar-app-react-project-tree .hbar-app-react-session-label .hbar-sidebar-caption-text')
          .first()
        await expect(navigation).toHaveText(title)
        await completeLine(navigation)
        await completeLine(page.locator('.hbar-web-feature-navigation > button'))
        const pane = page.locator('.lumen-app-sidebar-content')
        const caption = navigation.locator('..')
        await clippedCaption(caption)
        await expect(caption).toHaveAttribute('data-overflow', 'true')
        await expect(caption).toHaveAttribute('title', title)
        const projectCaption = project.locator(':scope > .lumen-tree-row .hbar-sidebar-caption')
        await clippedCaption(projectCaption)
        const projectStart = await projectCaption.evaluate((node) => node.getBoundingClientRect().left)
        const sessionStart = await caption.evaluate((node) => node.getBoundingClientRect().left)
        expect(Math.abs(projectStart - sessionStart)).toBeLessThanOrEqual(1)
        await session.focus()
        await session.press('ArrowRight')
        await clippedCaption(caption)
        await expect(session).toHaveAttribute('aria-selected', 'true')
        const captionWidth = await caption.evaluate((node) => node.getBoundingClientRect().width)
        await session.locator(':scope > .lumen-tree-row .lumen-action-menu-trigger').click()
        await expect(page.getByRole('menu')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menu')).toBeHidden()
        expect(await caption.evaluate((node) => node.getBoundingClientRect().width)).toBe(captionWidth)
        await expect(session).toHaveAttribute('aria-selected', 'true')
        if (locale === 'zh-CN' && theme === 'dark') {
          const timeToggle = page.getByTestId('sidebar-time-toggle')
          await timeToggle.click()
          const timeView = page.locator('.hbar-app-react-sidebar-time-view')
          await expect(timeView).toBeVisible()
          const timeCaption = timeView.locator('.hbar-app-react-session-title').first()
          await expect(timeCaption).toHaveText(title)
          await clippedCaption(timeCaption)
          await clippedCaption(
            timeView.locator('.hbar-app-react-sidebar-time-project-line .hbar-sidebar-caption').first(),
          )
          await pane.screenshot({ path: info.outputPath('sidebar-time.png') })
          await expect(timeToggle).toBeEnabled()
          await timeToggle.click()
          await expect(timeView).toBeHidden()
          await expect(caption).toBeVisible()
        }
        expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        for (const width of [1440, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 960 })
          const tabsVisible = await page.locator('.hbar-workspace-tab-title').first().isVisible()
          if (tabsVisible) await completeLine(page.locator('.hbar-workspace-tab-title'))
          const mobileTitle = page.locator('.hbar-app-react-shell-header-active-title')
          const mobileVisible = await mobileTitle.isVisible()
          expect(tabsVisible || mobileVisible).toBe(true)
          if (mobileVisible) {
            await expect(mobileTitle).toHaveText(title)
            const styles = await mobileTitle.evaluate((node) => ({
              whiteSpace: getComputedStyle(node).whiteSpace,
              textOverflow: getComputedStyle(node).textOverflow,
              scrollable: node.scrollWidth > node.clientWidth,
              overflow: getComputedStyle(node).overflowX,
            }))
            expect(styles).toMatchObject({ whiteSpace: 'nowrap', scrollable: true, overflow: 'auto' })
            expect(styles.textOverflow).not.toBe('ellipsis')
          }
          const copy = getShellCopy(locale)
          const reveal = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (width < 768 && (await reveal.isVisible())) {
            await reveal.click()
            await completeLine(navigation)
            await clippedCaption(caption)
            await completeLine(page.locator('.hbar-web-feature-navigation > button'))
            await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({ path: info.outputPath(`navigation-${width}.png`) })
          if (width === 1440) await pane.screenshot({ path: info.outputPath('sidebar.png') })
        }
        await page.setViewportSize({ width: 1440, height: 960 })
        const reveal = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
        if (await reveal.isVisible()) await reveal.click()
        await expect(caption).toBeVisible()
        const captionHeight = await caption.evaluate((node) => node.getBoundingClientRect().height)
        const shortTitle = locale === 'zh-CN' ? '检查布局' : 'Check layout'
        await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
          sessionId: host.ready.sessionId,
          title: shortTitle,
        })
        await expect(caption).toHaveText(shortTitle)
        await expect(caption).not.toHaveAttribute('data-overflow', 'true')
        expect(await caption.evaluate((node) => getComputedStyle(node).maskImage)).toBe('none')
        expect(await caption.evaluate((node) => node.getBoundingClientRect().height)).toBe(captionHeight)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        expect(
          await page
            .getByRole('treeitem', { name: shortTitle, exact: true })
            .locator(':scope > .lumen-tree-row')
            .evaluate((node) => getComputedStyle(node).transitionDuration),
        ).toBe('0s')
        expect(errors).toEqual([])
      } finally {
        await context.close()
        if (host) await stopWebSessionHost(host)
        await removeOwnedRoot(root)
      }
    })
  }
}

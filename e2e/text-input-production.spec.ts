import { expect, test, type Locator } from '@playwright/test'
import { createModelCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { chatDatabaseCopy } from '../apps/web/src/chat-database-copy'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { expectComposerText } from './support/composer-text'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-chat-browser-padding-')
  )
    throw new Error('Refusing cleanup outside owned text input fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function expectSearchInset(search: Locator) {
  await search.focus()
  await expect(search).toHaveCSS('padding', '6px 12px')
  await expect(search).toHaveCSS('outline-style', 'none')
  const frame = search.locator('..')
  await expect(frame).toHaveCSS('outline-style', 'solid')
  expect(await frame.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(
    2,
  )
  const iconGap = await search.evaluate((input) => {
    const prefix = input.parentElement?.querySelector('.lumen-icon')
    if (!prefix) throw new Error('Missing production search prefix')
    return (
      input.getBoundingClientRect().left +
      parseFloat(getComputedStyle(input).paddingLeft) -
      prefix.getBoundingClientRect().right
    )
  })
  expect(iconGap).toBe(12)
}

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`settings content stays inside its frame with a real Host: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-chat-browser-padding-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        fixture: 'chat-database',
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const shell = getShellCopy(locale)
      const copy = chatDatabaseCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(page.getByRole('region', { name: host.ready.sessionTitle, exact: true })).toBeVisible()
      await page.getByRole('button', { name: shell.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: shell.settings.groups })
        .getByRole('button', { name: copy.title, exact: true })
        .click()
      const retention = page.getByRole('textbox', {
        name: shell.settings.resolve('i18n:settings.chatDatabase.retentionDays.label'),
        exact: true,
      })
      await expect(retention).toHaveValue('90')
      const field = page.locator('.hbar-schema-form-field').filter({ has: retention })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', theme)
        for (const width of [1440, 768, 320]) {
          await page.setViewportSize({ width, height: 960 })
          await retention.scrollIntoViewIfNeeded()
          const insets = await field.locator('.hbar-schema-form-copy > *').evaluateAll((elements) =>
            elements.map((element) => {
              const owner = element.closest('.lumen-settings-form-root-surface')
              if (!owner) throw new Error('Missing settings frame')
              const rect = element.getBoundingClientRect(),
                boundary = owner.getBoundingClientRect(),
                style = getComputedStyle(owner)
              return {
                left: rect.left - boundary.left - parseFloat(style.borderLeftWidth),
                right: boundary.right - parseFloat(style.borderRightWidth) - rect.right,
              }
            }),
          )
          expect(insets.length).toBeGreaterThanOrEqual(3)
          for (const inset of insets) {
            expect(inset.left).toBeGreaterThanOrEqual(12)
            expect(inset.right).toBeGreaterThanOrEqual(12)
          }
          await expect(retention).toHaveCSS('padding', '6px 12px')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await expect(retention).toHaveValue('90')
          if (locale === 'zh-CN')
            await page.screenshot({ path: info.outputPath(`settings-padding-${theme}-${width}.png`) })
        }
      }
      await retention.fill('95')
      await expect(retention).toHaveValue('95')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`live composers and model searches keep their insets: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-chat-browser-padding-'))
    const context = await browser.newContext({
      locale,
      colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 960 },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const model = (await createModelCommandClient(host.client).execute('model.list', {})).find(
        (item) => item.id === 'local-fixture',
      )
      if (!model) throw new Error('Local fixture model is unavailable')
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const copy = getShellCopy(locale),
        preSession = preSessionCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
      await expect(prompt).toBeVisible()
      await prompt.fill('Draft with a long translated model search')
      const trigger = landing.locator('.hbar-web-pre-session-model-controls .hbar-pre-session-choice-picker > button')
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(prompt).toHaveCSS('padding', '12px')
        await trigger.click()
        const picker = page.getByRole('dialog', { name: preSession.model.title, exact: true })
        const search = picker.getByRole('searchbox', { name: preSession.model.search, exact: true })
        await expectSearchInset(search)
        await search.fill(model.modelId)
        await picker.getByRole('button', { name: preSession.model.clearSearch, exact: true }).click()
        await expect(search).toHaveValue('')
        await expect(search).toBeFocused()
        if (locale === 'zh-CN') await page.screenshot({ path: info.outputPath(`live-new-chat-model-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(picker).toBeHidden()
        await expect(trigger).toBeFocused()
        await expect(prompt).toHaveValue('Draft with a long translated model search')
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(composer).toBeVisible()
      await composer.fill('第一行')
      await composer.press('End')
      await composer.press('Shift+Enter')
      await page.keyboard.insertText('第二行')
      await expectComposerText(composer, '第一行\n第二行')
      const modelTrigger = page.locator('.hbar-composer-model-trigger')
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(composer).toHaveCSS('padding', '12px')
        await modelTrigger.click()
        const search = page.locator('.hbar-composer-model-search input')
        await expectSearchInset(search)
        await search.fill(model.modelId)
        await page.getByRole('button', { name: copy.session.modelPicker.clearSearch, exact: true }).click()
        await expect(search).toHaveValue('')
        await expect(search).toBeFocused()
        if (locale === 'zh-CN') await page.screenshot({ path: info.outputPath(`live-chat-model-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(search).toBeHidden()
        await expect(modelTrigger).toBeFocused()
        await expectComposerText(composer, '第一行\n第二行')
        await composer.press('ControlOrMeta+Home')
        const cursor = page.locator('.hbar-composer-mention-editor .cm-cursor-primary')
        await expect(cursor).toBeVisible()
        const caretInset = await cursor.evaluate((element) => {
          const content = element.closest('.cm-editor')?.querySelector('.cm-content')
          if (!content) throw new Error('Missing composer content')
          const rect = element.getBoundingClientRect(),
            boundary = content.getBoundingClientRect()
          return {
            left: rect.left - boundary.left,
            top: rect.top - boundary.top,
            visible: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          }
        })
        expect(caretInset.left).toBeGreaterThanOrEqual(12)
        expect(caretInset.top).toBeGreaterThanOrEqual(12)
        expect(caretInset.visible).toBe(true)
        await composer.press('Shift+ArrowRight')
        const selection = page.locator('.hbar-composer-mention-editor .cm-selectionBackground').first()
        await expect(selection).toBeVisible()
        expect(await selection.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
          'rgba(0, 0, 0, 0)',
        )
        await composer.press('ArrowRight')
        await expectComposerText(composer, '第一行\n第二行')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (locale === 'zh-CN') await page.screenshot({ path: info.outputPath(`live-composer-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('button', { name: copy.shell.searchChats, exact: true }).click()
      const chatSearch = page.getByRole('combobox', { name: chatSearchCopy(locale).search, exact: true })
      await expect(chatSearch).toHaveCSS('padding', '6px 12px')
      await chatSearch.fill('Fixture')
      await expect(chatSearch).toHaveValue('Fixture')
      await page.keyboard.press('Escape')
      await expect(chatSearch).toBeHidden()
      if (await showSidebar.isVisible()) await showSidebar.click()
      const sessionRow = page.locator(`[data-session-id="${host.ready.sessionId}"]`)
      const rename = sessionRow.getByRole('textbox', { name: copy.shell.renameEditor.title, exact: true })
      const beginRename = async () => {
        const trigger = sessionRow.locator('.lumen-action-menu-trigger')
        await trigger.click()
        const menu = await lumenMenuForTrigger(trigger)
        await menu.getByRole('menuitem', { name: copy.shell.renameSession, exact: true }).click()
        await expect(rename).toBeFocused()
      }
      await beginRename()
      await rename.fill('Discard this padding fixture draft')
      await rename.press('Escape')
      await expect(rename).toHaveCount(0)
      await expect(page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })).toBeFocused()
      await beginRename()
      await rename.fill('Discard this padding fixture draft')
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 960 })
        if (await showSidebar.isVisible()) await showSidebar.click()
        await expect(rename).toBeInViewport()
        await expect(rename).toHaveCSS('padding', '6px 12px')
        await expect(rename).toHaveValue('Discard this padding fixture draft')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      await sessionRow.getByRole('button', { name: copy.shell.renameEditor.cancel, exact: true }).click()
      await expect(rename).toHaveCount(0)
      await expect(page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })).toBeFocused()
      await page.setViewportSize({ width: 1440, height: 960 })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await beginRename()
      const title = '验证文本留白与重命名 / Rename padding fixture'
      await rename.fill(title)
      await rename.press('Enter')
      await expect(rename).toHaveCount(0)
      await expect(page.getByRole('treeitem', { name: title, exact: true })).toBeFocused()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })

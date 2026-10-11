import { expect, test, type Locator, type Page } from '@playwright/test'
import { mountLumenControlsFixture } from './support/lumen-controls-fixture'
import { expectLumenValue, selectLumenChoice, selectLumenOption } from './support/lumen-controls'

const fixtureStyles = `
  * { box-sizing: border-box; }
  html { min-block-size: 100%; background: var(--lumen-frost); }
  body { min-block-size: 100%; margin: 0; background: var(--lumen-frost); color: var(--lumen-ink); font-family: system-ui, sans-serif; }
  .lumen-controls-fixture { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; margin-inline: auto; padding: 1rem; }
  .lumen-controls-fixture { inline-size: 100%; max-inline-size: 100%; }
  .lumen-controls-fixture h1 { min-inline-size: 0; margin: 0; overflow-wrap: anywhere; font-size: 1.25rem; }
  .lumen-controls-panel { display: flex; min-inline-size: 0; flex-wrap: wrap; align-items: flex-start; gap: 1rem; padding: 1rem; border: 1px solid var(--lumen-edge); border-radius: var(--lumen-radius-surface); background: var(--lumen-glass); }
  .lumen-controls-panel > .lumen-form-field { min-inline-size: 0; flex: 1 1 16rem; }
  .lumen-controls-panel > [role='radiogroup'], .lumen-controls-panel > [role='group'] { display: flex; min-inline-size: 0; flex: 1 1 16rem; flex-wrap: wrap; gap: .5rem; }
  .lumen-controls-panel > .lumen-toggle { min-inline-size: 0; flex: 1 1 16rem; }
  .lumen-controls-panel > .lumen-control { min-inline-size: 0; flex: 1 1 16rem; }
  .lumen-controls-outside { align-self: flex-start; }
  .lumen-context-panel { display: flex; min-inline-size: 0; max-inline-size: 100%; flex-wrap: wrap; gap: .5rem; overflow-x: auto; overflow-y: hidden; }
  .lumen-context-panel > .hbar-session-project-context { flex: 0 0 auto; }
  .lumen-surface-fixture { display: flex; min-inline-size: 0; flex-wrap: wrap; gap: .5rem; }
  .lumen-dialog-fixture { display: flex; min-inline-size: 0; flex-direction: column; gap: .75rem; padding: 1rem; }
  #control-state { overflow-wrap: anywhere; }
  @media (max-width: 30rem) {
    .lumen-controls-fixture { padding: .5rem; }
    .lumen-controls-panel { padding: .75rem; }
    .lumen-controls-panel > .lumen-form-field, .lumen-controls-panel > [role='radiogroup'], .lumen-controls-panel > [role='group'], .lumen-controls-panel > .lumen-toggle, .lumen-controls-panel > .lumen-control { flex-basis: 100%; }
  }
`

async function listboxFor(control: Locator): Promise<Locator> {
  const id = await control.getAttribute('aria-controls')
  if (!id) throw new Error('Control has no aria-controls relationship')
  return control.page().locator(`[id=${JSON.stringify(id)}]`)
}

async function assertNoViewportOverflow(page: Page, width: number): Promise<void> {
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1)
  expect(geometry.bodyWidth).toBeLessThanOrEqual(width + 1)
  expect(geometry.documentWidth).toBeGreaterThanOrEqual(geometry.viewportWidth)
}

async function assertSurfaceFitsViewport(page: Page, surface: Locator): Promise<void> {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const box = await surface.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('Popup surface has no geometry')
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function assertTriggerAndSurfaceGeometry(page: Page, trigger: Locator): Promise<Locator> {
  const surface = (await listboxFor(trigger)).locator('xpath=ancestor-or-self::*[@data-lumen-floating-surface][1]')
  await expect(surface).toBeVisible()
  await assertSurfaceFitsViewport(page, surface)
  const anchor = trigger.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " lumen-popup-select ") or contains(concat(" ", normalize-space(@class), " "), " lumen-combobox ")][1]',
  )
  const [anchorBox, surfaceBox] = await Promise.all([anchor.boundingBox(), surface.boundingBox()])
  expect(anchorBox).not.toBeNull()
  expect(surfaceBox).not.toBeNull()
  if (!anchorBox || !surfaceBox) throw new Error('Missing trigger or popup geometry')
  expect(Math.abs(surfaceBox.width - anchorBox.width), JSON.stringify({ anchorBox, surfaceBox })).toBeLessThanOrEqual(1)
  return surface
}

async function assertFullControlLabel(label: Locator): Promise<void> {
  const geometry = await label.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const style = getComputedStyle(element)
    return {
      fullTextFits: range.getBoundingClientRect().width <= element.clientWidth + 1,
      whitespace: style.whiteSpace,
      overflow: style.textOverflow,
    }
  })
  expect(geometry).toEqual({ fullTextFits: true, whitespace: 'nowrap', overflow: 'clip' })
}

test.describe('Lumen production controls geometry and keyboard contract', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const longProtocolLabel =
      locale === 'zh-CN'
        ? '一个很长的协议标签，弹层中应当换行且不撑宽工具面板'
        : 'A deliberately long protocol label that should wrap in the popup without widening the panel'
    for (const viewport of [
      { name: 'narrow-320', width: 320, height: 720 },
      { name: 'narrow-390', width: 390, height: 844 },
      { name: 'tablet-768', width: 768, height: 900 },
      { name: 'desktop-1024', width: 1024, height: 900 },
      { name: 'desktop-1440', width: 1440, height: 960 },
    ] as const) {
      test(`popup controls stay in flow and inside the viewport: ${locale} ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await mountLumenControlsFixture(page, { theme: 'dark', size: 'm', locale, styles: fixtureStyles })

        const protocol = page.locator('#protocol-select')
        const stale = page.locator('#stale-select')
        const model = page.locator('#model-combo')
        const panel = page.locator('.lumen-controls-panel')
        const contexts = page.locator('.hbar-session-project-context')
        await expect(protocol).toHaveRole('combobox')
        await expect(stale).toHaveAttribute('data-stale', 'true')
        await expect(stale).toHaveAttribute('aria-invalid', 'true')
        await expect(stale).toHaveAttribute('data-value', 'removed-protocol')
        await expect(model).toHaveRole('combobox')
        await expect(page.locator('select')).toHaveCount(0)
        await expect(panel).toBeVisible()
        await assertNoViewportOverflow(page, viewport.width)
        await expect(contexts).toHaveCount(2)
        const shortContextName = contexts.nth(0).locator('.hbar-session-project-context-name')
        const longContextName = contexts.nth(1).locator('.hbar-session-project-context-name')
        await expect(shortContextName).toHaveText('hbar')
        expect(await shortContextName.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        await expect(longContextName).toHaveAttribute('title', 'D:/fixtures/a-deliberately-long-project-name')
        await assertFullControlLabel(longContextName)
        const contextRail = page.getByRole('region', { name: 'Session project context geometry', exact: true })
        const needsScroll = await contextRail.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
        if (viewport.width <= 390) expect(needsScroll).toBe(true)
        if (needsScroll) {
          await contextRail.focus()
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => contextRail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
          await contextRail.evaluate((element) => (element.scrollLeft = 0))
        }
        await expect(contexts.nth(1).locator('.hbar-session-project-context-branch')).toHaveAttribute(
          'title',
          /feature\/long-branch-name-that-must-remain-available-in-title/,
        )

        await selectLumenOption(protocol, 'anthropic')
        await expectLumenValue(protocol, 'anthropic')
        await expect(protocol).toContainText(locale === 'zh-CN' ? 'Anthropic 消息' : 'Anthropic Messages')
        const shortLabel = protocol.locator('.lumen-popup-select-label')
        expect(await shortLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

        await protocol.click()
        const protocolListbox = await listboxFor(protocol)
        await expect(protocolListbox).toBeVisible()
        const protocolSurface = await assertTriggerAndSurfaceGeometry(page, protocol)
        await expect(protocolSurface.locator('[role="option"]')).toHaveCount(protocolsCount())
        await expect(protocolSurface.locator('[role="option"]').filter({ hasText: 'Responses' })).toBeVisible()
        await expect(
          protocolSurface
            .locator('[role="option"]')
            .filter({ hasText: locale === 'zh-CN' ? '暂不可用' : 'Temporarily unavailable' }),
        ).toBeDisabled()
        await expect(protocolSurface.locator('[role="option"]').filter({ hasText: longProtocolLabel })).toBeVisible()
        expect(
          await protocolSurface
            .locator('.lumen-popup-select-option-label')
            .filter({ hasText: longProtocolLabel })
            .evaluate((element) => getComputedStyle(element).overflowWrap),
        ).toMatch(/anywhere|break-word/)
        await assertNoViewportOverflow(page, viewport.width)
        await page.screenshot({ path: `artifacts/reference-ux-v2/lumen-controls/${locale}-${viewport.name}-popup.png` })

        await page.keyboard.press('Escape')
        await expect(protocolListbox).toBeHidden()
        await expect(protocol).toBeFocused()
        await protocol.click()
        const outside = page.locator('.lumen-controls-outside')
        await outside.scrollIntoViewIfNeeded()
        await expect
          .poll(() =>
            outside.evaluate((element) => {
              const box = element.getBoundingClientRect()
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
              return hit !== null && element.contains(hit)
            }),
          )
          .toBe(true)
        await outside.click()
        await expect(protocolListbox).toBeHidden()
        await expect(outside).toBeFocused()

        await selectLumenOption(protocol, { label: longProtocolLabel })
        await expectLumenValue(protocol, 'long-protocol')
        await expect(shortLabel).toContainText(
          locale === 'zh-CN' ? '一个很长的协议标签' : 'A deliberately long protocol label',
        )
        await assertNoViewportOverflow(page, viewport.width)
        await assertFullControlLabel(shortLabel)
        const protocolRail = protocol.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " lumen-popup-select ")][1]',
        )
        if (await protocolRail.evaluate((element) => element.scrollWidth > element.clientWidth + 1)) {
          await protocol.focus()
          await protocolRail.evaluate((element) => (element.scrollLeft = 0))
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => protocolRail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
        }

        await model.click()
        const modelListbox = await listboxFor(model)
        await expect(modelListbox).toBeVisible()
        const modelSurface = modelListbox.locator('xpath=ancestor::*[@data-lumen-floating-surface][1]')
        await expect(modelSurface).toBeVisible()
        await expect(modelSurface.getByRole('option')).toHaveCount(23)
        const modelBox = await model
          .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " lumen-combobox ")][1]')
          .boundingBox()
        const modelPopupBox = await modelSurface.boundingBox()
        expect(modelBox).not.toBeNull()
        expect(modelPopupBox).not.toBeNull()
        if (modelBox && modelPopupBox) expect(Math.abs(modelPopupBox.width - modelBox.width)).toBeLessThanOrEqual(1)
        expect(await modelListbox.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
        await model.focus()
        await page.keyboard.press('End')
        await expect(model).toBeFocused()
        await expect(model).toHaveAttribute('aria-activedescendant', /-22$/)
        await expect(modelSurface.getByRole('option').nth(22)).toBeInViewport()
        await page.keyboard.press('ArrowUp')
        await expect(model).toBeFocused()
        await expect(model).toHaveAttribute('aria-activedescendant', /-21$/)
        const loadMore = modelSurface.getByRole('button', {
          name: locale === 'zh-CN' ? '加载更多模型' : 'Load more models',
          exact: true,
        })
        await loadMore.click()
        await expect(modelSurface.getByRole('option')).toHaveCount(43)
        await loadMore.click()
        await expect(modelSurface.getByRole('option')).toHaveCount(63)
        await assertNoViewportOverflow(page, viewport.width)
        await page.keyboard.press('Escape')
        await expect(modelSurface).toBeHidden()

        // A short localized label must remain readable in its own control.
        await selectLumenOption(protocol, 'responses')
        await expect(shortLabel).toHaveText('Responses')
        expect(await shortLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      })
    }
  }

  test('popup, single toggle, multi toggle and switch retain keyboard semantics and state IDs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mountLumenControlsFixture(page, { theme: 'light', size: 'm', styles: fixtureStyles })

    const protocol = page.locator('#protocol-select')
    await protocol.focus()
    await page.keyboard.press('Enter')
    await expect(protocol).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expectLumenValue(protocol, 'long-protocol')
    await expect(protocol).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(protocol).toHaveAttribute('aria-expanded', 'false')
    await expect(protocol).toBeFocused()

    const single = page.locator('#thinking-group')
    await expect(single).toHaveRole('radiogroup')
    const singleOptions = single.getByRole('radio')
    await expect(singleOptions).toHaveCount(4)
    await expect(single).toHaveAttribute('data-value', 'high')
    await selectLumenChoice(single, 'high')
    await expect(single).toHaveAttribute('data-value', 'high')
    await singleOptions.first().focus()
    await page.keyboard.press('End')
    await expect(singleOptions.last()).toBeFocused()
    await page.keyboard.press('Space')
    await expect(singleOptions.last()).toHaveAttribute('aria-checked', 'true')
    await expect(single).toHaveAttribute('data-value', 'max')
    await page.keyboard.press('Home')
    await expect(singleOptions.first()).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(singleOptions.nth(1)).toBeFocused()
    await expect(singleOptions.nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect(single).toHaveAttribute('data-value', 'low')

    const multiple = page.locator('#capability-group')
    await expect(multiple).toHaveRole('group')
    const high = multiple.locator('button[data-value="high"]')
    const max = multiple.locator('button[data-value="max"]')
    await expect(high).toHaveAttribute('aria-pressed', 'true')
    await max.click()
    await expect(max).toHaveAttribute('aria-pressed', 'true')
    await high.click()
    await expect(high).toHaveAttribute('aria-pressed', 'false')

    const enabled = page.getByRole('switch').first()
    await expect(enabled).toBeChecked()
    await enabled.focus()
    await page.keyboard.press('Space')
    await expect(enabled).not.toBeChecked()
    await expect(page.locator('select')).toHaveCount(0)
    await expect(page.locator('[role="listbox"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="control-state"]')).toContainText('"enabled":false')
  })

  for (const panelWidth of [320, 390, 768] as const) {
    test(`a narrowed workbench panel keeps options, badges and long copy readable: ${panelWidth}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 960 })
      await mountLumenControlsFixture(page, { theme: 'dark', size: 'm', styles: fixtureStyles })
      const panel = page.locator('.lumen-controls-panel')
      await panel.evaluate((element, width) => {
        element.style.inlineSize = `${width}px`
        element.style.maxInlineSize = `${width}px`
      }, panelWidth)
      await expect(panel).toHaveCSS('width', `${panelWidth}px`)
      const protocol = page.locator('#protocol-select')
      await selectLumenOption(protocol, {
        label: 'A deliberately long protocol label that should wrap in the popup without widening the panel',
      })
      await expectLumenValue(protocol, 'long-protocol')
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      await expect(page.locator('[data-testid="control-state"]')).toContainText('long-protocol')
      await expect(page.locator('[data-value="high"]').first()).toBeVisible()
      await page.screenshot({ path: `artifacts/reference-ux-v2/lumen-controls/narrow-panel-${panelWidth}.png` })
    })
  }

  // Windows display scaling changes raster density without changing the CSS
  // viewport.  Keep one light/small and one dark/large sample so the shared
  // geometry contract is exercised at both common scaling factors as well as
  // at the default DPR used by the viewport matrix above.
  for (const scenario of [
    { name: 'light-small-125', theme: 'light' as const, size: 's' as const, scale: 1.25 },
    { name: 'dark-large-150', theme: 'dark' as const, size: 'l' as const, scale: 1.5 },
  ]) {
    test.describe(`display scale and control size: ${scenario.name}`, () => {
      test.use({ deviceScaleFactor: scenario.scale })

      test('keeps the popup and compact labels within the CSS viewport', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 900 })
        await mountLumenControlsFixture(page, {
          theme: scenario.theme,
          size: scenario.size,
          locale: 'en-US',
          styles: fixtureStyles,
        })
        await expect(page.locator('html')).toHaveAttribute('data-lumen-control-size', scenario.size)
        expect(await page.evaluate(() => window.devicePixelRatio)).toBeCloseTo(scenario.scale, 2)
        const protocol = page.locator('#protocol-select')
        await selectLumenOption(protocol, 'anthropic')
        await protocol.click()
        const surface = await assertTriggerAndSurfaceGeometry(page, protocol)
        await expect(surface.getByRole('option', { name: 'Anthropic Messages', exact: true })).toBeVisible()
        await assertNoViewportOverflow(page, 768)
        const shortLabel = protocol.locator('.lumen-popup-select-label')
        expect(await shortLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/lumen-controls/${scenario.name}.png` })
      })
    })
  }

  test.describe('floating surface focus sequencing', () => {
    test('focuses the app surface initial search target only after desktop geometry is visible', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 900 })
      await mountLumenControlsFixture(page, { theme: 'dark', size: 'm', locale: 'en-US', styles: fixtureStyles })
      await page.getByTestId('open-app-surface').click()
      const surface = page.getByRole('dialog', { name: 'App React surface', exact: true })
      const search = surface.getByRole('searchbox', { name: 'App surface search', exact: true })
      await expect(surface).toBeVisible()
      await expect(surface).toHaveAttribute('data-positioned', 'true')
      await expect(search).toBeFocused()
      await expect(surface).not.toBeFocused()
    })

    test.describe('touch sheet', () => {
      test.use({ hasTouch: true, isMobile: true })

      test('focuses the sheet surface rather than the initial search target', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await mountLumenControlsFixture(page, { theme: 'dark', size: 'm', locale: 'en-US', styles: fixtureStyles })
        await page.getByTestId('open-app-surface').click()
        const surface = page.getByRole('dialog', { name: 'App React surface', exact: true })
        const search = surface.getByRole('searchbox', { name: 'App surface search', exact: true })
        await expect(surface).toBeVisible()
        await expect(surface).toHaveAttribute('data-mobile-sheet', 'true')
        await expect(surface).toHaveAttribute('data-positioned', 'true')
        await expect(surface).toBeFocused()
        await expect(search).not.toBeFocused()
      })
    })
  })

  test('shared floating surfaces close siblings, keep nested popups, and restore anchors', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await mountLumenControlsFixture(page, { theme: 'dark', size: 'm', locale: 'en-US', styles: fixtureStyles })

    const appSurfaceTrigger = page.getByTestId('open-app-surface')
    const appSurface = page.locator('[role="dialog"][aria-label="App React surface"]')
    const appSurfaceSearch = appSurface.getByRole('searchbox', { name: 'App surface search', exact: true })
    const protocol = page.locator('#protocol-select')
    await appSurfaceTrigger.click()
    await expect(appSurface).toBeVisible()
    await expect(appSurface).toHaveAttribute('data-positioned', 'true')
    await expect(appSurfaceSearch).toBeFocused()
    await protocol.click()
    await expect(protocol).toHaveAttribute('aria-expanded', 'true')
    await expect(appSurface).toBeHidden()
    await expect(await listboxFor(protocol)).toBeVisible()
    await appSurfaceTrigger.click()
    await expect(appSurface).toBeVisible()
    await expect(protocol).toHaveAttribute('aria-expanded', 'false')

    const openDialog = page.getByTestId('open-dialog')
    await appSurface.locator('[data-testid="close-app-surface"]').click()
    await openDialog.click()
    const dialog = page.locator('.lumen-dialog[data-lumen-floating-surface][aria-label="Nested Lumen dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toBeFocused()
    const dialogSelect = dialog.locator('#dialog-protocol-select')
    const dialogForm = dialog.locator('[data-testid="dialog-form"]')
    expect(await dialogForm.evaluate((element) => (element as HTMLFormElement).checkValidity())).toBe(false)
    await selectLumenOption(dialogSelect, 'anthropic')
    await expectLumenValue(dialogSelect, 'anthropic')
    await dialogSelect.click()
    await expect(dialogSelect).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(dialogSelect).toHaveAttribute('aria-expanded', 'false')
    await expect(dialogForm).toBeVisible()
    expect(await dialogForm.evaluate((element) => (element as HTMLFormElement).checkValidity())).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(openDialog).toBeFocused()

    const actionTrigger = page.getByRole('button', { name: 'Fixture actions', exact: true })
    const actionMenu = page.getByRole('menu', { name: 'Fixture actions', exact: true })
    await actionTrigger.click()
    await expect(actionMenu).toBeVisible()
    const actionItems = actionMenu.getByRole('menuitem')
    await expect(actionItems).toHaveCount(3)
    await expect(actionItems.nth(1)).toBeDisabled()
    await expect(actionItems.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(actionItems.nth(2)).toBeFocused()
    await page.keyboard.press('End')
    await expect(actionItems.nth(2)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(actionItems.first()).toBeFocused()
    await actionItems.first().click()
    await expect(actionMenu).toBeHidden()
    await expect(page.getByTestId('last-action')).toHaveText('open')
    await expect(actionTrigger).toBeFocused()

    await actionTrigger.click()
    await expect(actionMenu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(actionMenu).toBeHidden()
    await expect(actionTrigger).toBeFocused()

    await actionTrigger.click()
    await expect(actionMenu).toBeVisible()
    await protocol.click()
    await expect(actionMenu).toBeHidden()
    await expect(protocol).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(protocol).toHaveAttribute('aria-expanded', 'false')

    await protocol.focus()
    await protocol.click()
    await expect(protocol).toHaveAttribute('aria-expanded', 'true')
    await protocol.click()
    await expect(protocol).toHaveAttribute('aria-expanded', 'false')
    await expect(protocol).toBeFocused()
  })
})

function protocolsCount(): number {
  return 4
}

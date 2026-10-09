import { expect, test } from '@playwright/test'
import { mountTextInputBusinessFixture } from './support/text-input-business-fixture'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'

const fixtureStyles = `
  body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
  .padding-business-fixture { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; padding: 1rem; }
  .padding-business-fixture h1 { margin: 0; overflow-wrap: anywhere; }
  .padding-business-search { display: flex; min-inline-size: 0; min-block-size: 0; }
`
const spacing = { s: '4px 10px', m: '6px 12px', l: '8px 14px' } as const

for (const theme of ['light', 'dark'] as const)
  for (const size of ['s', 'm', 'l'] as const)
    test(`business inputs retain spacing and editing: ${theme} ${size}`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await mountTextInputBusinessFixture(page, {
        theme,
        size,
        locale: 'zh-CN',
        styles: fixtureStyles,
      })
      const search = page.locator('.hbar-chat-search-header input')
      const prompt = page.locator('#business-composer textarea')
      const textareas = page.locator(
        '#business-proposed-plan textarea, #business-plan-exit textarea, #business-answer-text textarea',
      )
      const secret = page.locator('#business-answer-secret input[type=password]')
      await expect(search).toBeVisible()
      const pickerCopy = preSessionCopy('zh-CN').model
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(search).toHaveCSS('padding', spacing[size])
        await expect(secret).toHaveCSS('padding', spacing[size])
        await expect(prompt).toHaveCSS('padding', '12px')
        await expect(textareas).toHaveCount(3)
        for (const textarea of await textareas.all()) await expect(textarea).toHaveCSS('padding', '12px')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

        const trigger = page.getByRole('button', { name: pickerCopy.trigger(null), exact: true })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: pickerCopy.title, exact: true })
        const pickerSearch = dialog.getByRole('searchbox', { name: pickerCopy.search, exact: true })
        await pickerSearch.focus()
        await expect(pickerSearch).toHaveCSS('padding', spacing[size])
        await expect(pickerSearch).toHaveCSS('outline-style', 'none')
        const searchFrame = dialog.locator('.hbar-pre-session-choice-search')
        await expect(searchFrame).toHaveCSS('outline-style', 'solid')
        expect(
          await searchFrame.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)),
        ).toBeGreaterThanOrEqual(2)
        const iconGap = await pickerSearch.evaluate((input) => {
          const prefix = input.parentElement?.querySelector('.lumen-icon')
          if (!prefix) throw new Error('Missing search prefix icon')
          return (
            input.getBoundingClientRect().left +
            parseFloat(getComputedStyle(input).paddingLeft) -
            prefix.getBoundingClientRect().right
          )
        })
        expect(iconGap).toBe({ s: 10, m: 12, l: 14 }[size])
        await pickerSearch.fill('很长的')
        await dialog.getByRole('button', { name: pickerCopy.clearSearch, exact: true }).click()
        await expect(pickerSearch).toHaveValue('')
        await expect(pickerSearch).toBeFocused()
        if (size === 'm' && width !== 768)
          await page.screenshot({ path: info.outputPath(`choice-search-${theme}-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
      }
      await search.fill('聊天搜索 / search')
      await expect(search).toHaveValue('聊天搜索 / search')
      await secret.fill('private fixture value')
      await expect(secret).toHaveValue('private fixture value')
      for (const textarea of [prompt, ...(await textareas.all())]) {
        await textarea.fill('第一行')
        await textarea.press('End')
        await textarea.press('Enter')
        await page.keyboard.insertText('第二行')
        await expect(textarea).toHaveValue('第一行\n第二行')
      }
      expect(errors).toEqual([])
    })

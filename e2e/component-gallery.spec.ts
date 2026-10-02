import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { mountComponentGalleryFixture } from './support/button-fixture'

const galleryUrl = 'http://127.0.0.1:5180/components.html?locale=zh-CN&theme=dark'
const longGalleryTitle = '所有组件及完整交互预览：由宿主提供的长中文标题需要在窄屏中自然换行，不能遮挡搜索与翻页操作'

test('the entire catalog is reachable through search, categories and pagination', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(galleryUrl)
  await expect(page.getByRole('heading', { name: '组件总览', exact: true })).toBeVisible()
  await expect(page.getByText('38 个类别 · 300 个组件变体')).toBeVisible()
  const cards = page.locator('[data-gallery-entry]')
  const categories = page.getByRole('navigation', { name: '组件类别' })
  await expect(categories.getByRole('button')).toHaveCount(39)
  await expect(cards).toHaveCount(6)
  await expect(page.getByRole('status')).toHaveText('第 1–6 项，共 300 项')
  await expect(page.frameLocator('iframe').first().locator('[data-hbar-app-ui-component]').first()).toBeVisible()
  await mkdir('artifacts/component-gallery', { recursive: true })
  await page.screenshot({ path: 'artifacts/component-gallery/overview-dark.png' })
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(cards.first()).toHaveAttribute('data-gallery-entry', 'hbar-app-ui-ai-chat-7')
  await expect(page).toHaveURL(/page=2/)
  await page.reload()
  await expect(cards.first()).toHaveAttribute('data-gallery-entry', 'hbar-app-ui-ai-chat-7')
  await categories.getByRole('button', { name: /^数据分析/ }).click()
  await expect(page.getByRole('status')).toHaveText('第 1–6 项，共 16 项')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(cards).toHaveCount(4)
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  await categories.getByRole('button', { name: /^所有组件/ }).click()
  await page.getByRole('searchbox', { name: '搜索组件' }).fill('文件管理')
  await expect(cards).toHaveCount(4)
  await expect(cards.first()).toHaveAttribute('data-gallery-entry', 'hbar-app-ui-file-manager-1')
  await page.getByRole('searchbox', { name: '搜索组件' }).fill('没有任何匹配的组件')
  await expect(page.getByRole('heading', { name: '没有匹配的组件' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(cards).toHaveCount(6)
  expect(errors).toEqual([])
})

test('host-supplied empty, single and pagination boundaries work with long Chinese content', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 960 })
  for (const count of [0, 1, 6, 7]) {
    await page.goto(galleryUrl)
    await mountComponentGalleryFixture(page, { theme: 'dark', styles: '', itemCount: count })
    await expect(page.getByRole('heading', { name: longGalleryTitle, exact: true })).toBeVisible()
    const cards = page.locator('[data-gallery-entry]')
    await expect(cards).toHaveCount(Math.min(count, 6))
    if (count === 0) {
      await expect(page.getByRole('heading', { name: '没有匹配的组件' })).toBeVisible()
      await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
    }
    if (count === 7) {
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await expect(cards).toHaveCount(1)
      await expect(cards.first()).toHaveAttribute('data-gallery-entry', 'hbar-app-ui-ai-chat-7')
      await expect(page.getByRole('status')).toHaveText('第 7–7 项，共 7 项')
      await page.getByRole('button', { name: '上一页', exact: true }).click()
      await expect(cards).toHaveCount(6)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('searchbox', { name: '搜索组件' }).focus()
    await expect(page.getByRole('searchbox', { name: '搜索组件' })).toBeFocused()
  }
})

test('live previews preserve editable content, theme and exact full-preview targets', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${galleryUrl}&q=hbar-app-ui-prompt-input-1`)
  await expect(page.locator('[data-gallery-entry]')).toHaveCount(1)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('[data-hbar-app-ui-component="hbar-app-ui-prompt-input-1"]').first()).toBeVisible()
  const draft = frame.locator('textarea').first()
  await draft.fill('可以在总览里直接编辑的预览草稿')
  await expect(draft).toHaveValue('可以在总览里直接编辑的预览草稿')
  await page.getByRole('button', { name: '切换深浅色' }).click()
  await expect(page.locator('main')).toHaveAttribute('data-hbar-app-ui-theme', 'light')
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    /variant=hbar-app-ui-prompt-input-1&theme=light&mode=isolated/,
  )
  await expect(frame.locator('[data-hbar-app-ui-theme]').first()).toHaveAttribute('data-hbar-app-ui-theme', 'light')
  const full = page.getByRole('link', { name: '打开提示词输入 01的完整预览' })
  await expect(full).toHaveAttribute('href', '/?variant=hbar-app-ui-prompt-input-1&theme=light')
  await expect(full).toHaveAttribute('target', '_blank')
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en-US')
  await expect(page.getByRole('heading', { name: 'Component gallery', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Primitives and motion' })).toHaveAttribute(
    'href',
    '/visual-language.html?locale=en-US&theme=light',
  )
  expect(errors).toEqual([])
})

test('desktop and narrow layouts keep long names, categories and preview scrolling accessible', async ({ page }) => {
  await mkdir('artifacts/component-gallery', { recursive: true })
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 })
    for (const theme of ['dark', 'light']) {
      await page.goto(`http://127.0.0.1:5180/components.html?locale=zh-CN&theme=${theme}&category=agent-approval`)
      await expect(page.locator('[data-gallery-entry]')).toHaveCount(6)
      await expect(page.frameLocator('iframe').first().locator('[data-hbar-app-ui-component]').first()).toBeVisible()
      const geometry = await page.evaluate(() => {
        const results = document.querySelector('.component-gallery-results')
        const categories = document.querySelector('.component-gallery-categories')
        if (!(results instanceof HTMLElement) || !(categories instanceof HTMLElement))
          throw new Error('Missing gallery panes')
        return {
          width: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          resultsWidth: results.clientWidth,
          resultsScrollWidth: results.scrollWidth,
          scrollable: results.scrollHeight > results.clientHeight,
          categoriesAccessible:
            categories.scrollWidth > categories.clientWidth || categories.scrollHeight > categories.clientHeight,
        }
      })
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width)
      expect(geometry.resultsScrollWidth).toBeLessThanOrEqual(geometry.resultsWidth)
      expect(geometry.scrollable).toBe(true)
      expect(geometry.categoriesAccessible).toBe(true)
      await page.getByRole('searchbox', { name: '搜索组件' }).focus()
      await expect(page.getByRole('searchbox', { name: '搜索组件' })).toBeFocused()
      expect(
        await page.locator('.component-gallery-search').evaluate((element) => getComputedStyle(element).outlineStyle),
      ).toBe('solid')
      expect(
        await page
          .getByRole('searchbox', { name: '搜索组件' })
          .evaluate((element) => getComputedStyle(element).outlineStyle),
      ).toBe('none')
      await page.screenshot({ path: `artifacts/component-gallery/${width}-${theme}.png` })
    }
  }
})

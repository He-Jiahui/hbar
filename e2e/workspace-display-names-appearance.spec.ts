import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  composer,
  hideSidebar,
  noExecution,
  openEditor,
  row,
  start,
  stop,
} from './support/workspace-display-names-fixture'
import { expectComposerText } from './support/composer-text'

const output = process.env.HBAR_DISPLAY_NAMES_APPEARANCE_EVIDENCE ?? 'artifacts/project-display-names-ui/appearance'
test.beforeAll(async () => mkdir(output, { recursive: true }))

for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 320],
] as const) {
  for (const theme of ['light', 'dark', 'forced-colors'] as const) {
    test(`project editor public panel/boxed appearance: ${locale} ${width} ${theme}`, async ({ browser }) => {
      const f = await start(browser, locale, width, async (page) => {
        await page.emulateMedia({
          colorScheme: theme === 'dark' ? 'dark' : 'light',
          forcedColors: theme === 'forced-colors' ? 'active' : 'none',
        })
      })
      try {
        const draft = `Unsent original draft ${locale} ${theme}`
        await composer(f).fill(draft)
        const dialog = await openEditor(f)
        const input = dialog.getByTestId('workspace-display-name-input')
        const path = dialog.getByRole('textbox', { name: f.names.path, exact: true })
        const surface = dialog.locator('.lumen-dialog-surface')
        await expect(dialog).toHaveAttribute('data-appearance', 'panel')
        await expect(surface).toHaveAttribute('data-material', 'solid')
        await expect(surface).toHaveAttribute('data-lens', 'none')
        await expect(surface.locator(':scope > [data-edge]')).toHaveCount(0)
        await expect(dialog.getByRole('separator')).toHaveCount(0)
        await expect(dialog.locator('filter')).toHaveCount(0)
        await expect(input).toHaveAttribute('data-lumen-variant', 'boxed')
        await expect(path).toHaveAttribute('readonly', '')
        await expect(input).toBeFocused()

        const inspect = () =>
          dialog.evaluate((root) => {
            const field = root.querySelector<HTMLInputElement>('[data-testid="workspace-display-name-input"]')
            const readonly = root.querySelector<HTMLInputElement>('input[readonly]')
            const pane = root.querySelector('.lumen-dialog-surface')
            const background = pane?.querySelector(':scope > div[aria-hidden="true"]')
            if (!field || !readonly || !pane || !background) throw new Error('Missing public editor elements')
            const fieldStyle = getComputedStyle(field)
            const backgroundStyle = getComputedStyle(background)
            const luminance = (color: string) => {
              const value = color.match(/^rgba?\(([^)]+)\)$/)?.[1]
              const srgb = color.match(/^color\(srgb ([^)]+)\)$/)?.[1]
              const values = value
                ? value
                    .split(',')
                    .slice(0, 3)
                    .map((part) => Number(part.trim()) / 255)
                : srgb?.split(/\s+/).slice(0, 3).map(Number)
              if (!values || values.length !== 3 || values.some((item) => !Number.isFinite(item)))
                throw new Error('Unexpected computed color format')
              const [red = 0, green = 0, blue = 0] = values.map((channel) =>
                channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
              )
              return 0.2126 * red + 0.7152 * green + 0.0722 * blue
            }
            const opacity = backgroundStyle.backgroundColor
              .match(/rgba?\(([^)]+)\)/)?.[1]
              ?.split(',')
              .map((value) => value.trim())
            const bounds = root.getBoundingClientRect()
            const fields = [field, readonly].map((element) => {
              const rect = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              const lightness = [luminance(style.color), luminance(style.backgroundColor)]
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                borderWidth: style.borderTopWidth,
                borderStyle: style.borderTopStyle,
                color: style.color,
                background: style.backgroundColor,
                textContrast: (Math.max(...lightness) + 0.05) / (Math.min(...lightness) + 0.05),
                hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element,
              }
            })
            return {
              theme: document.documentElement.getAttribute('data-theme'),
              forced: matchMedia('(forced-colors: active)').matches,
              prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
              panel: {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
                background: backgroundStyle.backgroundColor,
                alpha: opacity?.length === 4 ? Number(opacity[3]) : opacity?.length === 3 ? 1 : null,
                filter: backgroundStyle.backdropFilter,
              },
              focusVisible: field.matches(':focus-visible'),
              focusOutline: fieldStyle.outlineStyle,
              focusWidth: fieldStyle.outlineWidth,
              fields,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              viewport: { width: innerWidth, height: innerHeight },
            }
          })
        const appearance = await inspect()
        expect(appearance.panel.alpha).toBe(1)
        expect(appearance.panel.filter).toBe('none')
        expect(appearance.prefersDark).toBe(theme === 'dark')
        expect(appearance.forced).toBe(theme === 'forced-colors')
        expect(appearance.focusVisible).toBe(true)
        expect(appearance.focusOutline).toBe('solid')
        expect(Number.parseFloat(appearance.focusWidth)).toBeGreaterThanOrEqual(2)
        expect(appearance.horizontalOverflow).toBe(false)
        expect(appearance.panel.left).toBeGreaterThanOrEqual(0)
        expect(appearance.panel.right).toBeLessThanOrEqual(width)
        expect(appearance.panel.bottom).toBeLessThanOrEqual(appearance.viewport.height)
        for (const field of appearance.fields) {
          expect(field.borderStyle).toBe('solid')
          expect(Number.parseFloat(field.borderWidth)).toBeGreaterThanOrEqual(1)
          expect(field.hit).toBe(true)
          expect(field.color).not.toBe(field.background)
          expect(field.textContrast).toBeGreaterThanOrEqual(4.5)
        }
        await writeFile(`${output}/${locale}-${width}-${theme}.json`, JSON.stringify(appearance, null, 2))
        await f.page.screenshot({ path: `${output}/${locale}-${width}-${theme}.png` })

        await f.page.keyboard.press('Tab')
        await expect(path).toBeFocused()
        for (let index = 0; index < 5; index += 1) {
          await f.page.keyboard.press('Tab')
          expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
        }
        await input.fill(' ')
        await dialog.getByRole('button', { name: f.names.save, exact: true }).click()
        await expect(input).toHaveAttribute('aria-invalid', 'true')
        await expect(dialog).toContainText(f.names.validation.required)
        await expect(input).toBeFocused()
        await input.hover()
        if (theme !== 'forced-colors') {
          const invalid = await input.evaluate((element) => {
            const style = getComputedStyle(element)
            const danger = style.getPropertyValue('--lumen-danger').trim()
            const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(danger)
            if (!rgb) throw new Error('Unexpected declared danger token')
            return {
              actual: style.borderTopColor,
              expected: `rgb(${Number.parseInt(rgb[1] ?? '', 16)}, ${Number.parseInt(rgb[2] ?? '', 16)}, ${Number.parseInt(rgb[3] ?? '', 16)})`,
            }
          })
          expect(invalid.actual).toBe(invalid.expected)
        }
        await f.page.screenshot({ path: `${output}/${locale}-${width}-${theme}-required.png` })
        await input.fill('x'.repeat(81))
        await dialog.getByRole('button', { name: f.names.save, exact: true }).click()
        await expect(dialog).toContainText(f.names.validation.tooLong)
        await expect(input).toBeFocused()
        await path.click()
        await expect(path).toBeFocused()
        await path.press('Tab')
        await expect(dialog.getByRole('button', { name: f.names.cancel, exact: true })).toBeFocused()
        expect(f.commands.filter((name) => name === 'workspaceDisplayNames.apply')).toHaveLength(0)
        await f.page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(row(f).locator('.hbar-app-react-project-menu summary')).toBeFocused()
        await hideSidebar(f)
        await expectComposerText(composer(f), draft)
        await noExecution(f)
      } finally {
        await stop(f)
      }
    })
  }
}

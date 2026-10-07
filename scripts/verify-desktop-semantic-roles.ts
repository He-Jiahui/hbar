import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

// Real client rendering retains Vite's CSS-module bindings; fixtures are injected by this host.
const fixtures = {
  'zh-CN': {
    title: '工作台当前会话与所选项目中所有记录的完整长标题'.repeat(4),
    description: '辅助说明按照阅读顺序自然换行，保持完整的宿主文案与用户输入。'.repeat(5),
    author: '原始作者：',
    emphasis: '强调的操作对象。',
    isolated: 'feature/مرحبا-原始分支。',
    time: '2026年10月6日 13:24',
    path: 'C:\\真实项目\\' + '保留完整名称的目录'.repeat(35),
  },
  'en-US': {
    title: 'All records belonging to the current session and selected workspace '.repeat(5),
    description:
      'Supporting content follows normal reading flow and preserves the original host copy and user content. '.repeat(
        5,
      ),
    author: 'Original author: ',
    emphasis: 'the original action target. ',
    isolated: 'feature/مرحبا-original-branch. ',
    time: 'Oct 6, 2026, 1:24 PM',
    path: 'C:\\original-workspace\\' + 'complete-unchanged-directory-name'.repeat(30),
  },
} as const

const output = resolve('artifacts/desktop-elements/roles')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/desktop-semantic-roles-browser.tsx'),
      name: 'SemanticRolesFixture',
      formats: ['iife'],
      fileName: 'semantic-roles',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const stylesheet = await Bun.file(resolve(output, 'bundle/semantic-roles.css')).text()
const browserScript = await Bun.file(resolve(output, 'bundle/semantic-roles.iife.js')).text()
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const results: Array<{ locale: string; mode: string; width: number; scale: number; lines: number }> = []
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/*', (route) => route.abort())
  for (const [locale, copy] of Object.entries(fixtures)) {
    const source = `第一行\n  ${copy.path}\n\tLast original line`
    const sentence = copy.author + copy.emphasis + copy.isolated + copy.description
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        const scale = width <= 390 ? 1.25 : 1
        await page.evaluate(() => {
          if (window.releaseSemanticRolesFixture) window.releaseSemanticRolesFixture()
        })
        await page.setViewportSize({ width, height: 900 })
        await page.setContent(`<style>${stylesheet}</style><style>
          html { font-size: ${16 * scale}px; }
          body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
          .fixture { display: flex; flex-direction: column; gap: .75rem; padding: 1rem; min-inline-size: 0; }
          .fixture > * { margin-block: 0; }
          .caption-rail { min-inline-size: 0; max-inline-size: 100%; overflow: auto; }
          .caption-rail > * { inline-size: max-content; }
        </style><body data-lumen-mode="${mode}" lang="${locale}"><div id="semantic-roles-fixture"></div></body>`)
        await page.addScriptTag({ content: browserScript })
        expect(pageErrors).toEqual([])
        await page.evaluate((input) => window.renderSemanticRolesFixture(input), { copy, source, mode })
        const contrast = await page.locator('[data-description]').evaluate((element) => {
          const luminance = (color: string) => {
            const components = color
              .match(/[\d.]+/g)
              ?.slice(0, 3)
              .map(Number)
            if (!components || components.length !== 3) throw new Error(`Unexpected RGB color: ${color}`)
            return components.reduce((sum, value, index) => {
              const channel = value / 255
              return (
                sum +
                (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) *
                  [0.2126, 0.7152, 0.0722][index]!
              )
            }, 0)
          }
          const foreground = luminance(getComputedStyle(element).color)
          const backgroundColor = getComputedStyle(document.body).backgroundColor
          if (backgroundColor === 'rgba(0, 0, 0, 0)') throw new Error('Fixture host did not paint its theme canvas')
          const background = luminance(backgroundColor)
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        })
        expect(contrast).toBeGreaterThanOrEqual(4.5)
        await expect(page.locator('[data-primary-title]')).toHaveText(copy.title)
        await expect(page.locator('[data-sentence]')).toHaveText(sentence)
        expect(await page.locator('bdi').evaluate((element) => getComputedStyle(element).unicodeBidi)).toBe('isolate')
        expect(await page.locator('bdi').textContent()).toBe(copy.isolated)
        await expect(page.locator('time')).toHaveAttribute('datetime', '2026-10-06T05:24:00Z')
        expect(await page.locator('pre').textContent()).toBe(source)
        expect(await page.locator('code').textContent()).toBe(copy.path)
        const lines = await page.locator('[data-description]').evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return range.getClientRects().length
        })
        expect(lines).toBeGreaterThan(1)
        for (const selector of ['[data-path-rail]', 'pre']) {
          const scrollable = await page.locator(selector).evaluate((element) => {
            element.scrollLeft = element.scrollWidth
            return element.scrollLeft > 0
          })
          expect(scrollable, `${locale}/${mode}/${width} ${selector}`).toBe(true)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const titles = page.locator('[data-title], .lumen-page-heading h1, .lumen-tool-pane-heading h2')
        for (let index = 0; index < (await titles.count()); index++) {
          const title = titles.nth(index)
          await expect(title).toHaveText(copy.title)
          await expect(title).toHaveCSS('white-space', 'normal')
          const geometry = await title.evaluate((node) => {
            const range = document.createRange()
            range.selectNodeContents(node)
            return {
              lines: range.getClientRects().length,
              scroll: node.scrollWidth,
              width: node.clientWidth,
              overflow: getComputedStyle(node).textOverflow,
            }
          })
          expect(geometry.lines).toBeGreaterThan(1)
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1)
          expect(geometry.overflow).not.toBe('ellipsis')
        }
        await page.locator('.caption-rail, pre').evaluateAll((elements) =>
          elements.forEach((element) => {
            element.scrollLeft = 0
          }),
        )
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`), fullPage: true })
        results.push({ locale, mode, width, scale, lines })
      }
    }
  }
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(`${results.length} standalone semantic-role layout scenarios passed.`)
} finally {
  await browser.close()
}

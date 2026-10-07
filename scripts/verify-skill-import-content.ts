import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { skillImportCopy } from '../apps/web/src/skill-import-copy'
import type { SkillImportContentInput } from '../tests/fixtures/skill-import-content-browser'
import { skillImportCandidateName, skillImportCandidatePath } from '../tests/fixtures/skill-import-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/skill-import-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/skill-import-content-browser.tsx'),
      name: 'SkillImportContent',
      formats: ['iife'],
      fileName: 'skill-import-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/skill-import-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/skill-import-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/skill-import-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/skill-import-content')
const suffix = ' 完整导入说明 Complete import explanation'.repeat(3)
let current: (SkillImportContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: SkillImportContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeSkillImportContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#skill-import-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.skill-import-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="skill-import-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountSkillImportContent(value), input)
  const root = page.locator('.hbar-skill-import')
  await root.getByRole('button', { name: skillImportCopy(input.locale).open + suffix, exact: true }).click()
  await expect(root.locator('.hbar-skill-import-body')).toBeVisible()
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  expect(await reader.evaluate((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = skillImportCopy(locale)
    const input = { locale, suffix, count: 1 }
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ ...input, mode, state: 'preview' }, width)
        await verifyReadableText(root.locator('[data-text-context="section.title"]'), base.title + suffix, width < 400)
        await verifyReadableText(
          root.locator('[data-text-context="section.description"]').first(),
          base.description + suffix,
          true,
        )
        const item = root.getByRole('listitem')
        await verifyReadableText(
          item.locator('[data-text-context="collection.title"]'),
          skillImportCandidateName(0),
          width < 400,
        )
        await verifyReadableText(
          item.locator('[data-text-context="collection.detail"]'),
          base.candidateStatus.ready + suffix,
          width < 400,
        )
        await verifyReadableText(
          item.locator('[data-text-context="feedback.detail"]'),
          base.warnings.platform_metadata + suffix,
          width < 400,
        )
        await expect(item.locator('[data-text-context="resource.path"]')).toHaveText(skillImportCandidatePath(0))
        if (width < 400) {
          await read(root.getByRole('group', { name: base.source, exact: true }))
          await read(root.getByRole('region', { name: base.sourceRoot + suffix, exact: true }))
          await read(item.getByRole('group', { name: skillImportCandidatePath(0), exact: true }))
          await read(item.getByRole('group', { name: skillImportCandidateName(0), exact: true }))
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const count of [0, 1, 20, 21, 128, 129]) {
      const root = await mount({ ...input, mode: 'light', state: 'preview', count })
      if (count > 128) await expect(root.getByRole('alert')).toContainText(base.error('INVALID_OUTPUT'))
      else {
        await expect(root.getByRole('listitem')).toHaveCount(Math.min(20, count))
        if (count === 0)
          await verifyReadableText(root.locator('[data-text-context="empty.description"]'), base.empty + suffix, true)
        if (count > 20) {
          let next = 1
          while (next * 20 < count) {
            await root.getByRole('button', { name: base.next, exact: true }).click()
            next++
          }
          await expect(root.getByRole('listitem')).toHaveCount(count - (next - 1) * 20)
          await verifyReadableText(
            root.locator('[data-text-context="collection.title"]').last(),
            skillImportCandidateName(count - 1),
            true,
          )
        }
      }
      scenarios++
    }
    for (const limits of [
      { nameLength: 256, warnings: 16 },
      { nameLength: 257, warnings: 1 },
      { nameLength: 100, warnings: 17 },
    ]) {
      const root = await mount({ ...input, mode: 'dark', state: 'preview', ...limits })
      if (limits.nameLength === 256) {
        await verifyReadableText(root.locator('[data-text-context="collection.title"]'), '原'.repeat(256), true)
        await expect(root.locator('[data-text-context="feedback.detail"]')).toHaveCount(16)
      } else await expect(root.getByRole('alert')).toContainText(base.error('INVALID_OUTPUT'))
      scenarios++
    }
    const duplicate = await mount({ ...input, mode: 'dark', state: 'preview', duplicate: true, count: 2 })
    await expect(duplicate.getByRole('listitem')).toHaveCount(2)
    await expect(duplicate.locator('[data-text-context="resource.path"]')).toHaveText([
      skillImportCandidatePath(0),
      skillImportCandidatePath(1),
    ])
    scenarios++
    for (const state of ['error', 'loading', 'truncated', 'offline', 'unknown', 'retry', 'running'] as const) {
      const root = await mount({ ...input, mode: 'dark', state })
      if (state === 'error') {
        await verifyReadableText(root.getByRole('alert'), base.error('SKILL_SOURCE_INVALID') + suffix, true)
        await page.evaluate(() => window.repairSkillImportContent())
        await root.getByRole('button', { name: base.preview + suffix, exact: true }).click()
        await expect(root.getByRole('listitem')).toHaveCount(1)
      }
      if (state === 'loading') {
        await expect(root.getByRole('button', { name: base.previewing, exact: true })).toBeDisabled()
        await page.evaluate(() => window.repairSkillImportContent())
        await expect.poll(() => page.evaluate(() => window.skillImportContentState().state.status)).toBe('idle')
      }
      if (state === 'truncated') await verifyReadableText(root.getByRole('status'), base.truncated + suffix, true)
      if (state === 'offline')
        await expect(root.getByRole('textbox', { name: base.sourceRoot + suffix, exact: true })).toBeDisabled()
      if (state === 'unknown' || state === 'retry') {
        await verifyReadableText(root.getByRole('status'), base.unknown + suffix, true)
        const original = (await page.evaluate(() => window.skillImportContentState())).calls.find(
          (call) => call.name === 'start',
        )
        await page.evaluate(() => window.repairSkillImportContent())
        await root
          .getByRole('button', { name: state === 'retry' ? base.retryOriginal : base.check, exact: true })
          .click()
        await expect.poll(() => page.evaluate(() => window.skillImportContentState().state.status)).toBe('settled')
        const final = await page.evaluate(() => window.skillImportContentState())
        expect(final.copied).toBe(1)
        const starts = final.calls.filter((call) => call.name === 'start')
        expect(starts).toHaveLength(state === 'retry' ? 2 : 1)
        expect(starts.at(-1)?.input).toEqual(original?.input)
        await expect.poll(() => page.evaluate(() => window.skillImportContentState().imported)).toBe(1)
      }
      if (state === 'running') {
        await root.getByRole('button', { name: base.cancel, exact: true }).click()
        await expect
          .poll(() => page.evaluate(() => window.skillImportContentState().state.job?.status))
          .toBe('cancelled')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      scenarios++
    }
    const editable = await mount({ ...input, mode: 'light', state: 'preview' })
    const source = editable.getByRole('textbox', { name: base.sourceRoot + suffix, exact: true })
    await source.fill('')
    await source.focus()
    await page.keyboard.insertText('x'.repeat(4001))
    await expect(source).toHaveValue('x'.repeat(4000))
    await source.fill('D:/new-captured-source')
    await expect(editable.getByRole('listitem')).toHaveCount(0)
    await editable.getByRole('button', { name: base.preview + suffix, exact: true }).click()
    expect((await page.evaluate(() => window.skillImportContentState())).calls.at(-1)).toMatchObject({
      name: 'preview',
      input: { source: 'claude', sourceRoot: 'D:/new-captured-source' },
    })
    scenarios++
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual skill import Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned import case', current)
  await page.screenshot({ path: resolve(output, 'client-failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeSkillImportContent?.()).catch(() => {})
  await browser.close()
}

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SkillContentInput } from '../tests/fixtures/skill-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/skill-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/skill-content-browser.tsx'),
      name: 'SkillContent',
      formats: ['iife'],
      fileName: 'skill-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/skill-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/skill-content.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
let currentCase: unknown
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (reason) => errors.push(reason.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const labels = getShellCopy(locale).extensions.skillDetail
        const suffix =
          locale === 'zh-CN'
            ? ' 完整原始技能操作与栏目标题'.repeat(8)
            : ' Complete original Skill action and section heading'.repeat(8)
        const normal: SkillContentInput = { locale, mode, suffix, count: 3, state: 'ready' }
        const cases = [normal]
        if (width === 320 && mode === 'dark')
          cases.push(
            ...[0, 1, 20, 21, 200].map((count) => ({ ...normal, count })),
            ...(
              [
                'read-error',
                'missing',
                'no-overview',
                'no-entry',
                'truncated',
                'file-error',
                'file-missing',
                'offline',
                'duplicates',
              ] as const
            ).map((state) => ({ ...normal, state })),
          )
        for (const input of cases) {
          currentCase = { locale, mode, width, count: input.count, state: input.state }
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width <= 390 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#skill-content-fixture{min-inline-size:0;block-size:100dvh;overflow:auto;padding:1rem}</style><div id="skill-content-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountSkillContent(value), input)
          const detail = page.locator('.hbar-app-react-skill-detail')
          await expect(detail).toBeVisible()
          if (input.state === 'read-error') {
            await expect(detail.getByRole('alert')).toHaveText(labels.error('DISCONNECTED'))
            await page.evaluate(() => window.repairSkillContent())
            await detail.getByRole('button', { name: labels.retry + suffix, exact: true }).click()
            await expect(detail.getByRole('alert')).toHaveCount(0)
          }
          if (input.state === 'missing') await expect(detail.getByRole('status')).toHaveText(labels.missing)
          else if (input.state === 'duplicates') {
            await expect(detail.getByRole('alert')).toHaveText(labels.error('INVALID_OUTPUT'))
            await expect(detail.locator('.hbar-app-react-skill-summary')).toHaveCount(0)
          } else {
            const title = detail.locator('.hbar-app-react-skill-summary [data-text-context="section.title"]')
            await verifyReadableText(
              title,
              '完整原始技能名称 Complete original Skill name '.repeat(9).slice(0, 256),
              width <= 900,
            )
            if (width === 320 && input.state === 'ready' && input.count === 3)
              await page.screenshot({ path: resolve(output, `${locale}-${mode}-title-320.png`) })
            const path = detail.locator('[data-text-context="detail.value"]').first()
            await expect(path).toHaveText('D:/original-skills/' + 'original-parent/'.repeat(35))
            await path.scrollIntoViewIfNeeded()
            await path.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => path.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            if (input.state === 'no-overview')
              await expect(detail.getByText(labels.noOverview, { exact: true })).toBeVisible()
            if (input.state === 'no-entry' || !input.count)
              await expect(detail.getByText(labels.missingEntry, { exact: true })).toHaveCount(1)
            const overview = detail.getByRole('tab', { name: labels.overview + suffix, exact: true })
            const filesTab = detail.getByRole('tab', { name: labels.files + suffix, exact: true })
            await overview.focus()
            await overview.press('ArrowRight')
            await expect(filesTab).toBeFocused()
            await expect(filesTab).toHaveAttribute('aria-selected', 'true')
            const list = detail.locator('.hbar-app-react-skill-file-index ul')
            await expect(detail.locator('.hbar-app-react-skill-file-index li')).toHaveCount(Math.min(20, input.count))
            if (!input.count) await expect(detail.getByText(labels.noFiles, { exact: true })).toHaveCount(2)
            else if (input.state === 'offline') {
              await expect(list.getByRole('button').first()).toBeDisabled()
            } else {
              const original = list.getByRole('button', { name: 'SKILL.md', exact: true })
              await expect(original).toHaveAttribute('data-skill-file-path', 'SKILL.md')
              if (input.count === 3 && input.state === 'ready') {
                await page.evaluate(() => window.mutateSkillContent('reverse'))
                await expect(list.getByRole('button').first()).not.toHaveAttribute('data-skill-file-path', 'SKILL.md')
              }
              await original.click()
              if (input.state === 'file-error' || input.state === 'file-missing') {
                const preview = detail.locator('.hbar-app-react-skill-file-preview')
                if (input.state === 'file-error')
                  await expect(preview.getByRole('alert')).toHaveText(labels.fileError('DISCONNECTED'))
                else await expect(preview.getByRole('status')).toHaveText(labels.fileMissing)
                await page.evaluate(() => window.repairSkillContent())
                await preview.getByRole('button', { name: labels.fileRetry + suffix, exact: true }).click()
              }
              const raw = detail.locator('[data-text-context="code.block"]')
              if (input.state !== 'no-entry') {
                await expect(raw).toHaveText(
                  '---\ntitle: 原始文件完整标题\n---\n\nOriginal raw line ' +
                    'original-argument/'.repeat(30) +
                    '\n\n原始正文 retained exactly.',
                  { useInnerText: false },
                )
                expect(await raw.evaluate((node) => node.tagName)).toBe('PRE')
                await raw.focus()
                for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
                await expect.poll(() => raw.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              }
              if (input.count > 1) {
                await list.focus()
                for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
                await expect.poll(() => list.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
                const reference = list.locator('button[data-skill-file-path^="references/"]').first()
                const fileName = await reference.getAttribute('data-skill-file-path')
                if (!fileName) throw new Error('Missing original reference file path')
                await reference.click()
                await verifyReadableText(
                  detail.locator('.hbar-app-react-skill-file-heading [data-text-context="collection.title"]'),
                  fileName,
                  width <= 390,
                )
                await expect(detail.locator('.hbar-app-react-skill-file-content')).toContainText(
                  'Original Markdown proof — 文件原文。',
                )
              }
              if (input.count > 20) {
                await detail.getByRole('button', { name: labels.pagination.next + suffix, exact: true }).click()
                await expect(detail.locator('.hbar-app-react-skill-file-index li')).toHaveCount(
                  Math.min(20, input.count - 20),
                )
                await list.getByRole('button').last().click()
                await expect(detail.locator('.hbar-app-react-skill-file-content')).toContainText(
                  'Original Markdown proof',
                )
                await page.evaluate(() => window.mutateSkillContent('shrink'))
                await expect(detail.locator('.hbar-app-react-skill-file-index li')).toHaveCount(1)
                await expect(detail.locator('.hbar-app-react-extension-pagination')).toHaveCount(0)
                await expect(detail.getByText(labels.noSelectedFile, { exact: true })).toBeVisible()
              }
              const calls = await page.evaluate(() =>
                window.skillContentState().calls.filter((call) => call.name === 'skill.file.read'),
              )
              expect(calls[0]?.input).toEqual({ id: 'original-skill', path: 'SKILL.md' })
            }
            expect(await page.evaluate(() => window.skillContentBounds())).toEqual({
              files200: true,
              files201: false,
              name256: true,
              name257: false,
              body262144: true,
              body262145: false,
            })
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.evaluate(() => window.releaseSkillContent())
          scenarios++
        }
      }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual Skill detail Chrome scenarios passed.`)
} catch (reason) {
  console.error({ currentCase, errors })
  throw reason
} finally {
  await browser.close()
  await server.stop(true)
}

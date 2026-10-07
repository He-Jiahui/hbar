import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { StatusWorkspaceFixtureInput } from '../tests/fixtures/status-workspace-browser'
import { lumenMenuForTrigger, selectLumenOption } from '../e2e/support/lumen-controls'

const output = resolve('artifacts/desktop-elements/status-workspace')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/status-workspace-browser.tsx'),
      name: 'StatusWorkspace',
      formats: ['iife'],
      fileName: 'status-workspace',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/status-workspace.css')).text()
const script = await Bun.file(resolve(output, 'bundle/status-workspace.iife.js')).text()
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
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  const readHorizontally = async (area: Locator) => {
    await area.scrollIntoViewIfNeeded()
    const overflow = await area.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
    await area.focus()
    if (overflow) {
      for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight')
      await expect.poll(() => area.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
    }
  }
  const readTitle = async (title: Locator, needsWrap: boolean) => {
    await title.scrollIntoViewIfNeeded()
    await expect(title).toHaveCSS('white-space', 'normal')
    const geometry = await title.evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return {
        lines: range.getClientRects().length,
        content: node.scrollWidth,
        available: node.clientWidth,
        overflow: getComputedStyle(node).textOverflow,
      }
    })
    if (needsWrap) expect(geometry.lines).toBeGreaterThan(1)
    expect(geometry.content).toBeLessThanOrEqual(geometry.available + 1)
    expect(geometry.overflow).not.toBe('ellipsis')
  }
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320])
        for (const section of ['dashboard', 'usage', 'git'] as const) {
          const copy = getShellCopy(locale).status
          const suffix =
            locale === 'zh-CN' ? '完整原始状态报告标题'.repeat(10) : ' Original complete status report title'.repeat(10)
          const cases: readonly Pick<StatusWorkspaceFixtureInput, 'count' | 'state'>[] =
            width === 320 && mode === 'dark'
              ? [
                  { count: 3, state: 'ready' },
                  { count: 0, state: 'empty' },
                  { count: 1, state: 'ready' },
                  { count: section === 'usage' ? 1024 : section === 'git' ? 100 : 500, state: 'ready' },
                  { count: 3, state: 'duplicate' },
                  { count: 3, state: 'error' },
                  { count: 3, state: 'gap' },
                ]
              : [{ count: 3, state: 'ready' }]
          for (const scenario of cases) {
            currentCase = { locale, mode, width, section, scenario }
            await page.setViewportSize({ width, height: 1000 })
            await page.setContent(
              `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0}*{box-sizing:border-box}.status-workspace-fixture-pane{block-size:100dvh;min-inline-size:0}</style><div id="status-workspace-fixture"></div>`,
            )
            await page.addScriptTag({ content: script })
            await page.evaluate((input) => window.mountStatusWorkspace(input), {
              locale,
              mode,
              suffix,
              section,
              ...scenario,
            })
            const workspace = page.locator('.hbar-app-react-status-workspace')
            await expect(
              workspace.getByRole('heading', { level: 1, name: copy.title + suffix, exact: true }),
            ).toBeVisible()
            await readHorizontally(workspace.getByRole('navigation', { name: copy.tabs, exact: true }))
            if (scenario.state === 'error') {
              await expect(workspace.getByRole('alert')).toContainText(copy.error('DISCONNECTED'))
              await page.evaluate(() => window.statusWorkspaceRepair())
              await workspace.getByRole('button', { name: copy.refresh, exact: true }).click()
              await expect.poll(() => page.evaluate(() => window.statusWorkspaceSnapshot().status)).toBe('ready')
              await expect(workspace.getByRole('alert')).toHaveCount(0)
            }
            const titles = workspace.locator('[data-text-context="section.title"], .lumen-page-heading h1')
            for (let index = 0; index < (await titles.count()); index++)
              await readTitle(titles.nth(index), Boolean((await titles.nth(index).textContent())?.includes(suffix)))
            const labels = workspace.locator('.lumen-form-field-label-rail:visible')
            if (section !== 'dashboard' || scenario.count > 0) await expect(labels).toHaveCount(2)
            for (let index = 0; index < (await labels.count()); index++) await readHorizontally(labels.nth(index))
            if (section === 'dashboard' && scenario.count > 0) {
              await expect(workspace).toContainText('42%')
              await expect(workspace).toContainText('PLATFORM_UNSUPPORTED')
              const target = workspace.locator('#hbar-status-performance-target')
              await selectLumenOption(target, 'host')
              await expect(target).toHaveAttribute('data-value', 'host')
              await expect(workspace.locator('.hbar-app-react-performance-charts')).not.toContainText(
                copy.readings.systemCpuPercent,
              )
              await expect(workspace.locator('.hbar-app-react-performance-charts')).toContainText(
                copy.readings.hostCpuPercent,
              )
              const process = workspace.getByRole('button', { name: copy.process + suffix, exact: true }).last()
              await process.click()
              await expect(process).toHaveAttribute('aria-expanded', 'true')
              await expect(workspace).toContainText('42')
            }
            if (section === 'usage') {
              const rows = workspace.locator('.hbar-app-react-usage-models > li')
              await expect(rows).toHaveCount(scenario.count)
              if (scenario.count) {
                await expect(rows.first()).toContainText('Original model 0')
                await readTitle(rows.first().locator('[data-text-context="collection.title"]'), width < 400)
                await expect(rows.last()).toContainText(`Original model ${scenario.count - 1}`)
              }
              await expect(workspace).not.toContainText('Duplicate should not replace original model')
              const scope = workspace.locator('#hbar-status-usage-scope')
              await selectLumenOption(scope, 'session')
              await expect
                .poll(() => page.evaluate(() => window.statusWorkspaceSnapshot().usageQuery))
                .toMatchObject({ scope: 'session' })
              const advanced = workspace.getByRole('button', { name: copy.usage.advancedFilters + suffix, exact: true })
              await readHorizontally(advanced.locator('..'))
              await advanced.click()
              await expect(advanced).toHaveAttribute('aria-expanded', 'true')
              await expect(labels).toHaveCount(5)
              for (let index = 0; index < (await labels.count()); index++) await readHorizontally(labels.nth(index))
              expect(await workspace.locator(':scope > main').evaluate((node) => node.clientHeight)).toBeGreaterThan(0)
              if (scenario.count) {
                await rows.last().scrollIntoViewIfNeeded()
                await expect(rows.last()).toBeInViewport()
              }
              await selectLumenOption(workspace.locator('#hbar-status-usage-aggregation'), 'day')
              const exported = workspace.getByRole('button', { name: copy.usage.export, exact: true })
              await exported.click()
              const menu = await lumenMenuForTrigger(exported)
              await expect(menu).toHaveCSS('backdrop-filter', /blur/)
              await page.keyboard.press('Escape')
              await expect(exported).toBeFocused()
              await exported.click()
              await (
                await lumenMenuForTrigger(exported)
              )
                .getByRole('menuitem', { name: copy.usage.exportJson, exact: true })
                .click()
              await expect.poll(() => page.evaluate(() => window.statusWorkspaceSnapshot().exports.length)).toBe(1)
              const exportedFile = await page.evaluate(() => window.statusWorkspaceSnapshot().exports[0])
              expect(exportedFile?.name).toMatch(/^hbar-usage-\d+\.json$/)
              expect(exportedFile?.mime).toBe('application/json')
              expect(exportedFile?.content).toMatch(/"items":\s*\[\]/)
              const requests = await page.evaluate(() => window.statusWorkspaceSnapshot().targets)
              expect(requests.findLast((item) => item.name === 'usage.export')?.input).toMatchObject({
                scope: { kind: 'session', sessionId: 'original-session', includeDescendants: false },
              })
              await expect(
                workspace.getByRole('status').filter({ hasText: copy.usage.exported(0, exportedFile?.name ?? '') }),
              ).toBeVisible()
            }
            if (section === 'git') {
              const records = workspace.locator('.hbar-app-react-git-commits > .hbar-lumen-disclosure')
              await expect(records).toHaveCount(scenario.count)
              if (scenario.count) {
                await readTitle(records.first().locator('[data-text-context="collection.title"]'), true)
                const trigger = records.first().getByRole('button')
                await trigger.click()
                await expect(trigger).toHaveAttribute('aria-expanded', 'true')
                await expect(records.first().locator('dd')).toContainText([
                  'Original commit author',
                  'original-session',
                  'original-run',
                  'original-operation',
                ])
                await readHorizontally(records.first().locator('.hbar-status-detail-term').first())
                await expect(records.last()).toContainText(`Original commit ${scenario.count - 1}`)
                await expect(workspace).not.toContainText('Duplicate should not replace original commit')
                await page.evaluate(() => window.statusWorkspaceSelectBucket())
                const reset = workspace.getByRole('button', { name: copy.git.showAllCommits + suffix, exact: true })
                await readHorizontally(reset.locator('..'))
                await reset.click()
                await expect(reset).toHaveCount(0)
              } else await expect(workspace.getByRole('status')).toContainText(copy.git.noRepository)
              const requests = await page.evaluate(() => window.statusWorkspaceSnapshot().targets)
              for (const request of requests.filter((item) => item.name.startsWith('git.')))
                expect(request.input).toMatchObject({ cwd: 'D:/owned-status' })
            }
            if (scenario.state === 'gap') await expect(workspace.locator('.hbar-app-react-status-gap')).toBeVisible()
            const geometry = await workspace.evaluate((node) => ({
              page: document.documentElement.scrollWidth,
              width: innerWidth,
              content: node.scrollWidth,
              available: node.clientWidth,
            }))
            if (geometry.page > width + 1 || geometry.content > geometry.available + 1)
              console.log({
                section,
                locale,
                mode,
                width,
                scenario,
                geometry,
                overflow: await workspace.evaluate((node) =>
                  [...node.querySelectorAll('*')]
                    .filter((element) => {
                      let ancestor: Element | null = element
                      while (ancestor && ancestor !== node) {
                        if (getComputedStyle(ancestor).overflowX === 'auto') return false
                        ancestor = ancestor.parentElement
                      }
                      return element.getBoundingClientRect().right > innerWidth + 1
                    })
                    .map((element) => ({ class: element.className, width: element.getBoundingClientRect().width }))
                    .slice(0, 10),
                ),
              })
            expect(geometry.page).toBeLessThanOrEqual(width + 1)
            expect(geometry.content).toBeLessThanOrEqual(geometry.available + 1)
            if (width === 320)
              await page.screenshot({
                path: resolve(output, `${locale}-${mode}-${section}-${scenario.count}-${scenario.state}.png`),
              })
            if (
              width === 320 &&
              mode === 'dark' &&
              section === 'git' &&
              scenario.state === 'ready' &&
              scenario.count === 3
            )
              expect(await page.evaluate(() => window.statusWorkspaceBounds())).toEqual({
                models1024: true,
                models1025: false,
                usage500: true,
                usage501: false,
                performance500: true,
                performance501: false,
                commits100: true,
                commits101: false,
                git1000: true,
                git1001: false,
              })
            await page.evaluate(() => window.releaseStatusWorkspace())
            scenarios++
          }
        }
  expect(errors).toEqual([])
  console.log(
    `Status workspace verified: ${scenarios} actual Chrome scenarios; two locales/themes/five widths, original scope/CWD/export and model/commit/series capacity.`,
  )
} catch (error) {
  console.log({ currentCase })
  throw error
} finally {
  await browser.close()
  await server.stop(true)
}

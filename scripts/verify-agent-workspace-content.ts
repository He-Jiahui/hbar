import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { AgentWorkspaceContentInput } from '../tests/fixtures/agent-workspace-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/agent-workspace-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/agent-workspace-content-browser.tsx'),
      name: 'AgentWorkspaceContent',
      formats: ['iife'],
      fileName: 'agent-workspace-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/agent-workspace-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/agent-workspace-content.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
let currentCase: unknown
const page = await browser.newPage()
try {
  page.setDefaultTimeout(10000)
  page.on('pageerror', (reason) => errors.push(reason.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const base = getShellCopy(locale).agents
        const suffix =
          locale === 'zh-CN'
            ? ' 完整原始任务操作与栏目标题'.repeat(4)
            : ' Complete original Agent action and section heading'.repeat(4)
        const normal: AgentWorkspaceContentInput = { locale, mode, suffix, count: 3, state: 'list' }
        const cases = [normal]
        if (width === 320 && mode === 'dark')
          cases.push(
            ...[0, 1, 50, 51, 500, 501].map((count) => ({ ...normal, count })),
            ...(
              ['create', 'create-unknown', 'detail', 'cancel-error', 'cancel-unknown', 'read-error', 'offline'] as const
            ).map((state) => ({ ...normal, state })),
            { ...normal, state: 'duplicate-page', count: 51 },
            { ...normal, state: 'offline', count: 51 },
            { ...normal, state: 'append-pending', count: 51 },
            { ...normal, state: 'append-error', count: 51 },
          )
        for (const input of cases) {
          currentCase = { locale, mode, width, count: input.count, state: input.state }
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width <= 390 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#agent-workspace-content-fixture{min-inline-size:0;min-block-size:0;block-size:100dvh;display:flex}#agent-workspace-content-fixture>.lumen-tool-pane{flex:1 1 auto;min-inline-size:0;min-block-size:0}</style><div id="agent-workspace-content-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountAgentWorkspaceContent(value), input)
          const panel = page.locator('.hbar-app-react-agent-workspace')
          await expect(panel).toBeVisible()
          await verifyReadableText(panel.locator('[data-text-context="tool.title"]'), base.title + suffix, width <= 900)
          const header = panel.locator('[data-tool-pane-slot="header"]')
          const headerOverflow = await header.evaluate((node) => node.scrollHeight > node.clientHeight + 1)
          if (headerOverflow) {
            await header.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowDown')
            await expect.poll(() => header.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
          }
          expect(await panel.locator('.lumen-tool-pane-body').evaluate((node) => node.clientHeight)).toBeGreaterThan(0)
          if (input.state === 'read-error') {
            await expect(panel.locator('.hbar-app-react-agent-list').getByRole('alert')).toHaveText(
              base.error('DISCONNECTED'),
            )
            await page.evaluate(() => window.repairAgentWorkspaceContent())
            await panel.getByRole('button', { name: base.refresh, exact: true }).click()
            await expect(panel.locator('.hbar-app-react-agent-list').getByRole('alert')).toHaveCount(0)
          }
          if (input.state === 'create' || input.state === 'create-unknown') {
            await verifyReadableText(
              panel.getByRole('heading', { name: base.createTitle + suffix, exact: true }),
              base.createTitle + suffix,
              true,
            )
            const objective = panel.getByRole('textbox', { name: base.objective + suffix, exact: true })
            await objective.fill(' ')
            await panel.getByRole('button', { name: base.create + suffix, exact: true }).click()
            await expect(objective).toHaveAttribute('aria-invalid', 'true')
            await objective.fill('invalid'.repeat(600))
            await expect(objective).toHaveValue('invalid'.repeat(600).slice(0, 4000))
            const original = '原始创建任务 Original creation objective '.repeat(10).trim()
            await objective.fill(original)
            await expect(objective).not.toHaveAttribute('aria-invalid', 'true')
            await panel
              .getByRole('textbox', { name: base.childTitle + suffix, exact: true })
              .fill('原始子会话 Original child title')
            const submit = panel.getByRole('button', { name: base.create + suffix, exact: true })
            await submit.click()
            if (input.state === 'create-unknown') {
              await expect(objective).toBeDisabled()
              await expect(panel.getByRole('button', { name: base.retryCreate + suffix, exact: true })).toBeEnabled()
              await panel.getByRole('button', { name: base.retryCreate + suffix, exact: true }).click()
            }
            await expect(panel.locator('.hbar-app-react-agent-detail')).toBeVisible()
            await expect(panel.getByRole('status')).toContainText(base.created)
            const calls = await page.evaluate(() =>
              window.agentWorkspaceContentState().calls.filter((call) => call.name === 'agent.create'),
            )
            expect(calls).toHaveLength(input.state === 'create-unknown' ? 2 : 1)
            expect(calls[0]?.operationKey).toBeTruthy()
            expect(calls[0]?.input).toMatchObject({
              parentSessionId: 'original-parent',
              objective: original,
              title: '原始子会话 Original child title',
            })
            if (calls[1]) expect(calls[1]).toEqual(calls[0])
          } else if (input.state === 'detail' || input.state === 'cancel-error' || input.state === 'cancel-unknown') {
            const detail = panel.locator('.hbar-app-react-agent-detail')
            await verifyReadableText(
              detail.getByRole('heading', { name: base.detailTitle + suffix, exact: true }),
              base.detailTitle + suffix,
              true,
            )
            await verifyReadableText(
              detail.getByRole('heading', { name: base.objective + suffix, exact: true }),
              base.objective + suffix,
              true,
            )
            if (input.state !== 'detail') {
              await detail.getByRole('button', { name: base.cancel + suffix, exact: true }).click()
              await expect(detail.getByRole('alert')).toHaveCount(1)
              await page.evaluate(() => window.repairAgentWorkspaceContent())
              await detail
                .getByRole('button', {
                  name: (input.state === 'cancel-unknown' ? base.retryCancel : base.cancel) + suffix,
                  exact: true,
                })
                .click()
              await expect(detail.getByRole('alert')).toHaveCount(0)
              await expect(detail.getByRole('button', { name: base.cancel + suffix, exact: true })).toHaveCount(0)
              const calls = await page.evaluate(() =>
                window.agentWorkspaceContentState().calls.filter((call) => call.name === 'agent.cancel'),
              )
              expect(calls).toHaveLength(2)
              expect(calls[0]?.input).toMatchObject({ agentId: 'original-agent-0' })
              expect(calls[1]?.input).toEqual(calls[0]?.input)
            }
            await page.evaluate(() => window.removeSelectedAgentWorkspaceContent())
            await expect(panel.locator('.hbar-app-react-agent-detail')).toHaveCount(0)
            await expect(panel.locator('.hbar-app-react-agent-row')).toHaveCount(2)
          } else {
            const rows = panel.locator('.hbar-app-react-agent-record')
            await expect(rows).toHaveCount(Math.min(50, input.count))
            if (input.state === 'append-pending' || input.state === 'append-error') {
              const more = panel.getByRole('button', { name: base.loadMore + suffix, exact: true })
              await more.click()
              if (input.state === 'append-pending') {
                await expect(more).toBeDisabled()
                await expect(panel.getByRole('status')).toHaveText(base.loading)
              } else {
                await expect(more).toBeEnabled()
                await verifyReadableText(panel.getByRole('alert'), base.error('AGENT_NOT_FOUND'), true)
              }
              await expect(rows).toHaveCount(50)
              await page.evaluate(() => window.repairAgentWorkspaceContent())
              if (input.state === 'append-pending') await expect(rows).toHaveCount(51)
            }
            while (
              input.state !== 'offline' &&
              (await panel.getByRole('button', { name: base.loadMore + suffix, exact: true }).isVisible())
            ) {
              const oldCount = await rows.count()
              await panel.getByRole('button', { name: base.loadMore + suffix, exact: true }).click()
              await expect.poll(() => rows.count()).toBeGreaterThan(oldCount)
            }
            await expect(rows).toHaveCount(Math.min(input.state === 'offline' ? 50 : 500, input.count))
            if (input.state === 'append-error') {
              const attempts = await page.evaluate(() =>
                window
                  .agentWorkspaceContentState()
                  .calls.filter(
                    (call) =>
                      call.name === 'agent.list' &&
                      typeof call.input === 'object' &&
                      call.input !== null &&
                      'after' in call.input,
                  )
                  .map((call) => call.input),
              )
              expect(attempts).toHaveLength(2)
              expect(attempts[0]).toEqual(attempts[1])
              await expect(panel.getByRole('alert')).toHaveCount(0)
            }
            if (input.state === 'offline' && input.count > 50)
              await expect(panel.getByRole('button', { name: base.loadMore + suffix, exact: true })).toBeDisabled()
            if (input.count) {
              await verifyReadableText(
                rows.first().locator('[data-text-context="collection.title"]'),
                '原始任务 0 Complete original Agent objective '.repeat(7),
                width <= 390,
              )
              await expect(rows.first().locator('time')).toHaveAttribute('datetime', new Date(100).toISOString())
              const compact = rows.first().locator('.hbar-agent-content-reading').first()
              const overflow = await compact.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
              if (width <= 390) expect(overflow).toBe(true)
              if (overflow) {
                await compact.focus()
                for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
                await expect.poll(() => compact.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              }
              if (input.count === 3 && input.state === 'list') {
                const original = panel.getByRole('button', {
                  name: base.showDetails('原始任务 0 Complete original Agent objective '.repeat(7)),
                  exact: true,
                })
                await page.evaluate(() => window.reverseAgentWorkspaceContent())
                await expect(rows.first().locator('[data-text-context="collection.title"]')).toHaveText(
                  '原始任务 2 Complete original Agent objective '.repeat(7),
                )
                await original.click()
                await expect(panel.locator('.hbar-app-react-agent-detail > section')).toContainText(
                  '原始任务 0 Complete original Agent objective',
                )
                await page.evaluate(() => window.removeSelectedAgentWorkspaceContent())
                await expect(panel.locator('.hbar-app-react-agent-row')).toHaveCount(2)
              }
              await rows.last().scrollIntoViewIfNeeded()
            }
          }
          expect(await page.evaluate(() => window.agentWorkspaceContentBounds())).toEqual({
            objective4000: true,
            objective4001: false,
            page100: true,
            page101: false,
          })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (
            width === 320 &&
            input.count === 3 &&
            (input.state === 'list' || input.state === 'create' || input.state === 'detail')
          ) {
            await panel.locator('[data-text-context="tool.title"]').scrollIntoViewIfNeeded()
            await page.screenshot({ path: resolve(output, `${locale}-${mode}-${input.state}-320.png`) })
          }
          await page.evaluate(() => window.releaseAgentWorkspaceContent())
          scenarios++
        }
      }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual Agent workspace Chrome scenarios passed.`)
} catch (reason) {
  console.error({ currentCase, errors })
  console.error(
    await page.evaluate(() => {
      const state = typeof window.agentWorkspaceContentState === 'function' ? window.agentWorkspaceContentState() : null
      const entry = state?.entry
      return {
        draft: entry && typeof entry === 'object' && 'draft' in entry ? entry.draft : null,
        creation: entry && typeof entry === 'object' && 'creation' in entry ? entry.creation : null,
        calls: state?.calls.slice(-4),
        form: [...document.querySelectorAll('form')].map((form) => ({
          valid: form.checkValidity(),
          buttons: [...form.querySelectorAll('button[type="submit"]')].map((button) => ({
            disabled: button.hasAttribute('disabled'),
            type: button.getAttribute('type'),
          })),
        })),
      }
    }),
  )
  throw reason
} finally {
  await browser.close()
  await server.stop(true)
}

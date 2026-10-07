import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { WorkflowContentInput } from '../tests/fixtures/workflow-content-browser'
import { workflowFocusTitle, workflowCheckTitle, workflowPath } from '../tests/fixtures/workflow-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/workflow-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/workflow-content-browser.tsx'),
      name: 'WorkflowContent',
      formats: ['iife'],
      fileName: 'workflow-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/workflow-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/workflow-content.iife.js')).text()
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
  const readAction = async (reader: Locator) => {
    await reader.scrollIntoViewIfNeeded()
    const overflow = await reader.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
    if (overflow) {
      await reader.focus()
      for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
      await expect
        .poll(() => reader.evaluate((node) => node.scrollLeft), {
          message: 'Original compact text remains keyboard readable',
        })
        .toBeGreaterThan(0)
    }
  }
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const labels = getShellCopy(locale).goals.workflow
        const suffix =
          locale === 'zh-CN'
            ? ' 完整原始栏目标题和操作文案'.repeat(5)
            : ' Complete original section heading and action caption'.repeat(5)
        const regular: WorkflowContentInput = {
          locale,
          mode,
          suffix,
          evidence: 3,
          checks: 3,
          delegations: 3,
          scope: 3,
          files: 3,
          state: 'ready',
        }
        const cases: WorkflowContentInput[] = [regular]
        if (width === 320 && mode === 'dark') {
          cases.push(
            ...[0, 1, 20, 21, 1000].map((evidence) => ({
              ...regular,
              evidence,
              checks: evidence === 0 ? 0 : 1,
              delegations: evidence === 0 ? 0 : 1,
              scope: evidence === 0 ? 0 : 1,
              files: evidence === 0 ? 0 : 1,
            })),
            { ...regular, checks: 32 },
            { ...regular, delegations: 128, files: 1 },
            { ...regular, scope: 128 },
            { ...regular, delegations: 1, files: 512 },
            ...(['empty', 'draft', 'stale', 'review', 'read-error', 'duplicate', 'offline'] as const).map((state) => ({
              ...regular,
              state,
            })),
          )
        }
        for (const input of cases) {
          currentCase = {
            locale,
            mode,
            width,
            state: input.state,
            evidence: input.evidence,
            checks: input.checks,
            delegations: input.delegations,
            scope: input.scope,
            files: input.files,
          }
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width <= 390 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}.workflow-content-reading{display:flex;flex-direction:column;min-inline-size:0;block-size:100dvh;min-block-size:0;overflow:auto;padding:1rem}.workflow-content-reading>.hbar-app-react-workflow-overview{flex:0 0 auto}</style><div id="workflow-content-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountWorkflowContent(value), input)
          const overview = page.locator('.hbar-app-react-workflow-overview')
          await expect(overview).toBeVisible()
          if (input.state === 'read-error' || input.state === 'duplicate') {
            const code = input.state === 'read-error' ? 'DISCONNECTED' : 'DUPLICATE_ID'
            await expect(overview.getByRole('alert')).toHaveText(labels.error(code))
            expect(
              (await page.evaluate(() => window.workflowContentState())).calls.filter(
                (call) => call.name === 'workflow.acceptCheck',
              ),
            ).toEqual([])
            if (input.state === 'read-error') {
              await page.evaluate(() => window.repairWorkflowContent())
              await expect(overview.getByRole('alert')).toHaveCount(0)
            }
          }
          if (input.state !== 'duplicate') {
            await verifyReadableText(
              overview.locator(':scope > header > [data-text-context="section.title"]'),
              labels.title + suffix,
              width <= 900,
            )
            if (input.state === 'empty') await expect(overview.getByText(labels.empty, { exact: true })).toBeVisible()
            else if (input.state === 'draft')
              await expect(overview.getByText(labels.draft, { exact: true })).toBeVisible()
            else {
              if (input.state === 'stale')
                await verifyReadableText(
                  overview.locator('.hbar-app-react-workflow-focus > [data-text-context="collection.title"]'),
                  labels.staleFocus,
                  true,
                )
              else {
                await verifyReadableText(
                  overview.locator('.hbar-app-react-workflow-focus > [data-text-context="collection.title"]'),
                  workflowFocusTitle,
                  width <= 900,
                )
                await verifyReadableText(
                  overview.locator('.hbar-app-react-workflow-checks > [data-text-context="section.title"]'),
                  labels.acceptance + suffix,
                  width <= 900,
                )
                const scope = overview.locator('.hbar-app-react-workflow-disclosure').first()
                await scope.getByRole('button').click()
                await expect(scope.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
                await verifyReadableText(
                  scope.locator('[data-text-context="detail.value"]').first(),
                  labels.scopeEntries(Array.from({ length: input.scope }, (_, index) => workflowPath(index))),
                  input.scope > 0,
                )
                await expect(scope.locator('[data-text-context="detail.value"]').nth(1)).toHaveText(labels.none)
                await readAction(scope.locator('[data-text-context="detail.term"]').first())
                await scope.getByRole('button').press('Enter')
                await expect(scope.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
                await expect(overview.locator('.hbar-app-react-workflow-checks li')).toHaveCount(input.checks)
              }
              const evidence = overview.locator('.hbar-app-react-workflow-evidence > li')
              await expect(evidence).toHaveCount(Math.min(20, input.evidence))
              if (input.evidence > 20) {
                const more = overview.getByRole('button', { name: labels.loadMore + suffix, exact: true })
                await readAction(more.locator('..'))
                await more.focus()
                await more.press('Enter')
                await expect(evidence).toHaveCount(Math.min(40, input.evidence))
                expect((await page.evaluate(() => window.workflowContentState())).visibleEvidence).toBe(
                  Math.min(40, input.evidence),
                )
              }
              if (input.evidence) {
                await expect(evidence.first()).toContainText(`original-proof-${input.evidence - 1}`)
                const time = evidence.first().locator('[data-text-context="metadata.time"]')
                await expect(time).toHaveAttribute('datetime', new Date(1000 + input.evidence - 1).toISOString())
                await readAction(time.locator('..'))
              } else await expect(overview.getByText(labels.noEvidence, { exact: true })).toBeVisible()
              const agents = overview.locator('.hbar-app-react-workflow-agents > li')
              await expect(agents).toHaveCount(input.delegations)
              if (input.delegations && input.files) {
                const details = agents.first().locator('.hbar-app-react-workflow-disclosure')
                await expect(details.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
                await expect(details.locator('[data-text-context="resource.path"]')).toHaveCount(input.files)
                const last = details.locator('[data-text-context="resource.path"]').last()
                await expect(last).toHaveText(workflowPath(input.files - 1))
                await readAction(last.locator('..'))
                await last.scrollIntoViewIfNeeded()
                await expect(last).toBeInViewport()
                await details.getByRole('button').click()
                await expect(details.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
              }
              if (input.state === 'offline')
                await expect(
                  overview.getByRole('button', {
                    name: labels.acceptanceAction('accepted', workflowCheckTitle(0)),
                    exact: true,
                  }),
                ).toBeDisabled()
              if (
                input.state === 'ready' &&
                input.evidence === 3 &&
                input.checks === 3 &&
                input.delegations === 3 &&
                input.scope === 3 &&
                input.files === 3
              ) {
                expect(await page.evaluate(() => window.workflowContentBounds())).toEqual({
                  evidence1000: true,
                  evidence1001: false,
                  delegations128: true,
                  delegations129: false,
                  checks32: true,
                  checks33: false,
                  scope128: true,
                  scope129: false,
                  files512: true,
                  files513: false,
                })
                const accept = overview.getByRole('button', {
                  name: labels.acceptanceAction('accepted', workflowCheckTitle(0)),
                  exact: true,
                })
                const original = await accept.elementHandle()
                if (!original) throw new Error('Missing original acceptance button')
                await page.evaluate(() => window.reverseWorkflowChecks())
                await expect(overview.locator('.hbar-app-react-workflow-checks li').first()).toContainText(
                  workflowCheckTitle(2),
                )
                await original.click()
                await expect
                  .poll(async () =>
                    (await page.evaluate(() => window.workflowContentState())).calls.filter(
                      (call) => call.name === 'workflow.acceptCheck',
                    ),
                  )
                  .toEqual([
                    {
                      name: 'workflow.acceptCheck',
                      input: {
                        sessionId: 'original-parent',
                        itemId: 'original-focus',
                        checkId: 'original-check-0',
                        decision: 'accepted',
                        note: null,
                        expectedRevision: 5,
                      },
                    },
                  ])
                const reject = overview.getByRole('button', {
                  name: labels.acceptanceAction('rejected', workflowCheckTitle(1)),
                  exact: true,
                })
                await page.evaluate(() => window.failNextWorkflowAction())
                await reject.click()
                await expect(overview.getByRole('alert')).toHaveText(labels.error('REVISION_CONFLICT'))
                await reject.click()
                await expect(overview.getByRole('alert')).toHaveCount(0)
                const apply = agents.nth(1).getByRole('button', { name: labels.applyPatch + suffix, exact: true })
                await readAction(apply.locator('..'))
                await apply.focus()
                await apply.press('Enter')
                await expect
                  .poll(async () =>
                    (await page.evaluate(() => window.workflowContentState())).calls
                      .filter((call) => call.name === 'agent.patch.apply')
                      .map((call) => call.input),
                  )
                  .toEqual([{ parentSessionId: 'original-parent', agentId: 'original-agent-1', planRevision: 3 }])
                expect((await page.evaluate(() => window.workflowContentState())).selected).toBe('original-parent')
                await expect(agents.nth(1).getByRole('status')).toHaveText(labels.actionSucceeded)
                const coordinate = agents.first().getByRole('button', { name: labels.coordinate + suffix, exact: true })
                await readAction(coordinate.locator('..'))
                await coordinate.click()
                await expect
                  .poll(async () => (await page.evaluate(() => window.workflowContentState())).selected)
                  .toBe('original-child-0')
              }
            }
          }
          const pageBox = await page.evaluate(() => ({
            width: innerWidth,
            content: document.documentElement.scrollWidth,
          }))
          expect(pageBox.content, JSON.stringify(currentCase)).toBeLessThanOrEqual(pageBox.width + 1)
          if (width === 320 && input.state === 'ready' && input.checks === 3)
            await page.screenshot({
              path: resolve(output, `${locale}-${mode}-${input.evidence}-${input.files}-320.png`),
            })
          await page.evaluate(() => window.releaseWorkflowContent())
          scenarios++
        }
      }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual Workflow Chrome scenarios passed.`)
} catch (reason) {
  console.error({ currentCase, scenarios, reason })
  throw reason
} finally {
  await browser.close()
  await server.stop(true)
}

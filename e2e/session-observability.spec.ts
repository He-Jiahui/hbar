import { expect, test, type WebSocketRoute } from '@playwright/test'
import { createBudgetCommandClient, createRunCommandClient, createSessionTimelineClient } from '@hbar/client'
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-observability-browser-')
  )
    throw new Error('Unowned fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`durable activity statistics across all scopes, paging and refresh: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-observability-browser-'))
    const context = await browser.newContext({
      locale,
      colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
      viewport: { width: 1440, height: 1050 },
    })
    let host: WebSessionHost | undefined
    try {
      const skillRoot = join(root, '.agents', 'skills', 'telemetry-proof')
      await mkdir(join(skillRoot, 'references'), { recursive: true })
      await writeFile(
        join(skillRoot, 'SKILL.md'),
        '---\nname: telemetry-proof\ndescription: Verify measured session activity.\n---\nRead references/recipe.md to verify activity.\n',
      )
      await writeFile(join(skillRoot, 'references', 'recipe.md'), 'A measured reference.\n')
      await writeFile(join(root, 'measured.txt'), 'first line\n第二行 🧭\n')
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const { client, ready } = host
      await createBudgetCommandClient(client).execute(
        'session.setBudget',
        { sessionId: ready.sessionId, tokens: 2_000_000 },
        { idempotencyKey: 'observability-fixture-budget' },
      )
      const runs = createRunCommandClient(client)
      const statistics = createSessionTimelineClient(client)
      const submit = async (text: string) => {
        const result = await runs.execute(
          'run.submit',
          { sessionId: ready.sessionId, modelId: 'local-fixture', input: { text, images: [], approval: 'allow' } },
          { idempotencyKey: crypto.randomUUID() },
        )
        await expect
          .poll(async () => (await runs.execute('operation.get', { operationId: result.operationId })).status)
          .toBe('completed')
      }
      for (const text of [
        '/tool skill {"name":"telemetry-proof"}',
        '/tool skill_read {"name":"telemetry-proof","path":"references/recipe.md"}',
        '/tool read_file {"path":"measured.txt"}',
        '/tool write_file {"path":"changed.txt","text":"one\\ntwo\\n"}',
        '/tool edit_file {"path":"changed.txt","oldText":"two","newText":"three"}',
      ])
        await submit(text)
      for (let index = 0; index < 22; index++)
        await submit(`/tool shell ${JSON.stringify({ command: `Write-Output "command-${index} 🧭"` })}`)
      const before = await statistics.observability({ sessionId: ready.sessionId })
      expect(before.skills).toMatchObject({ used: 1, uses: 1, resourceReads: 1 })
      expect(before.files).toMatchObject({ reads: 1, writes: 2, linesRead: 2, addedLines: 3, removedLines: 1 })
      expect(before.terminal.total).toBe(22)
      await runs.execute(
        'context.compact',
        { sessionId: ready.sessionId, modelId: 'local-fixture' },
        { idempotencyKey: crypto.randomUUID() },
      )
      await submit('A new turn after compaction.')
      const all = await statistics.observability({ sessionId: ready.sessionId })
      const window = await statistics.observability({ sessionId: ready.sessionId, scope: 'window' })
      expect(all.compactions.completed).toBeGreaterThan(0)
      expect(window.range.anchor).toBeGreaterThan(0)
      const copy = getShellCopy(locale)
      const labels = copy.monitoring.observability
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const connection: { socket: WebSocketRoute | null } = { socket: null }
      await page.routeWebSocket('**/rpc', (route) => {
        connection.socket = route
        route.connectToServer()
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      const current = await client.call('session.snapshot', { sessionId: ready.sessionId })
      await page.getByRole('treeitem', { name: current.session.title, exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'monitoring')
      const pane = page.locator('.hbar-app-react-session-monitoring')
      const dashboard = pane.locator('.hbar-session-observability')
      await expect(dashboard.locator('.hbar-monitoring-primary-metrics')).toContainText(
        labels.number(all.usage.input + all.usage.output),
      )
      await expect(dashboard.locator('[data-statistics-section="skills"]')).toContainText(labels.fields.skillUses)
      await expect(dashboard.locator('.hbar-observability-record')).toContainText('telemetry-proof')
      const record = dashboard.locator('.hbar-observability-record').first()
      await record.getByRole('button').focus()
      await page.keyboard.press('Enter')
      await expect(record).toHaveAttribute('data-open', 'true')
      await expect(record).toContainText(labels.fields.resources)
      const detail = dashboard.locator('.hbar-observability-records')
      await detail.getByRole('tab', { name: labels.sections.models, exact: true }).click()
      const modelFacts = await statistics.observability({ sessionId: ready.sessionId, detail: 'models' })
      await expect(detail.locator('[data-model-usage]')).toHaveCount(modelFacts.records.length)
      const model = modelFacts.records[0]
      expect(model).toBeDefined()
      if (!model) throw new Error('Missing measured model')
      const modelRecord = detail.locator('[data-model-usage]').first()
      await modelRecord.getByRole('button').click()
      await expect(modelRecord).toContainText(
        labels.percent(((model.input ?? 0) + (model.output ?? 0)) / (all.usage.input + all.usage.output)),
      )
      await dashboard.getByRole('button', { name: labels.latency.title, exact: true }).click()
      await expect(dashboard.getByText(labels.latency.firstToken, { exact: true })).toBeVisible()
      await dashboard.getByRole('button', { name: labels.execution.title, exact: true }).click()
      await expect(dashboard.getByText(labels.execution.requestConcurrency, { exact: true })).toBeVisible()
      await detail.getByRole('tab', { name: labels.sections.terminal, exact: true }).click()
      await expect(detail.locator('.hbar-observability-record')).toHaveCount(20)
      const first = await detail.locator('.hbar-observability-record').first().textContent()
      await detail.getByRole('button', { name: labels.nextPage, exact: true }).click()
      await expect(detail.locator('.hbar-observability-record')).toHaveCount(2)
      expect(await detail.locator('.hbar-observability-record').first().textContent()).not.toBe(first)
      await detail.getByRole('button', { name: labels.previousPage, exact: true }).click()
      await expect(detail.locator('.hbar-observability-record')).toHaveCount(20)
      const scope = dashboard.locator('.hbar-observability-scope')
      await scope.getByRole('tab', { name: labels.scopes.turn, exact: true }).click()
      await expect(dashboard).toHaveAttribute('data-statistics-scope', 'turn')
      await expect(dashboard.locator('.hbar-monitoring-primary-metrics')).toContainText(
        labels.number(
          (await statistics.observability({ sessionId: ready.sessionId, scope: 'turn' })).usage.input +
            (await statistics.observability({ sessionId: ready.sessionId, scope: 'turn' })).usage.output,
        ),
      )
      await scope.getByRole('button', { name: labels.previous, exact: true }).click()
      await expect(dashboard.locator('[data-statistics-section="terminal"]')).toContainText(labels.fields.successRate)
      await scope.getByRole('tab', { name: labels.scopes.window, exact: true }).click()
      await expect(dashboard).toHaveAttribute('data-statistics-scope', 'window')
      await scope.getByRole('button', { name: labels.previous, exact: true }).click()
      await expect(dashboard.locator('.hbar-observability-compression')).toBeVisible()
      await scope.getByRole('tab', { name: labels.scopes.session, exact: true }).click()
      await expect(dashboard.locator('.hbar-monitoring-primary-metrics')).toContainText(
        labels.number(all.usage.input + all.usage.output),
      )
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 1050 })
        await scope.scrollIntoViewIfNeeded()
        expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await pane.screenshot({ path: info.outputPath(`statistics-overview-${width}.png`) })
        await dashboard.locator('[data-statistics-section="files"]').scrollIntoViewIfNeeded()
        await pane.screenshot({ path: info.outputPath(`statistics-resources-${width}.png`) })
      }
      await page.reload()
      await page.setViewportSize({ width: 1440, height: 1050 })
      await openSessionTool(page, copy.session.tools, 'monitoring')
      await expect(dashboard.locator('.hbar-monitoring-primary-metrics')).toContainText(
        labels.number(all.usage.input + all.usage.output),
      )
      await expect(dashboard.locator('.hbar-observability-record')).toContainText('telemetry-proof')
      await context.setOffline(true)
      await connection.socket?.close({ code: 1012, reason: 'Offline statistics fixture' })
      // Connection state comes from the app's existing centralized indicator; cached facts remain readable.
      await expect(scope.getByRole('button', { name: labels.refresh, exact: true })).toBeDisabled({ timeout: 15000 })
      await expect(dashboard.locator('.hbar-monitoring-primary-metrics')).toContainText(
        labels.number(all.usage.input + all.usage.output),
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })

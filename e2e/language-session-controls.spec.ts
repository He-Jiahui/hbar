import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createGoalPlanCommandClient, createModelCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { cleanupOwnedPermissionFixture } from './support/permission-fixture-cleanup'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('same-origin language switching retains model, session approval, durable Plan, paused Goal and command context', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-language-session-controls-'))
  const evidence = 'artifacts/desktop-entry-matrix/language-controls'
  await mkdir(evidence, { recursive: true })
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  const errors: string[] = []
  const observations: object[] = []
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44965),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const { sessionId } = host.ready
    const goals = createGoalPlanCommandClient(host.client)
    const models = createModelCommandClient(host.client)
    const configuration = createConfigurationCommandClient(host.client)
    // Fixture setup uses the public Goal API with autoContinue disabled. It does
    // not send a Run or imply commercial provider/model capability.
    const objective = 'Paused original Goal — 保留原始目标身份'
    const created = await goals.execute('goal.create', { sessionId, objective, tokenBudget: 3000 })
    const goalId = created.goal?.goalId
    if (!goalId) throw new Error('The fixture requires a confirmed Goal identity')
    await goals.execute('goal.set', { sessionId, expectedGoalId: goalId, status: 'paused' })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44967}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    let sockets = 0
    page.on('websocket', () => sockets++)
    const en = getShellCopy('en-US')
    const zh = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const draft = 'Unsent original language-control draft — 模型、审批、计划与目标保留'
    await page.getByRole('textbox', { name: en.session.prompt.input, exact: true }).fill(draft)
    const model = await models.execute('session.getModel', { sessionId })
    expect(model.modelId).toBe('local-fixture')
    if (!model.model) throw new Error('Expected the actual demo Host model descriptor')
    const modelName = model.model.modelName
    const modelTrigger = page.locator('.hbar-composer-model-trigger')
    await expect(modelTrigger).toContainText(modelName)
    await modelTrigger.click()
    const initialModelDialog = page.getByRole('dialog', { name: en.session.modelPicker.title, exact: true })
    const fixtureOption = initialModelDialog.getByRole('option').filter({ hasText: modelName })
    await expect(fixtureOption).toHaveCount(1)
    await expect(fixtureOption).toHaveAttribute('aria-selected', 'true')
    await fixtureOption.click()
    await expect(initialModelDialog).toBeHidden()
    const selectedModel = await models.execute('session.getModel', { sessionId })
    const permission = page.locator('.hbar-composer-permission-picker')
    const trigger = permission.locator('.hbar-composer-permission-trigger')
    const permissionPopup = page.locator('.hbar-composer-permission-surface')
    await trigger.click()
    await permissionPopup.locator('[data-choice="deny"]').click()
    await expect(trigger).toHaveAttribute('data-choice', 'deny')
    await trigger.click()
    await permissionPopup.locator('[role="menuitemradio"][data-choice="plan"]').click()
    await expect(trigger).toHaveAttribute('data-choice', 'plan')
    expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
    // The fixture itself changed session approval. Since 888c0757 that write
    // advances the same settings revision included in model configuration.
    // Verify only this expected revision advance before freezing the full
    // configuration that subsequent read-only language interactions must retain.
    const modelBaseline = await models.execute('session.getModel', { sessionId })
    const sessionRevision = `settings:session:${sessionId}`
    expect(modelBaseline).toEqual({
      ...selectedModel,
      revisions: { ...selectedModel.revisions, [sessionRevision]: (selectedModel.revisions[sessionRevision] ?? 0) + 1 },
    })
    const permissionBaseline = await configuration.execute('permission.get', {})
    expect(permissionBaseline).toEqual({ mode: 'ask' })
    const goalBaseline = (await goals.execute('goal.get', { sessionId })).goal
    expect(goalBaseline).toMatchObject({ goalId, status: 'paused', objective, tokenBudget: 3000 })
    const strip = page.locator('.hbar-composer-goal-strip')
    await expect(strip).toContainText(en.session.intent.statuses.paused)
    const connectedSockets = sockets
    const other = await context.newPage()
    other.on('pageerror', (error) => errors.push(error.message))
    await other.goto(base)
    await other.getByRole('button', { name: en.shell.settings, exact: true }).click()
    await other.getByRole('button', { name: en.general.group, exact: true }).click()

    for (const locale of ['zh-CN', 'en-US'] as const) {
      const copy = getShellCopy(locale)
      await other.getByRole('radio', { name: locale === 'en-US' ? 'English' : '简体中文', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
        await expectComposerText(prompt, draft)
        await expect(prompt).toHaveAttribute('placeholder', copy.session.intent.planPlaceholder)
        await expect(modelTrigger).toBeVisible()
        await expect(modelTrigger).toHaveAttribute('aria-label', copy.session.modelPicker.trigger(modelName))
        await expect(trigger).toBeVisible()
        await expect(trigger).toHaveAttribute('data-choice', 'plan')
        await expect(trigger).toHaveAttribute(
          'aria-label',
          copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
        )
        await expect(strip).toContainText(objective)
        await expect(strip).toContainText(copy.session.intent.statuses.paused)
        await expect(strip.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeEnabled()
        await expect(strip.getByRole('button', { name: copy.session.intent.expand, exact: true })).toBeEnabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `${evidence}/controls-${locale}-${width}.png` })

        await modelTrigger.click()
        const modelDialog = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
        await expect(
          modelDialog.getByRole('searchbox', { name: copy.session.modelPicker.search, exact: true }),
        ).toBeFocused()
        await expect(modelDialog.getByRole('option').filter({ hasText: modelName })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await page.screenshot({ path: `${evidence}/model-${locale}-${width}.png` })
        await page.keyboard.press('Escape')
        await expect(modelTrigger).toBeFocused()
        await trigger.click()
        await expect(permissionPopup.locator('[data-choice="plan"]')).toHaveAttribute('aria-checked', 'true')
        await expect(permissionPopup.getByRole('menuitemradio')).toHaveCount(6)
        for (const choice of await permissionPopup.getByRole('menuitemradio').all()) await expect(choice).toBeEnabled()
        await expect(permissionPopup).toContainText(copy.session.permissionPicker.plan.scope)
        await expect(permissionPopup).not.toContainText(copy.session.permissionPicker.scopeHint)
        await page.screenshot({ path: `${evidence}/execution-${locale}-${width}.png` })
        await page.keyboard.press('Escape')

        // This opens the real palette at narrow widths too; no hidden-sidebar
        // click or synthetic command injection substitutes for the UI entry.
        await page.keyboard.press('Control+Shift+p')
        const palette = page.getByRole('dialog', { name: copy.commandPalette.title, exact: true })
        const query = palette.getByRole('searchbox', { name: copy.commandPalette.search, exact: true })
        await expect(query).toBeFocused()
        const title = copy.commandPalette.resolve('commands.session.getBudget.title')
        await query.fill(title)
        const result = palette.getByRole('option').filter({ hasText: title })
        await expect(result).toHaveCount(1)
        await expect(result).toBeEnabled()
        expect(await result.getAttribute('id')).toContain('session.getBudget')
        await page.screenshot({ path: `${evidence}/command-${locale}-${width}.png` })
        await palette.getByRole('button', { name: copy.commandPalette.close, exact: true }).click()
        await expect(palette).toBeHidden()
        await expectComposerText(prompt, draft)
        expect(await models.execute('session.getModel', { sessionId })).toEqual(modelBaseline)
        expect((await goals.execute('goal.get', { sessionId })).goal).toEqual(goalBaseline)
        expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
        expect(await configuration.execute('permission.get', {})).toEqual(permissionBaseline)
        expect((await host.client.call('session.snapshot', { sessionId })).runs).toEqual([])
        expect(sockets).toBe(connectedSockets)
        observations.push({
          locale,
          width,
          sessionId,
          goalId,
          modelId: modelBaseline.modelId,
          mode: 'plan',
          draftKept: true,
          query: title,
          commandId: 'session.getBudget',
          sockets,
        })
      }
    }

    // Keep an already-open palette across an actual storage-event switch. Its
    // query and original command identity stay intact; subsequent localized
    // search must use the stable runtime copy port's latest language.
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.keyboard.press('Control+Shift+p')
    const palette = page.getByRole('dialog', { name: en.commandPalette.title, exact: true })
    const query = palette.getByRole('searchbox', { name: en.commandPalette.search, exact: true })
    const enTitle = en.commandPalette.resolve('commands.session.getBudget.title')
    const zhTitle = zh.commandPalette.resolve('commands.session.getBudget.title')
    await query.fill(enTitle)
    const originalResult = await palette.getByRole('option').filter({ hasText: enTitle }).getAttribute('id')
    if (!originalResult) throw new Error('Expected a stable command row identity')
    await other.getByRole('radio', { name: '简体中文', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    const chinesePalette = page.getByRole('dialog', { name: zh.commandPalette.title, exact: true })
    const chineseQuery = chinesePalette.getByRole('searchbox', { name: zh.commandPalette.search, exact: true })
    await expect(chineseQuery).toHaveValue(enTitle)
    await expect(chinesePalette.getByRole('option')).toHaveCount(0)
    await chineseQuery.fill(zhTitle)
    await expect(chinesePalette.getByRole('option').filter({ hasText: zhTitle })).toHaveCount(1)
    await expect(chinesePalette.getByRole('option').filter({ hasText: zhTitle })).toHaveAttribute('id', originalResult)
    await other.getByRole('radio', { name: 'English', exact: true }).click()
    await expect(query).toHaveValue(zhTitle)
    await expect(palette.getByRole('option')).toHaveCount(0)
    await query.fill(enTitle)
    await expect(palette.getByRole('option').filter({ hasText: enTitle })).toHaveCount(1)
    await palette.getByRole('button', { name: en.commandPalette.close, exact: true }).click()
    await expectComposerText(page.getByRole('textbox', { name: en.session.prompt.input, exact: true }), draft)
    // Choosing the retained deny choice exits Plan before the next send.
    await trigger.click()
    await permissionPopup.locator('[role="menuitemradio"][data-choice="deny"]').click()
    await expect(trigger).toHaveAttribute('data-choice', 'deny')
    expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
    expect(await configuration.execute('permission.get', {})).toEqual(permissionBaseline)
    expect((await goals.execute('goal.get', { sessionId })).goal).toEqual(goalBaseline)
    expect((await host.client.call('session.snapshot', { sessionId })).runs).toEqual([])
    expect(errors).toEqual([])
    observations.push({ openPaletteQueryKept: true, latestLocalizedSearch: true, approvalAfterPlan: 'deny', runs: 0 })
  } finally {
    await writeFile(
      `${evidence}/verification.json`,
      JSON.stringify(
        {
          fixture: {
            host: 'temporary demo Kernel through public Client contracts',
            model: 'local-fixture, not a commercial Provider capability',
            goalAutoContinue: false,
            submittedRuns: 0,
            languageSwitch: 'second same-origin production App through General UI',
          },
          observations,
          errors,
        },
        null,
        2,
      ),
    )
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupOwnedPermissionFixture(root, 'hbar-language-session-controls-')
  }
})

test('an open command palette recomputes a localized query after a real cross-window language change without editing it', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-language-command-filter-'))
  const evidence = 'artifacts/desktop-entry-matrix/language-controls'
  await mkdir(evidence, { recursive: true })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44965),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44967}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const en = getShellCopy('en-US')
    const zh = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await page.keyboard.press('Control+Shift+p')
    const chinesePalette = page.getByRole('dialog', { name: zh.commandPalette.title, exact: true })
    const query = chinesePalette.getByRole('searchbox', { name: zh.commandPalette.search, exact: true })
    await query.fill('工程')
    await expect.poll(() => chinesePalette.getByRole('option').count()).toBeGreaterThan(0)
    const before = await chinesePalette.getByRole('option').evaluateAll((nodes) => nodes.map((node) => node.id))
    await page.screenshot({ path: `${evidence}/palette-localized-before-zh-CN.png` })
    const other = await context.newPage()
    await other.goto(base)
    await other.getByRole('button', { name: zh.shell.settings, exact: true }).click()
    await other.getByRole('button', { name: zh.general.group, exact: true }).click()
    await other.getByRole('radio', { name: 'English', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    const englishPalette = page.getByRole('dialog', { name: en.commandPalette.title, exact: true })
    const unchangedQuery = englishPalette.getByRole('searchbox', { name: en.commandPalette.search, exact: true })
    await expect(unchangedQuery).toHaveValue('工程')
    await expect(englishPalette).toBeVisible()
    await page.screenshot({ path: `${evidence}/palette-localized-after-en-US.png` })
    await writeFile(
      `${evidence}/palette-localized-verification.json`,
      JSON.stringify(
        {
          before,
          after: await englishPalette.getByRole('option').evaluateAll((nodes) => nodes.map((node) => node.id)),
          query: await unchangedQuery.inputValue(),
          locale: await page.locator('html').getAttribute('lang'),
          runs: (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.length,
        },
        null,
        2,
      ),
    )
    await expect(englishPalette.getByRole('option')).toHaveCount(0, { timeout: 3000 })
    await expect(englishPalette.getByText(en.commandPalette.empty, { exact: true })).toBeVisible()
    const setBudgetTitle = en.commandPalette.resolve('commands.session.setBudget.title')
    await unchangedQuery.fill(setBudgetTitle)
    await englishPalette.getByRole('option').filter({ hasText: setBudgetTitle }).click()
    const component = page.locator('.hbar-app-react-command-palette')
    await expect(component).toHaveAttribute('data-view', 'parameters')
    const tokens = page.locator('#hbar-command-tokens')
    await tokens.fill('1234')
    const tokensNode = await tokens.elementHandle()
    if (!tokensNode) throw new Error('Expected the mounted budget parameter')
    await other.getByRole('radio', { name: '简体中文', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(component).toHaveAttribute('data-view', 'parameters')
    await expect(tokens).toHaveValue('1234')
    expect(await tokens.evaluate((node, original) => node === original, tokensNode)).toBe(true)
    await expect(component.getByText('session.setBudget', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${evidence}/palette-parameter-draft-after-zh-CN.png` })
    await component.getByRole('button', { name: zh.commandPalette.backToCommands, exact: true }).click()
    const readBudgetTitle = zh.commandPalette.resolve('commands.session.getBudget.title')
    await component.getByRole('searchbox', { name: zh.commandPalette.search, exact: true }).fill(readBudgetTitle)
    await component.getByRole('option').filter({ hasText: readBudgetTitle }).click()
    await expect(component).toHaveAttribute('data-view', 'parameters')
    await component.getByRole('button', { name: zh.commandPalette.execute, exact: true }).click()
    await expect(component).toHaveAttribute('data-view', 'result')
    await expect(component.getByRole('status')).toContainText(zh.commandPalette.succeeded)
    const result = await component.locator('.hbar-app-react-command-result-details pre').textContent()
    expect(result).toContain('100000')
    await other.getByRole('radio', { name: 'English', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(component).toHaveAttribute('data-view', 'result')
    await expect(component.getByRole('status')).toContainText(en.commandPalette.succeeded)
    await expect(component.getByText('session.getBudget', { exact: true })).toBeVisible()
    expect(await component.locator('.hbar-app-react-command-result-details pre').textContent()).toBe(result)
    await page.screenshot({ path: `${evidence}/palette-read-result-after-en-US.png` })
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
    await writeFile(
      `${evidence}/palette-preservation-verification.json`,
      JSON.stringify(
        {
          parameterDraft: '1234',
          sameParameterNode: true,
          executedCommand: 'session.getBudget',
          sameReadResult: result,
          submittedBudgetWrite: false,
          runs: 0,
        },
        null,
        2,
      ),
    )
    await tokensNode.dispose()
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupOwnedPermissionFixture(root, 'hbar-language-command-filter-')
  }
})

import { chromium, expect, type Page } from '@playwright/test'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  HbarClient,
  createConfigurationCommandClient,
  createExtensionCommandClient,
  createGoalPlanCommandClient,
  createModelCommandClient,
  createSettingsCommandClient,
  createSystemCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { z } from 'zod'
import { encodePath } from '@hbar/schema-core'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { expectComposerText } from '../e2e/support/composer-text'
import { openSessionTool } from '../e2e/support/session-tools-menu'
import {
  nativeSmokeFixtureRoot,
  ownsNativeSmokeHost,
  parseNativeSmokeConnection,
  redactNativeSmokeDiagnostics,
  waitForNativeSmokeExit,
} from './desktop-smoke-fixture'

const root = await mkdtemp(join(tmpdir(), 'hbar-native-'))
// Workspace tools must not browse the protected Host data root, including its descendants.
const projectFixtureRoot = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const workspaceRoot = join(projectFixtureRoot, 'native-project')
let child: ReturnType<typeof Bun.spawn> | undefined
let connection: ReturnType<typeof parseNativeSmokeConnection> | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
let inspectedPage: Page | undefined
async function until<T>(read: () => Promise<T>, limit = 30_000): Promise<T> {
  const start = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - start > limit) throw error
      await Bun.sleep(100)
    }
  }
}
async function invokeNative(page: Page, command: string, args: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ command, args }) => {
      const tauri: unknown = Reflect.get(window, '__TAURI_INTERNALS__')
      if (typeof tauri !== 'object' || tauri === null) throw new Error('Tauri initialization is missing')
      const invoke: unknown = Reflect.get(tauri, 'invoke')
      if (typeof invoke !== 'function') throw new Error('Tauri invoke is missing')
      const result: unknown = await Reflect.apply(invoke, tauri, [command, args])
      return result
    },
    { command, args },
  )
}

async function terminateOwnedHost(metadata: ReturnType<typeof parseNativeSmokeConnection>): Promise<void> {
  const inspector = Bun.spawn(
    [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$nativeSmokeProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${metadata.pid}'; if ($nativeSmokeProcess) { $nativeSmokeProcess.CommandLine | ConvertTo-Json -Compress }`,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', windowsHide: true, timeout: 5_000 },
  )
  const output = await new Response(inspector.stdout).text()
  if ((await inspector.exited) !== 0) throw new Error('Could not verify native smoke Host ownership')
  if (!output.trim()) return
  const commandLine = z.string().parse(JSON.parse(output))
  if (!ownsNativeSmokeHost(commandLine, root)) throw new Error('Refusing to stop an unowned Host PID')
  process.kill(metadata.pid)
  await until(async () => {
    try {
      process.kill(metadata.pid, 0)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return
      throw error
    }
    throw new Error('Owned native smoke Host has not exited')
  }, 5_000)
}

try {
  await mkdir(workspaceRoot)
  await writeFile(
    join(workspaceRoot, 'native-visual.md'),
    '# Owned native smoke project\n\n## Review steps\n\n1. Read the document.\n2. Inspect its source.\n3. Return to the conversation.\n\n| State | Next action |\n| --- | --- |\n| Draft | Review |\n\n```ts\nexport const ready = true\n```\n\n```mermaid\nflowchart TD\n  Start[Open document] --> Parse[Parse Markdown]\n  Parse --> Render[Render Mermaid]\n```\n\n[Related proof](nested/native-search-proof.txt)\n',
  )
  await mkdir(join(workspaceRoot, 'nested'))
  await writeFile(join(workspaceRoot, 'nested', 'native-search-proof.txt'), 'Owned nested native search proof.\n')
  const skillRoot = join(root, 'skills', 'global', 'native-review')
  await mkdir(join(skillRoot, 'references'), { recursive: true })
  await writeFile(
    join(skillRoot, 'SKILL.md'),
    '---\nname: Native skill review\ndescription: Owned read-only native skill fixture\n---\n\n# Native review\n\nRead the actual discovered skill entry.\n',
  )
  await writeFile(join(skillRoot, 'references', 'checks.md'), '# Review checks\n\nOwned native skill source proof.\n')
  await mkdir('artifacts/ui-redesign/tauri', { recursive: true })
  const debugProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('fixture') })
  const debugPort = debugProbe.port
  await debugProbe.stop(true)
  if (!debugPort) throw new Error('Could not reserve a loopback WebView debugging port')
  child = Bun.spawn([resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')], {
    env: {
      ...process.env,
      HBAR_HOME: root,
      HBAR_DATA_ROOT: root,
      HBAR_CACHE_ROOT: join(root, 'cache'),
      HBAR_WORKSPACE: workspaceRoot,
      HBAR_DEMO: '1',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
      WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  const nativeConnection = await until(async () =>
    parseNativeSmokeConnection(JSON.parse(await readFile(join(root, 'settings', 'connection.json'), 'utf8'))),
  )
  connection = nativeConnection
  api = new HbarClient(nativeConnection.url, nativeConnection.token)
  await api.connect()
  const paths = await createSystemCommandClient(api).execute('system.paths.get', {})
  if (resolve(paths.dataRoot) !== resolve(root)) throw new Error('Native Host is not using the owned temporary profile')
  const sessions = createWorkspaceSessionCommandClient(api)
  const models = createModelCommandClient(api)
  const goals = createGoalPlanCommandClient(api)
  const data = await api.call('system.bootstrap', {})
  const workspace = data.workspaces.find((item) => resolve(item.path) === resolve(workspaceRoot))
  if (!workspace || data.workspaces.length !== 1) throw new Error('Native fixture must expose only its owned project')
  await createExtensionCommandClient(api).execute('plugin.set', {
    id: 'goal.codex',
    enabled: true,
    config: { autoContinue: false },
  })
  const fixtureModel = (await models.execute('model.list', {})).find((item) => item.id === 'local-fixture')
  if (!fixtureModel) throw new Error('Native smoke requires the local mock model')
  const listSessions = async () =>
    (await sessions.execute('session.list', { workspaceId: workspace.id, limit: 100 })).items
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { timeout: 2_000 }))
  const nativeBrowser = browser
  const page = await until(async () => {
    const page = nativeBrowser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith(`${nativeConnection.url}/`))
    if (!page) throw new Error('WebView not created')
    return page
  })
  inspectedPage = page
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(redactNativeSmokeDiagnostics(message.text(), nativeConnection.token))
  })
  try {
    await page.locator('[data-hbar-app-ui-shell="app"]').waitFor({ timeout: 15_000 })
  } catch (error) {
    await page.screenshot({ path: 'artifacts/tauri-startup-failure.png' })
    console.error(
      redactNativeSmokeDiagnostics(
        `WebView URL: ${page.url()}\n${await page.locator('body').innerText()}\n${errors.join('\n')}`,
        nativeConnection.token,
      ),
    )
    throw error
  }
  await page
    .locator('footer')
    .getByText(/^(已连接|Connected)$/)
    .waitFor({ timeout: 15_000 })
  const locale = await page.evaluate(() => (document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en-US'))
  const copy = getShellCopy(locale)
  const preSession = preSessionCopy(locale)
  const location = preSessionLaunchCopy(locale).location
  await mkdir('artifacts/ui-redesign/tauri', { recursive: true })
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  const appearanceNavigation = page.getByRole('button', { name: /^(外观|Appearance)$/ })
  await appearanceNavigation.click()
  await expect(appearanceNavigation).toHaveAttribute('aria-current', 'page')
  await expect(appearanceNavigation).toHaveAttribute('data-lumen-state', 'selected')
  const navigationPaint = await appearanceNavigation.evaluate((button) => {
    const paint = getComputedStyle(button)
    return {
      background: paint.backgroundColor,
      color: paint.color,
    }
  })
  if (navigationPaint.background === 'transparent' || navigationPaint.background === 'rgba(0, 0, 0, 0)')
    throw new Error(
      `Desktop selected navigation does not have visible canonical paint: ${JSON.stringify(navigationPaint)}`,
    )
  const controlSize = page.getByRole('combobox', { name: /^(控件尺寸|Control size)$/ })
  const textSize = page.getByRole('combobox', { name: /^(文本尺寸|Text size)$/ })
  const cornerSize = page.getByRole('combobox', { name: /^(圆角尺寸|Corner size)$/ })
  await controlSize.selectOption('l')
  await textSize.selectOption('l')
  await cornerSize.selectOption('l')
  await page.getByRole('button', { name: /^(保存外观|Save appearance)$/ }).click()
  await page.getByText(/^(外观偏好已保存|Appearance preferences saved)$/).waitFor()
  const largeAppearance = await page.evaluate(() => {
    const control = document.querySelector<HTMLElement>('#hbar-appearance-controlSize')
    if (!control) throw new Error('Desktop appearance control is missing')
    return {
      controlSize: document.documentElement.dataset.lumenControlSize,
      textSize: document.documentElement.dataset.lumenTextSize,
      cornerSize: document.documentElement.dataset.lumenCornerSize,
      height: Math.round(control.getBoundingClientRect().height),
    }
  })
  if (
    largeAppearance.controlSize !== 'l' ||
    largeAppearance.textSize !== 'l' ||
    largeAppearance.cornerSize !== 'l' ||
    largeAppearance.height !== 42
  )
    throw new Error(`Desktop appearance did not apply the large scale: ${JSON.stringify(largeAppearance)}`)
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/appearance-large-default-window.png' })
  await page.reload()
  await page
    .locator('footer')
    .getByText(/^(已连接|Connected)$/)
    .waitFor({ timeout: 15_000 })
  await page.locator('html[data-lumen-control-size="l"]').waitFor()
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  await page.getByRole('button', { name: /^(外观|Appearance)$/ }).click()
  await page.getByRole('combobox', { name: /^(控件尺寸|Control size)$/ }).waitFor()
  if (
    (await page.getByRole('combobox', { name: /^(控件尺寸|Control size)$/ }).inputValue()) !== 'l' ||
    (await page.getByRole('combobox', { name: /^(文本尺寸|Text size)$/ }).inputValue()) !== 'l' ||
    (await page.getByRole('combobox', { name: /^(圆角尺寸|Corner size)$/ }).inputValue()) !== 'l'
  )
    throw new Error('Desktop appearance preferences did not survive reload')
  await page.getByRole('button', { name: /^(恢复默认|Restore defaults)$/ }).click()
  await page.getByText(/^(外观偏好已保存|Appearance preferences saved)$/).waitFor()
  await page.locator('html[data-lumen-control-size="m"]').waitFor()
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/appearance-reset-default-window.png' })
  await page.getByRole('button', { name: /^(返回会话|Back to session)$/ }).click()
  const beforeFirstSend = await listSessions()
  // The no-tab landing is distinct from explicit sidebar New session creation.
  const landing = page.locator('.hbar-pre-session-landing')
  await expect(landing).toBeVisible()
  await expect.poll(async () => (await listSessions()).length).toBe(beforeFirstSend.length)
  await landing.locator('.hbar-pre-session-location-picker > button').click()
  const locationRoot = page.getByRole('dialog', { name: location.title, exact: true })
  if (await locationRoot.isVisible())
    await locationRoot.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
  await page
    .getByRole('dialog', { name: location.chooseDirectory, exact: true })
    .locator('.hbar-pre-session-location-list')
    .getByRole('button')
    .filter({ hasText: workspace.name })
    .click()
  await locationRoot.getByRole('button', { name: location.close, exact: true }).click()
  await landing.locator('[data-placement="composer"] > button').click()
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/first-send-model-picker.png' })
  await page
    .getByRole('dialog', { name: preSession.model.title, exact: true })
    .getByRole('button')
    .filter({ hasText: fixtureModel.modelName })
    .click()
  if (!fixtureModel.thinkingLevels.includes('high')) throw new Error('The mock model must support high effort')
  await landing.locator('.hbar-pre-session-thinking-picker > button').click()
  const effort = page.getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
  await expect(effort.getByRole('slider')).toBeFocused()
  await page.keyboard.press('Home')
  for (let index = 0; index < fixtureModel.thinkingLevels.indexOf('high'); index++)
    await page.keyboard.press('ArrowRight')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/first-send-thinking-picker.png' })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  const objective = `/tool exit_plan_mode ${JSON.stringify({ plan: '# Native smoke plan\n\n- Keep the goal and plan together.' })}`
  const landingPrompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
  await landingPrompt.fill(objective)
  await landing.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
  await landing
    .getByRole('group', { name: copy.session.addMenu.menu })
    .getByRole('button', { name: copy.session.intent.goalMenu, exact: true })
    .click()
  const cancelPreparedGoal = landing.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
  const execution = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
  await execution.click()
  await page.locator('.hbar-pre-session-approval-popover [data-choice="plan"]').click()
  await expect(cancelPreparedGoal).toBeVisible()
  await expect(execution).toHaveAttribute('data-choice', 'plan')
  await expect(landingPrompt).toHaveValue(objective)
  expect((await listSessions()).length).toBe(beforeFirstSend.length)
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/goal-plan-prepared-default-window.png' })
  await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
  await expect(landing).toBeHidden()
  await expect.poll(async () => (await listSessions()).length).toBe(beforeFirstSend.length + 1)
  const currentSession = (await listSessions()).find((item) => !beforeFirstSend.some((before) => before.id === item.id))
  if (!currentSession) throw new Error('First send did not create the owned Session')
  const sessionId = currentSession.id
  const nativeApi = api
  await expect
    .poll(async () =>
      (await nativeApi.call('session.snapshot', { sessionId })).approvals.some(
        (item) => item.tool === 'exit_plan_mode' && item.status === 'pending',
      ),
    )
    .toBe(true)
  const planned = await api.call('session.snapshot', { sessionId })
  const originalRun = planned.runs.find((item) => item.input.source === 'user')
  const approval = planned.approvals.find((item) => item.tool === 'exit_plan_mode' && item.status === 'pending')
  if (!originalRun || !approval) throw new Error('First-send Plan Run and approval are missing')
  expect(planned.runs).toHaveLength(1)
  expect(originalRun.input.mode).toBe('plan')
  expect(approval.runId).toBe(originalRun.id)
  expect(await api.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
  expect(await models.execute('session.getModel', { sessionId })).toMatchObject({
    modelId: fixtureModel.id,
    thinkingLevel: 'high',
  })
  const originalGoal = (await goals.execute('goal.get', { sessionId })).goal
  if (!originalGoal) throw new Error('First-send Goal is missing before plan approval')
  expect(originalGoal).toMatchObject({ objective, status: 'active', tokensUsed: 0 })
  await expect(page.locator('.hbar-session-message-literal .hbar-message-file-link')).toHaveCount(0)
  const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
  const draft = 'Keep this unsent native draft while approving the plan.'
  await composer.pressSequentially(draft)
  await expectComposerText(composer, draft)
  const decision = page.locator(`[data-decision-id="${approval.id}"]`)
  await decision.getByRole('button', { name: copy.session.decisions.planExit.implement, exact: true }).click()
  await expect
    .poll(
      async () =>
        (await nativeApi.call('session.snapshot', { sessionId })).runs.find((item) => item.id === originalRun.id)
          ?.status,
    )
    .toBe('completed')
  expect((await api.call('session.snapshot', { sessionId })).runs.map((item) => item.id)).toEqual([originalRun.id])
  expect(await api.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
  expect((await goals.execute('goal.get', { sessionId })).goal).toMatchObject({
    goalId: originalGoal.goalId,
    objective,
    status: 'active',
  })
  await expectComposerText(composer, draft)
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/goal-plan-approved-default-window.png' })
  if (await page.getByRole('dialog', { name: /^(命令目录|Command catalog)$/ }).isVisible())
    throw new Error('Known-workspace new session unexpectedly opened the command catalog')
  // First-send title inference can replace the creation-time title before the Run settles.
  const settledSession = await sessions.execute('session.get', { sessionId })
  if (!settledSession) throw new Error('The original native Session is missing before rename')
  const currentRow = page.locator(`[data-session-id="${sessionId}"][data-selected="true"]`)
  const sessionActions = currentRow.locator('summary')
  await expect(sessionActions).toHaveAttribute('aria-label', copy.shell.sessionActions(settledSession.title))
  await sessionActions.click()
  await page.getByRole('menuitem', { name: copy.shell.renameSession, exact: true }).click()
  const titleInput = currentRow.getByRole('textbox', { name: /^(会话标题|Session title)$/ })
  await titleInput.fill('Tauri visual session')
  await titleInput.press('Enter')
  await page.getByRole('heading', { level: 1, name: 'Tauri visual session' }).waitFor()
  const modelTrigger = page.locator('.hbar-composer-model-trigger')
  await modelTrigger.click()
  await page.locator('.hbar-composer-picker-popover[data-kind="model"]:popover-open').waitFor()
  await expect(page.locator('.hbar-composer-picker-popover[data-kind="model"]').getByRole('option')).not.toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(modelTrigger).toBeFocused()
  await expectComposerText(composer, draft)
  await page.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
  const fileChooser = page.waitForEvent('filechooser')
  await page
    .getByRole('group', { name: copy.session.addMenu.menu })
    .getByRole('button', { name: copy.session.addMenu.files, exact: true })
    .click()
  await (
    await fileChooser
  ).setFiles({
    name: 'native-visual.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Selected through the native WebView file chooser.'),
  })
  await page.getByText('native-visual.txt', { exact: true }).waitFor()
  // A second owned recent record is required to exercise keyboard movement;
  // the first-send fixture intentionally began with no Sessions.
  await createWorkspaceSessionCommandClient(api).execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Native search selection' },
    { idempotencyKey: `native-search-${sessionId}` },
  )
  await page.keyboard.press('Control+k')
  const chatSearch = page.locator('dialog.hbar-app-react-chat-search-dialog')
  const searchInput = chatSearch.getByRole('combobox')
  await expect(searchInput).toBeFocused()
  const searchRows = chatSearch.getByRole('option')
  await expect.poll(() => searchRows.count()).toBeGreaterThan(1)
  await page.mouse.move(0, 0)
  await searchInput.press('ArrowDown')
  await expect(searchRows.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(searchRows.nth(1)).toHaveAttribute('data-lumen-state', 'selected')
  await expect
    .poll(() => searchRows.nth(0).evaluate((row) => getComputedStyle(row).backgroundColor))
    .toBe('rgba(0, 0, 0, 0)')
  const searchPaint = await searchRows.evaluateAll((rows) => ({
    selected: rows[1] ? getComputedStyle(rows[1]).backgroundColor : null,
    idle: rows[0] ? getComputedStyle(rows[0]).backgroundColor : null,
  }))
  if (searchPaint.selected === searchPaint.idle) throw new Error('Native chat search selection is not visible')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/chat-search-keyboard-selected.png' })
  await searchInput.press('Escape')
  await expect(chatSearch).toHaveCount(0)
  await expectComposerText(composer, draft)
  const noHorizontalOverflow = async () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  const readSessionGeometry = async () =>
    page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`Missing desktop layout region: ${selector}`)
        const bounds = element.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, width: bounds.width }
      }
      const viewport = document.querySelector<HTMLElement>('.lumen-conversation-messages')
      if (!viewport) throw new Error('Missing desktop message scroll viewport')
      const viewportBounds = viewport.getBoundingClientRect()
      const viewportLeft = viewportBounds.left + viewport.clientLeft
      return {
        shell: rect('.hbar-app-ui-app-shell'),
        frame: rect('.hbar-app-ui-app-frame'),
        sessionMain: rect('.hbar-app-react-session-main'),
        conversation: rect('.lumen-conversation'),
        messageViewport: {
          left: viewportLeft,
          right: viewportLeft + viewport.clientWidth,
          width: viewport.clientWidth,
        },
        timeline: rect('.lumen-conversation-content'),
        composer: rect('.hbar-app-react-session-footer'),
      }
    })
  const assertSessionGeometry = async (stage: string) => {
    const geometry = await readSessionGeometry()
    const within = (left: number, right: number, tolerance = 1) => Math.abs(left - right) <= tolerance
    if (
      !within(geometry.sessionMain.left, geometry.conversation.left) ||
      !within(geometry.sessionMain.right, geometry.conversation.right)
    )
      throw new Error(`${stage}: conversation does not fill the session main region: ${JSON.stringify(geometry)}`)
    if (
      // A native non-overlay scrollbar belongs to the message pane, not the composer.
      !within(geometry.timeline.width, Math.min(geometry.messageViewport.width, geometry.composer.width)) ||
      !within(
        geometry.composer.left - geometry.conversation.left,
        geometry.conversation.right - geometry.composer.right,
      )
    )
      throw new Error(`${stage}: timeline and composer edges differ: ${JSON.stringify(geometry)}`)
    const leftGutter = geometry.timeline.left - geometry.messageViewport.left
    const rightGutter = geometry.messageViewport.right - geometry.timeline.right
    if (!within(leftGutter, rightGutter) || geometry.composer.width < Math.min(geometry.conversation.width, 800))
      throw new Error(
        `${stage}: session content is not balanced across the available width: ${JSON.stringify(geometry)}`,
      )
    return geometry
  }
  if (!(await noHorizontalOverflow())) throw new Error('Desktop session has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-default-window.png' })
  await page.getByRole('button', { name: /^(文件|Files)$/ }).click()
  await page.getByRole('heading', { level: 2, name: /^(文件管理器|File manager)$/ }).waitFor()
  const nativeFile = page.getByText('native-visual.md', { exact: true })
  await expect(nativeFile).toBeVisible()
  await nativeFile.click()
  const nativePreview = page.locator('.hbar-file-markdown-preview')
  await expect(nativePreview).toHaveAttribute('aria-label', copy.files.textPreview('native-visual.md'))
  await expect(nativePreview).toContainText('Owned native smoke project')
  await expect(nativePreview.getByRole('heading', { name: 'Owned native smoke project', exact: true })).toBeVisible()
  const fileCode = nativePreview.locator('.hbar-file-markdown-code').first()
  await expect(fileCode).toContainText(copy.files.markdownCode.lines(1))
  await expect(fileCode.locator('code')).toHaveAttribute('data-code-highlight', 'ready')
  await expect(fileCode.locator('[data-code-token="keyword"]').first()).toHaveText('export')
  await expect(fileCode.locator('[data-code-token="number"]')).toHaveText('true')
  await fileCode.getByRole('button', { name: copy.files.markdownCode.copy, exact: true }).click()
  await expect(fileCode.getByRole('button', { name: copy.files.markdownCode.copied, exact: true })).toBeVisible()
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/file-code-copy-default-window.png' })
  const diagram = nativePreview.locator('.hbar-markdown-diagram')
  await expect(diagram.locator('.hbar-diagram-inline svg')).toBeVisible()
  await diagram.getByRole('button', { name: copy.files.markdownCode.copy, exact: true }).click()
  await expect(diagram.getByRole('button', { name: copy.files.markdownCode.copied, exact: true })).toBeVisible()
  const diagramPreview = diagram
    .getByRole('button', { name: copy.files.markdownCode.diagram.preview, exact: true })
    .first()
  await diagramPreview.focus()
  await diagramPreview.press('Enter')
  const diagramDialog = page.getByRole('dialog', { name: copy.files.markdownCode.diagram.previewTitle, exact: true })
  await expect(diagramDialog.locator('.hbar-diagram-svg svg')).toBeVisible()
  await diagramDialog.getByRole('button', { name: copy.files.markdownCode.diagram.zoomIn, exact: true }).click()
  await expect(
    diagramDialog.getByRole('button', { name: copy.files.markdownCode.diagram.resetZoom, exact: true }),
  ).toHaveText('125%')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/file-mermaid-preview-default-window.png' })
  await page.keyboard.press('Escape')
  await expect(diagramDialog).toHaveCount(0)
  await expect(diagramPreview).toBeFocused()
  await diagram.getByRole('button', { name: copy.files.markdownCode.diagram.source, exact: true }).click()
  await expect(diagram.locator('pre')).toContainText('Start[Open document] --> Parse[Parse Markdown]')
  await diagram.getByRole('button', { name: copy.files.markdownCode.diagram.diagram, exact: true }).click()
  await expect(diagram.locator('pre')).toBeHidden()
  await page.getByRole('button', { name: copy.files.source, exact: true }).click()
  await expect(page.locator('.hbar-file-text-preview')).toContainText('# Owned native smoke project')
  await page.getByRole('button', { name: copy.files.preview, exact: true }).click()
  if (!(await noHorizontalOverflow())) throw new Error('Desktop tool window has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/files-default-window.png' })
  await nativePreview
    .getByRole('button', { name: copy.files.openLinkedFile('nested/native-search-proof.txt'), exact: true })
    .click()
  await expect(page.locator('.hbar-file-text-preview')).toContainText('Owned nested native search proof.')
  await page.getByRole('tab', { name: copy.files.previews.tab('native-visual.md', 'document'), exact: true }).click()
  await expect(nativePreview.getByRole('heading', { name: 'Owned native smoke project', exact: true })).toBeVisible()
  await page.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
  const pathSearch = page.getByRole('textbox', { name: copy.files.tree.filter, exact: true })
  await pathSearch.fill('native-search-proof')
  const nestedResult = page.getByRole('button', { name: 'nested/native-search-proof.txt', exact: true })
  await expect(nestedResult).toBeVisible()
  await pathSearch.press('ArrowDown')
  await expect(nestedResult).toBeFocused()
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/files-search-default-window.png' })
  await nestedResult.press('Enter')
  await expect(page.locator('.hbar-file-text-preview')).toContainText('Owned nested native search proof.')
  await page.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
  await expect(pathSearch).toHaveValue('native-search-proof')
  await expect(nestedResult).toBeVisible()
  await page.getByRole('button', { name: /^(关闭文件管理器|Close file manager)$/ }).click()
  const beforeExplicitCreation = await listSessions()
  await page.getByRole('button', { name: copy.shell.newSession, exact: true }).click()
  await expect.poll(async () => (await listSessions()).length).toBe(beforeExplicitCreation.length + 1)
  const explicitSession = (await listSessions()).find(
    (item) => !beforeExplicitCreation.some((before) => before.id === item.id),
  )
  if (!explicitSession) throw new Error('Explicit New session did not create its project-owned Session')
  await expect(page.locator(`[data-session-id="${explicitSession.id}"][data-selected="true"]`)).toBeVisible()
  expect(explicitSession.workspaceId).toBe(workspace.id)
  await page.getByRole('button', { name: copy.shell.openSession('Tauri visual session'), exact: true }).click()
  await expectComposerText(composer, draft)
  await expect(page.locator(`[data-session-id="${sessionId}"][data-selected="true"]`)).toBeVisible()

  await invokeNative(page, 'plugin:window|set_size', {
    label: 'main',
    value: { Logical: { width: 900, height: 600 } },
  })
  await until(async () => {
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    if (size.width < 880 || size.width > 920 || size.height < 580 || size.height > 620)
      throw new Error(`Desktop window has not resized: ${JSON.stringify(size)}`)
  })
  // WebView size changes before React has applied the narrow-sidebar presentation.
  await page.getByRole('button', { name: /^(显示工程与会话侧栏|Show projects and sessions sidebar)$/ }).waitFor()
  if (!(await noHorizontalOverflow())) throw new Error('Minimum desktop window has horizontal overflow')
  const collapsedGeometry = await assertSessionGeometry('Minimum desktop window')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-min-window.png' })
  await page.getByRole('button', { name: /^(显示工程与会话侧栏|Show projects and sessions sidebar)$/ }).click()
  await page.getByRole('complementary', { name: /^(工程与会话|Projects and sessions)$/ }).waitFor()
  const expandedGeometry = await assertSessionGeometry('Minimum desktop window with sidebar')
  const sidebarGeometry = await page.locator('.hbar-app-ui-app-sidebar-drawer').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right, width: bounds.width, position: getComputedStyle(element).position }
  })
  const separator = page.locator('.lumen-app-sidebar-separator')
  await expect(separator).toBeVisible()
  const separatorGeometry = await separator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right }
  })
  if (
    sidebarGeometry.position === 'fixed' ||
    Math.abs(sidebarGeometry.right - separatorGeometry.left) > 1 ||
    Math.abs(separatorGeometry.right - expandedGeometry.frame.left) > 1 ||
    expandedGeometry.frame.width >= collapsedGeometry.frame.width
  )
    throw new Error(
      `Minimum desktop sidebar did not shrink the workspace in normal flow: ${JSON.stringify({ sidebarGeometry, separatorGeometry, collapsedGeometry, expandedGeometry })}`,
    )
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-sidebar-min-window.png' })
  await page.getByRole('button', { name: /^(隐藏工程与会话侧栏|Hide projects and sessions sidebar)$/ }).click()
  await page.getByRole('button', { name: /^(显示工程与会话侧栏|Show projects and sessions sidebar)$/ }).waitFor()
  await page.getByRole('button', { name: /^(文件|Files)$/ }).click()
  await page.getByRole('heading', { level: 2, name: /^(文件管理器|File manager)$/ }).waitFor()
  if (!(await noHorizontalOverflow())) throw new Error('Minimum desktop tool window has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/files-min-window.png' })
  await page.getByRole('button', { name: /^(关闭文件管理器|Close file manager)$/ }).click()
  await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  const settingsGroups = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await settingsGroups.isVisible()) await settingsGroups.selectOption('skills')
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups, exact: true })
      .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.skills'), exact: true })
      .click()
  const skillsPanel = page.locator('.hbar-app-react-extension-workspace')
  const skillFilter = skillsPanel.getByRole('textbox', { name: copy.extensions.navigation.skills.filter, exact: true })
  await skillFilter.fill('native-review')
  const skillOpener = skillsPanel.getByRole('button', { name: copy.extensions.inspect('native-review'), exact: true })
  await skillOpener.focus()
  await skillOpener.press('Enter')
  const skillDetail = skillsPanel.locator('.hbar-app-react-skill-detail')
  await expect(skillDetail.locator('.hbar-app-react-skill-overview')).toContainText(
    'Read the actual discovered skill entry.',
  )
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/skill-overview-min-window.png' })
  await skillDetail.getByRole('tab', { name: copy.extensions.skillDetail.files, exact: true }).click()
  await skillDetail.getByRole('button', { name: 'references/checks.md', exact: true }).click()
  await expect(skillDetail.locator('.hbar-app-react-skill-file-content')).toContainText(
    'Owned native skill source proof.',
  )
  if (!(await noHorizontalOverflow())) throw new Error('Minimum native Skills detail has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/skill-files-min-window.png' })
  await skillDetail.getByRole('button', { name: copy.extensions.skillDetail.back, exact: true }).click()
  await expect(skillFilter).toHaveValue('native-review')
  await expect(skillOpener).toBeFocused()
  await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
  await expectComposerText(composer, draft)
  // Providers is Host-owned even when entered through a layered Session form.
  // Keep both the original explicit Session selection and the unsaved settings draft.
  const settings = createSettingsCommandClient(api)
  const contextualProviderId = 'native-context-provider'
  await createConfigurationCommandClient(api).execute('provider.save', {
    provider: {
      id: contextualProviderId,
      name: 'Native contextual gateway — 原生上下文供应商',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'context-primary',
      models: [{ id: 'context-primary', name: 'Context primary — 上下文主模型' }],
    },
  })
  const contextualModel = (await models.execute('model.list', {})).find(
    (model) => model.providerId === contextualProviderId && model.modelId === 'context-primary',
  )
  if (!contextualModel) throw new Error('Native configured primary is missing from the Host model catalog')
  const beforeDefault = await settings.execute('settings.get', { scope: { kind: 'global' } })
  const originalSessionModel = await models.execute('session.getModel', { sessionId })
  const modelPath = encodePath([{ kind: 'field', name: 'provider.model' }])
  const thinkingPath = encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])
  const selectSettingsGroup = async (group: 'providers' | 'model') => {
    if (await settingsGroups.isVisible()) await settingsGroups.selectOption(group)
    else
      await page
        .getByRole('navigation', { name: copy.settings.groups, exact: true })
        .getByRole('button', { name: copy.settings.resolve(`i18n:settings.groups.${group}`), exact: true })
        .click()
  }
  await openSessionTool(page, copy.session.tools, 'settings')
  const settingsScope = page.getByRole('combobox', { name: copy.settings.scopes, exact: true })
  await expect(settingsScope).toHaveValue('session')
  const settingsModel = page.locator(`[id="hbar-schema-field-${modelPath}"]`)
  const originalModelLabel = await settingsModel.inputValue()
  const settingsThinking = page.locator(`[id="hbar-schema-field-${thinkingPath}"]`)
  const dirtyLevel = locale === 'zh-CN' ? '低' : 'Low'
  await settingsThinking.click()
  await page.getByRole('option', { name: dirtyLevel, exact: true }).click()
  await expect(page.getByRole('button', { name: copy.settings.save, exact: true })).toBeEnabled()
  await selectSettingsGroup('providers')
  await expect(settingsScope).toHaveCount(0)
  await expect(page.getByText(copy.settings.hostScope, { exact: true })).toBeVisible()
  // The extra profile was created through the fixture SDK after the first list read.
  await page.getByRole('button', { name: copy.providers.list.refresh, exact: true }).click()
  const contextualProvider = page.locator(`[data-provider-id="${contextualProviderId}"]`)
  await contextualProvider.getByTestId('provider-default-action').click()
  await expect(contextualProvider.getByTestId('provider-global-default')).toBeVisible()
  const afterDefault = await settings.execute('settings.get', { scope: { kind: 'global' } })
  expect(afterDefault.resolution.reports[modelPath]?.effectiveValue).toBe(contextualModel.id)
  expect(afterDefault.resolution.reports[thinkingPath]?.effectiveValue).toEqual(
    beforeDefault.resolution.reports[thinkingPath]?.effectiveValue,
  )
  const preservedSessionModel = await models.execute('session.getModel', { sessionId })
  expect(preservedSessionModel.modelId).toBe(originalSessionModel.modelId)
  expect(preservedSessionModel.thinkingLevel).toBe(originalSessionModel.thinkingLevel)
  if (!(await noHorizontalOverflow())) throw new Error('Native contextual Providers has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/provider-context-default-min-window.png' })
  await selectSettingsGroup('model')
  await expect(settingsScope).toHaveValue('session')
  await expect(settingsModel).toHaveValue(originalModelLabel)
  await expect(settingsThinking).toHaveValue(dirtyLevel)
  await expect(page.getByRole('button', { name: copy.settings.save, exact: true })).toBeEnabled()
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/provider-context-draft-min-window.png' })
  await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
  await expectComposerText(composer, draft)
  const session = await api.call('session.create', { workspaceId: workspace.id })
  const run = await api.call('run.start', {
    sessionId: session.id,
    requestId: 'native-background',
    modelId: 'local-fixture',
    input: { text: '/slow' },
  })
  await invokeNative(page, 'plugin:window|close', { label: 'main' })
  const hidden = await invokeNative(page, 'plugin:window|is_visible', { label: 'main' })
  if (hidden !== false) throw new Error('Close did not hide the desktop window')
  child.kill()
  await waitForNativeSmokeExit(child.exited)
  const health = await fetch(`${nativeConnection.url}/healthz`, { signal: AbortSignal.timeout(5_000) })
  if (!health.ok) throw new Error('Host stopped with the desktop')
  await api.call('run.cancel', { runId: run.id })
  await until(async () => {
    if ((await nativeApi.call('session.snapshot', { sessionId: session.id })).runs[0]?.status !== 'cancelled')
      throw new Error('Run has not settled')
  })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    'PASS: Native credentials connected to the owned temporary profile; appearance persisted and reset; first send created exactly one Session with the selected mock model, high effort, Goal and Plan; approval resumed the original Run without losing the draft; explicit New session created in the current project and return retained the original draft; model picker and native attachment chooser worked; chat search keyboard selection was visibly distinct and Escape retained the draft; owned Markdown file rendered, source mode retained its original text and explicit local-link navigation returned to the same document; file search after plugin reload found an unopened nested path, keyboard focus/open worked and return retained the query; Skills overview and reference source read from the discovered owned directory, Back retained search and original-row focus and return retained the draft; Session settings to Providers changed only the global default and return retained the layered settings draft, original explicit model/thinking and composer draft; session and tools rendered without overlap at default and minimum window sizes; closing hides the window; Host survives desktop exit; independent SDK cancellation settled.',
  )
} catch (error) {
  if (inspectedPage && !inspectedPage.isClosed()) {
    await inspectedPage.screenshot({ path: 'artifacts/ui-redesign/tauri/native-failure.png' }).catch(() => {})
    await writeFile(
      'artifacts/ui-redesign/tauri/native-failure.txt',
      redactNativeSmokeDiagnostics(
        await inspectedPage
          .locator('body')
          .innerText()
          .catch(() => 'No page text'),
        connection?.token,
      ),
    )
  }
  if (api) {
    const diagnosticClient = api
    const bootstrap = await diagnosticClient.call('system.bootstrap', {}).catch(() => null)
    for (const workspace of bootstrap?.workspaces ?? []) {
      const sessions = await createWorkspaceSessionCommandClient(diagnosticClient)
        .execute('session.list', { workspaceId: workspace.id, limit: 10 })
        .catch(() => null)
      for (const session of sessions?.items ?? []) {
        const snapshot = await diagnosticClient.call('session.snapshot', { sessionId: session.id }).catch(() => null)
        console.error(
          JSON.stringify({
            nativeFixtureSession: session.id,
            mode: await diagnosticClient.call('mode.get', { sessionId: session.id }).catch(() => null),
            model: await createModelCommandClient(diagnosticClient)
              .execute('session.getModel', { sessionId: session.id })
              .catch(() => null),
            goal: await createGoalPlanCommandClient(diagnosticClient)
              .execute('goal.get', { sessionId: session.id })
              .catch(() => null),
            runs: snapshot?.runs.map((run) => ({ id: run.id, status: run.status, error: run.error })),
            approvals: snapshot?.approvals.map((approval) => ({
              id: approval.id,
              runId: approval.runId,
              tool: approval.tool,
              status: approval.status,
            })),
          }),
        )
      }
    }
  }
  console.error(
    redactNativeSmokeDiagnostics(
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      connection?.token,
    ),
  )
  console.error(
    redactNativeSmokeDiagnostics(
      await readFile(join(root, 'diagnostics', 'desktop-host.log'), 'utf8').catch(() => 'No host log'),
      connection?.token,
    ),
  )
  throw error
} finally {
  api?.disconnect()
  await browser?.close().catch(() => {})
  if (child) {
    if (child.exitCode === null) child.kill()
    await waitForNativeSmokeExit(child.exited)
  }
  // A failed startup can still have created a Host; recover only validated fixture metadata.
  const host =
    connection ??
    (await readFile(join(root, 'settings', 'connection.json'), 'utf8')
      .then((text) => parseNativeSmokeConnection(JSON.parse(text)))
      .catch(() => undefined))
  if (host) await terminateOwnedHost(host)
  await Bun.sleep(200)
  await rm(nativeSmokeFixtureRoot(root), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  await rm(nativeSmokeFixtureRoot(projectFixtureRoot), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

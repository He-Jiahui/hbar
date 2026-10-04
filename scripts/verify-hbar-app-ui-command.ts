import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator, type Page } from '@playwright/test'
import {
  COMMAND_LABELS,
  COMMAND_PROJECT_LABELS,
  GROUPED_COMMANDS,
  QUICK_COMMANDS,
  ROOM_COMMANDS,
} from '../tests/fixtures/hbar-app-ui-command-fixtures'
import {
  ASSISTANT_FIXTURE,
  INVITE_FIXTURE,
  SEARCH_COMMANDS,
  SEARCH_COPY,
} from '../tests/fixtures/hbar-app-ui-command-workflow-fixtures'
import { createCommandPreviewFixtures } from '../apps/hbar-app-ui-preview/src/commandPreviewFixtures'

const previewBase = (process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193').replace(/\/+$/, '')
const screenshotDirectory = resolve('artifacts/command-menu-core-review')
const desktop = { width: 1180, height: 820 }
const narrow = { width: 390, height: 844 }
const localizedNarrow = { width: 360, height: 780 }
const overflowCommandCount = 10_000
const checks: string[] = []

type CommandFixture = 'overflow' | 'localized'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function optionNamed(list: Locator, label: string) {
  return list.getByRole('option', { name: new RegExp(escapeRegExp(label)) })
}

async function visitVariant(page: Page, variant: number, viewport = desktop, fixture?: CommandFixture) {
  await page.setViewportSize(viewport)
  const url = new URL('/', previewBase)
  url.searchParams.set('variant', `hbar-app-ui-command-menu-${variant}`)
  url.searchParams.set('mode', 'isolated')
  if (fixture) url.searchParams.set('commandFixture', fixture)
  const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
  expect(response?.ok(), `Command menu ${variant} preview route should load`).toBe(true)

  const owner = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-command-menu-${variant}"]`)
  await expect(owner, `Command menu ${variant} should be rendered`).toBeVisible()
  await expectNoHorizontalOverflow(page, `command menu ${variant}`)
  return owner
}

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.documentWidth, `${context} should not overflow horizontally`).toBeLessThanOrEqual(
    dimensions.viewportWidth,
  )
  checks.push(`${context}: no horizontal overflow`)
}

async function expectPreviewRequest(dialog: Locator) {
  // This preview records a request locally; it does not confirm a domain operation succeeded.
  const notice = dialog.locator('.lumen-command-menu-preview-notice[role="status"]')
  await expect(notice).toBeVisible()
  expect((await notice.innerText()).trim()).not.toBe('')
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})

try {
  await mkdir(screenshotDirectory, { recursive: true })
  const page = await browser.newPage({ viewport: desktop })
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`)
  })

  const grouped = await visitVariant(page, 1)
  const groupedList = grouped.getByRole('listbox')
  const groupedOptions = groupedList.getByRole('option')
  expect(await groupedOptions.count()).toBe(GROUPED_COMMANDS.length)
  await page.screenshot({ path: resolve(screenshotDirectory, 'grouped-desktop.png') })

  const groupedQuery = grouped.getByRole('combobox')
  const groupedQueryText = 'settings'
  await groupedQuery.fill(groupedQueryText)
  const groupedMatches = GROUPED_COMMANDS.filter((item) =>
    `${item.label} ${item.description ?? ''}`.toLocaleLowerCase().includes(groupedQueryText),
  )
  await expect(groupedOptions).toHaveCount(groupedMatches.length)
  await expect(optionNamed(groupedList, groupedMatches[0]!.label)).toBeVisible()

  await groupedQuery.fill('no command matches this phrase')
  await expect(groupedOptions).toHaveCount(0)
  await expect(grouped.getByText(COMMAND_LABELS.empty, { exact: true })).toBeVisible()
  await groupedQuery.fill('')
  await expect(groupedOptions).toHaveCount(GROUPED_COMMANDS.length)
  await groupedQuery.press('ArrowDown')
  await expect(groupedOptions.first()).toHaveAttribute('aria-selected', 'true')
  await groupedQuery.press('ArrowDown')
  await expect(groupedOptions.nth(1)).toHaveAttribute('aria-selected', 'true')
  await groupedQuery.press('ArrowUp')
  await expect(groupedOptions.first()).toHaveAttribute('aria-selected', 'true')
  await groupedQuery.press('Enter')
  await expectNoHorizontalOverflow(page, 'grouped keyboard search and recovery')

  const quick = await visitVariant(page, 2)
  const quickList = quick.getByRole('listbox')
  await expect(quickList.getByRole('option')).toHaveCount(QUICK_COMMANDS.length)
  await optionNamed(quickList, QUICK_COMMANDS[0]!.label).click()
  const projectPage = createCommandPreviewFixtures(2, null).seed.pages.find((page) => page.id === 'project')!
  await expect(quickList.getByRole('option')).toHaveCount(projectPage.items.length)
  await expect(optionNamed(quickList, projectPage.items[1]!.label)).toBeVisible()
  await quick.getByRole('button', { name: COMMAND_PROJECT_LABELS.home, exact: true }).click()
  await expect(quickList.getByRole('option')).toHaveCount(QUICK_COMMANDS.length)
  await expectNoHorizontalOverflow(page, 'quick project drilldown and back')

  const search = await visitVariant(page, 3)
  const searchDialog = search.getByRole('dialog')
  await expect(searchDialog).toBeVisible()
  const searchList = searchDialog.getByRole('listbox')
  await expect(searchList.getByRole('option')).toHaveCount(SEARCH_COMMANDS.length)
  const people = searchDialog.getByRole('tab', { name: 'People', exact: true })
  await people.click()
  await expect(people).toHaveAttribute('aria-selected', 'true')
  await expect(searchList.getByRole('option')).toHaveCount(2)
  await expect(searchDialog.getByText(SEARCH_COPY.missing, { exact: true })).toBeVisible()
  await optionNamed(searchList, 'Marcus Reed').hover()
  await expect(searchDialog.getByRole('heading', { name: 'Marcus Reed', exact: true })).toBeVisible()
  await expect(searchDialog.getByText('GMT−5', { exact: true })).toBeVisible()
  await searchDialog.getByRole('combobox').press('Enter')
  await expectPreviewRequest(searchDialog)
  await expectNoHorizontalOverflow(page, 'search scopes and detail request')

  const invite = await visitVariant(page, 4)
  const inviteDialog = invite.getByRole('dialog')
  await expect(inviteDialog).toBeVisible()
  const inviteForm = inviteDialog.getByRole('form')
  const emailInput = inviteForm.locator('input[type="email"]')
  const roleSelect = inviteForm.getByRole('combobox')
  const changedEmail = 'jane.doe@example.test'
  await expect(emailInput).toHaveValue(INVITE_FIXTURE.email)
  await emailInput.fill(changedEmail)
  await roleSelect.selectOption(INVITE_FIXTURE.roles[0]!.id)
  await inviteForm.locator('button[type="submit"]').click()
  await expect(inviteDialog.getByText('Step 2 of 2', { exact: true })).toBeVisible()
  await expect(inviteDialog.getByText(changedEmail, { exact: true })).toBeVisible()
  await inviteDialog.getByRole('button', { name: 'Back to details', exact: true }).click()
  await expect(emailInput).toHaveValue(changedEmail)
  await expect(roleSelect).toHaveValue(INVITE_FIXTURE.roles[0]!.id)
  await inviteForm.locator('button[type="submit"]').click()
  await inviteDialog.getByRole('button', { name: 'Send invite', exact: true }).click()
  await expectPreviewRequest(inviteDialog)
  await inviteDialog.getByRole('button', { name: 'Back to details', exact: true }).click()
  await inviteDialog.getByRole('button', { name: 'Back to actions', exact: true }).click()
  await inviteDialog.getByRole('option', { name: /Rerun a workflow/ }).click()
  await inviteDialog.getByRole('combobox', { name: 'Workflow', exact: true }).selectOption('rotate')
  await inviteDialog.getByRole('textbox', { name: 'Git ref', exact: true }).fill('release/v2')
  await inviteDialog.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(inviteDialog.getByText('Run Rotate signing keys on release/v2.', { exact: true })).toBeVisible()
  await inviteDialog.getByRole('button', { name: 'Start run', exact: true }).click()
  await expectPreviewRequest(inviteDialog)
  await expectNoHorizontalOverflow(page, 'invite edit review and back')

  const assistant = await visitVariant(page, 5)
  const assistantDialog = assistant.getByRole('dialog')
  await expect(assistantDialog).toBeVisible()
  const assistantForm = assistantDialog.getByRole('form')
  const assistantQuery = assistantDialog.getByRole('combobox')
  const suggestion = ASSISTANT_FIXTURE.suggestions.find((item) => item.id === 'usage')
  expect(suggestion).toBeDefined()
  if (!suggestion) throw new Error('Assistant usage suggestion fixture is required')
  await assistantForm.locator('button[type="submit"]').click()
  await expectPreviewRequest(assistantDialog)
  await assistantForm.getByRole('button', { name: suggestion.label, exact: true }).click()
  await expect(assistantQuery).toHaveValue(suggestion.label)
  await expect(assistantDialog.getByRole('option', { name: /Export usage report/ })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'assistant suggestion request')

  const rooms = await visitVariant(page, 6)
  const roomList = rooms.getByRole('listbox')
  await expect(roomList.getByRole('option')).toHaveCount(ROOM_COMMANDS.length)
  const room = ROOM_COMMANDS.find((item) => item.id === 'aurora')
  expect(room).toBeDefined()
  if (!room) throw new Error('Aurora room fixture is required')
  const roomQuery = rooms.getByRole('combobox')
  await roomQuery.press('2')
  await expect(optionNamed(roomList, room.label)).toContainText('Current room')
  await roomQuery.fill(room.label)
  await expect(roomList.getByRole('option')).toHaveCount(1)
  await optionNamed(roomList, room.label).click()
  await expectPreviewRequest(rooms.getByRole('dialog'))
  await expect(roomList.getByRole('option')).toContainText('Current room')
  await expectNoHorizontalOverflow(page, 'room selection request')

  const narrowQuick = await visitVariant(page, 2, narrow)
  await expect(narrowQuick.getByRole('listbox').getByRole('option')).toHaveCount(QUICK_COMMANDS.length)
  await expectNoHorizontalOverflow(page, 'narrow quick command menu')

  const localizedInvite = await visitVariant(page, 4, localizedNarrow, 'localized')
  const localizedDialog = localizedInvite.getByRole('dialog')
  const localizedForm = localizedDialog.getByRole('form')
  await expect(localizedForm.locator('input[type="email"]')).toBeVisible()
  await expect(localizedForm.getByRole('combobox')).toBeVisible()
  await expect(localizedForm.locator('button[type="submit"]')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'long-locale narrow invite form')
  await page.screenshot({ path: resolve(screenshotDirectory, 'invite-long-locale-narrow.png') })

  const overflow = await visitVariant(page, 1, desktop, 'overflow')
  const overflowList = overflow.getByRole('listbox')
  const virtualList = overflow.locator('.lumen-command-list')
  await expect(virtualList).toHaveAttribute('data-list-strategy', 'virtual')
  const initialRenderedCount = await overflowList.getByRole('option').count()
  expect(initialRenderedCount).toBeGreaterThan(0)
  expect(initialRenderedCount).toBeLessThanOrEqual(40)
  await overflowList.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const lastOverflowCommand = overflowList.getByRole('option', {
    name: `Command ${overflowCommandCount - 1}`,
    exact: true,
  })
  await expect(lastOverflowCommand).toBeVisible()
  await expectNoHorizontalOverflow(page, '10,000-command virtual list')
  await page.screenshot({ path: resolve(screenshotDirectory, 'virtual-10000-end.png') })

  expect(runtimeErrors).toEqual([])
  await writeFile(
    resolve(screenshotDirectory, 'report.json'),
    `${JSON.stringify(
      {
        commandMenuPractical: 'passed',
        variants: [1, 2, 3, 4, 5, 6],
        coreFlows: [
          'grouped keyboard/query/recovery',
          'nested project page/back',
          'typed scope/entity-specific detail',
          'invite and workflow arguments/confirmation/back/request-only confirm',
          'assistant fallback/request/matching command',
          'room current-choice projection',
        ],
        narrowRepresentatives: ['quick menu', 'long localized invite'],
        virtual: { total: overflowCommandCount, initiallyRendered: initialRenderedCount, finalRecordReachable: true },
        checks,
        diagnostics: runtimeErrors,
        screenshots: ['grouped-desktop.png', 'invite-long-locale-narrow.png', 'virtual-10000-end.png'].map((name) =>
          resolve(screenshotDirectory, name),
        ),
      },
      null,
      2,
    )}\n`,
  )
  console.log(
    'Command menu core preview passed: six structures, grouped keyboard/search recovery, workflows, two narrow layouts, and bounded 10,000-row virtualization.',
  )
} finally {
  await browser.close()
}

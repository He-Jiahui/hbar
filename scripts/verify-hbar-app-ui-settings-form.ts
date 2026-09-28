import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function previewUrl(variant: number, fixture?: 'overflow' | 'localized'): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-settings-form-${variant}`, mode: 'isolated' })
  if (fixture) parameters.set('settingsFormFixture', fixture)
  return `${baseUrl}/?${parameters.toString()}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Vite can need a short interval before the port is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function ensurePreview(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  try {
    await waitForPreview()
    return undefined
  } catch {
    const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
    return server
  }
}

async function inspectScroll(
  locator: import('@playwright/test').Locator,
): Promise<{ readonly scrollable: boolean; readonly moved: boolean }> {
  return locator.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return { scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }
  })
}

async function noHorizontalOverflow(
  page: import('@playwright/test').Page,
  variant: number,
  fixture?: 'overflow' | 'localized',
): Promise<boolean> {
  await page.goto(previewUrl(variant, fixture), { waitUntil: 'networkidle' })
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function run(): Promise<void> {
  const server = await ensurePreview()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 800 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(previewUrl(1), { waitUntil: 'networkidle' })
    await page.getByLabel('Name', { exact: true }).fill('Northwind Studio')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByText('Saved just now', { exact: true }).waitFor()
    assert(
      (await page.getByText('Unsaved changes in Workspace', { exact: true }).count()) === 0,
      'Workspace save did not clear the unsaved state',
    )
    await page.getByRole('button', { name: 'Billing', exact: true }).click()
    await page.getByLabel('Billing email', { exact: true }).fill('finance@northwind.co')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      (await page.getByLabel('Billing email', { exact: true }).inputValue()) === 'accounts-payable@northwind.co',
      'Billing cancel did not restore the host-owned saved value',
    )
    await page.getByRole('button', { name: 'Notifications', exact: true }).click()
    const productUpdates = page.locator('[data-hbar-app-ui-region="setting-field"]')
      .filter({ hasText: 'Product updates' }).getByRole('checkbox')
    await productUpdates.check()
    assert(
      await productUpdates.isChecked(),
      'Notification checkbox did not update the host draft',
    )
    await page.getByRole('button', { name: 'Security', exact: true }).click()
    const deviceApproval = page.locator('[data-hbar-app-ui-region="setting-field"]')
      .filter({ hasText: 'Device approval' }).getByRole('switch')
    await deviceApproval.check()
    assert(
      await deviceApproval.isChecked(),
      'Security switch did not update the host draft',
    )
    await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    await page.getByLabel('API rate limit', { exact: true }).selectOption('10000')
    assert(
      (await page.getByLabel('API rate limit', { exact: true }).inputValue()) === '10000',
      'Advanced select did not update the host draft',
    )

    await page.goto(previewUrl(2), { waitUntil: 'networkidle' })
    const profileSave = page.getByRole('button', { name: 'Save profile', exact: true })
    assert(await profileSave.isDisabled(), 'Taken username should keep profile save disabled')
    await page.getByLabel('Username', { exact: true }).fill('mara-new')
    assert(!(await profileSave.isDisabled()), 'Available username did not enable profile save')
    await page.getByLabel('Bio', { exact: true }).fill('b'.repeat(161))
    assert(
      (await page.getByRole('alert').getByText('Remove 1 characters to fit the limit.').count()) === 1,
      'Over-limit Bio did not expose the source-shaped validation alert',
    )
    assert(await profileSave.isDisabled(), 'Over-limit Bio should disable profile save')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      (await page.getByLabel('Username', { exact: true }).inputValue()) === 'mara',
      'Profile cancel did not restore the host baseline',
    )

    await page.goto(previewUrl(3), { waitUntil: 'networkidle' })
    await page.getByRole('switch', { name: 'Weekly summary', exact: true }).click()
    assert(
      !(await page.getByRole('switch', { name: 'Weekly summary', exact: true }).isChecked()),
      'Preference toggle did not change state',
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      await page.getByRole('switch', { name: 'Weekly summary', exact: true }).isChecked(),
      'Host cancel did not restore saved preferences',
    )
    await page.getByRole('switch', { name: 'Weekly summary', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    assert(
      await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(),
      'Host save did not acknowledge preferences',
    )
    await page.getByRole('switch', { name: 'Weekly summary', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      !(await page.getByRole('switch', { name: 'Weekly summary', exact: true }).isChecked()),
      'Cancel reverted to the fixture instead of the saved host value',
    )

    await page.goto(previewUrl(4), { waitUntil: 'networkidle' })
    await page.getByLabel('Email address', { exact: true }).fill('new.member@example.test')
    await page.getByRole('button', { name: 'Send invite', exact: true }).click()
    assert(
      (await page.getByText('new.member@example.test', { exact: true }).count()) >= 1,
      'Member invite did not append the pending member',
    )

    await page.goto(previewUrl(5), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Reveal Production server', exact: true }).click()
    assert(
      (await page.getByText('sk_live_1234567890abcdef4a2f6c0b', { exact: true }).count()) === 1,
      'API key reveal action did not expose the host token',
    )
    await page.getByRole('switch', { name: 'Toggle GitHub', exact: true }).click()
    assert(
      await page.getByRole('switch', { name: 'Toggle GitHub', exact: true }).isChecked(),
      'Integration toggle did not change state',
    )

    await page.goto(previewUrl(6), { waitUntil: 'networkidle' })
    const deleteAction = page.getByRole('button', { name: 'Delete this workspace', exact: true })
    assert(await deleteAction.isDisabled(), 'Danger action should be disabled before confirmation')
    await page.getByLabel('Workspace name confirmation', { exact: true }).fill('northwind')
    assert(!(await deleteAction.isDisabled()), 'Danger action did not enable for an exact confirmation')
    await deleteAction.click()
    assert(
      (await page.getByText('Workspace deletion requested.', { exact: true }).count()) === 1,
      'Danger action did not expose its resulting status',
    )

    await page.goto(previewUrl(4, 'overflow'), { waitUntil: 'networkidle' })
    const memberList = page.locator(
      '.hbar-app-ui-settings-members-surface .hbar-app-ui-settings-list[data-hbar-app-ui-list-strategy="pane-scroll"]',
    )
    const overflowCheck = await inspectScroll(memberList)
    assert(overflowCheck.scrollable && overflowCheck.moved, 'Members list did not honor its pane-owned scroll strategy')

    await page.goto(previewUrl(1, 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await page.getByText('Einstellungen', { exact: true }).count()) === 1,
      'Localized workspace title was not supplied by the host bundle',
    )
    assert(
      (await page.getByText('Änderungen speichern', { exact: true }).count()) === 1,
      'Localized workspace action was not supplied by the host bundle',
    )

    const narrowOverflow: Record<string, boolean> = {}
    await page.setViewportSize({ width: 320, height: 740 })
    for (let variant = 1; variant <= 6; variant += 1) {
      narrowOverflow[`settings-form-${variant}`] = await noHorizontalOverflow(
        page,
        variant,
        variant === 4 ? 'overflow' : undefined,
      )
      assert(
        narrowOverflow[`settings-form-${variant}`],
        `Narrow settings-form-${variant} layout overflowed horizontally`,
      )
    }

    assert(pageErrors.length === 0, `Settings form preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({ overflowCheck, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()

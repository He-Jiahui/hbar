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
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin })
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
    assert(
      await page.getByRole('radio', { name: 'System', exact: true }).isChecked(),
      'Preference cancel did not restore the source saved theme',
    )
    assert(
      !(await page.getByRole('switch', { name: 'Comment replies', exact: true }).isChecked()),
      'Preference cancel did not restore the source saved reply toggle',
    )
    await page.getByRole('switch', { name: 'Weekly summary', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByText('Preferences saved', { exact: true }).waitFor()
    assert(
      await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(),
      'Host save did not settle and acknowledge preferences',
    )
    await page.getByRole('switch', { name: 'Weekly summary', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      !(await page.getByRole('switch', { name: 'Weekly summary', exact: true }).isChecked()),
      'Cancel reverted to the fixture instead of the saved host value',
    )

    await page.goto(previewUrl(4), { waitUntil: 'networkidle' })
    assert(
      (await page.locator('.lumen-settings-form-4-member-list > li').count()) === 6,
      'Team access should start with the six host-owned source members',
    )
    assert(
      (await page.getByLabel('Role for Mara Whitfield', { exact: true }).count()) === 0,
      'Owner should not receive an assignable role select',
    )
    assert(
      (await page.locator('.lumen-settings-form-4-member-list select').count()) === 5,
      'Each non-owner member should receive an independent role select',
    )
    await page.getByLabel('Role for Devan Rao', { exact: true }).selectOption('billing')
    assert(
      (await page.getByLabel('Role for Devan Rao', { exact: true }).inputValue()) === 'billing',
      'Member role select did not update its addressed row',
    )
    const devanActions = page.getByRole('button', { name: 'Actions for Devan Rao', exact: true })
    await devanActions.click()
    const devanMenu = page.getByRole('menu', { name: 'Actions for Devan Rao', exact: true })
    await devanMenu.getByRole('menuitem', { name: 'Copy email address', exact: true }).click()
    await page.getByText('Email address copied', { exact: true }).waitFor()
    assert(
      (await page.evaluate(() => navigator.clipboard.readText())) === 'devan@northwind.co',
      'Copy email should copy the selected member address',
    )
    await devanActions.click()
    await page.getByRole('menu', { name: 'Actions for Devan Rao', exact: true })
      .getByRole('menuitem', { name: 'Remove from team', exact: true }).click()
    assert(
      (await page.locator('.lumen-settings-form-4-member-list > li').count()) === 6,
      'Remove is a host callback only and must not delete a member in the preview',
    )
    await page.getByLabel('Email address', { exact: true }).fill('new.member@example.test')
    await page.getByRole('button', { name: 'Send invite', exact: true }).click()
    assert(
      (await page.getByText('New Member', { exact: true }).count()) === 1 &&
        (await page.getByText('Invitation sent', { exact: true }).count()) >= 1,
      'Preview-local invite did not append the observed pending member feedback',
    )

    await page.goto(previewUrl(5), { waitUntil: 'networkidle' })
    const productionKey = page
      .locator('[data-hbar-app-ui-region="api-key-row"]')
      .filter({ hasText: 'Production server' })
    assert(
      (await productionKey.getByRole('button', { name: 'Copy Production server', exact: true }).count()) === 1,
      'Production key should expose its host-owned copy request control',
    )
    await productionKey.getByRole('button', { name: 'Copy Production server', exact: true }).click()
    assert(
      await productionKey
        .locator('[data-hbar-app-ui-region="masked-key-display"]')
        .evaluate((element) => element.textContent?.includes('••') ?? false),
      'Copy request must not reveal or replace the safe masked-key presentation',
    )
    await productionKey.getByRole('button', { name: 'Actions for Production server', exact: true }).click()
    assert(
      (await productionKey.getByRole('menuitem', { name: 'Rotate key', exact: true }).count()) === 1 &&
        (await productionKey.getByRole('menuitem', { name: 'Revoke key', exact: true }).count()) === 1,
      'Key actions menu should expose rotate and revoke requests without executing either request',
    )
    await page.getByRole('button', { name: 'Actions for Production server', exact: true }).click()
    await productionKey.getByRole('button', { name: 'Reveal Production server', exact: true }).click()
    assert(
      (await productionKey.getByRole('button', { name: 'Hide Production server', exact: true }).count()) === 1 &&
        (await productionKey.getByText('Secret value is withheld in this safe preview.', { exact: true }).count()) ===
          1,
      'Reveal should show only the explicit safe-preview placeholder',
    )
    await productionKey.getByRole('button', { name: 'Hide Production server', exact: true }).click()
    assert(
      (await productionKey.getByRole('button', { name: 'Reveal Production server', exact: true }).count()) === 1 &&
        (await productionKey
          .locator('[data-hbar-app-ui-region="masked-key-display"]')
          .evaluate((element) => /^[a-z_]+[•*]+$/.test(element.textContent?.trim() ?? ''))),
      'Hide should restore the source-style masked key presentation',
    )
    const githubSwitch = page.getByRole('switch', { name: 'GitHub', exact: true })
    assert(!(await githubSwitch.isChecked()), 'GitHub should begin disconnected in the preview fixture')
    await githubSwitch.click()
    assert(await githubSwitch.isChecked(), 'Integration toggle did not change state')

    await page.goto(previewUrl(6), { waitUntil: 'networkidle' })
    const deleteAction = page.getByRole('button', { name: 'Delete this workspace', exact: true })
    const transferAction = page.getByRole('button', { name: 'Transfer', exact: true })
    const archiveAction = page.getByRole('button', { name: 'Archive workspace', exact: true })
    const confirmationInput = page.getByLabel('Type northwind to confirm', { exact: true })
    assert(
      !(await deleteAction.isDisabled()) &&
        !(await transferAction.isDisabled()) &&
        !(await archiveAction.isDisabled()),
      'Source-observed danger actions should begin enabled',
    )
    await deleteAction.click()
    assert(
      (await page.getByText('Workspace deletion requested.', { exact: true }).count()) === 0 &&
        (await confirmationInput.count()) === 1 &&
        (await page.getByRole('button', { name: 'Delete this workspace', exact: true }).count()) === 1,
      'Delete callback should leave the safe preview unchanged without claiming completion',
    )
    await confirmationInput.fill('northwind')
    assert((await confirmationInput.inputValue()) === 'northwind', 'Confirmation draft did not remain host-owned')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      (await confirmationInput.inputValue()) === 'northwind' &&
        (await page.getByText('Workspace deletion requested.', { exact: true }).count()) === 0,
      'Cancel callback should not invent an unverified reset or confirmation flow',
    )

    await page.setViewportSize({ width: 320, height: 740 })
    assert(await noHorizontalOverflow(page, 6), '320px danger-zone content should not overflow horizontally')
    const narrowDeleteAction = page.getByRole('button', { name: 'Delete this workspace', exact: true })
    await narrowDeleteAction.scrollIntoViewIfNeeded()
    assert(await narrowDeleteAction.isVisible(), '320px document flow should keep the destructive callback reachable')
    await page.getByText('Export data before irreversible workspace changes.', { exact: true }).scrollIntoViewIfNeeded()
    assert(
      await page.getByText('Export data before irreversible workspace changes.', { exact: true }).isVisible(),
      '320px document flow should keep the guidance footer reachable',
    )
    await page.goto(`${baseUrl}/?variant=hbar-app-ui-settings-form-6`, { waitUntil: 'networkidle' })
    const fullPreviewFooter = page.getByText('Export data before irreversible workspace changes.', { exact: true })
    await fullPreviewFooter.scrollIntoViewIfNeeded()
    const fullPreviewReachability = await fullPreviewFooter.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
      }
    })
    assert(
      fullPreviewReachability.scrollTop > 0 && fullPreviewReachability.visible,
      '320px normal document flow should scroll to the F6 guidance footer',
    )
    await page.goto(previewUrl(4), { waitUntil: 'networkidle' })
    const memberList = page.locator('.lumen-settings-form-4-content-scroll')
    const overflowCheck = await inspectScroll(memberList)
    assert(overflowCheck.scrollable && overflowCheck.moved, '320px content pane did not scroll its member rows')
    assert(
      await page.getByText('6 of 10 seats used', { exact: true }).isVisible(),
      'Seat summary should remain reachable at the end of the 320px content pane',
    )

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

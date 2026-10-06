import { expect, type Locator } from '@playwright/test'

export type LumenOptionTarget = string | { readonly label: string }

/** Select a visible component option, rather than using the native select API. */
export async function selectLumenOption(control: Locator, target: LumenOptionTarget): Promise<void> {
  await expect(control).toBeEnabled()
  await control.click()
  await expect(control).toHaveAttribute('aria-expanded', 'true')
  const listboxId = await control.getAttribute('aria-controls')
  if (!listboxId) throw new Error('Lumen choice control does not identify its listbox')
  const listbox = control.page().locator(`[id=${JSON.stringify(listboxId)}]`)
  await expect(listbox).toBeVisible()
  const option =
    typeof target === 'string'
      ? listbox.locator(`[data-value=${JSON.stringify(target)}]`)
      : listbox.getByRole('option', { name: target.label, exact: true })
  await expect(option).toBeEnabled()
  await option.click()
  await expect(control).toHaveAttribute('aria-expanded', 'false')
  if (typeof target === 'string') await expectLumenValue(control, target)
}

/** Resolve the portaled ActionMenu owned by a trigger after it has been opened. */
export async function lumenMenuForTrigger(trigger: Locator): Promise<Locator> {
  const menuId = await trigger.getAttribute('aria-controls')
  if (!menuId) throw new Error('Lumen action trigger does not identify its menu')
  const menu = trigger.page().locator(`[id=${JSON.stringify(menuId)}][role="menu"]`)
  await expect(menu).toBeVisible()
  return menu
}

/** Stable domain values remain independent from the current host locale. */
export async function expectLumenValue(control: Locator, value: string | RegExp): Promise<void> {
  await expect(control).toHaveAttribute('data-value', value)
}

export async function selectLumenChoice(group: Locator, value: string): Promise<void> {
  const choice = group.locator(`[role="radio"][data-value=${JSON.stringify(value)}]`)
  await expect(choice).toBeEnabled()
  await choice.click()
  await expect(choice).toHaveAttribute('aria-checked', 'true')
  await expectLumenValue(group, value)
}

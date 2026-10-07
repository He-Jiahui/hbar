import type { Locator } from '@playwright/test'

/** The record retains its ID; the owning TreeItem handles keyboard navigation and selection. */
export function sessionTreeItemForRow(row: Locator): Locator {
  return row.locator('xpath=ancestor::*[@role="treeitem"][1]')
}

import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * These are the shipped control owners reached from apps/web/src/App.tsx.
 * Reference variants, preview applications, fixtures, and the retired
 * workbench components are intentionally outside this list.
 *
 * The counts document the migration surface at HEAD. They are a useful guard
 * against silently shrinking the audit list while the actual assertion below
 * checks the working tree has no native LumenSelect call left.
 */
const productionSelectOwners: Readonly<Record<string, number>> = {
  'apps/web/src/AppearanceSettings.tsx': 2,
  'apps/web/src/prompt-templates-page.tsx': 3,
  'apps/web/src/schedules-page.tsx': 4,
  'packages/app-react/src/agent-policy-editor.tsx': 2,
  'packages/app-react/src/command-palette.tsx': 3,
  'packages/app-react/src/lumen-agent-workspace.tsx': 5,
  'packages/app-react/src/lumen-file-workspace.tsx': 1,
  'packages/app-react/src/lumen-provider-editor.tsx': 2,
  'packages/app-react/src/lumen-settings-workspace.tsx': 2,
  'packages/app-react/src/lumen-status-workspace.tsx': 9,
  'packages/app-react/src/sandbox-profile-settings.tsx': 8,
}

const repositoryRoot = resolve(import.meta.dir, '..')

async function source(path: string): Promise<string> {
  return readFile(join(repositoryRoot, path), 'utf8')
}

test('production LumenSelect migration covers the 41-call-site HEAD baseline', async () => {
  const entries = Object.entries(productionSelectOwners)
  expect(entries).toHaveLength(11)
  expect(entries.reduce((total, [, count]) => total + count, 0)).toBe(41)

  const leftovers: string[] = []
  for (const [path, expectedHeadCount] of entries) {
    const contents = await source(path)
    const currentCount = contents.match(/<LumenSelect\b/g)?.length ?? 0
    if (currentCount > 0) leftovers.push(`${path}: ${currentCount} <LumenSelect> call(s)`)
    if (contents.match(/\bLumenSelect\b/g)) leftovers.push(`${path}: LumenSelect import/reference remains`)
    if (contents.match(/<select\b/g)) leftovers.push(`${path}: native <select> remains`)
    expect(expectedHeadCount).toBeGreaterThan(0)
  }

  expect(leftovers).toEqual([])
})

test('production source uses typed popup controls and leaves native select only to explicitly excluded legacy/reference code', async () => {
  const production = await Promise.all(Object.keys(productionSelectOwners).map((path) => source(path)))
  const joined = production.join('\n')
  expect(joined).toContain('LumenPopupSelect')
  expect(joined).not.toContain('LumenSelect')
  expect(joined).not.toMatch(/<select\b/)

  const popupSelect = await source('packages/lumen-app-ui/src/popup-select.tsx')
  expect(popupSelect).toMatch(/export const LumenPopupSelect\b/)
  expect(popupSelect).toMatch(/aria-controls=/)
  expect(popupSelect).toMatch(/data-value=/)
})

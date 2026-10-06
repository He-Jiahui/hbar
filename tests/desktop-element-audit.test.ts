import { expect, test } from 'bun:test'
import * as ts from 'typescript'
import { resolve } from 'node:path'
import { classifyDesktopSource } from '../scripts/desktop-element-audit/classify'
import { collectDesktopBuildInputs, collectDesktopElements } from '../scripts/desktop-element-audit/inventory'

const source = (text: string) =>
  ts.createSourceFile('fixture.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

test('semantic audit records distinct text ownership and the original row action target', () => {
  const records = classifyDesktopSource(
    'packages/app-react/src/session-navigation-row.tsx',
    source(`
    function SessionRow({labels, row, onRename}) {
      return <LumenFrame><LumenContentText context="navigation.caption">{row.title}</LumenContentText>
        <LumenButton aria-label={labels.rename(row.title)} disabled={row.pending} onClick={() => onRename(row.id)}>{labels.rename}</LumenButton></LumenFrame>
    }`),
  )
  expect(records.map((record) => record.owner)).toEqual(['SessionRow', 'SessionRow', 'SessionRow'])
  expect(records[1]?.context).toBe('navigation.caption')
  expect(records[1]?.contentSources).toEqual(['row.title'])
  expect(records[2]?.actionBindings.onClick).toBe('() => onRename(row.id)')
  expect(records[2]?.accessibleNameSources).toEqual(['aria-label=labels.rename(row.title)'])
  expect(records[2]?.stateSources).toContain('disabled=row.pending')
})

test('audit rejects unclassified low-level text, raw containers and literal accessible content', () => {
  const records = classifyDesktopSource(
    'apps/web/src/App.tsx',
    source(`
    function View() { return <div><LumenText as="p">{labels.description}</LumenText><button>Save</button>
      <LumenContentText context="missing.role">{row.value}</LumenContentText></div> }`),
  )
  expect(records.every((record) => record.status === 'pending')).toBe(true)
  expect(records[1]?.issues).toContain('text-purpose-not-declared')
  expect(records[2]?.issues).toContain('literal-visible-content')
  expect(records[3]?.issues).toContain('unknown-text-context')
})

test('a dedicated renderer exception does not exempt business actions or other functions in the same module', () => {
  const records = classifyDesktopSource(
    'packages/app-react/src/message-markdown.tsx',
    source(`
    function InlineContainer({children}) { return <span>{children}</span> }
    function MessageActions({labels}) { return <button>{labels.copy}</button> }`),
  )
  expect(records[0]?.status).toBe('renderer-boundary')
  expect(records[1]?.status).toBe('pending')
  expect(records[1]?.issues).toContain('native-element-outside-renderer')
})

test('Desktop graph reaches each delayed feature and retains platform elements', async () => {
  const inventory = await collectDesktopElements(resolve(import.meta.dirname, '..'))
  for (const path of [
    'apps/web/src/App.tsx',
    'apps/web/src/schedules-page.tsx',
    'packages/app-react/src/lumen-file-workspace.tsx',
    'packages/app-react/src/lumen-settings-workspace.tsx',
    'packages/app-react/src/notifications.tsx',
  ])
    expect(inventory.sourceModules).toContain(path)
  expect(inventory.sourceModules.some((path) => path.includes('/react-bits/reference/'))).toBe(false)
  expect(inventory.elements.filter((entry) => entry.id.startsWith('native::'))).toHaveLength(6)
  expect(new Set(inventory.elements.map((element) => element.id)).size).toBe(inventory.elements.length)
  const buildInputs = await collectDesktopBuildInputs(resolve(import.meta.dirname, '..'))
  expect(inventory.sourceModules.filter((path) => !buildInputs.includes(path))).toEqual([])
})

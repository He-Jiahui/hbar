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
        <LumenButton aria-label={labels.rename(row.title)} disabled={row.pending} onClick={() => onRename(row.id)}>{labels.rename}</LumenButton>
        <LumenLink href={row.uri} target="_blank" aria-label={labels.open(row.title)}>{row.title}</LumenLink></LumenFrame>
    }`),
  )
  expect(records.map((record) => record.owner)).toEqual(['SessionRow', 'SessionRow', 'SessionRow', 'SessionRow'])
  expect(records[1]?.context).toBe('navigation.caption')
  expect(records[1]?.contentSources).toEqual(['row.title'])
  expect(records[2]?.actionBindings.onClick).toBe('() => onRename(row.id)')
  expect(records[2]?.accessibleNameSources).toEqual(['aria-label=labels.rename(row.title)'])
  expect(records[2]?.stateSources).toContain('disabled=row.pending')
  expect(records[3]?.targetSources).toContain('href=row.uri')
  expect(records[3]?.targetSources).toContain('target=_blank')
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

test('flow containers compose semantic children while direct text still requires an explicit purpose', () => {
  const records = classifyDesktopSource(
    'apps/web/src/App.tsx',
    source(`
    function View({labels, busy, rows}) { return <LumenFrame>
      <LumenFrame as="span">{busy && <LumenIcon />}</LumenFrame>
      <LumenFrame>{rows.map(row => <LumenContentText context="navigation.caption">{row.title}</LumenContentText>)}</LumenFrame>
      <LumenFrame as="label"><LumenContentText context="form.label">{labels.name}</LumenContentText></LumenFrame>
      <LumenFrame>{labels.description}</LumenFrame>
      <LumenFrame as="span">{busy ? <LumenIcon /> : labels.status}</LumenFrame>
    </LumenFrame> }`),
  )
  expect(records.filter((record) => record.status === 'pending')).toHaveLength(2)
  expect(records.filter((record) => record.issues.includes('container-owns-unclassified-content'))).toHaveLength(2)
})

test('typed content slots retain composition ownership after truthy narrowing while strings remain pending', () => {
  const fixture = source(`
    type ReactNode = string | null | {type: string}
    function View(props: {children: ReactNode, title: string}) { return <LumenFrame>
      {props.children ? <LumenFrame>{props.children}</LumenFrame> : null}
      <LumenFrame>{props.title}</LumenFrame>
    </LumenFrame> }
  `)
  const host = ts.createCompilerHost({ jsx: ts.JsxEmit.ReactJSX })
  const readSource = host.getSourceFile.bind(host)
  host.getSourceFile = (name, version, onError, shouldCreateNewSourceFile) =>
    name === 'fixture.tsx' ? fixture : readSource(name, version, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram(['fixture.tsx'], { jsx: ts.JsxEmit.ReactJSX }, host)
  const records = classifyDesktopSource('apps/web/src/App.tsx', fixture, program.getTypeChecker())
  expect(records[1]?.status).toBe('composed')
  expect(records[2]?.issues).toContain('container-owns-unclassified-content')
})

test('source-token renderers are narrow exceptions while adjacent business copy remains classified', () => {
  const records = classifyDesktopSource(
    'packages/app-react/src/markdown-code-content.tsx',
    source(`
    function MarkdownCodeContent({source}) { const content = () => <span data-code-token="string">{source}</span>; return <code>{content()}</code> }
    function CopyAction({labels}) { return <LumenText as="span">{labels.copy}</LumenText> }
  `),
  )
  expect(records[0]?.owner).toBe('content')
  expect(records[0]?.status).toBe('renderer-boundary')
  expect(records[1]?.status).toBe('renderer-boundary')
  expect(records[2]?.status).toBe('pending')
  expect(records[2]?.issues).toContain('text-purpose-not-declared')
  const diagram = classifyDesktopSource(
    'packages/app-react/src/markdown-diagram.tsx',
    source(`
    function DiagramSourceCode({text}) { return <code>{text}</code> }
    function MarkdownDiagram({labels}) { return <LumenText as="span">{labels.title}</LumenText> }
  `),
  )
  expect(diagram[0]?.status).toBe('renderer-boundary')
  expect(diagram[1]?.status).toBe('pending')
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
  expect(inventory.elements.filter((entry) => entry.id.startsWith('native::'))).toHaveLength(10)
  expect(inventory.elements.filter((entry) => entry.id.startsWith('native::') && entry.status === 'pending')).toEqual(
    [],
  )
  expect(inventory.elements.find((entry) => entry.id === 'native::tray-open')?.contentSources).toEqual([
    'DesktopChromeCopy.trayOpen',
  ])
  expect(new Set(inventory.elements.map((element) => element.id)).size).toBe(inventory.elements.length)
  const buildInputs = await collectDesktopBuildInputs(resolve(import.meta.dirname, '..'))
  expect(inventory.sourceModules.filter((path) => !buildInputs.includes(path))).toEqual([])
}, 30_000)

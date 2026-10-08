import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { expect, test } from 'bun:test'
import { auditProductionTsx, collectProductionAppSourceFiles } from '../scripts/verify-design-system-boundaries'

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)))
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

test('production app sources use only the Lumen component boundary', async () => {
  const files = await collectProductionAppSourceFiles()
  const violations: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (/from\s+['"]hbar-app-ui(?:\/|['"])/.test(source) || /\bHbarAppUi[A-Z]/.test(source)) {
      violations.push(`${relative('.', file)}:legacy-ui-import`)
    }
    violations.push(
      ...auditProductionTsx(relative('.', file).replaceAll('\\', '/'), source).map(
        (violation) => `${violation.file}:${violation.line}:${violation.rule}`,
      ),
    )
  }
  expect(violations).toEqual([])
}, 30_000)

test('the compatibility catalog and preview render controls through Lumen', async () => {
  const roots = ['packages/hbar-app-ui/src', 'apps/hbar-app-ui-preview/src']
  const files = (await Promise.all(roots.map((root) => collectSourceFiles(root)))).flat()
  const violations: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const referenceEntry =
      relative('.', file).replaceAll('\\', '/') === 'apps/hbar-app-ui-preview/src/VisualLanguagePreview.tsx'
    if (/@mui\/material(?:\/|['"])/.test(source) && !referenceEntry) {
      violations.push(`${relative('.', file)}:mui-import`)
    }
    violations.push(
      ...auditProductionTsx(relative('.', file).replaceAll('\\', '/'), source).map(
        (violation) => `${violation.file}:${violation.line}:${violation.rule}`,
      ),
    )
  }
  expect(violations).toEqual([])
})

test('the MUI comparison baseline stays in its explicit reference page', async () => {
  const roots = ['packages/app-react/src', 'apps/web/src', 'apps/hbar-app-ui-preview/src']
  const files = (await Promise.all(roots.map((root) => collectSourceFiles(root)))).flat()
  for (const file of files) {
    if (file.endsWith('VisualLanguagePreview.tsx')) continue
    const source = await readFile(file, 'utf8')
    expect(source).not.toMatch(/(?:from\s*|import\s*\()['"][^'"]*VisualLanguagePreview/)
  }
  const page = await readFile('apps/hbar-app-ui-preview/visual-language.html', 'utf8')
  expect(page).toContain('/src/VisualLanguagePreview.tsx')
})

test('retired app-react implementation files are absent from the production package', async () => {
  const retired = [
    'agent-workspace.tsx',
    'file-workspace.tsx',
    'provider-editor.tsx',
    'schema-components.tsx',
    'session-workspace.tsx',
    'settings-workspace.tsx',
    'status-workspace.tsx',
    'workspace-shell.tsx',
  ]
  const source = await readFile('packages/app-react/src/index.ts', 'utf8')
  for (const file of retired) {
    expect(source).not.toContain(`./${file.replace(/\.tsx$/, '')}`)
    expect(await Bun.file(`packages/app-react/src/${file}`).exists()).toBe(false)
  }
})

import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const lumenRoot = resolve('packages/lumen-app-ui/src')

/** Follow the selected rendered family's relative module dependencies.
 * Global styles/registries and host inputs are retained separately by the caller. */
export async function lumenDependencyFiles(entries: readonly string[]): Promise<ReadonlySet<string>> {
  const files = new Set<string>()
  const visit = async (path: string): Promise<void> => {
    const absolute = resolve(path)
    if (!absolute.startsWith(`${lumenRoot}${sep}`))
      throw new Error(`Lumen dependency escapes its source boundary: ${absolute}`)
    const name = relative(lumenRoot, absolute).replaceAll('\\', '/')
    if (files.has(name)) return
    files.add(name)
    if (!/\.[cm]?[jt]sx?$/.test(absolute)) return
    const source = await Bun.file(absolute).text()
    const ast = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true)
    const imports = new Set<string>()
    const walk = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        imports.add(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const target = node.arguments[0]
        if (!target || !ts.isStringLiteral(target))
          throw new Error(`Unresolved dynamic import in audit dependency scope: ${name}`)
        imports.add(target.text)
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) continue
      const base = resolve(dirname(absolute), specifier)
      const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.json`,
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
      ]
      let found: string | undefined
      for (const candidate of candidates) {
        if (await Bun.file(candidate).exists()) {
          found = candidate
          break
        }
      }
      if (!found) throw new Error(`Missing audit dependency ${specifier} from ${name}`)
      await visit(found)
    }
  }
  for (const entry of entries) await visit(join(lumenRoot, entry))
  return files
}

export function includesLumenAuditFile(file: string, dependencies: ReadonlySet<string> | undefined): boolean {
  const normalized = file.replaceAll('\\', '/')
  return (
    !dependencies ||
    dependencies.has(normalized) ||
    /\.(css|json)$/.test(normalized) ||
    ['index.ts', 'catalog.ts', 'variants/index.ts'].includes(normalized)
  )
}

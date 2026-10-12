import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { z } from 'zod'

export interface DesktopSourceGraph {
  readonly root: string
  readonly compilerOptions: ts.CompilerOptions
  readonly sources: ReadonlyMap<string, ts.SourceFile>
  readonly externalBoundaries: readonly string[]
}

/** Follow runtime imports and demanded barrel exports, including named lazy surfaces. */
export function loadDesktopSourceGraph(root: string, entry = 'apps/web/src/main.tsx'): DesktopSourceGraph {
  const absoluteRoot = resolve(root)
  const raw: unknown = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8'))
  const configuration = z
    .object({
      compilerOptions: z.record(z.string(), z.unknown()),
      include: z.array(z.string()),
      exclude: z.array(z.string()),
    })
    .parse(raw)
  const parsed = ts.parseJsonConfigFileContent(configuration, ts.sys, absoluteRoot)
  if (parsed.errors.length)
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  const sources = new Map<string, ts.SourceFile>()
  const requests = new Map<string, Set<string>>()
  const boundaries = new Set<string>()
  const moduleCache = ts.createModuleResolutionCache(absoluteRoot, (name) => name.toLowerCase(), parsed.options)

  function resolveImport(specifier: string, importer: string): string | null {
    const resolved = ts.resolveModuleName(specifier, importer, parsed.options, ts.sys, moduleCache).resolvedModule
    if (!resolved || resolved.resolvedFileName.endsWith('.d.ts')) return null
    const path = realpathSync(resolved.resolvedFileName)
    const display = relative(absoluteRoot, path).replaceAll('\\', '/')
    if (isAbsolute(display) || display.startsWith('../') || display.includes('node_modules/')) return null
    if (
      display.startsWith('hbar-ui/') ||
      display.includes('/react-bits/reference/') ||
      display.startsWith('packages/hbar-app-ui/')
    ) {
      boundaries.add(display)
      return null
    }
    return path
  }

  function visitModule(path: string | null, requested: readonly string[]): void {
    if (!path || !requested.length || !/\.[cm]?tsx?$/.test(path)) return
    const demand = requests.get(path) ?? new Set<string>()
    const added = requested.filter((name) => !demand.has(name))
    if (!added.length) return
    added.forEach((name) => demand.add(name))
    requests.set(path, demand)
    let source = sources.get(path)
    if (!source) {
      source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
      sources.set(path, source)
      const currentSource = source
      const importer = path
      function inspect(node: ts.Node): void {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          !node.importClause?.isTypeOnly
        ) {
          const imports: string[] = []
          if (!node.importClause) imports.push('@side-effect')
          if (node.importClause?.name) imports.push('default')
          const bindings = node.importClause?.namedBindings
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements)
              if (!element.isTypeOnly) imports.push((element.propertyName ?? element.name).text)
          } else if (bindings) imports.push('*')
          visitModule(resolveImport(node.moduleSpecifier.text, importer), imports)
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const argument = node.arguments[0]
          if (argument && ts.isStringLiteral(argument)) {
            let exports = ['*']
            // `import('./surface').then(module => ...)` has the import call as
            // the property-access receiver; its containing call is two parents
            // up. Looking three parents up skips the `.then` call when it is
            // nested inside a lazy-surface wrapper and silently widens the
            // demand to every barrel export.
            const callback = node.parent?.parent
            if (
              callback &&
              ts.isCallExpression(callback) &&
              ts.isPropertyAccessExpression(callback.expression) &&
              callback.expression.name.text === 'then'
            ) {
              const fn = callback.arguments[0]
              if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
                const parameter = fn.parameters[0]?.name.getText(currentSource)
                const used = new Set<string>()
                function inspectExport(value: ts.Node): void {
                  if (ts.isPropertyAccessExpression(value) && value.expression.getText(currentSource) === parameter)
                    used.add(value.name.text)
                  ts.forEachChild(value, inspectExport)
                }
                inspectExport(fn.body)
                if (used.size) exports = [...used]
              }
            }
            visitModule(resolveImport(argument.text, importer), exports)
          }
        }
        ts.forEachChild(node, inspect)
      }
      inspect(source)
    }
    for (const node of source.statements) {
      if (
        !ts.isExportDeclaration(node) ||
        node.isTypeOnly ||
        !node.moduleSpecifier ||
        !ts.isStringLiteral(node.moduleSpecifier)
      )
        continue
      const needed: string[] = []
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          if (!element.isTypeOnly && (demand.has('*') || demand.has(element.name.text)))
            needed.push((element.propertyName ?? element.name).text)
        }
      } else if (!node.exportClause) needed.push(...added.filter((name) => name !== '@side-effect'))
      visitModule(resolveImport(node.moduleSpecifier.text, path), needed)
    }
  }
  visitModule(resolve(absoluteRoot, entry), ['@side-effect'])
  return { root: absoluteRoot, compilerOptions: parsed.options, sources, externalBoundaries: [...boundaries].sort() }
}

import ts from 'typescript'
import { posix } from 'node:path'

export interface WorkspaceModule {
  readonly name: string
  readonly directory: string
  readonly exports: readonly string[]
}

export interface SourceModule {
  readonly path: string
  readonly source: string
}

export interface BoundaryViolation {
  readonly path: string
  readonly dependency: string
  readonly reason: 'private-import' | 'forbidden-dependency' | 'dynamic-import' | 'cycle'
}

const allowedFrameworkDependencies: Readonly<Record<string, readonly string[]>> = {
  '@hbar/commands': [],
  '@hbar/schema-core': [],
  '@hbar/schema-react': ['@hbar/schema-core'],
  '@hbar/settings-core': ['@hbar/schema-core'],
  '@hbar/app-runtime': ['@hbar/commands', '@hbar/schema-core', '@hbar/settings-core', '@hbar/contracts'],
  '@hbar/app-react': ['@hbar/app-runtime', '@hbar/schema-core', '@hbar/schema-react', 'hbar-app-ui'],
}

function owner(path: string, workspaces: readonly WorkspaceModule[]): WorkspaceModule | undefined {
  return workspaces.find((workspace) => path.startsWith(`${workspace.directory}/`))
}

function imports(file: SourceModule): { values: string[]; dynamic: boolean } {
  const values: string[] = []
  let dynamic = false
  const source = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) values.push(node.moduleSpecifier.text)
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
      values.push(node.argument.literal.text)
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0]
      if (argument && ts.isStringLiteralLike(argument)) values.push(argument.text)
      else dynamic = true
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { values, dynamic }
}

/** Inspect actual source edges, including re-exports and literal dynamic imports. */
export function checkWorkspaceBoundaries(
  sources: readonly SourceModule[],
  workspaces: readonly WorkspaceModule[],
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = []
  const graph = new Map<string, Set<string>>()
  for (const source of sources) {
    const path = source.path.replaceAll('\\', '/')
    const from = owner(path, workspaces)
    if (!from) continue
    const dependencies = imports(source)
    const allowed = allowedFrameworkDependencies[from.name]
    if (allowed && dependencies.dynamic) violations.push({ path, dependency: '<computed>', reason: 'dynamic-import' })
    for (const dependency of dependencies.values) {
      const relative = dependency.startsWith('.')
      const targetPath = relative ? posix.normalize(posix.join(posix.dirname(path), dependency)) : ''
      const to = relative
        ? owner(targetPath, workspaces)
        : workspaces.find((workspace) => dependency === workspace.name || dependency.startsWith(`${workspace.name}/`))
      if (allowed && /^(?:node:|bun:|@tauri-apps\/|react(?:-dom)?(?:\/|$))/.test(dependency)) {
        if (!(
          ['@hbar/app-react', '@hbar/schema-react'].includes(from.name) && /^react(?:-dom)?(?:\/|$)/.test(dependency)
        ))
          violations.push({ path, dependency, reason: 'forbidden-dependency' })
      }
      if (from.name === '@hbar/app-runtime' && /^zustand(?:\/|$)/.test(dependency) && dependency !== 'zustand/vanilla')
        violations.push({ path, dependency, reason: 'forbidden-dependency' })
      if (!to || to.name === from.name) continue
      const edges = graph.get(from.name) ?? new Set<string>()
      edges.add(to.name)
      graph.set(from.name, edges)
      if (relative || !to.exports.includes(dependency.slice(to.name.length) || '.'))
        violations.push({ path, dependency, reason: 'private-import' })
      if (
        (allowed && !allowed.includes(to.name)) ||
        (from.directory.startsWith('packages/') && to.directory.startsWith('apps/')) ||
        (from.name === '@hbar/contracts' &&
          !['@hbar/commands', '@hbar/schema-core', '@hbar/settings-core'].includes(to.name)) ||
        (from.name === 'hbar-app-ui' && to.name !== 'hbar-app-ui')
      )
        violations.push({ path, dependency, reason: 'forbidden-dependency' })
      if (from.name === '@hbar/contracts' && to.name === '@hbar/commands' && dependency !== '@hbar/commands/protocol')
        violations.push({ path, dependency, reason: 'forbidden-dependency' })
    }
  }
  const visited = new Set<string>()
  const active = new Set<string>()
  const walk = (name: string, route: readonly string[]): void => {
    if (active.has(name)) {
      violations.push({ path: name, dependency: [...route, name].join(' → '), reason: 'cycle' })
      return
    }
    if (visited.has(name)) return
    active.add(name)
    for (const next of graph.get(name) ?? []) walk(next, [...route, name])
    active.delete(name)
    visited.add(name)
  }
  for (const name of graph.keys()) walk(name, [])
  return violations
}

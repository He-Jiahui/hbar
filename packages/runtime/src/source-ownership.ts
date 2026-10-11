import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { HbarError } from '@hbar/contracts'

export interface RuntimeSourceInput {
  readonly imports: readonly { readonly path: string }[]
}

/** Zero-byte re-export modules still select live bindings; eliminated implementations retain no ownership. */
export async function includeLinkedReexports(
  inputs: Readonly<Record<string, RuntimeSourceInput>>,
  included: Set<string>,
  sourceRoot: string,
  resolveInput: (input: string) => string,
): Promise<void> {
  const candidates = Object.keys(inputs).filter((input) => {
    if (included.has(input)) return false
    const path = relative(sourceRoot, resolveInput(input)).replaceAll('\\', '/')
    return (
      !isAbsolute(path) &&
      !path.startsWith('../') &&
      !path.split('/').includes('node_modules') &&
      /\.[cm]?[jt]sx?$/.test(path)
    )
  })
  if (!candidates.length) return
  if (candidates.length > 4096)
    throw new HbarError('RUNTIME_SOURCE_GRAPH_LIMIT', 'Source binding graph exceeds its file bound')
  const ts = await import('typescript')
  const linked = new Set<string>()
  let bytes = 0
  for (const input of candidates) {
    const path = resolveInput(input),
      size = (await stat(path)).size
    bytes += size
    if (size > 2 * 1024 * 1024 || bytes > 32 * 1024 * 1024)
      throw new HbarError('RUNTIME_SOURCE_GRAPH_LIMIT', 'Source binding graph exceeds its byte bound')
    const file = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, false)
    const declarationsOnly = file.statements.every(
      (statement) =>
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEmptyStatement(statement),
    )
    const exportsRuntime = file.statements.some(
      (statement) =>
        ts.isExportDeclaration(statement) &&
        !statement.isTypeOnly &&
        (!statement.exportClause ||
          !ts.isNamedExports(statement.exportClause) ||
          statement.exportClause.elements.some((element) => !element.isTypeOnly)),
    )
    if (declarationsOnly && exportsRuntime) linked.add(input)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const input of linked) {
      if (inputs[input]?.imports.some((dependency) => included.has(dependency.path))) {
        included.add(input)
        linked.delete(input)
        changed = true
      }
    }
  }
}

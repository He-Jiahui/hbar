import { readdir, readFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { findTypedMessageScopeViolations } from './typed-message-scope-contract'

async function sourceFiles(directory: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await sourceFiles(path)))
    else if (entry.isFile() && ['.ts', '.tsx'].includes(extname(path)) && !entry.name.endsWith('.d.ts'))
      found.push(path)
  }
  return found
}

const roots = ['packages/app-react/src', 'apps/web/src']
const files = (await Promise.all(roots.map(sourceFiles))).flat().sort()
const violations = (
  await Promise.all(
    files.map(async (file) =>
      findTypedMessageScopeViolations(relative(process.cwd(), file), await readFile(file, 'utf8')),
    ),
  )
).flat()

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(`${violation.file}:${violation.line}: ${violation.rule}: ${violation.detail}\n`)
  }
  process.exitCode = 1
} else {
  process.stdout.write(`Typed message scope contract passed for ${files.length} app-react/Web source files.\n`)
}

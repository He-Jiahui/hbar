import { ESLint } from 'eslint'
import { relative, resolve } from 'node:path'

/** Discovery uses ESLint's own glob/config/ignore selection, not Git's ignore list. */
export async function collectLintFiles(cwd: string, configFile: string): Promise<readonly string[]> {
  const inventory = new ESLint({
    cwd,
    overrideConfigFile: resolve(cwd, configFile),
    // Only discovery avoids type-program and rule caches. Strict workers receive
    // the original config, without either of these inventory-only overrides.
    overrideConfig: { languageOptions: { parserOptions: { project: false } } },
    ruleFilter: () => false,
  })
  const results = await inventory.lintFiles(['.'])
  const files = results.map((result) => relative(cwd, result.filePath).replaceAll('\\', '/')).sort()
  if (new Set(files).size !== files.length) throw new Error('ESLint returned duplicate files')
  if (files.some((file) => file.startsWith('../') || file === '..')) throw new Error('Lint file escaped workspace')
  return files
}

export function lintFileBatches(files: readonly string[], size: number): readonly (readonly string[])[] {
  if (!Number.isSafeInteger(size) || size < 1 || size > 128) throw new Error('Lint batch size must be 1 to 128')
  if (new Set(files).size !== files.length) throw new Error('Lint inventory contains duplicate files')
  const batches: string[][] = []
  for (let offset = 0; offset < files.length; offset += size) batches.push(files.slice(offset, offset + size))
  return batches
}

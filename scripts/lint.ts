import { join, resolve } from 'node:path'
import { ESLint } from 'eslint'

export const LINT_BATCH_SIZE = 64
export async function runLintBatches(
  files: readonly string[],
  execute: (batch: readonly string[]) => Promise<number>,
  batchSize = LINT_BATCH_SIZE,
): Promise<number> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > LINT_BATCH_SIZE)
    throw new RangeError('Lint batch size must be between 1 and 64')
  let failed = false
  for (let index = 0; index < files.length; index += batchSize) {
    const code = await execute(files.slice(index, index + batchSize))
    failed = failed || code !== 0
  }
  return failed ? 1 : 0
}

export async function maintainedLintFiles(root: string): Promise<string[]> {
  const listing = Bun.spawn(['git', '-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [output, errors, code] = await Promise.all([
    new Response(listing.stdout).text(),
    new Response(listing.stderr).text(),
    listing.exited,
  ])
  if (code !== 0) throw new Error(`Cannot enumerate maintained source: ${errors.trim()}`)
  const candidates = new Set(output.split('\0').filter((path) => /\.[cm]?[jt]sx?$/.test(path)))
  const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.config.js') })
  const files: string[] = []
  for (const path of [...candidates].sort()) if (!(await eslint.isPathIgnored(path))) files.push(path)
  return files
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  const files = await maintainedLintFiles(root)
  const code = await runLintBatches(files, async (batch) => {
    console.log(`Lint ${batch.length} files: ${batch[0]} … ${batch.at(-1)}`)
    const lint = Bun.spawn(
      [
        'node',
        '--max-old-space-size=8192',
        join(root, 'node_modules/eslint/bin/eslint.js'),
        '--config',
        join(root, 'eslint.config.js'),
        ...batch,
        '--max-warnings',
        '0',
      ],
      { cwd: root, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
    )
    return lint.exited
  })
  process.exitCode = code
}

import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { relative, resolve } from 'node:path'
import { z } from 'zod'
import { collectLintFiles, lintFileBatches } from './quality/lint-workspace'

const messageSchema = z.object({
  ruleId: z.string().nullable(),
  severity: z.number().int().min(1).max(2),
  message: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  fatal: z.boolean().optional(),
})
const resultSchema = z.array(
  z.object({
    filePath: z.string(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    messages: z.array(messageSchema),
  }),
)
const cwd = process.cwd()
const configFile = 'eslint.config.js'
const output = resolve(cwd, 'artifacts/lint')
const size = z.coerce
  .number()
  .int()
  .min(1)
  .max(128)
  .parse(process.env.HBAR_LINT_BATCH_SIZE ?? 64)
await mkdir(output, { recursive: true })
console.log('Discovering every configured lint file with ESLint…')
const files = await collectLintFiles(cwd, configFile)
const batches = lintFileBatches(files, size)
const configHash = createHash('sha256')
  .update(await Bun.file(configFile).text())
  .digest('hex')
const inventoryHash = createHash('sha256').update(JSON.stringify(files)).digest('hex')
await Bun.write(resolve(output, 'inventory.json'), JSON.stringify({ configHash, inventoryHash, files, size }, null, 2))
let errors = 0
let warnings = 0
let checked = 0
const problems: z.infer<typeof resultSchema> = []
for (const [index, batch] of batches.entries()) {
  const child = Bun.spawn(
    [
      'node',
      '--max-old-space-size=8192',
      resolve(import.meta.dir, '../node_modules/eslint/bin/eslint.js'),
      '--config',
      configFile,
      '--max-warnings',
      '0',
      '--format',
      'json',
      ...batch,
    ],
    { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0 && exitCode !== 1) {
    await Bun.write(resolve(output, 'worker-failure.log'), stderr.slice(-16_384))
    throw new Error(`Lint batch ${index + 1} failed with exit ${exitCode}; see artifacts/lint/worker-failure.log`)
  }
  const results = resultSchema.parse(JSON.parse(stdout))
  const actual = results.map((result) => relative(cwd, result.filePath).replaceAll('\\', '/')).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...batch].sort()))
    throw new Error('Lint worker did not check its complete batch')
  for (const result of results) {
    errors += result.errorCount
    warnings += result.warningCount
    if (result.messages.length)
      problems.push({ ...result, filePath: relative(cwd, result.filePath).replaceAll('\\', '/') })
  }
  checked += results.length
  console.log(
    `Lint ${index + 1}/${batches.length}: ${checked}/${files.length} files; ${errors} errors, ${warnings} warnings`,
  )
  await Bun.write(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        configHash,
        inventoryHash,
        total: files.length,
        checked,
        errors,
        warnings,
        complete: checked === files.length,
        problems,
      },
      null,
      2,
    ),
  )
}
if (checked !== files.length) throw new Error('Lint inventory was not fully checked')
console.log(
  `Lint complete: ${checked} files; ${errors} errors, ${warnings} warnings. Report: artifacts/lint/results.json`,
)
if (errors || warnings) process.exitCode = 1

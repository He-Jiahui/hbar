import { expect, test } from 'bun:test'
import { ESLint } from 'eslint'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { collectLintFiles, lintFileBatches } from '../scripts/quality/lint-workspace'

async function removeOwnedFixture(cwd: string) {
  const target = await realpath(cwd)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith('hbar-lint-inventory-'))
    throw new Error('Unowned lint fixture')
  await rm(target, { recursive: true, force: true })
}

test('lint discovery matches ESLint including dot files, extra extensions and ignore re-inclusion', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'hbar-lint-inventory-'))
  try {
    await mkdir(join(cwd, 'ignored'))
    await mkdir(join(cwd, 'generated'))
    await writeFile(
      join(cwd, 'eslint.config.mjs'),
      'export default [{ ignores: ["ignored/*", "!ignored/keep.ts", "generated/**"] }, { files: ["**/*.ts", "**/*.tsx"], rules: { "no-debugger": "error" } }];',
    )
    for (const file of [
      'main.js',
      '.hidden.mjs',
      'other.cjs',
      'view.tsx',
      'model.ts',
      'ignored/keep.ts',
      'ignored/drop.ts',
      'generated/output.js',
      'notes.txt',
    ])
      await writeFile(join(cwd, file), 'debugger;')
    const reference = new ESLint({ cwd, overrideConfigFile: join(cwd, 'eslint.config.mjs') })
    const expected = (await reference.lintFiles(['.'])).map((result) => result.filePath)
    const inventory = await collectLintFiles(cwd, 'eslint.config.mjs')
    expect(inventory.map((file) => join(cwd, file)).sort()).toEqual(expected.sort())
    expect(inventory).toContain('.hidden.mjs')
    expect(inventory).toContain('view.tsx')
    expect(inventory).toContain('ignored/keep.ts')
    expect(inventory).not.toContain('ignored/drop.ts')
    expect(inventory).not.toContain('generated/output.js')
    expect(inventory).not.toContain('notes.txt')
    expect(lintFileBatches(inventory, 2).flat()).toEqual([...inventory])
    expect(lintFileBatches(inventory, 2).every((batch) => batch.length <= 2)).toBe(true)
  } finally {
    await removeOwnedFixture(cwd)
  }
})

test('strict lint workers report all later batches after errors and clear prior failures after recovery', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'hbar-lint-inventory-'))
  const script = resolve(import.meta.dir, '../scripts/lint-workspace.ts')
  const read = async () =>
    z
      .object({
        total: z.number(),
        checked: z.number(),
        complete: z.boolean(),
        errors: z.number(),
        warnings: z.number(),
        problems: z.array(
          z.object({ filePath: z.string(), messages: z.array(z.object({ ruleId: z.string().nullable() })) }),
        ),
      })
      .parse(await Bun.file(join(cwd, 'artifacts/lint/results.json')).json())
  const run = async () => {
    const child = Bun.spawn([process.execPath, script], {
      cwd,
      env: { ...process.env, HBAR_LINT_BATCH_SIZE: '1' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(stderr).toBe('')
    expect(stdout).toContain('Lint complete:')
    return exitCode
  }
  try {
    await writeFile(
      join(cwd, 'eslint.config.js'),
      'export default [{ ignores: ["artifacts/**"] }, { rules: { "no-debugger": "error" } }];',
    )
    await writeFile(join(cwd, 'early.js'), 'debugger;')
    await writeFile(join(cwd, 'late.js'), 'debugger;')
    expect(await run()).toBe(1)
    const failed = await read()
    expect(failed).toMatchObject({ total: 3, checked: 3, complete: true, errors: 2, warnings: 0 })
    expect(failed.problems.map((problem) => problem.filePath)).toEqual(['early.js', 'late.js'])
    expect(failed.problems.flatMap((problem) => problem.messages.map((message) => message.ruleId))).toEqual([
      'no-debugger',
      'no-debugger',
    ])
    await writeFile(join(cwd, 'early.js'), '')
    await writeFile(join(cwd, 'late.js'), '')
    expect(await run()).toBe(0)
    expect(await read()).toMatchObject({ total: 3, checked: 3, complete: true, errors: 0, warnings: 0, problems: [] })
  } finally {
    await removeOwnedFixture(cwd)
  }
}, 20_000)

test('lint batches reject invalid capacities and duplicate input instead of losing files', () => {
  expect(lintFileBatches([], 64)).toEqual([])
  expect(lintFileBatches(['only.ts'], 64)).toEqual([['only.ts']])
  const files = Array.from({ length: 65 }, (_, index) => `${index}.ts`)
  expect(lintFileBatches(files, 64).map((batch) => batch.length)).toEqual([64, 1])
  expect(lintFileBatches(files, 64).flat()).toEqual(files)
  expect(() => lintFileBatches(['same.ts', 'same.ts'], 64)).toThrow('duplicate')
  for (const size of [0, -1, 129, 1.5, NaN, Infinity]) expect(() => lintFileBatches(files, size)).toThrow()
})

import { expect, test } from 'bun:test'
import { maintainedLintFiles, runLintBatches } from '../scripts/lint'

test('lint covers tracked and new maintained files while ignoring independent checkouts and build artifacts', async () => {
  const files = await maintainedLintFiles(process.cwd())
  expect(files).toContain('packages/storage/src/worker.ts')
  expect(files).toContain('scripts/lint.ts')
  expect(files).toContain('packages/lumen-app-ui/src/index.ts')
  expect(files).toContain('eslint.config.js')
  expect(
    files.some(
      (file) => file.startsWith('.hbar-worktrees/') || file.includes('/artifacts/') || file.includes('/node_modules/'),
    ),
  ).toBe(false)
  expect(new Set(files).size).toBe(files.length)
})

test('lint bounds each process to 64 files, runs sequentially and retains failures from earlier batches', async () => {
  const files = Array.from({ length: 129 }, (_, index) => `source-${index}.ts`)
  const batches: string[][] = []
  let active = 0
  let maximum = 0
  const code = await runLintBatches(files, async (batch) => {
    active++
    maximum = Math.max(active, maximum)
    batches.push([...batch])
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
    active--
    return batches.length === 1 ? 2 : 0
  })
  expect(code).toBe(1)
  expect(maximum).toBe(1)
  expect(batches.map((batch) => batch.length)).toEqual([64, 64, 1])
  expect(batches.flat()).toEqual(files)
  expect(await runLintBatches([], async () => 0)).toBe(0)
})

import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { z } from 'zod'

for (const mode of ['source', 'emitted'] as const) {
  test.skipIf(process.platform !== 'win32' || process.arch !== 'x64')(
    'owned readonly SQLite fixed scan: ' + mode,
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'hbar-readonly-scan-' + mode + '-'))
      let entry = join(import.meta.dir, 'fixtures/readonly-sqlite-scan.ts')
      let workerEntry = join(import.meta.dir, 'fixtures/readonly-sqlite-scan-worker.ts')
      if (mode === 'emitted') {
        const build = await Bun.build({
          entrypoints: [entry, workerEntry],
          outdir: join(root, 'emitted-native-asset-' + 'x'.repeat(180)),
          target: 'bun',
          format: 'esm',
          sourcemap: 'none',
        })
        expect(build.success).toBe(true)
        const output = build.outputs.find((item) => basename(item.path) === 'readonly-sqlite-scan.js')
        if (!output) throw new Error('Readonly scan emitted entry missing')
        entry = output.path
        const worker = build.outputs.find((item) => basename(item.path) === 'readonly-sqlite-scan-worker.js')
        if (!worker) throw new Error('Readonly scan emitted Worker missing')
        workerEntry = worker.path
      }
      const scope = join(root, 'scope.json')
      const report = join(root, 'report.json')
      const nativeDirectory = join(resolve(import.meta.dir, '../target'), 'readonly-sqlite-' + randomUUID())
      writeFileSync(scope, JSON.stringify({ root, report, nativeDirectory, workerEntry }) + '\n', { flag: 'wx' })
      const child = Bun.spawn([process.execPath, '--smol', entry, scope], {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      })
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      writeFileSync(join(root, 'stdout.log'), stdout, { flag: 'wx' })
      writeFileSync(join(root, 'stderr.log'), stderr, { flag: 'wx' })
      console.log(JSON.stringify({ mode, root, exit, stdout, stderr }))
      expect(exit).toBe(0)
      const actual = z
        .object({
          pass: z.literal(true),
          checks: z.array(z.string()).length(9),
          asset: z.string(),
          assetSHA256: z.string().regex(/^[a-f0-9]{64}$/),
          externalModelRequests: z.literal(0),
          productionDataAccessed: z.literal(false),
        })
        .parse(JSON.parse(readFileSync(report, 'utf8')) as unknown)
      expect(actual.pass).toBe(true)
    },
    15000,
  )
}

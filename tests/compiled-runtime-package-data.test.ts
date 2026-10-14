import { expect, test } from 'bun:test'
import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withCompiledRuntimePackageData } from '../scripts/compiled-runtime-package-data'
import { loadEmbeddedRuntimePackage } from '../apps/cli/src/embedded-runtime-package'

async function fixtureRoot(): Promise<string> {
  const root = resolve(import.meta.dir, '../artifacts/compiled-runtime-data-tests')
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, 'fixture-'))
}

const fixturePackage = {
  format: 1,
  id: 'a'.repeat(64),
  units: [
    {
      artifact: {
        id: 'b'.repeat(64),
        unitId: 'fixture',
        entry: 'unit.js',
        descriptor: {
          id: 'fixture',
          kind: 'plugin',
          isolation: 'process',
          dependencies: [],
          required: true,
          reloadable: true,
          contractFingerprint: 'c'.repeat(64),
          storageSchema: 1,
        },
        files: [{ name: 'unit.js', sha256: 'd'.repeat(64) }],
        inputs: [],
        resources: [],
        resourceFiles: [],
      },
      files: [{ name: 'unit.js', base64: Buffer.from('export const marker = 1').toString('base64') }],
    },
  ],
}

async function run(
  executable: string,
  cwd: string,
  mode: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([executable, mode], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  const deadline = setTimeout(() => child.kill(), 10_000)
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    return { code, stdout: stdout.trim(), stderr: stderr.trim() }
  } finally {
    clearTimeout(deadline)
    if (child.exitCode === null) {
      child.kill()
      await child.exited
    }
  }
}

// No recursive fixture deletion: artifacts retain candidate binaries/evidence for review.
test('production DATA plugin precisely replaces its loader and rejects corrupt DATA after relocation', async () => {
  const root = await fixtureRoot()
  const source = join(root, 'source'),
    moved = join(root, 'relocated')
  await Promise.all([
    mkdir(source),
    mkdir(moved),
    mkdir(join(source, 'owner'), { recursive: true }),
    mkdir(join(source, 'other'), { recursive: true }),
  ])
  const loader = join(source, 'owner/embedded-runtime-package.ts')
  const other = join(source, 'other/embedded-runtime-package.ts')
  const entry = join(source, 'entry.ts')
  await writeFile(loader, "export function loadEmbeddedRuntimePackage() { throw new Error('SOURCE_PROVIDER_USED') }\n")
  await writeFile(other, 'export const collision = 42;\n')
  await writeFile(
    entry,
    `import { collision } from './other/embedded-runtime-package';
if (collision !== 42) throw new Error('NON_TARGET_PROVIDER_REPLACED');
if (Bun.argv[2] === 'lazy') console.log('LAZY_NO_READ');
else {
  try {
    const { loadEmbeddedRuntimePackage } = await import('./owner/embedded-runtime-package');
    const value = await loadEmbeddedRuntimePackage();
    console.log(JSON.stringify({id:value.id,units:value.units.length}));
  } catch (error) {
    console.error(error instanceof Error && error.name === 'ZodError' ? 'PACKAGE_SCHEMA_REJECTED' : error instanceof Error ? error.message : 'PACKAGE_REJECTED');
    process.exitCode = 75;
  }
}
`,
  )
  const cases = ['valid', 'digest', 'bytes', 'schema'] as const
  const reports: unknown[] = []
  for (const kind of cases) {
    const executable = join(moved, `${kind}${process.platform === 'win32' ? '.exe' : ''}`)
    const built = join(source, `${kind}${process.platform === 'win32' ? '.exe' : ''}`)
    let generatedRoot = ''
    await withCompiledRuntimePackageData(
      join(root, 'generated'),
      loader,
      kind === 'schema' ? '{}' : JSON.stringify(fixturePackage),
      async (data) => {
        generatedRoot = data.generatedRoot
        if (kind === 'digest') {
          const original = await readFile(data.dataPath, 'utf8')
          await writeFile(data.dataPath, original.replace('a'.repeat(64), 'e'.repeat(64)))
        } else if (kind === 'bytes') await writeFile(data.dataPath, `${await readFile(data.dataPath, 'utf8')} `)
        const build = await Bun.build({
          entrypoints: [entry],
          target: 'bun',
          minify: false,
          compile: { outfile: built },
          plugins: [data.plugin],
        })
        if (!build.success) throw new AggregateError(build.logs, 'DATA test compile failed')
      },
    )
    await copyFile(built, executable)
    // Production cleanup removed the actual generated DATA, so runtime cannot use source data.
    await expect(access(generatedRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    await writeFile(join(moved, 'runtime-package.json'), '{invalid-neighbor')
    const lazy = await run(executable, moved, 'lazy')
    expect(lazy).toEqual({ code: 0, stdout: 'LAZY_NO_READ', stderr: '' })
    const actual = await run(executable, moved, 'read')
    if (kind === 'valid') {
      expect(actual.code, actual.stderr).toBe(0)
      expect(actual.stdout).toBe(JSON.stringify({ id: fixturePackage.id, units: 1 }))
    } else {
      expect(actual.code).toBe(75)
      expect(actual.stdout).toBe('')
      expect(actual.stderr).toBe(kind === 'schema' ? 'PACKAGE_SCHEMA_REJECTED' : 'RUNTIME_PACKAGE_CHANGED')
    }
    reports.push({ kind, lazy, actual, generatedSourceAbsent: true })
  }
  await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2))
}, 90_000)

test('producer preserves every falsey primary throw when its cleanup also fails', async () => {
  const root = await fixtureRoot()
  for (const failure of [undefined, null, false, 0, '']) {
    let caught = false
    try {
      await withCompiledRuntimePackageData(root, join(root, 'embedded-runtime-package.ts'), '{}', async (data) => {
        // Foreign entry makes owned cleanup refuse recursive deletion; original failure still wins.
        await writeFile(join(data.generatedRoot, 'foreign.txt'), 'preserve')
        throw failure
      })
    } catch (error) {
      caught = true
      expect(error).toBe(failure)
    }
    expect(caught).toBe(true)
  }
})

test('producer fails successful builds on cleanup ownership failure and preserves other fixtures', async () => {
  const root = await fixtureRoot()
  const neighbor = join(root, 'compiled-package-other')
  await mkdir(neighbor)
  await writeFile(join(neighbor, 'keep.txt'), 'unchanged')
  await expect(
    withCompiledRuntimePackageData(root, join(root, 'embedded-runtime-package.ts'), '{}', async (data) => {
      await writeFile(join(data.generatedRoot, 'foreign.txt'), 'preserve')
      return 0
    }),
  ).rejects.toThrow('RUNTIME_PACKAGE_BUILD_CLEANUP_FOREIGN_ENTRY')
  expect(await readFile(join(neighbor, 'keep.txt'), 'utf8')).toBe('unchanged')
})

test('actual source provider returns undefined but a standalone build without its plugin fails closed', async () => {
  expect(Bun.isStandaloneExecutable).toBe(false)
  expect(await loadEmbeddedRuntimePackage()).toBeUndefined()
  const root = await fixtureRoot()
  const entry = join(root, 'missing-plugin.ts')
  const executable = join(root, process.platform === 'win32' ? 'missing-plugin.exe' : 'missing-plugin')
  // Import the actual production provider file; neither source nor implementation is copied into the fixture.
  const provider = resolve(import.meta.dir, '../apps/cli/src/embedded-runtime-package.ts')
  await writeFile(
    entry,
    [
      `import { loadEmbeddedRuntimePackage } from ${JSON.stringify(provider.replaceAll('\\', '/'))};`,
      'try {',
      '  const value = await loadEmbeddedRuntimePackage();',
      "  console.log(value === undefined ? 'UNSAFE_SOURCE_FALLBACK' : 'UNEXPECTED_PACKAGE');",
      '} catch (error) {',
      "  console.error(error instanceof Error ? error.message : 'UNKNOWN_PACKAGE_ERROR');",
      '  process.exitCode = 75;',
      '}',
    ].join('\n'),
  )
  const build = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    minify: false,
    compile: { outfile: executable },
  })
  if (!build.success) throw new AggregateError(build.logs, 'Missing-plugin fixture compile failed')
  const actual = await run(executable, root, 'read')
  expect(actual).toEqual({ code: 75, stdout: '', stderr: 'RUNTIME_PACKAGE_EMBED_REQUIRED' })
  await writeFile(join(root, 'missing-plugin-report.json'), JSON.stringify(actual, null, 2))
}, 90_000)

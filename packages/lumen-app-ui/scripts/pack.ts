import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

type ExportTarget = string | Readonly<{ types: string; import: string }>
interface PackageManifest {
  readonly name: string
  readonly version: string
  readonly files: readonly string[]
  readonly publishConfig: Readonly<{ exports: Readonly<Record<string, ExportTarget>> }>
}

const packageDirectory = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(packageDirectory, 'package.json'), 'utf8')) as PackageManifest
const output = resolve(
  packageDirectory,
  process.argv[2] ?? `artifacts/packages/${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`,
)
const temporaryRoot = resolve(tmpdir())
const staging = await mkdtemp(resolve(temporaryRoot, 'lumen-package-'))
const resolvedStaging = resolve(staging)
if (!resolvedStaging.startsWith(`${temporaryRoot}${sep}`) || !basename(resolvedStaging).startsWith('lumen-package-'))
  throw new Error('Unexpected package staging path; cleanup refused')
try {
  for (const file of manifest.files) {
    const destination = resolve(staging, file)
    if (!destination.startsWith(`${staging}${sep}`)) throw new Error(`Package file escapes staging: ${file}`)
    await cp(resolve(packageDirectory, file), destination, { recursive: true })
  }
  const packedManifest = { ...manifest, exports: manifest.publishConfig.exports }
  await writeFile(resolve(staging, 'package.json'), `${JSON.stringify(packedManifest, null, 2)}\n`)
  await mkdir(dirname(output), { recursive: true })
  const child = Bun.spawn(['bun', 'pm', 'pack', '--filename', output, '--ignore-scripts', '--quiet'], {
    cwd: staging,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if ((await child.exited) !== 0) throw new Error('Unable to pack the built Lumen package')
} finally {
  await rm(resolvedStaging, { recursive: true, force: true })
}

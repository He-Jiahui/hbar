import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { extract as extractTar } from 'tar'
import { Open } from 'unzipper'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'

export const packageNameSchema = z
  .string()
  .min(1)
  .max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/)

const dependencyMap = z.record(z.string(), z.string()).default({})
export const pluginPackageSchema = z.object({
  name: packageNameSchema,
  version: z.string(),
  type: z.literal('module').optional(),
  hbar: z.object({
    apiVersion: z.string().default('^1.0.0'),
    scope: z.enum(['global', 'project']).default('global'),
    runtimeScope: z.enum(['host', 'workspace', 'session', 'run', 'client']).optional(),
    host: z.string().min(1),
    client: z.string().min(1).optional(),
    dependencies: dependencyMap,
    peerDependencies: dependencyMap,
    optionalDependencies: dependencyMap,
    permissions: z.array(z.string()).default([]),
    activationEvents: z.array(z.string()).default(['host.start']),
    contributes: z
      .object({
        commands: z.array(z.record(z.string(), z.unknown())).default([]),
        panels: z.array(z.record(z.string(), z.unknown())).default([]),
        renderers: z.array(z.record(z.string(), z.unknown())).default([]),
      })
      .default({ commands: [], panels: [], renderers: [] }),
  }),
})
export type PluginPackage = z.infer<typeof pluginPackageSchema>

export async function readPluginPackage(root: string): Promise<PluginPackage> {
  const raw: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as unknown
  const pkg = pluginPackageSchema.parse(raw)
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version))
    throw new HbarError('PLUGIN_VERSION', `Invalid plugin version: ${pkg.version}`)
  return pkg
}

export function pluginDirectory(root: string, packageName: string) {
  packageNameSchema.parse(packageName)
  return join(root, ...packageName.split('/'))
}

async function assertTree(root: string, current = root, state = { entries: 0, bytes: 0 }): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    state.entries++
    if (state.entries > 10_000) throw new HbarError('PLUGIN_LIMIT', 'Plugin contains more than 10,000 entries')
    const path = join(current, entry.name)
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new HbarError('PLUGIN_ARCHIVE', `Symbolic links are not allowed: ${relative(root, path)}`)
    if (info.isDirectory()) await assertTree(root, path, state)
    else {
      state.bytes += info.size
      if (state.bytes > 100 * 1024 * 1024) throw new HbarError('PLUGIN_LIMIT', 'Plugin exceeds 100 MiB')
    }
  }
}

function safeArchivePath(path: string) {
  const unix = path.replaceAll('\\', '/')
  const normalized = normalize(unix).replaceAll('\\', '/')
  if (!unix || unix.startsWith('/') || /^[A-Za-z]:/.test(unix) || normalized === '..' || normalized.startsWith('../'))
    throw new HbarError('PLUGIN_ARCHIVE', `Unsafe archive path: ${path}`)
  return normalized
}

async function extractZip(source: string, destination: string) {
  const archive = await Open.file(source)
  let bytes = 0
  if (archive.files.length > 10_000) throw new HbarError('PLUGIN_LIMIT', 'Plugin contains more than 10,000 entries')
  for (const entry of archive.files) {
    const path = safeArchivePath(entry.path)
    const mode = entry.externalFileAttributes >>> 16
    if ((mode & 0o170000) === 0o120000) throw new HbarError('PLUGIN_ARCHIVE', `Symbolic links are not allowed: ${path}`)
    const target = resolve(destination, path)
    const rel = relative(destination, target)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new HbarError('PLUGIN_ARCHIVE', `Unsafe archive path: ${path}`)
    if (entry.type === 'Directory') await mkdir(target, { recursive: true })
    else {
      bytes += entry.uncompressedSize
      if (bytes > 100 * 1024 * 1024) throw new HbarError('PLUGIN_LIMIT', 'Plugin exceeds 100 MiB')
      await mkdir(dirname(target), { recursive: true })
      const content = await entry.buffer()
      await writeFile(target, content, { flag: 'wx', mode: 0o600 })
    }
  }
}

async function extractTgz(source: string, destination: string) {
  let entries = 0
  await extractTar({
    file: source,
    cwd: destination,
    strict: true,
    preservePaths: false,
    filter(path, entry) {
      safeArchivePath(path)
      entries++
      if (entries > 10_000) throw new HbarError('PLUGIN_LIMIT', 'Plugin contains more than 10,000 entries')
      const type = 'type' in entry ? entry.type : ''
      if (['SymbolicLink', 'Link'].includes(type))
        throw new HbarError('PLUGIN_ARCHIVE', `Links are not allowed: ${path}`)
      if (entry.size > 100 * 1024 * 1024) throw new HbarError('PLUGIN_LIMIT', 'Plugin file exceeds 100 MiB')
      return true
    },
  })
  await assertTree(destination)
}

async function packageRoot(extracted: string) {
  const candidates = [extracted, join(extracted, 'package')]
  for (const candidate of candidates)
    try {
      await readPluginPackage(candidate)
      return candidate
    } catch {
      continue
    }
  const directories = (await readdir(extracted, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  if (directories.length === 1) {
    const candidate = join(extracted, directories[0]!.name)
    await readPluginPackage(candidate)
    return candidate
  }
  throw new HbarError('PLUGIN_MANIFEST', 'Archive must contain one plugin package')
}

export async function stagePlugin(source: string, extractRoot: string) {
  const resolved = resolve(source)
  const info = await lstat(resolved).catch((error: unknown) => {
    throw new HbarError('PLUGIN_SOURCE', `Plugin source is unavailable: ${resolved}`, { cause: error })
  })
  if (info.isSymbolicLink()) throw new HbarError('PLUGIN_SOURCE', 'Plugin source cannot be a symbolic link')
  const temporary = await mkdtemp(join(extractRoot || tmpdir(), 'install-'))
  try {
    if (info.isDirectory()) {
      await assertTree(resolved)
      return { root: resolved, cleanup: async () => rm(temporary, { recursive: true, force: true }) }
    }
    await mkdir(temporary, { recursive: true })
    const extension = basename(resolved).toLowerCase()
    if (extension.endsWith('.zip')) await extractZip(resolved, temporary)
    else if (extension.endsWith('.tgz') || extension.endsWith('.tar.gz')) await extractTgz(resolved, temporary)
    else throw new HbarError('PLUGIN_SOURCE', 'Plugin source must be a directory, .zip, .tgz, or .tar.gz')
    return { root: await packageRoot(temporary), cleanup: async () => rm(temporary, { recursive: true, force: true }) }
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

export async function installPluginTree(sourceRoot: string, destination: string) {
  await assertTree(sourceRoot)
  const pkg = await readPluginPackage(sourceRoot)
  const hostEntry = await containedEntry(sourceRoot, pkg.hbar.host, 'Host')
  const clientEntry = pkg.hbar.client ? await containedEntry(sourceRoot, pkg.hbar.client, 'Client') : undefined
  const staging = `${destination}.install-${crypto.randomUUID()}`
  await mkdir(dirname(destination), { recursive: true })
  try {
    await cp(sourceRoot, staging, { recursive: true, errorOnExist: true, force: false, dereference: false })
    const output = join(staging, 'dist')
    await mkdir(output, { recursive: true })
    const host = await Bun.build({
      entrypoints: [hostEntry],
      outdir: output,
      naming: 'hbar-host.js',
      target: 'bun',
      format: 'esm',
      splitting: false,
    })
    if (!host.success) throw new AggregateError(host.logs, 'Host plugin build failed')
    if (clientEntry) {
      const client = await Bun.build({
        entrypoints: [clientEntry],
        outdir: output,
        naming: 'hbar-client.js',
        target: 'browser',
        format: 'esm',
        splitting: false,
      })
      if (!client.success) throw new AggregateError(client.logs, 'Client plugin build failed')
    }
    const installed = {
      ...pkg,
      hbar: {
        ...pkg.hbar,
        host: './dist/hbar-host.js',
        ...(clientEntry ? { client: './dist/hbar-client.js' } : {}),
      },
    }
    await writeFile(join(staging, 'package.json'), `${JSON.stringify(installed, null, 2)}\n`, 'utf8')
    await rename(staging, destination)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function containedEntry(root: string, entry: string, kind: string) {
  const path = await realFile(resolve(root, entry), `${kind} entry not found: ${entry}`)
  const rel = relative(root, path)
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new HbarError('PLUGIN_MANIFEST', `${kind} entry must be inside the plugin directory`)
  return path
}

async function realFile(path: string, message: string) {
  const info = await lstat(path).catch((error: unknown) => {
    throw new HbarError('PLUGIN_MANIFEST', message, { cause: error })
  })
  if (!info.isFile() || info.isSymbolicLink()) throw new HbarError('PLUGIN_MANIFEST', message)
  return path
}

export async function treeIntegrity(root: string) {
  const hash = createHash('sha256')
  async function visit(path: string): Promise<void> {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name)
      const name = relative(root, child).split(sep).join('/')
      hash.update(name)
      if (entry.isDirectory()) await visit(child)
      else hash.update(await readFile(child))
    }
  }
  await visit(root)
  return `sha256-${hash.digest('base64')}`
}

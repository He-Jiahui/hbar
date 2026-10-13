import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

export const WEB_BUILD_PROVENANCE_FILE = 'hbar-build-provenance.json'

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024
const MAX_SOURCE_FILES = 12_000
const MAX_ASSETS = 20_000
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 256 * 1024 * 1024

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const relativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.startsWith('\\') &&
      !value.includes('\\') &&
      !value.split('/').some((part) => part.includes(':')) &&
      !isAbsolute(value) &&
      value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..'),
    'Path must be a normalized relative POSIX path',
  )

const fileRecordSchema = z
  .object({
    path: relativePathSchema,
    bytes: z.number().int().nonnegative().max(MAX_FILE_BYTES),
    sha256: digestSchema,
  })
  .strict()

const fileListSchema = z.object({
  files: z.array(fileRecordSchema).max(MAX_SOURCE_FILES),
  sha256: digestSchema,
})

const settingListSchema = z
  .object({
    values: z
      .array(z.object({ name: z.enum(['HBAR_DESKTOP_DEV', 'HBAR_HOST_URL']), sha256: digestSchema }).strict())
      .max(16),
    sha256: digestSchema,
  })
  .strict()

export const webBuildProvenanceSchema = z
  .object({
    schema: z.literal('hbar.web-build-provenance.v1'),
    entry: z
      .object({
        path: relativePathSchema,
        bytes: z.number().int().nonnegative().max(MAX_FILE_BYTES),
        sha256: digestSchema,
      })
      .strict(),
    sourceModules: fileListSchema,
    buildInputs: fileListSchema,
    emittedAssets: fileListSchema,
    buildSettings: settingListSchema,
    moduleKinds: z
      .object({
        externalCount: z.number().int().nonnegative().max(MAX_SOURCE_FILES),
        externalPackages: z
          .array(z.string().regex(/^(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+|external-file)$/))
          .max(512),
        bundledDependencyCount: z.number().int().nonnegative().max(MAX_SOURCE_FILES),
        virtualCount: z.number().int().nonnegative().max(MAX_SOURCE_FILES),
      })
      .strict(),
    sourceGraphSha256: digestSchema,
    assetInventorySha256: digestSchema,
  })
  .strict()

export type WebBuildProvenance = z.infer<typeof webBuildProvenanceSchema>
export type WebBuildFileRecord = z.infer<typeof fileRecordSchema>
export type WebBuildSettingRecord = z.infer<typeof settingListSchema>['values'][number]

export function serializeWebBuildProvenance(manifest: WebBuildProvenance): string {
  const serialized = JSON.stringify(manifest)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MANIFEST_BYTES)
    throw new Error('Web build provenance manifest exceeds the size limit')
  return serialized
}

export async function hashWebBuildFile(root: string, path: string): Promise<WebBuildFileRecord> {
  const normalizedPath = relativePathSchema.parse(path)
  const target = await safeFilePath(root, normalizedPath)
  const contents = await readBoundedFile(target, MAX_FILE_BYTES, `Web provenance file: ${normalizedPath}`)
  return { path: normalizedPath, bytes: contents.byteLength, sha256: sha256(contents) }
}

export function currentWebBuildSettings(environment: NodeJS.ProcessEnv = process.env): WebBuildSettingRecord[] {
  const hostOrigin = environment.HBAR_HOST_URL ?? `http://127.0.0.1:${environment.HBAR_E2E_HOST_PORT ?? '4317'}`
  const settings = [
    ['HBAR_DESKTOP_DEV', environment.HBAR_DESKTOP_DEV === '1' ? '1' : '0'],
    ['HBAR_HOST_URL', environment.HBAR_DESKTOP_DEV === '1' ? hostOrigin : 'null'],
  ] as const
  return settings.map(([name, value]) => ({ name, sha256: sha256(Buffer.from(value, 'utf8')) }))
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalFileListSha256(files: readonly WebBuildFileRecord[]): string {
  return sha256(Buffer.from(JSON.stringify(files), 'utf8'))
}

function sortedUniqueFiles(files: readonly WebBuildFileRecord[], label: string): WebBuildFileRecord[] {
  const sorted = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  if (sorted.length > MAX_SOURCE_FILES) throw new Error(`${label} exceeds the file-count limit`)
  let totalBytes = 0
  for (let index = 0; index < sorted.length; index++) {
    const current = sorted[index]
    const previous = sorted[index - 1]
    if (!current) throw new Error(`${label} contains an invalid file record`)
    relativePathSchema.parse(current.path)
    if (previous?.path === current.path) throw new Error(`${label} contains duplicate paths`)
    totalBytes += current.bytes
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`${label} exceeds the total-byte limit`)
  }
  return sorted
}

export function createWebBuildProvenance(input: {
  readonly entryPath: string
  readonly sourceModules: readonly WebBuildFileRecord[]
  readonly buildInputs: readonly WebBuildFileRecord[]
  readonly emittedAssets: readonly WebBuildFileRecord[]
  readonly buildSettings: readonly WebBuildSettingRecord[]
  readonly externalPackages: readonly string[]
  readonly externalModuleCount: number
  readonly bundledDependencyCount: number
  readonly virtualModuleCount: number
}): WebBuildProvenance {
  const sourceModules = sortedUniqueFiles(input.sourceModules, 'Source module list')
  const buildInputs = sortedUniqueFiles(input.buildInputs, 'Build input list')
  const emittedAssets = sortedUniqueFiles(input.emittedAssets, 'Emitted asset list')
  const buildSettings = [...input.buildSettings].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )
  const entry = emittedAssets.find((asset) => asset.path === input.entryPath)
  if (!entry) throw new Error('Web build provenance has no emitted entry asset')

  const sourceGraphSha256 = sha256(Buffer.from(JSON.stringify({ sourceModules, buildInputs, buildSettings }), 'utf8'))
  const assetInventorySha256 = canonicalFileListSha256(emittedAssets)
  const manifest = {
    schema: 'hbar.web-build-provenance.v1' as const,
    entry,
    sourceModules: { files: sourceModules, sha256: canonicalFileListSha256(sourceModules) },
    buildInputs: { files: buildInputs, sha256: canonicalFileListSha256(buildInputs) },
    emittedAssets: { files: emittedAssets, sha256: assetInventorySha256 },
    buildSettings: {
      values: buildSettings,
      sha256: sha256(Buffer.from(JSON.stringify(buildSettings), 'utf8')),
    },
    moduleKinds: {
      externalCount: input.externalModuleCount,
      externalPackages: [...new Set(input.externalPackages)].sort(),
      bundledDependencyCount: input.bundledDependencyCount,
      virtualCount: input.virtualModuleCount,
    },
    sourceGraphSha256,
    assetInventorySha256,
  }
  return webBuildProvenanceSchema.parse(manifest)
}

export function parseWebBuildProvenance(bytes: Uint8Array): WebBuildProvenance {
  if (bytes.byteLength > MAX_MANIFEST_BYTES)
    throw new Error('Web build provenance manifest exceeds the size limit; rebuild the Web bundle')
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    throw new Error('Web build provenance manifest is invalid; rebuild the Web bundle')
  }
  const manifest = webBuildProvenanceSchema.parse(json)
  assertFileListIntegrity(manifest.sourceModules, 'Source module list')
  assertFileListIntegrity(manifest.buildInputs, 'Build input list')
  assertFileListIntegrity(manifest.emittedAssets, 'Emitted asset list')
  if (manifest.entry.path !== 'index.html') throw new Error('Web build provenance entry must be index.html')
  const entry = manifest.emittedAssets.files.find((file) => file.path === manifest.entry.path)
  if (!entry || entry.bytes !== manifest.entry.bytes || entry.sha256 !== manifest.entry.sha256)
    throw new Error('Web build provenance entry does not match its asset inventory')
  if (
    manifest.sourceGraphSha256 !==
    sha256(
      Buffer.from(
        JSON.stringify({
          sourceModules: manifest.sourceModules.files,
          buildInputs: manifest.buildInputs.files,
          buildSettings: manifest.buildSettings.values,
        }),
        'utf8',
      ),
    )
  )
    throw new Error('Web build provenance source graph hash is invalid')
  if (manifest.buildSettings.sha256 !== sha256(Buffer.from(JSON.stringify(manifest.buildSettings.values), 'utf8')))
    throw new Error('Web build provenance build settings hash is invalid')
  if (
    JSON.stringify(
      [...manifest.buildSettings.values].sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      ),
    ) !== JSON.stringify(manifest.buildSettings.values) ||
    manifest.moduleKinds.externalCount < manifest.moduleKinds.externalPackages.length ||
    JSON.stringify([...new Set(manifest.moduleKinds.externalPackages)].sort()) !==
      JSON.stringify(manifest.moduleKinds.externalPackages)
  )
    throw new Error('Web build provenance module or settings inventory is not canonical')
  if (manifest.assetInventorySha256 !== manifest.emittedAssets.sha256)
    throw new Error('Web build provenance asset inventory hash is invalid')
  return manifest
}

function assertFileListIntegrity(list: z.infer<typeof fileListSchema>, label: string): void {
  const sorted = sortedUniqueFiles(list.files, label)
  if (JSON.stringify(sorted) !== JSON.stringify(list.files)) throw new Error(`${label} is not canonical`)
  if (list.sha256 !== canonicalFileListSha256(list.files)) throw new Error(`${label} hash is invalid`)
}

async function safeFilePath(root: string, relativePath: string): Promise<string> {
  const normalizedPath = relativePathSchema.parse(relativePath)
  const base = await realpath(root)
  const lexicalTarget = resolve(base, ...normalizedPath.split('/'))
  const lexicalInfo = await lstat(lexicalTarget)
  if (lexicalInfo.isSymbolicLink()) throw new Error(`Web provenance path is a symbolic link: ${normalizedPath}`)
  const target = await realpath(lexicalTarget)
  const rel = relative(base, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(`Web provenance path escaped its root: ${normalizedPath}`)
  const info = await lstat(target)
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(`Web provenance path is not a plain file: ${normalizedPath}`)
  if (info.size > MAX_FILE_BYTES) throw new Error(`Web provenance file exceeds the size limit: ${normalizedPath}`)
  return target
}

async function readBoundedFile(path: string, maximumBytes: number, label: string): Promise<Uint8Array> {
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${label} must be a plain file`)
  if (before.size > maximumBytes) throw new Error(`${label} exceeds the size limit`)
  const contents = await readFile(path)
  if (contents.byteLength > maximumBytes) throw new Error(`${label} exceeds the size limit`)
  return contents
}

async function verifyFileRecords(root: string, files: readonly WebBuildFileRecord[], label: string): Promise<void> {
  let totalBytes = 0
  for (const expected of files) {
    const path = await safeFilePath(root, expected.path)
    const contents = await readBoundedFile(path, MAX_FILE_BYTES, `Web provenance file: ${expected.path}`)
    totalBytes += contents.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`${label} exceeds the total-byte limit`)
    if (contents.byteLength !== expected.bytes || sha256(contents) !== expected.sha256)
      throw new Error(`Web build provenance ${label} changed: ${expected.path}; run bun run build first`)
  }
}

async function listPlainFiles(
  root: string,
  relativeDirectory = '',
  state: { entries: number } = { entries: 0 },
  depth = 0,
): Promise<string[]> {
  if (depth > 64) throw new Error('Web bundle directory exceeds the nesting limit')
  const entries = await readdir(resolve(root, ...relativeDirectory.split('/').filter(Boolean)), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    state.entries++
    if (state.entries > MAX_ASSETS) throw new Error('Web bundle exceeds the entry-count limit')
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    relativePathSchema.parse(relativePath)
    const path = resolve(root, ...relativePath.split('/'))
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`Web bundle contains a symbolic link: ${relativePath}`)
    if (info.isDirectory()) files.push(...(await listPlainFiles(root, relativePath, state, depth + 1)))
    else if (info.isFile()) {
      if (relativePath === WEB_BUILD_PROVENANCE_FILE) continue
      if (info.size > MAX_FILE_BYTES) throw new Error(`Web bundle asset exceeds the size limit: ${relativePath}`)
      files.push(relativePath)
    } else throw new Error(`Web bundle contains an unsupported entry: ${relativePath}`)
    if (files.length > MAX_ASSETS) throw new Error('Web bundle exceeds the asset-count limit')
  }
  return files
}

export async function verifyWebBuildProvenance(
  projectRoot: string,
  webRoot: string,
): Promise<{
  readonly manifest: WebBuildProvenance
  readonly bytes: Uint8Array
}> {
  const manifestPath = resolve(webRoot, WEB_BUILD_PROVENANCE_FILE)
  let manifestBytes: Uint8Array
  try {
    const info = await lstat(manifestPath)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Web build provenance manifest must be a plain file')
    if (info.size > MAX_MANIFEST_BYTES)
      throw new Error('Web build provenance manifest exceeds the size limit; rebuild the Web bundle')
    manifestBytes = await readBoundedFile(manifestPath, MAX_MANIFEST_BYTES, 'Web build provenance manifest')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new Error('Web build provenance is missing; run bun run build before packaging desktop resources', {
        cause: error,
      })
    throw error
  }
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES)
    throw new Error('Web build provenance manifest exceeds the size limit; rebuild the Web bundle')
  const manifest = parseWebBuildProvenance(manifestBytes)
  const currentSettings = currentWebBuildSettings()
  if (JSON.stringify(currentSettings) !== JSON.stringify(manifest.buildSettings.values))
    throw new Error('Web build provenance settings do not match the current build environment; run bun run build first')
  await verifyFileRecords(projectRoot, manifest.sourceModules.files, 'source module')
  await verifyFileRecords(projectRoot, manifest.buildInputs.files, 'build input')
  const actual = (await listPlainFiles(webRoot)).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  const expected = manifest.emittedAssets.files.map((file) => file.path)
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Web build provenance asset list does not match dist/web; run bun run build first')
  await verifyFileRecords(webRoot, manifest.emittedAssets.files, 'asset')
  return { manifest, bytes: manifestBytes }
}

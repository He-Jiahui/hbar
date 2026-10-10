import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  runtimeArtifactIdSchema,
  runtimeUnitDescriptorSchema,
  type RuntimeUnitDescriptor,
} from '@hbar/contracts/runtime'

const artifactSchema = z.strictObject({
  id: runtimeArtifactIdSchema,
  unitId: z.string().min(1).max(160),
  descriptor: runtimeUnitDescriptorSchema,
  entry: z.string().min(1).max(256),
  files: z
    .array(z.strictObject({ name: z.string().min(1).max(256), sha256: runtimeArtifactIdSchema }))
    .min(1)
    .max(128),
  inputs: z.array(z.string().min(1).max(4_000)).max(20_000),
  resources: z.array(z.string().min(1).max(4_000)).max(512),
  resourceFiles: z
    .array(
      z.strictObject({
        sourcePath: z.string().min(1).max(4_000),
        name: z.string().min(1).max(256),
        sha256: runtimeArtifactIdSchema,
      }),
    )
    .max(4_096),
})
export type RuntimeArtifact = z.infer<typeof artifactSchema>
export interface RuntimeArtifactSet {
  readonly id: string
  readonly artifacts: readonly RuntimeArtifact[]
  readonly createdAt: number
}
export interface RuntimeBuildUnit {
  readonly descriptor: RuntimeUnitDescriptor
  readonly entrypoint: string
  readonly resources?: readonly string[]
  readonly external?: readonly string[]
  readonly workers?: readonly string[]
  readonly define?: Readonly<Record<string, string>>
}
export interface RuntimeArtifactPort {
  get(id: string): Promise<RuntimeArtifact>
  modulePath(id: string): Promise<string>
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
function metafilePath(input: string): string {
  // Bun 1.4 prefixes cross-drive Windows inputs with relative segments before the drive.
  const drive = /(?:^|\/)([A-Za-z]:\/.*)$/.exec(input.replaceAll('\\', '/'))?.[1]
  return resolve(process.cwd(), drive ?? input)
}
function within(root: string, path: string): boolean {
  const name = relative(root, path)
  return (
    name === '' ||
    (!isAbsolute(name) && name !== '..' && !name.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
  )
}
function fileName(name: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..')
    throw new HbarError('RUNTIME_ARTIFACT_INVALID', 'Artifact file name is invalid')
  return name
}

/** Registered immutable bundles, verified again before loading. It never accepts an arbitrary reload path. */
export class RuntimeArtifactStore implements RuntimeArtifactPort {
  private readonly sets = new Map<string, RuntimeArtifactSet>()
  private readonly registered = new Map<string, RuntimeArtifact>()
  constructor(
    readonly root: string,
    readonly sourceRoot: string,
  ) {}

  async build(unit: RuntimeBuildUnit): Promise<RuntimeArtifact> {
    const descriptor = runtimeUnitDescriptorSchema.parse(unit.descriptor)
    const sourceRoot = await realpath(this.sourceRoot)
    const entrypoint = await realpath(resolve(sourceRoot, unit.entrypoint))
    if (!within(sourceRoot, entrypoint))
      throw new HbarError('RUNTIME_BUILD_INVALID', 'Runtime entrypoint is outside the registered source root')
    if ((unit.workers?.length ?? 0) > 16) throw new HbarError('RUNTIME_BUILD_LIMIT', 'Runtime Worker entrypoint capacity is exhausted')
    const workers: string[] = []
    for (const input of unit.workers ?? []) {
      const path = await realpath(resolve(sourceRoot, input))
      if (!within(sourceRoot, path)) throw new HbarError('RUNTIME_BUILD_INVALID', 'Runtime Worker entrypoint is outside the registered source root')
      workers.push(path)
    }
    if (new Set([entrypoint, ...workers].map(path => basename(path, extname(path)))).size !== workers.length + 1)
      throw new HbarError('RUNTIME_BUILD_INVALID', 'Runtime entrypoint output names must be unique')
    const result = await Bun.build({
      entrypoints: [entrypoint, ...workers],
      target: 'bun',
      format: 'esm',
      splitting: false,
      metafile: true,
      minify: false,
      external: [...(unit.external ?? []), '*.node'],
      define: unit.define ?? {},
    }).catch((error: unknown) => {
      throw new HbarError('RUNTIME_BUILD_FAILED', 'Runtime candidate did not compile', { cause: error })
    })
    if (!result.success) throw new HbarError('RUNTIME_BUILD_FAILED', 'Runtime candidate did not compile')
    const metafile = z.object({
      inputs: z.record(z.string(), z.unknown()),
      outputs: z.record(z.string(), z.object({ inputs: z.record(z.string(), z.object({ bytesInOutput: z.number().nonnegative() })) })),
    }).parse(result.metafile)
    const included = new Set(Object.values(metafile.outputs).flatMap(output =>
      Object.entries(output.inputs).flatMap(([input, contribution]) => contribution.bytesInOutput > 0 ? [input] : [])))
    const inputs = Object.keys(metafile.inputs).filter(input => included.has(input))
      .map((input) => relative(sourceRoot, metafilePath(input)).replaceAll('\\', '/'))
      .sort()
    const outputs = await Promise.all(
      result.outputs.map(async (output) => ({
        name: fileName(output.path.split(/[\\/]/).at(-1) ?? 'unit.mjs'),
        bytes: new Uint8Array(await output.arrayBuffer()),
        kind: output.kind,
      })),
    )
    if (
      outputs.length > 128 ||
      outputs.reduce((bytes, output) => bytes + output.bytes.byteLength, 0) > 128 * 1024 * 1024
    )
      throw new HbarError('RUNTIME_BUILD_LIMIT', 'Runtime bundle output exceeds its bound')
    const entry = outputs.find((output) => output.kind === 'entry-point' && basename(output.name, extname(output.name)) === basename(entrypoint, extname(entrypoint)))?.name
    if (!entry) throw new HbarError('RUNTIME_BUILD_FAILED', 'Runtime build has no process module')
    const files = outputs
      .map((output) => ({ name: output.name, sha256: sha256(output.bytes) }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const resources: string[] = []
    const resourceFiles: Array<{ sourcePath: string; name: string; sha256: string; bytes: Uint8Array }> = []
    const resourceBudget = { bytes: 0, files: 0 }
    if (new Set(unit.resources ?? []).size !== (unit.resources?.length ?? 0))
      throw new HbarError('RUNTIME_RESOURCE_INVALID', 'Declared runtime resources contain duplicates')
    const resourceFingerprints: Array<{ path: string; hash: string }> = []
    for (const resource of unit.resources ?? []) {
      const path = resolve(sourceRoot, resource)
      if (!within(sourceRoot, path))
        throw new HbarError('RUNTIME_RESOURCE_INVALID', 'Declared runtime resource is outside its source root')
      resources.push(relative(sourceRoot, path).replaceAll('\\', '/'))
      resourceFingerprints.push({
        path: resource,
        hash: await this.hashResource(path, sourceRoot, resourceFiles, resourceBudget),
      })
    }
    const id = sha256(JSON.stringify({ descriptor, entry, files, resources: resourceFingerprints }))
    const artifact = artifactSchema.parse({
      id,
      unitId: descriptor.id,
      descriptor,
      entry,
      files,
      inputs,
      resources: resources.sort(),
      resourceFiles: resourceFiles.map(({ sourcePath, name, sha256 }) => ({ sourcePath, name, sha256 })),
    })
    if (!this.registered.has(id) && this.registered.size >= 4_096)
      throw new HbarError('RUNTIME_ARTIFACT_CAPACITY', 'Registered artifact capacity is exhausted')
    const directory = join(this.root, id)
    await mkdir(directory, { recursive: true })
    for (const output of outputs) await this.immutableWrite(join(directory, output.name), output.bytes)
    for (const resource of resourceFiles) await this.immutableWrite(join(directory, resource.name), resource.bytes)
    await this.immutableWrite(join(directory, 'manifest.json'), `${JSON.stringify(artifact)}\n`)
    this.registered.set(id, artifact)
    return artifactSchema.parse(artifact)
  }

  registerSet(artifacts: readonly RuntimeArtifact[]): RuntimeArtifactSet {
    if (
      !artifacts.length ||
      artifacts.length > 512 ||
      new Set(artifacts.map((artifact) => artifact.unitId)).size !== artifacts.length
    )
      throw new HbarError('RUNTIME_ARTIFACT_SET_INVALID', 'Runtime artifact set has invalid or duplicate units')
    const parsed = artifacts.map((artifact) => artifactSchema.parse(artifact))
    for (const artifact of parsed)
      if (!this.registered.has(artifact.id))
        throw new HbarError('RUNTIME_ARTIFACT_UNREGISTERED', 'Runtime artifact was not prepared by this Host')
    const id = sha256(JSON.stringify(parsed.map((artifact) => [artifact.unitId, artifact.id]).sort()))
    const existing = this.sets.get(id)
    if (existing)
      return { ...existing, artifacts: existing.artifacts.map((artifact) => artifactSchema.parse(artifact)) }
    if (this.sets.size >= 256)
      throw new HbarError('RUNTIME_ARTIFACT_CAPACITY', 'Registered artifact set capacity is exhausted')
    const set = { id, artifacts: parsed, createdAt: Date.now() }
    this.sets.set(id, set)
    return { ...set, artifacts: set.artifacts.map((artifact) => artifactSchema.parse(artifact)) }
  }
  artifactSet(id: string): RuntimeArtifactSet {
    const set = this.sets.get(id)
    if (!set) throw new HbarError('RUNTIME_ARTIFACT_UNREGISTERED', 'Runtime artifact set is not registered')
    return { ...set, artifacts: set.artifacts.map((artifact) => artifactSchema.parse(artifact)) }
  }
  preparedSets(): string[] {
    return [...this.sets.keys()]
  }
  forgetSet(id: string): void {
    this.sets.delete(id)
  }

  async get(id: string): Promise<RuntimeArtifact> {
    runtimeArtifactIdSchema.parse(id)
    if (!this.registered.has(id))
      throw new HbarError('RUNTIME_ARTIFACT_UNREGISTERED', 'Runtime artifact is not registered')
    const directory = join(this.root, id)
    const artifact = artifactSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
    if (artifact.id !== id || JSON.stringify(artifact) !== JSON.stringify(this.registered.get(id)))
      throw new HbarError('RUNTIME_ARTIFACT_CHANGED', 'Runtime artifact manifest changed after registration')
    for (const file of artifact.files)
      if (sha256(await readFile(join(directory, fileName(file.name)))) !== file.sha256)
        throw new HbarError('RUNTIME_ARTIFACT_CHANGED', 'Runtime artifact content changed after preparation')
    for (const file of artifact.resourceFiles)
      if (sha256(await readFile(join(directory, fileName(file.name)))) !== file.sha256)
        throw new HbarError('RUNTIME_ARTIFACT_CHANGED', 'Runtime resource changed after preparation')
    return artifact
  }
  async modulePath(id: string): Promise<string> {
    const artifact = await this.get(id)
    return join(this.root, id, fileName(artifact.entry))
  }
  async resourcePaths(id: string): Promise<Record<string, string>> {
    const artifact = await this.get(id)
    return Object.fromEntries(
      artifact.resourceFiles.map((file) => [file.sourcePath, join(this.root, id, fileName(file.name))]),
    )
  }

  affected(changedPaths: readonly string[], artifacts: readonly RuntimeArtifact[]): string[] {
    const paths = changedPaths.map((path) =>
      relative(this.sourceRoot, resolve(this.sourceRoot, path)).replaceAll('\\', '/'),
    )
    const affected = new Set<string>()
    for (const artifact of artifacts) {
      if (
        paths.some(
          (path) =>
            artifact.inputs.some((input) => input === path || input.startsWith(`${path}/`)) ||
            artifact.resources.some(
              (resource) => path === resource || path.startsWith(`${resource}/`) || resource.startsWith(`${path}/`),
            ),
        )
      )
        affected.add(artifact.unitId)
    }
    // A capability dependency is explicit, including its dynamically loaded resources.
    for (let changed = true; changed;) {
      changed = false
      for (const artifact of artifacts)
        if (!affected.has(artifact.unitId) && artifact.descriptor.dependencies.some((unit) => affected.has(unit))) {
          affected.add(artifact.unitId)
          changed = true
        }
    }
    return [...affected].sort()
  }

  private async immutableWrite(path: string, value: string | Uint8Array): Promise<void> {
    try {
      await writeFile(path, value, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'EEXIST') throw error
      if (sha256(await readFile(path)) !== sha256(value))
        throw new HbarError('RUNTIME_ARTIFACT_CONFLICT', 'An immutable artifact path already holds different content', {
          cause: error,
        })
    }
  }
  private async hashResource(
    path: string,
    sourceRoot: string,
    files: Array<{ sourcePath: string; name: string; sha256: string; bytes: Uint8Array }>,
    budget: { bytes: number; files: number },
    depth = 0,
  ): Promise<string> {
    if (depth > 16) throw new HbarError('RUNTIME_RESOURCE_LIMIT', 'Declared resource tree exceeds its depth bound')
    const metadata = await stat(path)
    if (!within(sourceRoot, await realpath(path)))
      throw new HbarError('RUNTIME_RESOURCE_INVALID', 'Declared resource escapes its registered root')
    if (metadata.isFile()) {
      budget.bytes += metadata.size
      if (budget.bytes > 64 * 1024 * 1024 || ++budget.files > 4_096)
        throw new HbarError('RUNTIME_RESOURCE_LIMIT', 'Declared resource exceeds its byte bound')
      const bytes = await readFile(path)
      const sourcePath = relative(sourceRoot, path).replaceAll('\\', '/')
      const hash = sha256(bytes)
      files.push({ sourcePath, name: fileName(`resource-${sha256(sourcePath)}${extname(path)}`), sha256: hash, bytes })
      return hash
    }
    if (!metadata.isDirectory())
      throw new HbarError('RUNTIME_RESOURCE_INVALID', 'Declared resource is not a file or directory')
    const entries = await readdir(path)
    if (entries.length > 4_096)
      throw new HbarError('RUNTIME_RESOURCE_LIMIT', 'Declared resource tree exceeds its entry bound')
    const hashes: Array<[string, string]> = []
    for (const entry of entries.sort())
      hashes.push([entry, await this.hashResource(join(path, entry), sourceRoot, files, budget, depth + 1)])
    return sha256(JSON.stringify(hashes))
  }
}

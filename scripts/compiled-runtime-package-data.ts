import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

export interface CompiledRuntimePackageData {
  readonly plugin: Bun.BunPlugin
  readonly dataPath: string
  readonly generatedRoot: string
}

function pathIdentity(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

async function plainDirectory(path: string): Promise<Awaited<ReturnType<typeof lstat>>> {
  const info = await lstat(path)
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    pathIdentity(await realpath(path)) !== pathIdentity(path)
  )
    throw new Error('RUNTIME_PACKAGE_BUILD_DIRECTORY_INVALID')
  return info
}

/** Composition-root build helper. The callback may compile this resource; it cannot supply runtime fallbacks. */
export async function withCompiledRuntimePackageData<T>(
  artifactRootInput: string,
  loaderPathInput: string,
  packageText: string,
  build: (data: CompiledRuntimePackageData) => Promise<T>,
): Promise<T> {
  const artifactRoot = resolve(artifactRootInput)
  const loaderPath = resolve(loaderPathInput)
  await mkdir(artifactRoot, { recursive: true })
  const rootIdentity = await plainDirectory(artifactRoot)
  const generated = await mkdtemp(join(artifactRoot, 'compiled-package-'))
  const generatedIdentity = await plainDirectory(generated)
  const dataPath = join(generated, 'runtime-package.json')
  let failed = false
  let failure: unknown
  let completed: { readonly value: T } | undefined
  try {
    await writeFile(dataPath, packageText, { flag: 'wx' })
    const expectedSha256 = createHash('sha256').update(packageText).digest('hex')
    const loaderContents = [
      `import packagePath from ${JSON.stringify(dataPath.replaceAll('\\', '/'))} with { type: 'file' };`,
      "import { createHash } from 'node:crypto';",
      "import { runtimeArtifactPackageSchema, type RuntimeArtifactPackage } from '@hbar/runtime';",
      'export async function loadEmbeddedRuntimePackage(): Promise<RuntimeArtifactPackage> {',
      "  if (!Bun.isStandaloneExecutable) throw new Error('RUNTIME_PACKAGE_EMBED_REQUIRED');",
      '  const file = Bun.file(packagePath);',
      `  if (file.size !== ${Buffer.byteLength(packageText)}) throw new Error('RUNTIME_PACKAGE_CHANGED');`,
      '  const text = await file.text();',
      `  if (createHash('sha256').update(text).digest('hex') !== ${JSON.stringify(expectedSha256)}) throw new Error('RUNTIME_PACKAGE_CHANGED');`,
      '  return runtimeArtifactPackageSchema.parse(JSON.parse(text));',
      '}',
    ].join('\n')
    const plugin: Bun.BunPlugin = {
      name: 'hbar-compiled-runtime-package-data',
      setup(builder) {
        builder.onLoad({ filter: /[\\/]embedded-runtime-package\.ts$/ }, (args) => {
          if (pathIdentity(resolve(args.path)) !== pathIdentity(loaderPath)) return undefined
          return { contents: loaderContents, loader: 'ts', resolveDir: dirname(loaderPath) }
        })
      },
    }
    completed = { value: await build({ plugin, dataPath, generatedRoot: generated }) }
  } catch (error) {
    // Boolean sentinel preserves throw undefined/null/false/0/'' exactly, as Kernel 8d493541 does.
    failed = true
    failure = error
  }
  try {
    // Check both parent identity and exact owned mkdtemp identity immediately before recursive removal.
    if (
      !isAbsolute(generated) ||
      resolve(generated) !== generated ||
      dirname(generated) !== artifactRoot ||
      !/^compiled-package-[a-zA-Z0-9]+$/.test(basename(generated))
    )
      throw new Error('RUNTIME_PACKAGE_BUILD_CLEANUP_BOUNDARY')
    const currentRoot = await plainDirectory(artifactRoot)
    const currentGenerated = await plainDirectory(generated)
    if (
      currentRoot.dev !== rootIdentity.dev ||
      currentRoot.ino !== rootIdentity.ino ||
      currentGenerated.dev !== generatedIdentity.dev ||
      currentGenerated.ino !== generatedIdentity.ino
    )
      throw new Error('RUNTIME_PACKAGE_BUILD_CLEANUP_OWNER_CHANGED')
    // No nested directories, junctions, symlinks or foreign files are owned by this helper.
    for (const name of await readdir(generated)) {
      if (name !== 'runtime-package.json') throw new Error('RUNTIME_PACKAGE_BUILD_CLEANUP_FOREIGN_ENTRY')
      const file = await lstat(dataPath)
      if (!file.isFile() || file.isSymbolicLink() || pathIdentity(await realpath(dataPath)) !== pathIdentity(dataPath))
        throw new Error('RUNTIME_PACKAGE_BUILD_CLEANUP_REPARSE')
    }
    await rm(generated, { recursive: true, force: false })
  } catch (error) {
    if (!failed) throw error
    try {
      // One fixed diagnostic; never print paths, arbitrary thrown payloads, package contents or credentials.
      console.error('[hbar build] RUNTIME_PACKAGE_BUILD_SECONDARY_CLEANUP_FAILED')
    } catch {
      // A diagnostic sink cannot replace the build's primary failure.
    }
  }
  if (failed) throw failure
  // build has fulfilled on this branch, including T=undefined; avoid rejecting valid falsey results.
  if (!completed) throw new Error('RUNTIME_PACKAGE_BUILD_RESULT_MISSING')
  return completed.value
}

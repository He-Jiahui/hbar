import { watch, type FSWatcher } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const backendPackages = new Set([
  'commands',
  'contracts',
  'kernel',
  'metrics',
  'plugin-sdk',
  'provider-catalog',
  'runtime',
  'runtime-native',
  'schema-core',
  'settings-core',
  'storage',
  'terminal',
  'usage',
])
export async function runtimeSourceRoots(project: string): Promise<string[]> {
  const packages = await readdir(resolve(project, 'packages'), { withFileTypes: true })
  return [
    resolve(project, 'apps/host/src'),
    resolve(project, 'plugins'),
    ...packages
      .filter((entry) => entry.isDirectory() && backendPackages.has(entry.name))
      .map((entry) =>
        entry.name === 'runtime-native'
          ? resolve(project, 'packages', entry.name)
          : resolve(project, 'packages', entry.name, 'src'),
      ),
  ]
}
export function isRuntimeSourceChange(filename: string): boolean {
  const parts = filename.replaceAll('\\', '/').split('/')
  return (
    !parts.some((part) => ['node_modules', 'dist', 'target', 'artifacts', '.dev', '.git'].includes(part)) &&
    (/\.(?:[cm]?tsx?|json|sql|rs|c|cpp|h|hpp|toml|node|dll|so|dylib|wasm)$/.test(filename) ||
      parts.at(-1) === 'Cargo.lock')
  )
}
/** One debounced batch and one merged follow-up. Retain actual paths, including rename/delete notifications. */
export function createRuntimeSourceReload(options: {
  readonly reload: (paths: readonly string[]) => Promise<void>
  readonly onError: (error: unknown) => void
  readonly debounceMs?: number
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false,
    disposed = false
  const paths = new Set<string>()
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      run().catch(options.onError)
    }, options.debounceMs ?? 400)
  }
  const run = async () => {
    if (disposed || running || !paths.size) return
    running = true
    const batch = [...paths]
    paths.clear()
    try {
      await options.reload(batch)
    } catch (error) {
      options.onError(error)
    } finally {
      running = false
      if (paths.size && !disposed) schedule()
    }
  }
  return {
    changed(path = '') {
      if (disposed) return
      if (paths.size >= 4_096) {
        paths.clear()
        paths.add('')
      }
      if (!paths.has('') || !path) paths.add(path)
      if (!running) schedule()
    },
    dispose() {
      disposed = true
      paths.clear()
      clearTimeout(timer)
    },
  }
}
export function watchRuntimeSources(
  roots: readonly string[],
  changed: (path: string) => void,
  onError: (error: unknown) => void,
): () => void {
  const watchers: FSWatcher[] = []
  try {
    for (const root of roots) {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (filename && isRuntimeSourceChange(filename.toString())) changed(resolve(root, filename.toString()))
      })
      watcher.on('error', onError)
      watchers.push(watcher)
    }
  } catch (error) {
    for (const watcher of watchers) watcher.close()
    throw error
  }
  return () => {
    for (const watcher of watchers) watcher.close()
  }
}

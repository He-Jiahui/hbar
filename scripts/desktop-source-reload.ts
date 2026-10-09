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
  'schema-core',
  'settings-core',
  'storage',
  'terminal',
  'usage',
])

export async function desktopHostSourceRoots(project: string): Promise<string[]> {
  const packages = await readdir(resolve(project, 'packages'), { withFileTypes: true })
  return [
    resolve(project, 'apps/host/src'),
    resolve(project, 'plugins'),
    ...packages
      .filter((entry) => entry.isDirectory() && backendPackages.has(entry.name))
      .map((entry) => resolve(project, 'packages', entry.name, 'src')),
  ]
}

export function isHostSourceChange(filename: string): boolean {
  const parts = filename.replaceAll('\\', '/').split('/')
  return (
    !parts.some((part) => ['node_modules', 'dist', 'target', 'artifacts', '.dev', '.git'].includes(part)) &&
    /\.(?:[cm]?tsx?|json|sql)$/.test(filename)
  )
}

/** One debounced reload plus one coalesced follow-up, with explicit disposal. */
export function createDesktopSourceReload(options: {
  readonly reload: () => Promise<void>
  readonly onError: (error: unknown) => void
  readonly debounceMs?: number
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let dirty = false
  let disposed = false
  const debounceMs = options.debounceMs ?? 400
  const run = async () => {
    if (disposed || running || !dirty) return
    running = true
    dirty = false
    try {
      await options.reload()
    } catch (error) {
      options.onError(error)
    } finally {
      running = false
      if (dirty && !disposed) schedule()
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      run().catch(options.onError)
    }, debounceMs)
  }
  return {
    changed() {
      if (disposed) return
      dirty = true
      if (!running) schedule()
    },
    dispose() {
      disposed = true
      dirty = false
      clearTimeout(timer)
    },
  }
}

export function watchDesktopHostSources(
  roots: readonly string[],
  changed: () => void,
  onError: (error: unknown) => void,
): () => void {
  const watchers: FSWatcher[] = []
  try {
    for (const root of roots) {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (filename && isHostSourceChange(filename)) changed()
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

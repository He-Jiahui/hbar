import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

export const pathPointerSchema = z.object({
  version: z.literal(1),
  dataRoot: z.string().min(1),
  cacheRoot: z.string().min(1),
})

export type PathPointer = z.infer<typeof pathPointerSchema>

export interface PathLayout {
  dataRoot: string
  cacheRoot: string
  pointerFile: string
  settings: string
  sessions: string
  skills: string
  plugins: string
  diagnostics: string
  databases: string
  artifacts: string
  database: string
  pluginLock: string
  settingsFile: string
  keybindingsFile: string
  hostLock: string
  connectionFile: string
  cache: {
    models: string
    pluginBuild: string
    pluginExtract: string
    markdown: string
    mermaid: string
    attachments: string
    tmp: string
    locks: string
  }
}

export interface PathLayoutOptions {
  dataRoot?: string | undefined
  cacheRoot?: string | undefined
  /** Compatibility alias for the former single-directory layout. */
  home?: string | undefined
  pointerFile?: string | undefined
  readPointer?: boolean | undefined
}

function systemBase() {
  if (platform() === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'hbar')
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'hbar')
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'hbar')
}

export function defaultPathPointerFile() {
  return join(systemBase(), 'paths.json')
}

export function createPathLayout(dataRoot: string, cacheRoot: string, pointerFile = defaultPathPointerFile()): PathLayout {
  const data = resolve(dataRoot)
  const cacheRootResolved = resolve(cacheRoot)
  const settings = join(data, 'settings')
  const plugins = join(data, 'plugins')
  const cache = {
    models: join(cacheRootResolved, 'models'),
    pluginBuild: join(cacheRootResolved, 'plugin-build'),
    pluginExtract: join(cacheRootResolved, 'plugin-extract'),
    markdown: join(cacheRootResolved, 'markdown'),
    mermaid: join(cacheRootResolved, 'mermaid'),
    attachments: join(cacheRootResolved, 'attachments'),
    tmp: join(cacheRootResolved, 'tmp'),
    locks: join(cacheRootResolved, 'locks'),
  }
  return {
    dataRoot: data,
    cacheRoot: cacheRootResolved,
    pointerFile: resolve(pointerFile),
    settings,
    sessions: join(data, 'sessions'),
    skills: join(data, 'skills'),
    plugins,
    diagnostics: join(data, 'diagnostics'),
    databases: join(data, 'databases'),
    artifacts: join(data, 'artifacts'),
    database: join(data, 'databases', 'hbar.sqlite'),
    pluginLock: join(plugins, 'lock.json'),
    settingsFile: join(settings, 'settings.json'),
    keybindingsFile: join(settings, 'keybindings.json'),
    hostLock: join(settings, 'host.lock'),
    connectionFile: join(settings, 'connection.json'),
    cache,
  }
}

export async function resolvePathLayout(options: PathLayoutOptions = {}): Promise<PathLayout> {
  const pointerFile = resolve(options.pointerFile ?? defaultPathPointerFile())
  let pointer: PathPointer | undefined
  if (options.readPointer !== false && !options.home && !options.dataRoot && !options.cacheRoot) {
    try {
      pointer = pathPointerSchema.parse(JSON.parse(await readFile(pointerFile, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const base = systemBase()
  const compatibilityRoot = options.home ? resolve(options.home) : undefined
  return createPathLayout(
    options.dataRoot ?? compatibilityRoot ?? pointer?.dataRoot ?? join(base, 'data'),
    options.cacheRoot ?? (compatibilityRoot ? join(compatibilityRoot, 'cache') : pointer?.cacheRoot) ?? join(base, 'cache'),
    pointerFile,
  )
}

export async function ensurePathLayout(layout: PathLayout): Promise<void> {
  await Promise.all([
    layout.settings,
    join(layout.settings, 'profiles'),
    layout.sessions,
    join(layout.skills, 'global'),
    join(layout.plugins, 'global'),
    join(layout.plugins, 'projects'),
    layout.diagnostics,
    layout.databases,
    layout.artifacts,
    ...Object.values(layout.cache),
  ].map((path) => mkdir(path, { recursive: true })))
  for (const [path, initial] of [
    [layout.settingsFile, { version: 1 }],
    [layout.keybindingsFile, { version: 1, bindings: {} }],
    [layout.pluginLock, { version: 1, plugins: {} }],
  ] as const) {
    try {
      await access(path, constants.F_OK)
    } catch {
      await writeFile(path, `${JSON.stringify(initial, null, 2)}\n`, { flag: 'wx', mode: 0o600 }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      })
    }
  }
}

export async function validatePathRoots(dataRoot: string, cacheRoot: string, pointerFile?: string) {
  const layout = createPathLayout(dataRoot, cacheRoot, pointerFile)
  await ensurePathLayout(layout)
  await Promise.all([layout.dataRoot, layout.cacheRoot].map((path) => access(path, constants.R_OK | constants.W_OK)))
  return layout
}

export async function writePathPointer(layout: PathLayout): Promise<void> {
  await mkdir(dirname(layout.pointerFile), { recursive: true })
  const temporary = `${layout.pointerFile}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(
    temporary,
    `${JSON.stringify({ version: 1, dataRoot: layout.dataRoot, cacheRoot: layout.cacheRoot }, null, 2)}\n`,
    { mode: 0o600 },
  )
  try {
    await rename(temporary, layout.pointerFile)
  } finally {
    await rm(temporary, { force: true })
  }
}

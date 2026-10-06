import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathPointerSchema, type PathPointer } from './path-pointer.ts'
import { migrateStoredPaths } from './storage-locations.ts'
export { pathPointerSchema, type PathPointer } from './path-pointer.ts'

export interface PathLayout {
  dataRoot: string
  /** Stable credential namespace across directory relocation. */
  identityRoot: string
  cacheRoot: string
  pointerFile: string
  settings: string
  sessions: string
  skills: string
  globalSkills: string
  plugins: string
  diagnostics: string
  databases: string
  artifacts: string
  /** Host-managed Git worktrees, kept outside project checkouts. */
  worktrees: string
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
  /** Managed Desktop restarts follow saved locations over launch-time defaults. */
  preferPointer?: boolean | undefined
  settingsRoot?: string | undefined
  sessionsRoot?: string | undefined
  skillsRoot?: string | undefined
  identityRoot?: string | undefined
}

function systemBase() {
  if (platform() === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'hbar')
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'hbar')
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'hbar')
}

export function defaultPathPointerFile() {
  return join(systemBase(), 'paths.json')
}

export function createPathLayout(
  dataRoot: string,
  cacheRoot: string,
  pointerFile = defaultPathPointerFile(),
  overrides: Pick<PathLayoutOptions, 'settingsRoot' | 'sessionsRoot' | 'skillsRoot' | 'identityRoot'> = {},
): PathLayout {
  const data = resolve(dataRoot)
  const cacheRootResolved = resolve(cacheRoot)
  const settings = resolve(overrides.settingsRoot ?? join(data, 'settings'))
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
    identityRoot: resolve(overrides.identityRoot ?? data),
    cacheRoot: cacheRootResolved,
    pointerFile: resolve(pointerFile),
    settings,
    sessions: resolve(overrides.sessionsRoot ?? join(data, 'sessions')),
    skills: join(data, 'skills'),
    globalSkills: resolve(overrides.skillsRoot ?? join(data, 'skills', 'global')),
    plugins,
    diagnostics: join(data, 'diagnostics'),
    databases: join(data, 'databases'),
    artifacts: join(data, 'artifacts'),
    worktrees: join(data, 'worktrees'),
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
  if (
    options.readPointer !== false &&
    (options.preferPointer ||
      options.pointerFile !== undefined ||
      (!options.home && !options.dataRoot && !options.cacheRoot))
  ) {
    try {
      pointer = pathPointerSchema.parse(JSON.parse(await readFile(pointerFile, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const base = systemBase()
  const compatibilityRoot = options.home ? resolve(options.home) : undefined
  const explicitData = options.dataRoot ?? compatibilityRoot
  if (
    !options.preferPointer &&
    pointer &&
    ((explicitData && resolve(explicitData) !== resolve(pointer.dataRoot)) ||
      (options.cacheRoot && resolve(options.cacheRoot) !== resolve(pointer.cacheRoot)))
  )
    pointer = undefined
  if (pointer?.version === 2 && pointer.migration) await migrateStoredPaths(pointerFile, pointer)
  return createPathLayout(
    (options.preferPointer ? pointer?.dataRoot : undefined) ??
      options.dataRoot ??
      compatibilityRoot ??
      pointer?.dataRoot ??
      join(base, 'data'),
    (options.preferPointer ? pointer?.cacheRoot : undefined) ??
      options.cacheRoot ??
      pointer?.cacheRoot ??
      (compatibilityRoot ? join(compatibilityRoot, 'cache') : join(base, 'cache')),
    pointerFile,
    {
      identityRoot: pointer?.version === 2 ? pointer.identityRoot : undefined,
      settingsRoot: options.settingsRoot ?? (pointer?.version === 2 ? pointer.settingsRoot : undefined),
      sessionsRoot: options.sessionsRoot ?? (pointer?.version === 2 ? pointer.sessionsRoot : undefined),
      skillsRoot: options.skillsRoot ?? (pointer?.version === 2 ? pointer.skillsRoot : undefined),
    },
  )
}

export async function ensurePathLayout(layout: PathLayout): Promise<void> {
  await Promise.all(
    [
      layout.settings,
      join(layout.settings, 'profiles'),
      layout.sessions,
      layout.globalSkills,
      join(layout.plugins, 'global'),
      join(layout.plugins, 'projects'),
      layout.diagnostics,
      layout.databases,
      layout.artifacts,
      layout.worktrees,
      ...Object.values(layout.cache),
    ].map((path) => mkdir(path, { recursive: true })),
  )
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

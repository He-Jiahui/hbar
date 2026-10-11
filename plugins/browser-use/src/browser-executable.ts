import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { HbarError } from '@hbar/contracts'

type ExecutableProbe = (path: string) => Promise<boolean>

export interface BrowserExecutableResolution {
  bundledPath: string
  platform: NodeJS.Platform
  environment: Readonly<Record<string, string | undefined>>
  exists?: ExecutableProbe
}

async function regularFileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** Resolve only configured, bundled, or standard installed browser files. Never download a browser. */
export async function resolveBrowserExecutable(
  explicitPath: string | undefined,
  options: BrowserExecutableResolution,
): Promise<string | undefined> {
  const exists = options.exists ?? regularFileExists
  if (explicitPath !== undefined) {
    if (!(await exists(explicitPath)))
      throw new HbarError('BROWSER_BACKEND_UNAVAILABLE', 'Configured browser executable is unavailable')
    return explicitPath
  }
  if (await exists(options.bundledPath)) return options.bundledPath
  if (options.platform !== 'win32') return undefined

  const roots = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']
    .map((name) => options.environment[name])
    .filter((root): root is string => Boolean(root && win32.isAbsolute(root)))
  const browsers = [
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ]
  const inspected = new Set<string>()
  for (const browser of browsers)
    for (const root of roots) {
      const candidate = win32.join(root, ...browser)
      const identity = candidate.toLowerCase()
      if (inspected.has(identity)) continue
      inspected.add(identity)
      if (await exists(candidate)) return candidate
    }
  return undefined
}

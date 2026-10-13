import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { lstat, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import {
  createWebBuildProvenance,
  currentWebBuildSettings,
  hashWebBuildFile,
  serializeWebBuildProvenance,
  type WebBuildFileRecord,
  WEB_BUILD_PROVENANCE_FILE,
} from '../../scripts/web-build-provenance.ts'

const configuredWebPort = process.env.HBAR_WEB_PORT
const hostOrigin = process.env.HBAR_HOST_URL ?? `http://127.0.0.1:${process.env.HBAR_E2E_HOST_PORT ?? 4317}`
const previewDist = process.env.HBAR_E2E_PREVIEW_DIST
const devInstanceId = process.env.HBAR_DESKTOP_DEV === '1' ? process.env.HBAR_DEV_INSTANCE_ID : undefined
const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const webSourceRoot = resolve(projectRoot, 'apps/web')

async function forEachBounded<T>(
  values: readonly T[],
  limit: number,
  visit: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++
        const value = values[index]
        if (value === undefined) continue
        await visit(value)
      }
    }),
  )
}

function createAsyncLimiter(limit: number): <T>(operation: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolveWait) => waiting.push(resolveWait))
    else active++
    try {
      return await operation()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

async function workspaceMetadataPaths(): Promise<string[]> {
  const paths = [
    'package.json',
    'bun.lock',
    'tsconfig.json',
    'apps/web/package.json',
    'apps/web/vite.config.ts',
    'scripts/web-build-provenance.ts',
  ]
  let count = 0
  let packageCount = paths.length
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      count++
      if (count > 20_000) throw new Error('Web build provenance metadata scan exceeded its entry limit')
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      if (['.git', 'artifacts', 'build', 'dist', 'node_modules', 'target'].includes(entry.name)) continue
      const nextRelative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const next = resolve(directory, entry.name)
      const packagePath = resolve(next, 'package.json')
      try {
        const info = await lstat(packagePath)
        if (info.isFile() && !info.isSymbolicLink()) {
          packageCount++
          if (packageCount > 12_000) throw new Error('Web build provenance metadata exceeds the file-count limit')
          paths.push(`${nextRelative}/package.json`)
        }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
      await visit(next, nextRelative)
    }
  }
  for (const directory of ['apps', 'packages', 'plugins']) {
    const absolute = resolve(projectRoot, directory)
    try {
      await visit(absolute, directory)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  return [...new Set(paths)].sort()
}

function moduleFilePath(id: string): string | null {
  if (id.startsWith('\0')) return null
  const cleanId = id.split(/[?#]/, 1)[0]
  let candidate: string | undefined
  try {
    candidate = cleanId?.startsWith('file://') ? fileURLToPath(cleanId) : cleanId
  } catch {
    return null
  }
  if (!candidate || !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(candidate)) return null
  return resolve(candidate)
}

function externalPackageName(id: string, path: string | null): string {
  if (path) {
    const normalized = path.replaceAll('\\', '/')
    const parts = normalized.split('/')
    const packageDirectory = parts.lastIndexOf('node_modules')
    if (packageDirectory >= 0) {
      const packageName = parts[packageDirectory + 1]
      if (!packageName) return 'external-file'
      if (packageName.startsWith('@')) {
        const scopedName = parts[packageDirectory + 2]
        return scopedName ? `${packageName}/${scopedName}` : 'external-file'
      }
      return packageName
    }
    return 'external-file'
  }
  const specifier = id.split(/[?#]/, 1)[0]?.replace(/^node:/, '')
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return 'external-file'
  const parts = specifier.split('/')
  if (parts[0]?.startsWith('@')) return parts[1] ? `${parts[0]}/${parts[1]}` : 'external-file'
  return parts[0] ?? 'external-file'
}

function isInside(root: string, path: string): boolean {
  const relativePath = relative(root, path)
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !/^[A-Za-z]:/.test(relativePath)
  )
}

function buildProvenance(project: string): Plugin {
  let inputRecords: WebBuildFileRecord[] = []
  let publicRecords: WebBuildFileRecord[] = []
  const sourcePaths = new Map<string, WebBuildFileRecord>()
  const loadLimit = createAsyncLimiter(8)

  const capturePublicFiles = async (
    directory: string,
    relativeDirectory = '',
    state: { entries: number; totalBytes: number } = { entries: 0, totalBytes: 0 },
  ): Promise<WebBuildFileRecord[]> => {
    const result: WebBuildFileRecord[] = []
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      state.entries++
      if (state.entries > 20_000) throw new Error('Web public assets exceed the directory-entry limit')
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Web public assets cannot contain symlinks: ${relativePath}`)
      if (entry.isDirectory()) result.push(...(await capturePublicFiles(path, relativePath, state)))
      else if (entry.isFile()) {
        const record = await hashWebBuildFile(resolve(webSourceRoot, 'public'), relativePath)
        result.push(record)
        state.totalBytes += record.bytes
        if (result.length > 12_000 || state.totalBytes > 256 * 1024 * 1024)
          throw new Error('Web public assets exceed the provenance limits')
      }
    }
    return result
  }

  return {
    name: 'hbar-build-provenance',
    enforce: 'pre',
    async buildStart() {
      sourcePaths.clear()
      const metadataPaths = await workspaceMetadataPaths()
      inputRecords = []
      await forEachBounded(metadataPaths, 8, async (path) => {
        inputRecords.push(await hashWebBuildFile(project, path))
      })
      const publicRoot = resolve(webSourceRoot, 'public')
      try {
        publicRecords = await capturePublicFiles(publicRoot)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') publicRecords = []
        else throw error
      }
    },
    async load(id) {
      await loadLimit(async () => {
        const path = moduleFilePath(id)
        if (!path || !isInside(project, path)) return
        const local = relative(project, path).replaceAll('\\', '/')
        if (
          local
            .split('/')
            .some((part) => ['.git', 'artifacts', 'build', 'dist', 'node_modules', 'target'].includes(part))
        )
          return
        const record = await hashWebBuildFile(project, local)
        const previous = sourcePaths.get(local)
        if (previous && previous.sha256 !== record.sha256)
          throw new Error(`Web source changed during Vite load: ${local}`)
        sourcePaths.set(local, record)
        if (sourcePaths.size > 12_000)
          throw new Error('Web build provenance source modules exceed the file-count limit')
      })
      return null
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const sourceModules = [...sourcePaths.values()]
        const externalPackages = new Set<string>()
        const bundleFileNames = new Set(Object.keys(bundle))
        let externalModuleCount = 0
        let virtualModuleCount = 0
        let bundledDependencyCount = 0
        for (const id of this.getModuleIds()) {
          if (id.startsWith('\0') || id.startsWith('virtual:') || id.startsWith('vite:')) virtualModuleCount++
          else {
            const path = moduleFilePath(id)
            if (path?.includes(`${sep}node_modules${sep}`)) bundledDependencyCount++
          }
        }
        for (const outputFile of Object.values(bundle)) {
          if (outputFile.type !== 'chunk') continue
          for (const specifier of [...outputFile.imports, ...outputFile.dynamicImports]) {
            if (bundleFileNames.has(specifier)) continue
            externalModuleCount++
            externalPackages.add(externalPackageName(specifier, moduleFilePath(specifier)))
          }
        }
        if (sourceModules.length === 0) throw new Error('Vite did not report workspace source modules for provenance')

        const emittedAssets: WebBuildFileRecord[] = []
        let emittedBytes = 0
        for (const outputFile of Object.values(bundle)) {
          const filePath = outputFile.fileName.replaceAll('\\', '/')
          const contents = outputFile.type === 'chunk' ? outputFile.code : outputFile.source
          const bytes = typeof contents === 'string' ? Buffer.from(contents) : Buffer.from(contents)
          if (bytes.byteLength > 32 * 1024 * 1024)
            throw new Error(`Web output asset exceeds the size limit: ${filePath}`)
          emittedBytes += bytes.byteLength
          if (emittedAssets.length >= 12_000 || emittedBytes > 256 * 1024 * 1024)
            throw new Error('Web output assets exceed the provenance limits')
          emittedAssets.push({
            path: filePath,
            bytes: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          })
        }
        for (const publicFile of publicRecords) {
          const assetPath = publicFile.path
          if (emittedAssets.some((asset) => asset.path === assetPath))
            throw new Error(`Web public asset collides with a bundled output: ${assetPath}`)
          emittedAssets.push(publicFile)
        }

        await forEachBounded(sourceModules, 8, (record) => verifyRecord(project, record))
        await forEachBounded(inputRecords, 8, (record) => verifyRecord(project, record))
        await forEachBounded(publicRecords, 8, (record) => verifyRecord(resolve(webSourceRoot, 'public'), record))
        const manifest = createWebBuildProvenance({
          entryPath: 'index.html',
          sourceModules,
          buildInputs: inputRecords,
          emittedAssets,
          buildSettings: currentWebBuildSettings(),
          externalPackages: [...externalPackages],
          externalModuleCount,
          bundledDependencyCount,
          virtualModuleCount,
        })
        this.emitFile({
          type: 'asset',
          fileName: WEB_BUILD_PROVENANCE_FILE,
          source: serializeWebBuildProvenance(manifest),
        })
      },
    },
  }
}

async function verifyRecord(root: string, expected: WebBuildFileRecord): Promise<void> {
  const current = await hashWebBuildFile(root, expected.path)
  if (current.bytes !== expected.bytes || current.sha256 !== expected.sha256)
    throw new Error(`Web build input changed during Vite build: ${expected.path}; rerun bun run build`)
}

const desktopReadiness: Plugin = {
  name: 'hbar-desktop-dev-readiness',
  configureServer(server) {
    if (!devInstanceId) return
    server.middlewares.use((request, response, next) => {
      if (request.url !== '/__hbar_dev_ready') return next()
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-store')
      response.end(JSON.stringify({ instanceId: devInstanceId }))
    })
  },
}
if (previewDist && !/^artifacts\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(previewDist))
  throw new Error('HBAR_E2E_PREVIEW_DIST must name a nested directory under artifacts/')

export default defineConfig({
  clearScreen: false,
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [buildProvenance(projectRoot), react(), desktopReadiness],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: {
    'import.meta.env.HBAR_NATIVE_HOST_ORIGIN': JSON.stringify(process.env.HBAR_DESKTOP_DEV === '1' ? hostOrigin : null),
  },
  build: {
    outDir: previewDist ? fileURLToPath(new URL(`../../${previewDist}`, import.meta.url)) : '../../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: '127.0.0.1',
    port: configuredWebPort === undefined ? 0 : Number(configuredWebPort),
    strictPort: configuredWebPort !== undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**', '**/dist/**', '**/artifacts/**', '**/.dev/**'],
    },
    proxy: {
      '/rpc': { target: hostOrigin, ws: true },
      '/auth': hostOrigin,
      '/api': hostOrigin,
      '/healthz': hostOrigin,
    },
  },
})

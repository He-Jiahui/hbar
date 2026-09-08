import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import type { KernelProfile } from '@hbar/kernel'
import { Kernel } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import { startServer } from './server.ts'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    home: { type: 'string' },
    'data-root': { type: 'string' },
    'cache-root': { type: 'string' },
    host: { type: 'string' },
    port: { type: 'string' },
    workspace: { type: 'string' },
    origin: { type: 'string', multiple: true },
    demo: { type: 'boolean' },
    desktop: { type: 'boolean' },
    cert: { type: 'string' },
    key: { type: 'string' },
    'web-root': { type: 'string' },
    profile: { type: 'string' },
  },
})
const layout = await resolvePathLayout({
  home: values.home ?? process.env.HBAR_HOME,
  dataRoot: values['data-root'] ?? process.env.HBAR_DATA_ROOT,
  cacheRoot: values['cache-root'] ?? process.env.HBAR_CACHE_ROOT,
})
const home = layout.dataRoot
await mkdir(home, { recursive: true })
const lock = layout.hostLock
await mkdir(resolve(lock, '..'), { recursive: true })
try {
  await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 })
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  const previous = JSON.parse(await readFile(lock, 'utf8')) as { pid: number }
  let alive = true
  try {
    process.kill(previous.pid, 0)
  } catch (check) {
    if ((check as NodeJS.ErrnoException).code === 'ESRCH') alive = false
    else throw check
  }
  if (alive) throw new Error(`A host already owns this data directory (PID ${previous.pid})`, { cause: error })
  await rm(lock)
  await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 })
}
let cleanup: (() => Promise<void>) | undefined
let kernel: Kernel | undefined
try {
  const profile = values.profile
    ? ((await import(pathToFileURL(resolve(values.profile)).href)) as { default: KernelProfile }).default
    : undefined
  kernel = await Kernel.create({
    layout,
    ...(values.demo !== undefined ? { demo: values.demo } : {}),
    ...(values.workspace ? { workspace: values.workspace } : {}),
    ...(profile ? { profile } : {}),
  })
  const host = await startServer(kernel, {
    ...(values.host ? { hostname: values.host } : {}),
    ...(values.port ? { port: Number(values.port) } : {}),
    ...(values.origin ? { origins: values.origin } : {}),
    ...(values.cert ? { cert: values.cert } : {}),
    ...(values.key ? { key: values.key } : {}),
    ...((values['web-root'] ?? process.env.HBAR_WEB_ROOT)
      ? { staticRoot: values['web-root'] ?? process.env.HBAR_WEB_ROOT! }
      : {}),
  })
  if (values.desktop) {
    const device = await host.auth.createDevice('hbar desktop')
    await writeFile(
      layout.connectionFile,
      JSON.stringify({
        url: `${values.cert ? 'https' : 'http'}://127.0.0.1:${host.server.port}`,
        token: device.token,
        pid: process.pid,
        instanceId: kernel.instanceId,
      }),
      { mode: 0o600 },
    )
  }
  console.log(`hbar ${host.info().version} | ${home}`)
  for (const address of host.info().addresses) console.log(`  ${address}`)
  console.log(`Pairing code: ${host.pairing.code} (expires in 5 minutes)`)
  cleanup = async () => {
    await host.close()
    await kernel?.close()
    await rm(lock, { force: true })
  }
  let closing = false
  const stop = async () => {
    if (closing) return
    closing = true
    await cleanup?.()
    process.exit(0)
  }
  process.on('SIGINT', () => {
    void stop()
  })
  process.on('SIGTERM', () => {
    void stop()
  })
} catch (error) {
  await kernel?.close()
  await rm(lock, { force: true })
  throw error
}

import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createDesktopSourceReload,
  desktopHostSourceRoots,
  isHostSourceChange,
  watchDesktopHostSources,
} from '../scripts/desktop-source-reload'

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Source reload fixture did not settle')
    await Bun.sleep(10)
  }
}

test('server roots include independently loaded Workers and plugins while client source roots stay with Vite', async () => {
  const roots = await desktopHostSourceRoots(process.cwd())
  expect(roots).toContain(join(process.cwd(), 'packages/storage/src'))
  expect(roots).toContain(join(process.cwd(), 'packages/kernel/src'))
  expect(roots).toContain(join(process.cwd(), 'plugins'))
  expect(roots.some((root) => /app-react|app-runtime|apps[\\/]web/.test(root))).toBe(false)
  expect(isHostSourceChange('src/worker.ts')).toBe(true)
  expect(isHostSourceChange('new-module.ts')).toBe(true)
  for (const path of [
    'node_modules/package/index.ts',
    'artifacts/log.json',
    '.git/config.json',
    'src/file.ts.tmp',
    'dist/generated.js',
  ])
    expect(isHostSourceChange(path)).toBe(false)
})

test('rapid edits coalesce and only one follow-up runs after an in-progress reload', async () => {
  const gate = Promise.withResolvers<void>()
  let calls = 0
  let active = 0
  let peak = 0
  const errors: unknown[] = []
  const controller = createDesktopSourceReload({
    debounceMs: 10,
    onError: (error) => errors.push(error),
    async reload() {
      calls++
      active++
      peak = Math.max(peak, active)
      if (calls === 1) await gate.promise
      active--
    },
  })
  try {
    for (let index = 0; index < 50; index++) controller.changed()
    await until(() => calls === 1)
    for (let index = 0; index < 50; index++) controller.changed()
    gate.resolve()
    await until(() => calls === 2)
    await Bun.sleep(30)
    expect(calls).toBe(2)
    expect(peak).toBe(1)
    expect(errors).toEqual([])
  } finally {
    gate.resolve()
    controller.dispose()
  }
})

test('reload failure is reported and a later edit can retry; disposal cancels queued work', async () => {
  let calls = 0
  const errors: unknown[] = []
  const controller = createDesktopSourceReload({
    debounceMs: 10,
    onError: (error) => errors.push(error),
    reload() {
      calls++
      return calls === 1 ? Promise.reject(new Error('Fixture restart failed')) : Promise.resolve()
    },
  })
  controller.changed()
  await until(() => errors.length === 1)
  controller.changed()
  await until(() => calls === 2)
  controller.changed()
  controller.dispose()
  controller.changed()
  await Bun.sleep(30)
  expect(calls).toBe(2)
  expect(errors[0]).toBeInstanceOf(Error)
})

test('recursive watcher sees a Worker source save and releases its handles on dispose', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-source-watch-')))
  if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-source-watch-'))
    throw new Error('Watcher fixture is outside its owned temporary root')
  let changes = 0
  const errors: unknown[] = []
  const dispose = watchDesktopHostSources(
    [root],
    () => {
      changes++
    },
    (error) => errors.push(error),
  )
  try {
    await writeFile(join(root, 'worker.ts'), 'export const fixture=1\n')
    await until(() => changes > 0)
    dispose()
    await Bun.sleep(20)
    const before = changes
    await writeFile(join(root, 'worker.ts'), 'export const fixture=2\n')
    await Bun.sleep(30)
    expect(changes).toBe(before)
    expect(errors).toEqual([])
  } finally {
    dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('rename and delete retain their actual paths and a pending reload merges the latest changes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-source-watch-')))
  const received: string[][] = []
  const controller = createDesktopSourceReload({ debounceMs: 10, reload: paths => { received.push([...paths]); return Promise.resolve() }, onError: error => { throw error } })
  const changes = new Set<string>()
  const dispose = watchDesktopHostSources([root], path => { changes.add(path); controller.changed(path) }, error => { throw error })
  try {
    const original = join(root, 'original.ts'), next = join(root, 'renamed.ts')
    await writeFile(original, 'export const value = 1')
    await until(() => changes.has(original))
    await rename(original, next)
    await until(() => changes.has(next))
    changes.clear(); await rm(next)
    await until(() => changes.has(next))
    await until(() => received.some(batch => batch.includes(next)))
    expect(received.flat()).toContain(original)
    expect(isHostSourceChange('native/lib.rs')).toBe(true)
  } finally { dispose(); controller.dispose(); await rm(root, { recursive: true, force: true }) }
})

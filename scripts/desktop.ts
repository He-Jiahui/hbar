import { resolve } from 'node:path'
import { runDesktopDev } from './desktop-dev'

const project = resolve(import.meta.dir, '..')
if (Bun.argv[2] === 'build') {
  const node = Bun.which('node')
  if (!node) throw new Error('Desktop builds require Node.js for the Tauri CLI')
  for (const [command, cwd] of [
    [[process.execPath, 'run', 'build'], project],
    [[process.execPath, 'scripts/build-host.ts'], project],
    [
      [node, resolve(project, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', ...Bun.argv.slice(3)],
      resolve(project, 'apps/desktop'),
    ],
  ] as const) {
    const child = Bun.spawn([...command], { cwd, stdio: ['inherit', 'inherit', 'inherit'] })
    if ((await child.exited) !== 0) process.exit(child.exitCode ?? 1)
  }
} else {
  process.exit(await runDesktopDev(Bun.argv.slice(3)))
}

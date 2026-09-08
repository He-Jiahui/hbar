import { resolve } from 'node:path'

for (const command of [
  ['bun', 'run', 'build'],
  ['bun', 'scripts/build-host.ts'],
]) {
  const child = Bun.spawn(command, { stdio: ['inherit', 'inherit', 'inherit'] })
  if ((await child.exited) !== 0) process.exit(child.exitCode ?? 1)
}
const mode = Bun.argv[2] === 'build' ? 'build' : 'dev'
const child = Bun.spawn(
  ['bunx', '--no-install', 'tauri', mode, ...(mode === 'build' ? [] : ['--no-watch']), ...Bun.argv.slice(3)],
  {
    cwd: resolve('apps/desktop'),
    stdio: ['inherit', 'inherit', 'inherit'],
    env: {
      ...process.env,
      ...(mode === 'dev'
        ? {
            HBAR_HOME: process.env.HBAR_HOME ?? resolve('.dev/desktop'),
            HBAR_WORKSPACE: process.cwd(),
            HBAR_DEMO: process.env.HBAR_DEMO ?? '1',
          }
        : {}),
    },
  },
)
process.on('SIGINT', () => child.kill())
process.exit(await child.exited)

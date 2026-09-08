export {}

const host = Bun.spawn(
  [
    process.execPath,
    'apps/host/src/main.ts',
    '--home',
    '.dev/host',
    '--workspace',
    process.cwd(),
    '--origin',
    'http://127.0.0.1:5173',
    '--origin',
    'http://localhost:5173',
    ...(Bun.argv.includes('--demo') ? ['--demo'] : []),
  ],
  { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true },
)
const web = Bun.spawn([process.execPath, 'node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
})
const stop = () => {
  host.kill()
  web.kill()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
await Promise.race([host.exited, web.exited])
stop()

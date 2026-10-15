import { serve } from '../../apps/cli/src/serve'
import { parseCli } from '../../apps/cli/src/args'

// Simulate a terminal signal through fixture IPC, including Windows where Subprocess.kill
// terminates only the wrapper and cannot exercise its registered shutdown handlers.
process.on('message', (message: unknown) => {
  if (message === 'stop-owned-service') process.emit('SIGTERM')
})
process.exitCode = await serve(parseCli(Bun.argv.slice(2)))
process.disconnect?.()

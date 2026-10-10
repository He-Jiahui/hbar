import { runHost } from '../../apps/host/src/main.ts'

await runHost(process.argv.slice(2))

const stopPump = (async () => {
  const reader = Bun.stdin.stream().getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      if (decoder.decode(next.value).includes('hbar-test-stop')) {
        process.emit('SIGTERM')
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
})()
void stopPump.catch(() => {
  process.stderr.write('host-main-diagnostics stop pump failed\n')
  process.exitCode = 1
})

import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const port = createRuntimeProcessTreePort()
const child = Bun.spawn([process.execPath, fileURLToPath(new URL('./runtime-native-tree.ts', import.meta.url))], {
  env: { ...process.env, ...port.environment },
  stdio: ['ignore', 'ignore', 'inherit'],
  windowsHide: true,
  serialization: 'json',
  ipc(value: unknown) {
    const leaf = z.strictObject({ pid: z.number().int().positive() }).parse(value)
    process.send?.({ owner: child.pid, leaf: leaf.pid })
  },
})
const tree = await port.attach(child.pid, AbortSignal.timeout(5_000))
process.on('message', (value: unknown) => {
  if (value === 'launch') child.send('launch')
  if (value === 'close') {
    tree.terminate()
    void tree
      .join(5_000)
      .then(() => {
        tree.close()
        process.exit(0)
      })
      .catch(() => process.exit(77))
  }
})
process.send?.({ ready: true })
setInterval(() => {}, 1000)

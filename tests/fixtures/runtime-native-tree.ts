import { enterRuntimeProcessGroup } from '@hbar/runtime-native'
import { spawn } from 'node:child_process'

enterRuntimeProcessGroup()
process.on('message', (message: unknown) => {
  if (message !== 'launch') return
  const leaf = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
    detached: process.platform === 'win32',
  })
  leaf.on('error', () => process.exit(77))
  leaf.unref()
  process.send?.({ pid: leaf.pid })
})
setInterval(() => {}, 1000)

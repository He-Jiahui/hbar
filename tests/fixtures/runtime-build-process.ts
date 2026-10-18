import { enterRuntimeProcessGroup } from '@hbar/runtime-native'
import { rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
enterRuntimeProcessGroup()
async function mark(path: string): Promise<void> {
  await writeFile(path + '.pending', 'dispatched')
  await rename(path + '.pending', path)
}
const mode = Bun.argv[2]
if (!mode || mode === 'build') {
  const { runRuntimeBuildProcess } = await import('@hbar/runtime/build-process')
  process.exitCode = await runRuntimeBuildProcess()
} else {
  // No compiler runs until the same parent-owned EOF barrier arrives.
  const request = await Bun.stdin.text()
  if (mode === 'malformed') await Bun.write(Bun.stdout, '{"ok":true,"artifact":{}}')
  else if (mode === 'overflow') await Bun.write(Bun.stdout, 'x'.repeat(8_388_609))
  else if (mode === 'load-failure') throw new Error('Owned builder load failure')
  else if (mode === 'abort-after-dispatch') {
    const marker = Bun.argv[3]
    if (!marker) throw new Error('Owned marker required')
    await mark(marker)
    // A real pending child, stopped only by the adapter/outer owner after controlled cancellation.
    await Bun.sleep(120_000)
  } else if (mode === 'neighbors' || mode === 'stderr-success') {
    const { unit } = z
      .object({ unit: z.object({ descriptor: z.object({ id: z.string() }) }) })
      .parse(JSON.parse(request))
    if (mode === 'neighbors' && unit.descriptor.id === 'cancelled') {
      const marker = Bun.argv[3]
      if (!marker) throw new Error('Owned marker required')
      await mark(marker)
      await Bun.sleep(120_000)
    } else {
      const { runRuntimeBuildProcess } = await import('@hbar/runtime/build-process')
      process.exitCode = await runRuntimeBuildProcess(new Blob([request]).stream())
      if (mode === 'stderr-success') await Bun.write(Bun.stderr, 'Owned diagnostic failure')
    }
  } else throw new Error('Unsupported owned fixture mode')
}

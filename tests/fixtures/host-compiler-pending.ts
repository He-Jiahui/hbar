import { enterRuntimeProcessGroup } from '@hbar/runtime-native'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

enterRuntimeProcessGroup()
const root = Bun.argv[2]
if (!root) throw new Error('Owned dispatch marker directory required')
const request: unknown = JSON.parse(await Bun.stdin.text())
const { unit } = z
  .object({ unit: z.object({ descriptor: z.object({ id: z.string().regex(/^[a-z.-]+$/) }) }) })
  .parse(request)
await writeFile(join(root, `dispatched-${unit.descriptor.id}`), String(process.pid))
await Bun.sleep(120_000)

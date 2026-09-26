import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { resolvePathLayout } from '@hbar/storage'
import { decisionCheckpointSchema } from '@hbar/contracts/decision'
import { setupLaya } from '@hbar/decision-laya'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'runtime-directory': { type: 'string' },
    python: { type: 'string' },
    'torch-platform': { type: 'string', default: 'cpu' },
    'torch-wheel': { type: 'string' },
    checkpoints: { type: 'string', default: 'multilingual' },
  },
})
const platform = values['torch-platform']
if (platform !== 'cpu' && platform !== 'cu128' && platform !== 'pypi')
  throw new Error('torch-platform must be cpu, cu128 or pypi')
const layout = await resolvePathLayout()
const controller = new AbortController()
const cancel = () => controller.abort(new Error('Laya setup cancelled'))
process.once('SIGINT', cancel)
try {
  await setupLaya(
    {
      runtimeDirectory: values['runtime-directory'] ?? join(layout.dataRoot, 'runtimes', 'laya'),
      ...(values.python ? { python: values.python } : {}),
      torchPlatform: platform,
      ...(values['torch-wheel'] ? { torchWheel: values['torch-wheel'] } : {}),
      checkpoints: (values.checkpoints ?? 'multilingual')
        .split(',')
        .map((value) => decisionCheckpointSchema.parse(value)),
    },
    controller.signal,
  )
} finally {
  process.removeListener('SIGINT', cancel)
}

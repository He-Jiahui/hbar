import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'
import { runtimeUnitDescriptorSchema } from '@hbar/contracts/runtime'
import { RuntimeArtifactStore } from './artifacts'
import { runtimeDomainError } from './errors'

const input = z.strictObject({
  root: z.string().max(4_000), sourceRoot: z.string().max(4_000),
  unit: z.strictObject({ descriptor: runtimeUnitDescriptorSchema, entrypoint: z.string().max(4_000),
    resources: z.array(z.string().max(4_000)).max(512).optional(), external: z.array(z.string().max(512)).max(512).optional(),
    workers: z.array(z.string().max(4_000)).max(16).optional(),
    modules: z.array(z.strictObject({ name: z.string().max(256), path: z.string().max(4_000) })).max(16).optional(),
    sourceRoots: z.array(z.string().max(4_000)).max(8).optional(), define: z.record(z.string().max(512), z.string().max(4_000)).optional(),
  }),
}).parse(workerData)
try {
  const unit = input.unit
  const artifact = await new RuntimeArtifactStore(input.root, input.sourceRoot).build({ descriptor: unit.descriptor, entrypoint: unit.entrypoint,
    ...(unit.resources ? { resources: unit.resources } : {}), ...(unit.external ? { external: unit.external } : {}),
    ...(unit.workers ? { workers: unit.workers } : {}), ...(unit.modules ? { modules: unit.modules } : {}),
    ...(unit.sourceRoots ? { sourceRoots: unit.sourceRoots } : {}), ...(unit.define ? { define: unit.define } : {}),
  })
  parentPort?.postMessage({ ok: true, artifact })
} catch (error) {
  parentPort?.postMessage({ ok: false, reasonCode: runtimeDomainError(error)?.code ?? 'RUNTIME_BUILD_FAILED' })
} finally { parentPort?.close() }

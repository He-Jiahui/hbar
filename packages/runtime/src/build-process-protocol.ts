import { z } from 'zod'
import { runtimeUnitDescriptorSchema } from '@hbar/contracts/runtime'
import { runtimeArtifactSchema } from './artifacts'
import { HbarError } from '@hbar/contracts/errors'

export const BUILD_REQUEST_MAX_BYTES = 131_072
export const BUILD_RESULT_MAX_BYTES = 8_388_608
export const BUILD_ERROR_MAX_BYTES = 65_536
export const buildProcessRequestSchema = z.strictObject({
  root: z.string().min(1).max(4_000),
  sourceRoot: z.string().min(1).max(4_000),
  unit: z.strictObject({
    descriptor: runtimeUnitDescriptorSchema,
    entrypoint: z.string().min(1).max(4_000),
    resources: z.array(z.string().max(4_000)).max(512).optional(),
    external: z.array(z.string().max(512)).max(512).optional(),
    workers: z.array(z.string().max(4_000)).max(16).optional(),
    modules: z
      .array(z.strictObject({ name: z.string().max(256), path: z.string().max(4_000) }))
      .max(16)
      .optional(),
    sourceRoots: z.array(z.string().max(4_000)).max(8).optional(),
    define: z.record(z.string().max(512), z.string().max(4_000)).optional(),
  }),
})
export const buildProcessResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), artifact: runtimeArtifactSchema }),
  z.strictObject({ ok: z.literal(false), reasonCode: z.string().regex(/^[A-Z][A-Z0-9_.-]{0,127}$/) }),
])
export async function readBuildProcessText(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) throw new HbarError('RUNTIME_BUILD_INVALID', 'Local builder exceeded transport capacity')
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } finally {
    reader.releaseLock()
  }
}

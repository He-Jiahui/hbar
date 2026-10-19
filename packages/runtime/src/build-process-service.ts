import { HbarError } from '@hbar/contracts/errors'
import { RuntimeArtifactStore } from './artifacts'
import { runtimeDomainError } from './errors'
import {
  BUILD_REQUEST_MAX_BYTES,
  BUILD_RESULT_MAX_BYTES,
  buildProcessRequestSchema,
  readBuildProcessText,
} from './build-process-protocol'

/** Composition must establish native process ownership before sending stdin EOF. */
export async function runRuntimeBuildProcess(
  inputStream: ReadableStream<Uint8Array> = Bun.stdin.stream(),
): Promise<number> {
  try {
    const raw: unknown = JSON.parse(await readBuildProcessText(inputStream, BUILD_REQUEST_MAX_BYTES))
    const input = buildProcessRequestSchema.parse(raw)
    const unit = input.unit
    const artifact = await new RuntimeArtifactStore(input.root, input.sourceRoot).build({
      descriptor: unit.descriptor,
      entrypoint: unit.entrypoint,
      ...(unit.resources ? { resources: unit.resources } : {}),
      ...(unit.external ? { external: unit.external } : {}),
      ...(unit.workers ? { workers: unit.workers } : {}),
      ...(unit.modules ? { modules: unit.modules } : {}),
      ...(unit.sourceRoots ? { sourceRoots: unit.sourceRoots } : {}),
      ...(unit.define ? { define: unit.define } : {}),
    })
    const response = JSON.stringify({ ok: true, artifact })
    if (Buffer.byteLength(response) > BUILD_RESULT_MAX_BYTES)
      throw new HbarError('RUNTIME_BUILD_INVALID', 'Local builder exceeded descriptor capacity')
    await Bun.write(Bun.stdout, response)
    return 0
  } catch (error) {
    // Same safe domain code as the Worker; compiler/source messages stay private.
    const reasonCode = runtimeDomainError(error)?.code ?? 'RUNTIME_BUILD_FAILED'
    await Bun.write(Bun.stdout, JSON.stringify({ ok: false, reasonCode }))
    return 1
  }
}

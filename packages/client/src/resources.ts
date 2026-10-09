import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { RESOURCE_MEDIA_LIMIT } from '@hbar/contracts/resources'
import { resourceCommands, resourceReadInputSchema, type ResourceReadInput } from '@hbar/contracts/commands/resources'
import type { ClientTransport } from './transport'

export function createResourceCommandClient(client: ClientTransport) {
  return createCommandClient(resourceCommands, {
    execute(commandId, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: 1,
        input,
      })
    },
  })
}

export async function readResourceMedia(
  baseUrl: string,
  token: string | undefined,
  value: ResourceReadInput,
  signal: AbortSignal,
): Promise<Blob> {
  const input = resourceReadInputSchema.parse(value)
  const response = await fetch(new URL('/api/resource-media', baseUrl), {
    method: 'POST',
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  })
  if (!response.ok || !response.body) throw new HbarError('READ_FAILED', 'Resource could not be read')
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!mime.startsWith('image/')) {
    await response.body.cancel()
    throw new HbarError('CONTENT_MISMATCH', 'Resource is not an image')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > RESOURCE_MEDIA_LIMIT) throw new HbarError('TOO_LARGE', 'Image exceeds the preview limit')
      chunks.push(new Uint8Array(next.value))
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  signal.throwIfAborted()
  return new Blob(chunks, { type: mime })
}

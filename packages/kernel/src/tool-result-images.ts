import { HbarError, MAX_TOOL_RESULT_IMAGES, type ArtifactRef } from '@hbar/contracts'
import type { ToolResult } from '@hbar/plugin-sdk'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const extensions = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

/** Sequential artifact writes keep tool image capture bounded and use the normal Host validation port. */
export async function persistToolResultImages(
  name: string,
  result: ToolResult,
  upload: (name: string, mime: string, bytes: Uint8Array) => Promise<ArtifactRef>,
  signal: AbortSignal,
): Promise<ArtifactRef[]> {
  const images = result.content?.filter((block) => block.type === 'image') ?? []
  if (!images.length) return []
  if (images.length > MAX_TOOL_RESULT_IMAGES)
    throw new HbarError('IMAGE_LIMIT', 'Tool output exceeds the 12-image limit')
  const artifacts: ArtifactRef[] = []
  for (const [index, image] of images.entries()) {
    signal.throwIfAborted()
    const mime = image.mimeType.trim().toLowerCase()
    const extension = extensions.get(mime)
    if (!extension) throw new HbarError('UNSUPPORTED_IMAGE', 'Tool output has an unsupported image type')
    if (image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
      throw new HbarError('FILE_LIMIT', 'Tool output image exceeds the 10 MiB limit')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))
      throw new HbarError('INVALID_IMAGE', 'Tool output image is not valid base64')
    const bytes = Buffer.from(image.data, 'base64')
    if (bytes.toString('base64').replace(/=+$/, '') !== image.data.replace(/=+$/, ''))
      throw new HbarError('INVALID_IMAGE', 'Tool output image is not valid base64')
    artifacts.push(await upload(`${name}-${index + 1}.${extension}`, mime, bytes))
  }
  signal.throwIfAborted()
  return artifacts
}

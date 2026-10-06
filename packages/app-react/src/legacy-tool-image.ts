import type { ContentBlock } from '@hbar/contracts'

const imageMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_BASE64_CHARACTERS = Math.ceil((10 * 1024 * 1024) / 3) * 4

/** Old screenshot tools stored their image in details before durable image references existed. */
export function legacyToolImageSource(result: Extract<ContentBlock, { type: 'tool_result' }>): string | null {
  const details = result.details
  if (!details || typeof details !== 'object' || !('data' in details) || !('mime' in details)) return null
  const { data, mime } = details
  if (typeof data !== 'string' || typeof mime !== 'string') return null
  const normalized = mime.trim().toLowerCase()
  if (
    !imageMimes.has(normalized) ||
    !data.length ||
    data.length > MAX_BASE64_CHARACTERS ||
    data.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    return null
  return `data:${normalized};base64,${data}`
}

/** A short, content-grown collection; additional occurrences retain their original links. */
export const MAX_MESSAGE_IMAGE_PREVIEWS = 12
const extensions = /\.(?:png|jpe?g|webp|gif|apng|avif|svg|bmp|ico)$/i

export function remoteImageSource(value: string | undefined): string | null {
  if (!value || value.length > 16_384) return null
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

/** Explicit Markdown images may use extensionless URLs; ordinary links need evidence of an image resource. */
export function imageLinkSource(value: string | undefined): string | null {
  const source = remoteImageSource(value)
  if (!source) return null
  const url = new URL(source)
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  return extensions.test(path) ? source : null
}

export function imageSourceName(source: string, alt?: string): string {
  if (alt?.trim()) return alt
  const url = new URL(source)
  try {
    return decodeURIComponent(url.pathname.split('/').at(-1) ?? '') || url.hostname
  } catch {
    return url.hostname
  }
}

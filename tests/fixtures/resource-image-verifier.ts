import { acquireResourceImage } from '../../apps/web/src/resource-image'
export async function decodeResourceImage({ base64, mime }: { base64: string; mime: string }) {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  const lease = await acquireResourceImage(new Blob([bytes], { type: mime }), new AbortController().signal)
  try {
    const image = new Image()
    image.src = lease.url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    lease.release()
  }
}

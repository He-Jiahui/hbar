import { HbarError } from '@hbar/contracts'
import { IMAGE_PREFLIGHT_LIMITS, preflightImage } from './image-preflight'

// Header admission supplements the cancellable decoder; encoded metadata is
// not a guarantee of decoder memory use. Formats follow BITMAPINFOHEADER and
// https://aomediacodec.github.io/av1-avif/v1.1.0.html#image-spatial-extents-property
function invalid(): never {
  throw new HbarError('INVALID_IMAGE', 'Invalid resource image metadata')
}
function size(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) invalid()
  if (
    width > IMAGE_PREFLIGHT_LIMITS.side ||
    height > IMAGE_PREFLIGHT_LIMITS.side ||
    width * height > IMAGE_PREFLIGHT_LIMITS.pixels
  )
    throw new HbarError('TOO_LARGE', 'Resource image exceeds dimension limits')
}

/** Validate dimensions before starting a raster decoder or allocating a preview URL. */
export function preflightResourceImage(bytes: Uint8Array, mime: string): void {
  if (!bytes.length) invalid()
  if (bytes.length > IMAGE_PREFLIGHT_LIMITS.bytes) throw new HbarError('TOO_LARGE', 'Resource image is too large')
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/gif') {
    preflightImage(bytes, mime)
    return
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const need = (offset: number, count: number, end = bytes.length) => {
    if (offset < 0 || count < 0 || offset > end || count > end - offset) invalid()
  }
  const dib = (offset: number, end: number, icon = false) => {
    need(offset, 12, end)
    const header = view.getUint32(offset, true)
    if (header === 12) size(view.getUint16(offset + 4, true), view.getUint16(offset + 6, true) / (icon ? 2 : 1))
    else {
      if (header < 40) invalid()
      need(offset, header, end)
      size(view.getInt32(offset + 4, true), Math.abs(view.getInt32(offset + 8, true)) / (icon ? 2 : 1))
    }
  }
  if (mime === 'image/bmp') {
    need(0, 26)
    if (bytes[0] !== 66 || bytes[1] !== 77) invalid()
    dib(14, bytes.length)
    return
  }
  if (mime === 'image/x-icon') {
    need(0, 6)
    if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) invalid()
    const count = view.getUint16(4, true)
    if (!count) invalid()
    if (count > IMAGE_PREFLIGHT_LIMITS.frames) throw new HbarError('TOO_LARGE', 'Icon contains too many images')
    need(6, count * 16)
    for (let index = 0; index < count; index++) {
      const at = 6 + index * 16
      const width = view.getUint8(at) || 256
      const height = view.getUint8(at + 1) || 256
      const length = view.getUint32(at + 8, true)
      const offset = view.getUint32(at + 12, true)
      if (offset < 6 + count * 16 || !length) invalid()
      need(offset, length)
      if (bytes[offset] === 137) {
        const image = preflightImage(bytes.subarray(offset, offset + length), 'image/png')
        if (image.width !== width || image.height !== height) invalid()
      } else dib(offset, offset + length, true)
      size(width, height)
    }
    return
  }
  if (mime === 'image/avif') {
    let structures = 0
    let dimensions = 0
    let branded = false
    const text = (offset: number, count: number) => String.fromCharCode(...bytes.subarray(offset, offset + count))
    const boxes = (start: number, end: number, depth: number) => {
      if (depth > 8) invalid()
      for (let at = start; at < end;) {
        need(at, 8, end)
        if (++structures > IMAGE_PREFLIGHT_LIMITS.structures) throw new HbarError('TOO_LARGE', 'Too many image boxes')
        let length = view.getUint32(at)
        let header = 8
        if (length === 1) {
          need(at, 16, end)
          const large = view.getBigUint64(at + 8)
          if (large > BigInt(end - at)) invalid()
          length = Number(large)
          header = 16
        } else if (length === 0) length = end - at
        if (length < header) invalid()
        need(at, length, end)
        const type = text(at + 4, 4)
        const data = at + header
        const limit = at + length
        if (type === 'ftyp' && depth === 0) {
          need(data, 8, limit)
          for (let brand = data; brand + 4 <= limit; brand += 4) {
            if (brand !== data + 4 && ['avif', 'avis'].includes(text(brand, 4))) branded = true
          }
        } else if (type === 'ispe') {
          need(data, 12, limit)
          size(view.getUint32(data + 4), view.getUint32(data + 8))
          dimensions++
        } else if (type === 'meta') {
          need(data, 4, limit)
          boxes(data + 4, limit, depth + 1)
        } else if (type === 'iprp' || type === 'ipco') boxes(data, limit, depth + 1)
        at = limit
      }
    }
    boxes(0, bytes.length, 0)
    if (!branded || !dimensions) invalid()
    return
  }
  throw new HbarError('UNSUPPORTED_IMAGE', 'Unsupported resource image format')
}

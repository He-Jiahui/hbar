/** Decode admission, not a pixel decoder or a guarantee of decoder memory use.
 * Sources: https://www.w3.org/TR/png/ ; https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 * https://developers.google.com/speed/webp/docs/riff_container
 * https://www.w3.org/Graphics/JPEG/itu-t81.pdf (Annex B).
 */
export const IMAGE_PREFLIGHT_LIMITS = Object.freeze({
  bytes: 10 * 1024 * 1024,
  side: 16_384,
  pixels: 32_000_000,
  frames: 256,
  framePixels: 64_000_000,
  structures: 65_536,
})

export type ImagePreflightMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
export type ImagePreflightCode = 'INVALID_IMAGE' | 'TOO_LARGE' | 'UNSUPPORTED_IMAGE' | 'CONTENT_MISMATCH'
export interface ImagePreflight {
  readonly mime: ImagePreflightMime
  /** Encoded canvas dimensions; a decoder may rotate them through EXIF orientation. */
  readonly width: number
  readonly height: number
  readonly animated: boolean
  /** APNG counts animation frames, excluding a separate default poster. */
  readonly frameCount: number
}
export class ImagePreflightError extends Error {
  constructor(readonly code: ImagePreflightCode) {
    super('The image could not be admitted for decoding')
    this.name = 'ImagePreflightError'
  }
}
function fail(code: ImagePreflightCode = 'INVALID_IMAGE'): never {
  throw new ImagePreflightError(code)
}
interface Size {
  readonly width: number
  readonly height: number
}
function dimensions(width: number, height: number): Size {
  if (width < 1 || height < 1) fail()
  if (
    width > IMAGE_PREFLIGHT_LIMITS.side ||
    height > IMAGE_PREFLIGHT_LIMITS.side ||
    width * height > IMAGE_PREFLIGHT_LIMITS.pixels
  )
    fail('TOO_LARGE')
  return { width, height }
}
function cost(size: Size, frames: number, poster = false): void {
  if (frames < 1) fail()
  if (
    frames > IMAGE_PREFLIGHT_LIMITS.frames ||
    size.width * size.height * (frames + Number(poster)) > IMAGE_PREFLIGHT_LIMITS.framePixels
  )
    fail('TOO_LARGE')
}
function frameBounds(canvas: Size, x: number, y: number, width: number, height: number): void {
  if (width < 1 || height < 1 || x + width > canvas.width || y + height > canvas.height) fail()
}
class Reader {
  readonly view: DataView
  private structures = 0
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  need(offset: number, count: number, end = this.bytes.length): void {
    if (offset < 0 || count < 0 || offset > end || count > end - offset) fail()
  }
  tick(): void {
    if (++this.structures > IMAGE_PREFLIGHT_LIMITS.structures) fail('TOO_LARGE')
  }
  byte(offset: number): number {
    this.need(offset, 1)
    return this.view.getUint8(offset)
  }
  u16(offset: number, little = false): number {
    this.need(offset, 2)
    return this.view.getUint16(offset, little)
  }
  u32(offset: number, little = false): number {
    this.need(offset, 4)
    return this.view.getUint32(offset, little)
  }
  u24(offset: number): number {
    return this.byte(offset) + this.byte(offset + 1) * 256 + this.byte(offset + 2) * 65536
  }
  text(offset: number, count: number): string {
    this.need(offset, count)
    let value = ''
    for (let i = 0; i < count; i++) value += String.fromCharCode(this.byte(offset + i))
    return value
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let result = value
  for (let bit = 0; bit < 8; bit++) result = result & 1 ? 0xedb88320 ^ (result >>> 1) : result >>> 1
  return result >>> 0
})
function pngCrc(reader: Reader, from: number, end: number): number {
  let crc = 0xffffffff
  for (let i = from; i < end; i++) crc = (crc >>> 8) ^ (crcTable[(crc ^ reader.byte(i)) & 255] ?? 0)
  return (crc ^ 0xffffffff) >>> 0
}
function png(reader: Reader): ImagePreflight {
  let offset = 8
  let size: Size | null = null
  let color = -1
  let palette = false
  let imageBytes = 0
  let seenIdat = false
  let endedIdat = false
  let declaredFrames: number | null = null
  let frames = 0
  let sequence = 0
  let poster = false
  let frame: { defaultImage: boolean; bytes: number } | null = null
  const seq = (at: number) => {
    if (reader.u32(at) !== sequence++) fail()
  }
  while (offset < reader.bytes.length) {
    reader.tick()
    reader.need(offset, 12)
    const length = reader.u32(offset)
    const type = reader.text(offset + 4, 4)
    const data = offset + 8
    reader.need(data, length + 4)
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2]?.toUpperCase()) fail()
    if (pngCrc(reader, offset + 4, data + length) !== reader.u32(data + length)) fail()
    if (!size && type !== 'IHDR') fail()
    if (seenIdat && type !== 'IDAT') endedIdat = true
    if (type === 'IHDR') {
      if (size || offset !== 8 || length !== 13) fail()
      size = dimensions(reader.u32(data), reader.u32(data + 4))
      const depth = reader.byte(data + 8)
      color = reader.byte(data + 9)
      const depths =
        color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [2, 4, 6].includes(color) ? [8, 16] : []
      if (
        !depths.includes(depth) ||
        reader.byte(data + 10) !== 0 ||
        reader.byte(data + 11) !== 0 ||
        reader.byte(data + 12) > 1
      )
        fail()
    } else if (type === 'PLTE') {
      if (palette || seenIdat || length === 0 || length > 768 || length % 3 !== 0 || color === 0 || color === 4) fail()
      palette = true
    } else if (type === 'acTL') {
      if (!size || declaredFrames !== null || seenIdat || length !== 8) fail()
      declaredFrames = reader.u32(data)
      cost(size, declaredFrames)
    } else if (type === 'fcTL') {
      if (!size || declaredFrames === null || length !== 26 || (frame && frame.bytes === 0)) fail()
      seq(data)
      const width = reader.u32(data + 4)
      const height = reader.u32(data + 8)
      const x = reader.u32(data + 12)
      const y = reader.u32(data + 16)
      frameBounds(size, x, y, width, height)
      if (reader.byte(data + 24) > 2 || reader.byte(data + 25) > 1) fail()
      if (!seenIdat && (frames !== 0 || x !== 0 || y !== 0 || width !== size.width || height !== size.height)) fail()
      if (frames === 0) poster = seenIdat
      frame = { defaultImage: !seenIdat, bytes: 0 }
      frames++
      cost(size, frames, poster)
      if (frames > declaredFrames) fail()
    } else if (type === 'IDAT') {
      if (endedIdat || (color === 3 && !palette) || (frame && !frame.defaultImage)) fail()
      seenIdat = true
      imageBytes += length
      if (frame) frame.bytes += length
    } else if (type === 'fdAT') {
      if (!seenIdat || !frame || frame.defaultImage || length < 4 || declaredFrames === null) fail()
      seq(data)
      frame.bytes += length - 4
    } else if (type === 'IEND') {
      if (!size || length !== 0 || imageBytes === 0 || data + 4 !== reader.bytes.length || (frame && frame.bytes === 0))
        fail()
      if (declaredFrames !== null && frames !== declaredFrames) fail()
      cost(size, declaredFrames ?? 1, poster)
      return { ...size, mime: 'image/png', animated: declaredFrames !== null, frameCount: declaredFrames ?? 1 }
    } else if (type[0] === type[0]?.toUpperCase()) fail('UNSUPPORTED_IMAGE')
    offset = data + length + 4
  }
  return fail()
}

function gif(reader: Reader): ImagePreflight {
  reader.need(0, 13)
  const size = dimensions(reader.u16(6, true), reader.u16(8, true))
  const packed = reader.byte(10)
  const globalColors = packed & 128 ? 2 ** ((packed & 7) + 1) : 0
  let offset = 13 + globalColors * 3
  reader.need(13, globalColors * 3)
  let frames = 0
  let control = false
  let transparentIndex: number | null = null
  const blocks = (): number => {
    let bytes = 0
    while (true) {
      reader.tick()
      const length = reader.byte(offset++)
      if (!length) return bytes
      reader.need(offset, length)
      offset += length
      bytes += length
    }
  }
  while (offset < reader.bytes.length) {
    reader.tick()
    const tag = reader.byte(offset++)
    if (tag === 0x3b) {
      if (offset !== reader.bytes.length || control) fail()
      cost(size, frames)
      return { ...size, mime: 'image/gif', animated: frames > 1, frameCount: frames }
    }
    if (tag === 0x2c) {
      reader.need(offset, 9)
      frameBounds(
        size,
        reader.u16(offset, true),
        reader.u16(offset + 2, true),
        reader.u16(offset + 4, true),
        reader.u16(offset + 6, true),
      )
      const flags = reader.byte(offset + 8)
      if (flags & 0x18) fail()
      const localColors = flags & 128 ? 2 ** ((flags & 7) + 1) : 0
      const colors = localColors || globalColors
      if (!colors) fail('UNSUPPORTED_IMAGE')
      if (transparentIndex !== null && transparentIndex >= colors) fail()
      offset += 9
      reader.need(offset, localColors * 3)
      offset += localColors * 3
      const minimumCodeSize = reader.byte(offset++)
      if (minimumCodeSize < 2 || minimumCodeSize > 8 || blocks() === 0) fail()
      frames++
      cost(size, frames)
      control = false
      transparentIndex = null
    } else if (tag === 0x21) {
      const label = reader.byte(offset++)
      if (label === 0xf9) {
        if (control || reader.byte(offset++) !== 4) fail()
        reader.need(offset, 5)
        const flags = reader.byte(offset)
        if ((flags & 0xe0) !== 0 || ((flags >> 2) & 7) > 3 || reader.byte(offset + 4) !== 0) fail()
        transparentIndex = flags & 1 ? reader.byte(offset + 3) : null
        control = true
        offset += 5
      } else if (label === 0x01) {
        // Plain Text is a graphic-rendering block, not safely countable as an image frame.
        fail('UNSUPPORTED_IMAGE')
      } else {
        if (label === 0xff) {
          if (reader.byte(offset++) !== 11) fail()
          reader.need(offset, 11)
          offset += 11
        }
        blocks()
      }
    } else fail()
  }
  return fail()
}

interface WebpChunk {
  readonly type: string
  readonly data: number
  readonly end: number
  readonly next: number
}
function webpChunk(reader: Reader, offset: number, end: number): WebpChunk {
  reader.tick()
  reader.need(offset, 8, end)
  const length = reader.u32(offset + 4, true)
  const data = offset + 8
  reader.need(data, length + (length & 1), end)
  if (length & 1 && reader.byte(data + length) !== 0) fail()
  return { type: reader.text(offset, 4), data, end: data + length, next: data + length + (length & 1) }
}
function webpBits(reader: Reader, chunk: WebpChunk): Size {
  const { data, end, type } = chunk
  if (type === 'VP8L') {
    reader.need(data, 6, end)
    if (reader.byte(data) !== 0x2f) fail()
    const bits = reader.u32(data + 1, true)
    if (bits >>> 29) fail('UNSUPPORTED_IMAGE')
    return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
  }
  reader.need(data, 11, end)
  const tag = reader.u24(data)
  if ((tag & 1) !== 0 || !(tag & 16) || reader.text(data + 3, 3) !== '\x9d\x01\x2a') fail()
  if (((tag >> 1) & 7) > 3) fail('UNSUPPORTED_IMAGE')
  if (tag >>> 5 > end - data - 3) fail()
  return dimensions(reader.u16(data + 6, true) & 0x3fff, reader.u16(data + 8, true) & 0x3fff)
}
function webpFrame(reader: Reader, offset: number, end: number): Size {
  let size: Size | null = null
  let alpha = false
  while (offset < end) {
    const chunk = webpChunk(reader, offset, end)
    if (chunk.type === 'ALPH') {
      if (alpha || size || chunk.end - chunk.data < 2) fail()
      alpha = true
    } else if (chunk.type === 'VP8 ' || chunk.type === 'VP8L') {
      if (size || (alpha && chunk.type === 'VP8L')) fail()
      size = webpBits(reader, chunk)
    } else if (['VP8X', 'ANIM', 'ANMF'].includes(chunk.type)) fail()
    offset = chunk.next
  }
  return size ?? fail()
}
function webp(reader: Reader): ImagePreflight {
  if (reader.u32(4, true) + 8 !== reader.bytes.length) fail()
  let offset = 12
  let canvas: Size | null = null
  let image: Size | null = null
  let extended = false
  let animation = false
  let animationHeader = false
  let alpha = false
  let frames = 0
  while (offset < reader.bytes.length) {
    const chunk = webpChunk(reader, offset, reader.bytes.length)
    const length = chunk.end - chunk.data
    const data = chunk.data
    if (chunk.type === 'VP8X') {
      if (extended || offset !== 12 || length !== 10) fail()
      const flags = reader.byte(data)
      if ((flags & 0xc1) !== 0 || reader.u24(data + 1) !== 0) fail()
      extended = true
      animation = Boolean(flags & 2)
      canvas = dimensions(reader.u24(data + 4) + 1, reader.u24(data + 7) + 1)
    } else if (chunk.type === 'ANIM') {
      if (!animation || animationHeader || image || frames || length !== 6) fail()
      animationHeader = true
    } else if (chunk.type === 'ANMF') {
      if (!canvas || !animationHeader || !animation || image || length < 16) fail()
      const width = reader.u24(data + 6) + 1
      const height = reader.u24(data + 9) + 1
      frameBounds(canvas, reader.u24(data) * 2, reader.u24(data + 3) * 2, width, height)
      if (reader.byte(data + 15) & 0xfc) fail()
      const actual = webpFrame(reader, data + 16, chunk.end)
      if (actual.width !== width || actual.height !== height) fail()
      frames++
      cost(canvas, frames)
    } else if (chunk.type === 'ALPH') {
      if (!extended || animation || alpha || image || length < 2) fail()
      alpha = true
    } else if (chunk.type === 'VP8 ' || chunk.type === 'VP8L') {
      if (image || animation || (alpha && chunk.type === 'VP8L')) fail()
      image = webpBits(reader, chunk)
      if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) fail()
      canvas ??= image
    } else if (['ICCP', 'EXIF', 'XMP '].includes(chunk.type) && !extended) fail()
    offset = chunk.next
  }
  if (!canvas || (animation ? !animationHeader || !frames : !image)) fail()
  cost(canvas, animation ? frames : 1)
  return { ...canvas, mime: 'image/webp', animated: animation, frameCount: animation ? frames : 1 }
}

function jpeg(reader: Reader): ImagePreflight {
  let offset = 2
  let size: Size | null = null
  let frameType = 0
  const components = new Set<number>()
  let scans = 0
  while (offset < reader.bytes.length) {
    reader.tick()
    if (reader.byte(offset++) !== 0xff) fail()
    while (reader.byte(offset) === 0xff) {
      reader.tick()
      offset++
    }
    const marker = reader.byte(offset++)
    if (marker === 0xd9) {
      if (!size || !scans || offset !== reader.bytes.length) fail()
      return { ...size, mime: 'image/jpeg', animated: false, frameCount: 1 }
    }
    if (marker === 0xd8 || marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) fail()
    if (marker === 0xdc || marker === 0xde || marker === 1) fail('UNSUPPORTED_IMAGE')
    const length = reader.u16(offset)
    if (length < 2) fail()
    reader.need(offset, length)
    const data = offset + 2
    const end = offset + length
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (size) fail()
      if (![0xc0, 0xc1, 0xc2].includes(marker)) fail('UNSUPPORTED_IMAGE')
      reader.need(data, 6, end)
      if (reader.byte(data) !== 8 || reader.u16(data + 1) === 0) fail('UNSUPPORTED_IMAGE')
      size = dimensions(reader.u16(data + 3), reader.u16(data + 1))
      frameType = marker
      const count = reader.byte(data + 5)
      if (count < 1 || count > 4 || length !== 8 + count * 3) fail()
      for (let i = 0; i < count; i++) {
        const at = data + 6 + i * 3
        const id = reader.byte(at)
        const sampling = reader.byte(at + 1)
        if (
          components.has(id) ||
          (sampling & 15) < 1 ||
          (sampling & 15) > 4 ||
          sampling >> 4 < 1 ||
          sampling >> 4 > 4 ||
          reader.byte(at + 2) > 3
        )
          fail()
        components.add(id)
      }
    } else if (marker === 0xda) {
      if (!size) fail()
      reader.need(data, 1, end)
      const count = reader.byte(data)
      if (count < 1 || count > components.size || length !== 6 + 2 * count) fail()
      const scanComponents = new Set<number>()
      for (let i = 0; i < count; i++) {
        const id = reader.byte(data + 1 + i * 2)
        const tables = reader.byte(data + 2 + i * 2)
        if (!components.has(id) || scanComponents.has(id) || (tables & 15) > 3 || tables >> 4 > 3) fail()
        scanComponents.add(id)
      }
      const first = reader.byte(end - 3)
      const last = reader.byte(end - 2)
      const approximation = reader.byte(end - 1)
      if (
        frameType !== 0xc2
          ? first !== 0 || last !== 63 || approximation !== 0
          : first > last ||
            last > 63 ||
            (first === 0 && last !== 0) ||
            (first > 0 && count !== 1) ||
            (approximation & 15) > 13 ||
            approximation >> 4 > 13
      )
        fail()
      scans++
      offset = end
      let entropyBytes = 0
      while (offset < reader.bytes.length) {
        if (reader.byte(offset) !== 0xff) {
          offset++
          entropyBytes++
          continue
        }
        const markerStart = offset++
        while (reader.byte(offset) === 0xff) {
          reader.tick()
          offset++
        }
        const next = reader.byte(offset)
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
          reader.tick()
          offset++
          if (next === 0) entropyBytes++
        } else {
          offset = markerStart
          break
        }
      }
      if (entropyBytes === 0) fail()
      continue
    } else if (marker === 0xdd) {
      if (length !== 4) fail()
    } else if (![0xc4, 0xdb, 0xfe].includes(marker) && !(marker >= 0xe0 && marker <= 0xef)) fail('UNSUPPORTED_IMAGE')
    offset = end
  }
  return fail()
}

/** Synchronous bounded preflight. No URL, decompression, persistence or credential access. */
export function preflightImage(bytes: Uint8Array, expectedMime: string): ImagePreflight {
  if (bytes.length === 0) fail()
  if (bytes.length > IMAGE_PREFLIGHT_LIMITS.bytes) fail('TOO_LARGE')
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(expectedMime)) fail('UNSUPPORTED_IMAGE')
  const reader = new Reader(bytes)
  const matches = (offset: number, text: string) =>
    bytes.length >= offset + text.length && reader.text(offset, text.length) === text
  const mime = matches(0, '\x89PNG\r\n\x1a\n')
    ? 'image/png'
    : matches(0, '\xff\xd8')
      ? 'image/jpeg'
      : matches(0, 'GIF87a') || matches(0, 'GIF89a')
        ? 'image/gif'
        : matches(0, 'RIFF') && matches(8, 'WEBP')
          ? 'image/webp'
          : null
  if (!mime) fail()
  if (mime !== expectedMime) fail('CONTENT_MISMATCH')
  if (mime === 'image/png') return png(reader)
  if (mime === 'image/jpeg') return jpeg(reader)
  if (mime === 'image/gif') return gif(reader)
  return webp(reader)
}

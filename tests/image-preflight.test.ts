import { expect, test } from 'bun:test'
import {
  IMAGE_PREFLIGHT_LIMITS,
  ImagePreflightError,
  preflightImage,
  type ImagePreflightCode,
} from '../apps/web/src/image-preflight'
import { imageResourceFixtures } from './fixtures/image-resource-fixtures'

const ascii = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0))
const bytes = (...values: number[]) => Uint8Array.from(values)
function join(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
function u32(value: number, little = false): Uint8Array {
  const result = new Uint8Array(4)
  new DataView(result.buffer).setUint32(0, value, little)
  return result
}
function u16(value: number, little = false): Uint8Array {
  const result = new Uint8Array(2)
  new DataView(result.buffer).setUint16(0, value, little)
  return result
}
const u24 = (value: number) => bytes(value & 255, (value >>> 8) & 255, (value >>> 16) & 255)
function rejected(input: Uint8Array, mime: string, code: ImagePreflightCode = 'INVALID_IMAGE'): void {
  let caught: unknown
  try {
    preflightImage(input, mime)
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(ImagePreflightError)
  if (!(caught instanceof ImagePreflightError)) throw new Error('Expected a typed preflight rejection')
  expect(caught.code).toBe(code)
  expect(caught.message).toBe('The image could not be admitted for decoding')
}

// Independent bit-at-a-time CRC generator; no production parser helpers are imported.
function pngChunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  const body = join(ascii(type), data)
  let crc = 0xffffffff
  for (const value of body) {
    crc ^= value
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return join(u32(data.length), body, u32((crc ^ 0xffffffff) >>> 0))
}
const pngSignature = bytes(137, 80, 78, 71, 13, 10, 26, 10)
const pngEnd = pngChunk('IEND')
const pngHeader = (width = 2, height = 3) => pngChunk('IHDR', join(u32(width), u32(height), bytes(8, 6, 0, 0, 0)))
// Real Edge canvas-generated 2x3 RGBA PNG. The IDAT bytes below retain its actual compressed pixels.
const pngTiny = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWISClv9H4SZGKAAzgAAAAD//92949EAAAAGSURBVAMAWpUEKyHawvcAAAAASUVORK5CYII=',
    'base64',
  ),
)
const pngData = join(pngTiny.slice(41, 61), pngTiny.slice(73, 79))
function pngImage(width = 2, height = 3, extra: readonly Uint8Array[] = []): Uint8Array {
  return join(pngSignature, pngHeader(width, height), ...extra, pngChunk('IDAT', pngData), pngEnd)
}
function frameControl(sequence: number, width: number, height: number, x = 0, y = 0): Uint8Array {
  return pngChunk('fcTL', join(u32(sequence), u32(width), u32(height), u32(x), u32(y), u16(1), u16(5), bytes(0, 0)))
}
function apng(width: number, height: number, frames: number, poster = false): Uint8Array {
  const parts = [pngSignature, pngHeader(width, height), pngChunk('acTL', join(u32(frames), u32(0)))]
  if (poster) parts.push(pngChunk('IDAT', pngData))
  let sequence = 0
  for (let index = 0; index < frames; index++) {
    parts.push(frameControl(sequence++, width, height))
    parts.push(index === 0 && !poster ? pngChunk('IDAT', pngData) : pngChunk('fdAT', join(u32(sequence++), pngData)))
  }
  return join(...parts, pngEnd)
}

const gifHeader = (width = 1, height = 1) =>
  join(ascii('GIF89a'), u16(width, true), u16(height, true), bytes(0x80, 0, 0), bytes(0, 0, 0, 255, 255, 255))
const gifControl = bytes(0x21, 0xf9, 4, 1, 20, 0, 0, 0)
// Complete LZW stream: clear(4), black(0), end(5), packed least-significant-bit first.
const gifFrame = join(bytes(0x2c), u16(0, true), u16(0, true), u16(1, true), u16(1, true), bytes(0, 2, 2, 0x44, 1, 0))
const gifImage = (frames = 1, width = 1, height = 1) =>
  join(gifHeader(width, height), ...Array.from({ length: frames }, () => join(gifControl, gifFrame)), bytes(0x3b))

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  return join(ascii(type), u32(data.length, true), data, data.length % 2 ? bytes(0) : bytes())
}
function riff(...chunks: readonly Uint8Array[]): Uint8Array {
  const body = join(ascii('WEBP'), ...chunks)
  return join(ascii('RIFF'), u32(body.length, true), body)
}
const webpExtended = (width = 2, height = 3, flags = 0) =>
  riffChunk('VP8X', join(bytes(flags, 0, 0, 0), u24(width - 1), u24(height - 1)))
// Real Edge canvas VP8 keyframe, extracted unchanged from a 2x3 WebP container.
const webpPayload = Uint8Array.from(
  Buffer.from('0AEAnQEqAgADAAFAJiWgAnS6AfgAA7AA/vNpl/6TZ4mzxNnwiv/ME r8g3XIAAA=='.replaceAll(' ', ''), 'base64'),
)
const webpStill = () => riff(riffChunk('VP8 ', webpPayload))
function webpAnimated(frames = 2, width = 2, height = 3): Uint8Array {
  const frame = riffChunk(
    'ANMF',
    join(u24(0), u24(0), u24(1), u24(2), u24(200), bytes(0), riffChunk('VP8 ', webpPayload)),
  )
  return riff(
    webpExtended(width, height, 2),
    riffChunk('ANIM', bytes(0, 0, 0, 0, 0, 0)),
    ...Array.from({ length: frames }, () => frame),
  )
}

const jpegSegment = (marker: number, data: Uint8Array) => join(bytes(0xff, marker), u16(data.length + 2), data)
const jpegFrame = (width = 2, height = 3, progressive = false) =>
  jpegSegment(progressive ? 0xc2 : 0xc0, join(bytes(8), u16(height), u16(width), bytes(1, 1, 0x11, 0)))
const jpegScan = (first = 0, last = 63) => jpegSegment(0xda, bytes(1, 1, 0, first, last, 0))
// The synthetic JPEGs below test marker admission, not Huffman/pixel decoding.
const jpegStructure = (width = 2, height = 3) =>
  join(bytes(0xff, 0xd8), jpegFrame(width, height), jpegScan(), bytes(3, 0xff, 0, 4, 0xff, 0xd0, 5, 0xff, 0xd9))

test('metadata of complete tiny static and animated containers', () => {
  expect(preflightImage(pngTiny, 'image/png')).toEqual({
    mime: 'image/png',
    width: 2,
    height: 3,
    animated: false,
    frameCount: 1,
  })
  expect(preflightImage(apng(2, 3, 2), 'image/png')).toEqual({
    mime: 'image/png',
    width: 2,
    height: 3,
    animated: true,
    frameCount: 2,
  })
  expect(preflightImage(apng(2, 3, 2, true), 'image/png').frameCount).toBe(2)
  expect(preflightImage(gifImage(), 'image/gif')).toEqual({
    mime: 'image/gif',
    width: 1,
    height: 1,
    animated: false,
    frameCount: 1,
  })
  expect(preflightImage(gifImage(2), 'image/gif').animated).toBe(true)
  expect(preflightImage(webpStill(), 'image/webp')).toEqual({
    mime: 'image/webp',
    width: 2,
    height: 3,
    animated: false,
    frameCount: 1,
  })
  expect(preflightImage(webpAnimated(), 'image/webp').frameCount).toBe(2)
  const embedded = join(bytes(5, 6), pngTiny, bytes(7, 8))
  expect(preflightImage(embedded.subarray(2, 2 + pngTiny.length), 'image/png').width).toBe(2)
})

test('real encoded PNG/JPEG/progressive JPEG/GIF/VP8/VP8L/APNG/WebP animations retain their facts', () => {
  for (const fixture of imageResourceFixtures) {
    const mime = fixture.mime
    if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/gif' && mime !== 'image/webp')
      throw new Error('Unexpected real fixture MIME')
    const input = Uint8Array.from(Buffer.from(fixture.base64, 'base64'))
    expect(preflightImage(input, fixture.mime)).toEqual({
      mime,
      width: fixture.width,
      height: fixture.height,
      frameCount: fixture.frames,
      animated: fixture.frames > 1,
    })
    for (let end = 0; end < input.length; end++) rejected(input.subarray(0, end), fixture.mime)
  }
})

test('typed MIME errors reveal no embedded metadata and reject unsupported types', () => {
  rejected(pngTiny, 'image/jpeg', 'CONTENT_MISMATCH')
  rejected(gifImage(), 'image/png', 'CONTENT_MISMATCH')
  rejected(pngTiny, 'image/svg+xml', 'UNSUPPORTED_IMAGE')
  rejected(pngTiny, 'image/png; charset=utf-8', 'UNSUPPORTED_IMAGE')
  rejected(ascii('<svg>private filename or content</svg>'), 'image/png')
  rejected(bytes(), 'image/png')
})

test('all truncated prefixes and trailing bytes fail safely for every structural format', () => {
  for (const [input, mime] of [
    [pngTiny, 'image/png'],
    [gifImage(2), 'image/gif'],
    [webpAnimated(), 'image/webp'],
    [jpegStructure(), 'image/jpeg'],
  ] as const) {
    for (let end = 0; end < input.length; end++) rejected(input.subarray(0, end), mime)
    rejected(join(input, bytes(0)), mime)
  }
})

test('byte, side and canvas boundaries are enforced before any decoder', () => {
  rejected(new Uint8Array(IMAGE_PREFLIGHT_LIMITS.bytes + 1), 'image/png', 'TOO_LARGE')
  // Opaque IDAT remains the tiny fixture. These mutated dimensions assert admission budgets only.
  expect(preflightImage(pngImage(6000, 4000), 'image/png').width).toBe(6000)
  expect(preflightImage(pngImage(8000, 4000), 'image/png').height).toBe(4000)
  rejected(pngImage(8001, 4000), 'image/png', 'TOO_LARGE')
  expect(preflightImage(pngImage(16_384, 1), 'image/png').width).toBe(16_384)
  rejected(pngImage(16_385, 1), 'image/png', 'TOO_LARGE')
  rejected(pngImage(0xffffffff, 0xffffffff), 'image/png', 'TOO_LARGE')
  rejected(pngImage(0, 1), 'image/png')
  rejected(gifImage(1, 16_385, 1), 'image/gif', 'TOO_LARGE')
  rejected(jpegStructure(16_385, 1), 'image/jpeg', 'TOO_LARGE')
  rejected(riff(webpExtended(16_385, 1), riffChunk('VP8 ', webpPayload)), 'image/webp', 'TOO_LARGE')
  const filler = new Uint8Array(IMAGE_PREFLIGHT_LIMITS.bytes - pngImage().length - 12)
  const exact = pngImage(2, 3, [pngChunk('teXt', filler)])
  expect(exact.length).toBe(IMAGE_PREFLIGHT_LIMITS.bytes)
  expect(preflightImage(exact, 'image/png').frameCount).toBe(1)
  rejected(join(exact, bytes(0)), 'image/png', 'TOO_LARGE')
})

test('animation frame count and full-canvas cost include independent APNG poster', () => {
  for (const [input, mime] of [
    [apng(2, 3, 256), 'image/png'],
    [gifImage(256), 'image/gif'],
    [webpAnimated(256), 'image/webp'],
  ] as const)
    expect(preflightImage(input, mime).frameCount).toBe(256)
  for (const [input, mime] of [
    [apng(2, 3, 257), 'image/png'],
    [gifImage(257), 'image/gif'],
    [webpAnimated(257), 'image/webp'],
  ] as const)
    rejected(input, mime, 'TOO_LARGE')
  expect(preflightImage(apng(8000, 4000, 2), 'image/png').frameCount).toBe(2)
  rejected(apng(8000, 4000, 2, true), 'image/png', 'TOO_LARGE')
  expect(preflightImage(apng(8000, 4000, 1, true), 'image/png').frameCount).toBe(1)
  rejected(gifImage(3, 8000, 4000), 'image/gif', 'TOO_LARGE')
  rejected(webpAnimated(3, 8000, 4000), 'image/webp', 'TOO_LARGE')
})

test('PNG rejects malformed key chunks, CRC, ordering and critical extensions', () => {
  rejected(pngImage(2, 3, [pngHeader()]), 'image/png')
  const corrupt = pngTiny.slice()
  corrupt[29] = 0
  rejected(corrupt, 'image/png')
  rejected(join(pngSignature, u32(0xffffffff), ascii('IHDR'), bytes(0)), 'image/png')
  rejected(join(pngSignature, pngHeader(), pngEnd), 'image/png')
  rejected(pngImage(2, 3, [pngChunk('ABCD')]), 'image/png', 'UNSUPPORTED_IMAGE')
  rejected(pngImage(2, 3, [pngChunk('abca')]), 'image/png')
  rejected(
    join(pngSignature, pngHeader(), pngChunk('IDAT', pngData), pngChunk('teXt'), pngChunk('IDAT', pngData), pngEnd),
    'image/png',
  )
  rejected(
    join(pngSignature, pngHeader(), pngChunk('IDAT', pngData), pngChunk('acTL', join(u32(1), u32(0))), pngEnd),
    'image/png',
  )
})

test('APNG rejects duplicate/gapped sequence, unmatched frame counts and frames without pixels', () => {
  const start = join(pngSignature, pngHeader(), pngChunk('acTL', join(u32(2), u32(0))))
  rejected(join(start, frameControl(1, 2, 3), pngChunk('IDAT', pngData), pngEnd), 'image/png')
  rejected(join(start, frameControl(0, 2, 3), pngChunk('IDAT', pngData), pngEnd), 'image/png')
  rejected(join(start, frameControl(0, 2, 3), pngChunk('IDAT', pngData), frameControl(0, 2, 3), pngEnd), 'image/png')
  rejected(join(start, frameControl(0, 2, 3), frameControl(1, 2, 3), pngEnd), 'image/png')
  rejected(join(start, frameControl(0, 3, 3), pngChunk('IDAT', pngData), pngEnd), 'image/png')
  rejected(join(start, frameControl(0, 1, 1, 1, 1), pngChunk('IDAT', pngData), pngEnd), 'image/png')
  rejected(
    join(
      start,
      frameControl(0, 2, 3),
      pngChunk('IDAT', pngData),
      frameControl(1, 2, 3),
      pngChunk('fdAT', u32(2)),
      pngEnd,
    ),
    'image/png',
  )
  rejected(pngImage(2, 3, [pngChunk('acTL', join(u32(0), u32(0)))]), 'image/png')
})

test('GIF accepts comment/application extensions and enforces graphic and palette bounds', () => {
  const app = join(bytes(0x21, 0xff, 11), ascii('NETSCAPE2.0'), bytes(3, 1, 0, 0, 0))
  const comment = join(bytes(0x21, 0xfe, 3), ascii('abc'), bytes(0))
  expect(
    preflightImage(join(gifHeader(), app, comment, gifControl, gifFrame, bytes(0x3b)), 'image/gif').frameCount,
  ).toBe(1)
  rejected(join(gifHeader(), gifControl, gifControl, gifFrame, bytes(0x3b)), 'image/gif')
  rejected(join(gifHeader(), gifControl, bytes(0x3b)), 'image/gif')
  rejected(join(gifHeader(), bytes(0x21, 1)), 'image/gif', 'UNSUPPORTED_IMAGE')
  rejected(join(gifHeader(), bytes(0x21, 0xfe, 255, 1, 2)), 'image/gif')
  const outside = gifFrame.slice()
  outside[1] = 1
  rejected(join(gifHeader(), outside, bytes(0x3b)), 'image/gif')
  const codeSize = gifFrame.slice()
  codeSize[10] = 1
  rejected(join(gifHeader(), codeSize, bytes(0x3b)), 'image/gif')
  const transparency = gifControl.slice()
  transparency[6] = 2
  rejected(join(gifHeader(), transparency, gifFrame, bytes(0x3b)), 'image/gif')
})

test('GIF89a local palettes, interlacing and transparent graphic control remain supported', () => {
  const localDescriptor = gifFrame.slice(0, 10)
  localDescriptor[9] = 0xc0
  const localFrame = join(localDescriptor, bytes(255, 0, 0, 0, 255, 0), gifFrame.slice(10))
  const withoutGlobalPalette = join(ascii('GIF89a'), u16(1, true), u16(1, true), bytes(0, 0, 0))
  expect(preflightImage(join(withoutGlobalPalette, gifControl, localFrame, bytes(0x3b)), 'image/gif').frameCount).toBe(
    1,
  )
  rejected(join(withoutGlobalPalette, gifFrame, bytes(0x3b)), 'image/gif', 'UNSUPPORTED_IMAGE')
  const invalidPalette = localDescriptor.slice()
  invalidPalette[9] = 0x87
  rejected(join(withoutGlobalPalette, invalidPalette, bytes(0, 0, 0, 0x3b)), 'image/gif')
  const invalidDisposal = gifControl.slice()
  invalidDisposal[3] = 0x1d
  rejected(join(gifHeader(), invalidDisposal, gifFrame, bytes(0x3b)), 'image/gif')
})

test('WebP rejects conflicting canvas, duplicate bitstreams and malformed RIFF padding', () => {
  rejected(riff(webpExtended(3, 3), riffChunk('VP8 ', webpPayload)), 'image/webp')
  rejected(riff(webpExtended(), webpExtended(), riffChunk('VP8 ', webpPayload)), 'image/webp')
  rejected(riff(riffChunk('VP8 ', webpPayload), riffChunk('VP8 ', webpPayload)), 'image/webp')
  rejected(riff(webpExtended(2, 3, 2), riffChunk('VP8 ', webpPayload)), 'image/webp')
  rejected(riff(webpExtended(2, 3, 2), riffChunk('ANIM', bytes(0, 0, 0, 0, 0, 0))), 'image/webp')
  const badLength = webpStill()
  badLength[4] = 0
  rejected(badLength, 'image/webp')
  const padded = riff(riffChunk('JUNK', bytes(7)), riffChunk('VP8 ', webpPayload))
  expect(preflightImage(padded, 'image/webp').width).toBe(2)
  padded[21] = 1
  rejected(padded, 'image/webp')
  rejected(riff(join(ascii('JUNK'), u32(1, true), bytes(0))), 'image/webp')
  const inconsistentFrame = riffChunk(
    'ANMF',
    join(u24(0), u24(0), u24(0), u24(0), u24(200), bytes(0), riffChunk('VP8 ', webpPayload)),
  )
  rejected(riff(webpExtended(2, 3, 2), riffChunk('ANIM', bytes(0, 0, 0, 0, 0, 0)), inconsistentFrame), 'image/webp')
})

test('JPEG supports stuffed bytes, restart markers and multiple progressive scans without decoding entropy', () => {
  expect(preflightImage(jpegStructure(), 'image/jpeg').width).toBe(2)
  const progressive = join(
    bytes(0xff, 0xd8),
    jpegFrame(2, 3, true),
    jpegScan(0, 0),
    bytes(1, 0xff, 0, 2, 0xff, 0xd1, 3),
    jpegScan(1, 63),
    bytes(9, 0xff, 0xd9),
  )
  expect(preflightImage(progressive, 'image/jpeg').height).toBe(3)
  rejected(join(bytes(0xff, 0xd8), jpegFrame(), jpegFrame(), jpegScan(), bytes(1, 0xff, 0xd9)), 'image/jpeg')
  rejected(join(bytes(0xff, 0xd8), jpegFrame(), jpegScan(), bytes(1), jpegFrame(), bytes(0xff, 0xd9)), 'image/jpeg')
  rejected(join(bytes(0xff, 0xd8), jpegFrame(), jpegScan(), bytes(0xff, 0xd9)), 'image/jpeg')
  rejected(join(bytes(0xff, 0xd8), jpegFrame(), jpegScan(), bytes(1, 0xff, 0xdc)), 'image/jpeg', 'UNSUPPORTED_IMAGE')
  rejected(
    join(bytes(0xff, 0xd8), jpegFrame(1, 0), jpegScan(), bytes(1, 0xff, 0xd9)),
    'image/jpeg',
    'UNSUPPORTED_IMAGE',
  )
  rejected(join(bytes(0xff, 0xd8), jpegFrame(), jpegScan(1, 63), bytes(1, 0xff, 0xd9)), 'image/jpeg')
  rejected(
    join(bytes(0xff, 0xd8), jpegSegment(0xc3, bytes(8, 0, 3, 0, 2, 1, 1, 0x11, 0))),
    'image/jpeg',
    'UNSUPPORTED_IMAGE',
  )
})

test('WebP lossless version, image/frame identity and VP8 keyframe partition bounds are checked', () => {
  const fixture = imageResourceFixtures.find((item) => item.name === 'losslessWebp')
  if (!fixture) throw new Error('The real lossless fixture must exist')
  const encoded = Uint8Array.from(Buffer.from(fixture.base64, 'base64'))
  const payload = encoded.slice(20, 20 + new DataView(encoded.buffer).getUint32(16, true))
  expect(preflightImage(riff(webpExtended(4, 4), riffChunk('VP8L', payload)), 'image/webp').width).toBe(4)
  rejected(riff(webpExtended(3, 4), riffChunk('VP8L', payload)), 'image/webp')
  rejected(riff(riffChunk('VP8L', payload), riffChunk('VP8L', payload)), 'image/webp')
  const version = payload.slice()
  version[4] = (version[4] ?? 0) | 0x20
  rejected(riff(riffChunk('VP8L', version)), 'image/webp', 'UNSUPPORTED_IMAGE')
  rejected(riff(webpExtended(4, 4, 16), riffChunk('ALPH', bytes(0, 0)), riffChunk('VP8L', payload)), 'image/webp')
  const nonKeyframe = webpPayload.slice()
  nonKeyframe[0] = (nonKeyframe[0] ?? 0) | 1
  rejected(riff(riffChunk('VP8 ', nonKeyframe)), 'image/webp')
  const oversizedPartition = webpPayload.slice()
  oversizedPartition.set(bytes(0xf0, 0xff, 0xff))
  rejected(riff(riffChunk('VP8 ', oversizedPartition)), 'image/webp')
  const repeatedFrameImage = riffChunk(
    'ANMF',
    join(
      u24(0),
      u24(0),
      u24(1),
      u24(2),
      u24(200),
      bytes(0),
      riffChunk('VP8 ', webpPayload),
      riffChunk('VP8 ', webpPayload),
    ),
  )
  rejected(riff(webpExtended(2, 3, 2), riffChunk('ANIM', bytes(0, 0, 0, 0, 0, 0)), repeatedFrameImage), 'image/webp')
  const outsideFrame = riffChunk(
    'ANMF',
    join(u24(0xffffff), u24(0), u24(1), u24(2), u24(200), bytes(0), riffChunk('VP8 ', webpPayload)),
  )
  rejected(riff(webpExtended(2, 3, 2), riffChunk('ANIM', bytes(0, 0, 0, 0, 0, 0)), outsideFrame), 'image/webp')
})

test('bounded structure traversal rejects oversized chunk and sub-block counts', () => {
  const empty = pngChunk('teXt')
  const extras = Array.from({ length: IMAGE_PREFLIGHT_LIMITS.structures - 3 }, () => empty)
  expect(preflightImage(pngImage(2, 3, extras), 'image/png').frameCount).toBe(1)
  rejected(pngImage(2, 3, [...extras, empty]), 'image/png', 'TOO_LARGE')
  const comments = Array.from({ length: IMAGE_PREFLIGHT_LIMITS.structures }, () => bytes(0x21, 0xfe, 0))
  rejected(join(gifHeader(), ...comments, gifFrame, bytes(0x3b)), 'image/gif', 'TOO_LARGE')
})

test('deterministic adversarial byte mutations never leak RangeError or input data', () => {
  let seed = 0x715e
  for (const [input, mime] of [
    [pngTiny, 'image/png'],
    [gifImage(2), 'image/gif'],
    [webpAnimated(), 'image/webp'],
    [jpegStructure(), 'image/jpeg'],
  ] as const) {
    for (let attempt = 0; attempt < 128; attempt++) {
      const value = input.slice()
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      value[seed % value.length] = seed & 255
      try {
        const metadata = preflightImage(value, mime)
        expect(metadata.width * metadata.height).toBeLessThanOrEqual(IMAGE_PREFLIGHT_LIMITS.pixels)
      } catch (error) {
        expect(error).toBeInstanceOf(ImagePreflightError)
        if (!(error instanceof ImagePreflightError)) throw error
        expect(error.message).toBe('The image could not be admitted for decoding')
      }
    }
  }
})

import { zlibSync } from 'fflate'

/** Original colored pixel fixture; a different hash per occurrence, no external or user image. */
export function imageFile(index: number, name = `image-${index}.png`) {
  const chunk = (type: string, data: Uint8Array) => {
    const bytes = new Uint8Array(data.length + 12)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, data.length)
    bytes.set(new TextEncoder().encode(type), 4)
    bytes.set(data, 8)
    let crc = 0xffffffff
    for (const byte of bytes.subarray(4, -4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0)
    return bytes
  }
  const width = index % 2 ? 240 : 480
  const height = index % 2 ? 360 : 240
  const header = new Uint8Array(13)
  new DataView(header.buffer).setUint32(0, width)
  new DataView(header.buffer).setUint32(4, height)
  header[8] = 8
  header[9] = 2
  const pixels = new Uint8Array((width * 3 + 1) * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3
      pixels[at] = 50 + index * 13 + (x > width / 2 ? 35 : 0)
      pixels[at + 1] = 100 + index * 9
      pixels[at + 2] = 190 - index * 7 + (y > height / 2 ? 25 : 0)
    }
  const buffer = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(pixels)),
    chunk('IEND', new Uint8Array()),
  ])
  return { name, mimeType: 'image/png', buffer }
}

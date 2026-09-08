import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'

function chunk(type: string, data: Buffer) {
  const content = Buffer.concat([Buffer.from(type), data])
  let crc = 0xffffffff
  for (const byte of content) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  const header = Buffer.alloc(4),
    tail = Buffer.alloc(4)
  header.writeUInt32BE(data.length)
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([header, content, tail])
}
function png(size: number) {
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 32,
        v = (y / size) * 32
      const mark =
        (u >= 7 && u < 11 && v >= 5 && v < 27) ||
        (u >= 21 && u < 25 && v >= 12 && v < 27) ||
        (u >= 7 && u < 25 && v >= 12 && v < 16)
      rows.set(mark ? [130, 193, 162, 255] : [35, 37, 42, 255], y * (size * 4 + 1) + 1 + x * 4)
    }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const directory = 'apps/desktop/src-tauri/icons'
await mkdir(directory, { recursive: true })
await writeFile(`${directory}/icon.png`, png(256))
const icon = png(256),
  header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(icon.length, 14)
header.writeUInt32LE(22, 18)
await writeFile(`${directory}/icon.ico`, Buffer.concat([header, icon]))

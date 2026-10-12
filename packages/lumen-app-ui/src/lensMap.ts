/** A monochrome rounded-rectangle lens: neutral center, refracting perimeter.
 * R/G encode surface normals; no channel splitting or chromatic aberration.
 */
export default function createLensMap(width: number, height: number, radius: number): string {
  const scale = Math.min(1, 720 / width, 720 / height)
  const w = Math.max(2, Math.round(width * scale))
  const h = Math.max(2, Math.round(height * scale))
  const r = Math.min(radius * scale, w / 2, h / 2)
  const band = Math.max(8, 22 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const context = canvas.getContext('2d')
  if (!context) {
    return ''
  }
  const pixels = context.createImageData(w, h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const cx = Math.max(r, Math.min(w - r, x))
      const cy = Math.max(r, Math.min(h - r, y))
      const dx = x - cx
      const dy = y - cy
      const cornerDistance = Math.hypot(dx, dy)
      const distances = [x, w - 1 - x, y, h - 1 - y]
      const distance = cornerDistance > 0 ? r - cornerDistance : Math.min(...distances)
      let nx: number
      let ny: number
      if (cornerDistance > 0) {
        nx = dx / cornerDistance
        ny = dy / cornerDistance
      } else {
        const nearest = distances.indexOf(distance)
        nx = nearest === 0 ? -1 : Number(nearest === 1)
        ny = nearest === 2 ? -1 : Number(nearest === 3)
      }
      const amplitude = Math.sin(Math.max(0, Math.min(1, distance / band)) * Math.PI) * 120
      const offset = (y * w + x) * 4
      pixels.data[offset] = 128 + nx * amplitude
      pixels.data[offset + 1] = 128 + ny * amplitude
      pixels.data[offset + 2] = 128
      pixels.data[offset + 3] = 255
    }
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL()
}

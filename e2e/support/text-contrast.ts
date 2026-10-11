/** Samples declared solid/translucent background layers; bitmap/blurred imagery needs separate visual review. */
export function measureVisibleLumenContrast() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const painter = canvas.getContext('2d')
  if (!painter) throw new Error('Contrast sample canvas unavailable')
  const rgba = (color: string) => {
    painter.clearRect(0, 0, 1, 1)
    painter.fillStyle = color
    painter.fillRect(0, 0, 1, 1)
    return [...painter.getImageData(0, 0, 1, 1).data]
  }
  const blend = (front: number[], back: number[]) => {
    const alpha = (front[3] ?? 255) / 255
    return front
      .slice(0, 3)
      .map((value, index) => value * alpha + (back[index] ?? 255) * (1 - alpha))
      .concat(255)
  }
  const luminance = (color: number[]) =>
    color.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255
      return (
        sum +
        (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!
      )
    }, 0)
  return [...document.querySelectorAll<HTMLElement>('[data-text-context]')]
    .filter(
      (node) =>
        node.textContent?.trim() &&
        node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        !node.closest('[disabled], [aria-disabled="true"]'),
    )
    .map((node) => {
      const layers: number[][] = []
      let element: Element | null = node
      while (element) {
        layers.push(rgba(getComputedStyle(element).backgroundColor))
        element = element.parentElement
      }
      const background = layers.reverse().reduce((result, layer) => blend(layer, result), [255, 255, 255, 255])
      const style = getComputedStyle(node)
      const foreground = blend(rgba(style.color), background)
      const first = luminance(foreground),
        second = luminance(background)
      const large =
        parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseFloat(style.fontWeight) >= 700)
      return {
        context: node.dataset.textContext,
        text: node.textContent?.trim().slice(0, 120),
        ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
        minimum: large ? 3 : 4.5,
      }
    })
}

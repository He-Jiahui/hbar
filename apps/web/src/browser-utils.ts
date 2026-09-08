export function newRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `req-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* Plain HTTP and denied clipboard permissions use the selection fallback. */
    }
  }
  const previous = document.activeElement as HTMLElement | null
  const input = document.createElement('textarea')
  input.value = text
  input.style.cssText = 'position:fixed;left:-9999px;top:0'
  document.body.append(input)
  input.focus()
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  previous?.focus()
  if (!copied) throw new Error('Clipboard is unavailable in this browser')
}

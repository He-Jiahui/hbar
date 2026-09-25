import { expect, type Locator } from '@playwright/test'

/** The composer may use a textarea fallback or a rich contenteditable editor. */
export async function readComposerText(editor: Locator): Promise<string> {
  return editor.evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value
    const lines = element.querySelectorAll('.cm-line')
    if (lines.length > 0)
      return Array.from(lines, (line) => {
        const content = line.cloneNode(true) as HTMLElement
        content.querySelectorAll('.cm-placeholder').forEach((placeholder) => placeholder.remove())
        return content.textContent ?? ''
      }).join('\n')
    return (element as HTMLElement).innerText.replaceAll('\r\n', '\n')
  })
}

export async function expectComposerText(editor: Locator, text: string): Promise<void> {
  await expect.poll(() => readComposerText(editor)).toBe(text)
}

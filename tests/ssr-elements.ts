export interface RenderedElement {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
  readonly text: string
}

/** Read non-overlapping rendered content slots without depending on attribute order or token markup. */
export async function renderedElements(html: string, selector: string): Promise<readonly RenderedElement[]> {
  const elements: { tag: string; attributes: Record<string, string>; text: string }[] = []
  await new HTMLRewriter()
    .on(selector, {
      element(element) {
        elements.push({ tag: element.tagName, attributes: Object.fromEntries(element.attributes), text: '' })
      },
      text(chunk) {
        const element = elements.at(-1)
        if (element) element.text += chunk.text
      },
    })
    .transform(new Response(html))
    .text()
  return elements
}

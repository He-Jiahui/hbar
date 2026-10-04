import { diagramSourceFailure, MAX_DIAGRAM_PENDING, type DiagramFailure } from './markdown-diagram-model'

export type DiagramRenderResult =
  | {
      readonly status: 'ready'
      readonly svg: string
      readonly previewSvg: string
      readonly width: number
      readonly height: number
    }
  | { readonly status: 'failed'; readonly reason: DiagramFailure }
  | { readonly status: 'cancelled' }
export interface DiagramRenderInput {
  readonly source: string
  readonly dark: boolean
  readonly signal: AbortSignal
}
type DiagramRenderer = (input: DiagramRenderInput) => Promise<DiagramRenderResult>

/** One physical render at a time; aborting the owner never frees an active slot early. */
export function createDiagramRenderQueue(renderer: DiagramRenderer): DiagramRenderer {
  type Job = { input: DiagramRenderInput; settle: (result: DiagramRenderResult) => void }
  const pending: Job[] = []
  let active = false
  const pump = () => {
    if (active) return
    const job = pending.shift()
    if (!job) return
    active = true
    void renderer(job.input)
      .then(job.settle, () => job.settle({ status: 'failed', reason: 'failed' }))
      .finally(() => {
        active = false
        pump()
      })
  }
  return (input) => {
    if (input.signal.aborted) return Promise.resolve({ status: 'cancelled' })
    const failure = diagramSourceFailure(input.source)
    if (failure) return Promise.resolve({ status: 'failed', reason: failure })
    if (pending.length >= MAX_DIAGRAM_PENDING) return Promise.resolve({ status: 'failed', reason: 'busy' })
    return new Promise<DiagramRenderResult>((resolve) => {
      let settled = false
      const settle = (result: DiagramRenderResult) => {
        if (settled) return
        settled = true
        input.signal.removeEventListener('abort', abort)
        resolve(input.signal.aborted ? { status: 'cancelled' } : result)
      }
      const job: Job = { input, settle }
      const abort = () => {
        const index = pending.indexOf(job)
        if (index >= 0) pending.splice(index, 1)
        settle({ status: 'cancelled' })
      }
      input.signal.addEventListener('abort', abort, { once: true })
      pending.push(job)
      pump()
    })
  }
}

let nextId = 0
// No CDN, runtime plugin registration, author configuration or bindFunctions.
const renderLocalDiagram: DiagramRenderer = async ({ source, dark, signal }) => {
  const [{ default: mermaid }, { default: purify }] = await Promise.all([import('mermaid'), import('dompurify')])
  if (signal.aborted) return { status: 'cancelled' }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    theme: dark ? 'dark' : 'neutral',
    fontFamily: 'Arial, sans-serif',
    maxTextSize: 16 * 1024,
    maxEdges: 100,
    flowchart: { htmlLabels: false },
  })
  const container = document.createElement('div')
  // SVG text metrics require layout. This non-interactive measurement overlay
  // is removed in finally; display:none would silently produce zero-size labels.
  container.className = 'hbar-diagram-measure-overlay'
  container.setAttribute('aria-hidden', 'true')
  container.inert = true
  document.body.append(container)
  try {
    const result = await mermaid.render(`hbar-diagram-${++nextId}`, source, container)
    if (signal.aborted) return { status: 'cancelled' }
    if (result.svg.length > 1024 * 1024) return { status: 'failed', reason: 'too_large' }
    const sanitized = purify.sanitize(result.svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['a', 'image', 'use', 'foreignObject', 'script', 'animate', 'set'],
      FORBID_ATTR: ['href', 'xlink:href', 'src'],
    })
    const parsed = new DOMParser().parseFromString(sanitized, 'image/svg+xml')
    const svg = parsed.documentElement
    const values = (svg.getAttribute('viewBox') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    const width = values[2]
    const height = values[3]
    if (
      svg.localName !== 'svg' ||
      parsed.querySelector('parsererror') ||
      values.length !== 4 ||
      !values.every(Number.isFinite) ||
      width === undefined ||
      height === undefined ||
      width <= 0 ||
      height <= 0 ||
      width > 100_000 ||
      height > 100_000
    )
      return { status: 'failed', reason: 'failed' }
    svg.removeAttribute('style')
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    const serialized = new XMLSerializer().serializeToString(svg)
    // Inline and modal coexist. Scope every generated ID and its CSS/marker
    // reference so the modal never resolves a fragment against the inline SVG.
    const ids = [svg, ...svg.querySelectorAll('[id]')]
      .flatMap((element) => {
        const id = element.getAttribute('id')
        return id ? [id] : []
      })
      .sort((a, b) => b.length - a.length)
    let previewSvg = serialized
    for (const id of ids) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      previewSvg = previewSvg.replace(new RegExp(`id="${escaped}"|#${escaped}(?=[\\s.,:>{)}\\["']|$)`, 'g'), (value) =>
        value.startsWith('id=') ? `id="${id}-preview"` : `#${id}-preview`,
      )
    }
    previewSvg = previewSvg.replace(
      /\b(aria-labelledby|aria-describedby)="([^"]*)"/g,
      (_, attribute: string, value: string) =>
        `${attribute}="${value
          .split(/\s+/)
          .map((id) => (ids.includes(id) ? `${id}-preview` : id))
          .join(' ')}"`,
    )
    return { status: 'ready', svg: serialized, previewSvg, width, height }
  } catch {
    return { status: 'failed', reason: 'invalid' }
  } finally {
    container.remove()
  }
}

export const renderMarkdownDiagram = createDiagramRenderQueue(renderLocalDiagram)

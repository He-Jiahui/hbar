/** Limits belong to the renderer, never to the original source/Copy payload. */
export const MAX_DIAGRAM_CHARACTERS = 16 * 1024
export const MAX_DIAGRAM_PENDING = 8
export type DiagramFailure = 'empty' | 'too_large' | 'restricted' | 'invalid' | 'busy' | 'failed'

export interface HbarDiagramLabels {
  readonly title: string
  readonly source: string
  readonly diagram: string
  readonly preview: string
  readonly previewTitle: string
  readonly close: string
  readonly loading: string
  readonly generating: string
  readonly retry: string
  readonly failure: (reason: DiagramFailure) => string
  readonly zoomIn: string
  readonly zoomOut: string
  readonly resetZoom: string
  readonly fit: string
  readonly zoom: (percent: number) => string
  readonly panHelp: string
}

export function isDiagramCode(language: string | null, source: string): boolean {
  const normalized = language?.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (normalized === 'mermaid') return true
  if (!['', 'text', 'plaintext', 'plain'].includes(normalized)) return false
  const first = source.split(/\r\n|\r|\n/).find((line) => line.trim()) ?? ''
  return /^\s*(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|requirementDiagram|quadrantChart|xychart-beta|sankey-beta|block-beta|packet-beta|architecture|kanban)\b/i.test(
    first,
  )
}

export function diagramSourceFailure(source: string): DiagramFailure | null {
  if (!source.trim()) return 'empty'
  if (source.length > MAX_DIAGRAM_CHARACTERS) return 'too_large'
  // Render a local, static diagram subset. Author configuration, CSS, HTML,
  // links, image/icon loaders and math are not executable product capabilities.
  // Reject before Mermaid inserts its measurement DOM (post-SVG cleanup is late).
  if (
    /^\s*---/.test(source) ||
    /%%\s*\{|@\{|<\s*[/!a-z]|\\|\$\$|!\s*\[|\burl\s*\(|@import|&(?:#|[a-z]+;)|(?:https?|file|data|javascript|vbscript):/i.test(
      source,
    ) ||
    /(?:^|[\s;])(?:click|href|style|classDef|linkStyle|link|links)\b|\bfa[blrs]?:/im.test(source)
  )
    return 'restricted'
  const first = source.split(/\r\n|\r|\n/).find((line) => line.trim() && !line.trimStart().startsWith('%%'))
  return first &&
    /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph)\b/.test(
      first,
    )
    ? null
    : isDiagramCode(null, source)
      ? 'restricted'
      : 'invalid'
}

export function clampDiagramZoom(value: number): number {
  return Math.min(3, Math.max(0.05, Number.isFinite(value) ? value : 1))
}

export function fitDiagramZoom(width: number, height: number, availableWidth: number, availableHeight: number): number {
  return clampDiagramZoom(
    Math.min(1, Math.max(1, availableWidth - 48) / width, Math.max(1, availableHeight - 48) / height),
  )
}

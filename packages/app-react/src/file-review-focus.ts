/** Captured UI targets only: committing a reference never authorizes navigation or a Run. */
export function captureFileReviewFocus<Node>(options: {
  readonly composer: Node | null
  readonly line: Node | null
  readonly active: () => Node | null
  readonly inEditor: (node: Node) => boolean
  readonly current: () => boolean
  readonly usable: (node: Node) => boolean
  readonly focus: (node: Node) => void
}): () => void {
  const origin = options.active()
  return () => {
    if (!options.current()) return
    const active = options.active()
    if (active !== null && active !== origin && !options.inEditor(active)) return
    const target = options.composer !== null && options.usable(options.composer) ? options.composer : options.line
    if (target !== null && options.usable(target)) options.focus(target)
  }
}

import { Component, type ReactNode } from 'react'
import type { RunFileChangeDiff } from '@hbar/contracts/run-file-changes'

/** Host-selected read-only patch slot. The built-in paged rows remain the safe fallback. */
export interface HbarRunFileChangeRenderer {
  readonly id: string
  readonly slot: 'patch'
  readonly readOnly: true
  readonly render: (page: Readonly<RunFileChangeDiff>) => ReactNode
}
class RendererBoundary extends Component<
  { readonly children: ReactNode; readonly fallback: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
export function HbarRunFileChangeRendererSlot({
  renderer,
  page,
  fallback,
}: {
  readonly renderer: HbarRunFileChangeRenderer | undefined
  readonly page: RunFileChangeDiff
  readonly fallback: ReactNode
}) {
  if (!renderer) return fallback
  let content: ReactNode
  try {
    content = renderer.render(page)
  } catch {
    return fallback
  }
  if (content === null || content === undefined) return fallback
  return (
    <RendererBoundary
      key={JSON.stringify([renderer.id, page.sessionId, page.runId, page.path, page.offset])}
      fallback={fallback}
    >
      {content}
    </RendererBoundary>
  )
}

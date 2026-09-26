import type { FileWorkspaceEntryState } from '@hbar/app-runtime'

/** A canonical reader error can have a more precise code than the command wrapper's rejection. */
export function filePreviewOwnsFailure(
  entry: Pick<FileWorkspaceEntryState, 'previews' | 'activePreviewId'> | undefined,
  command: string,
  input: unknown,
): boolean {
  const preview = entry?.previews.find((item) => item.id === entry.activePreviewId)
  if (!preview || !input || typeof input !== 'object') return false
  const error = preview.kind === 'document' ? preview.document.error : preview.diff.error
  if (!error) return false
  if ('previewId' in input && typeof input.previewId === 'string') return preview.id === input.previewId
  if (!('path' in input) || typeof input.path !== 'string' || preview.path !== input.path.replaceAll('\\', '/'))
    return false
  if (command === 'fileWorkspace.openEntry')
    return preview.kind === 'document' && 'directory' in input && input.directory === false
  if (command === 'fileWorkspace.openChange')
    return (
      preview.kind === 'diff' &&
      (!('cached' in input) || input.cached === undefined || preview.diff.cached === input.cached)
    )
  return false
}

export function focusVisibleFilePreviewControl(owner: HTMLElement): void {
  const candidates = owner.querySelectorAll<HTMLElement>(
    '[role="tab"][aria-selected="true"], .hbar-file-single-preview-close, .hbar-file-tree-controls input, .hbar-file-changes-controls input',
  )
  for (const element of candidates) {
    if (!element.isConnected || element.closest('[hidden], [inert]') || element.matches(':disabled')) continue
    const style = getComputedStyle(element)
    if (!element.getClientRects().length || style.visibility === 'hidden' || style.display === 'none') continue
    element.focus()
    if (element.ownerDocument.activeElement === element) return
  }
}

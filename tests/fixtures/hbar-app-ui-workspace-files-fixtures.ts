import type { HbarAppUiWorkspaceFileLabels, HbarAppUiWorkspaceFile } from '../../packages/hbar-app-ui/src/production'

export const WORKSPACE_FILE_LABELS: HbarAppUiWorkspaceFileLabels = {
  title: 'Files',
  parent: 'Parent directory',
  refresh: 'Refresh files',
  loading: 'Loading files',
  empty: 'This directory is empty',
  retry: 'Retry',
  readOnly: 'Read only',
}
export const WORKSPACE_FILE_ROWS: readonly HbarAppUiWorkspaceFile[] = [
  { id: 'docs', name: 'docs', directory: true },
  { id: 'README.md', name: 'README.md', directory: false },
]
export const WORKSPACE_FILE_SOURCES: Readonly<Record<string, string>> = {
  'README.md': '# Workspace\n\nA host-owned document preview.',
  'docs/notes.md': '# Notes\n\nFile content is supplied by the preview host.',
}

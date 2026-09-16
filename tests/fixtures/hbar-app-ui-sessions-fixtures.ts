import type { HbarAppUiSessionLabels, HbarAppUiSessionRow } from '../../packages/hbar-app-ui/src/production'

export const SESSION_NAVIGATOR_LABELS: HbarAppUiSessionLabels = {
  title: 'Sessions',
  search: 'Search sessions',
  empty: 'No matching sessions',
  create: 'New session',
  archiveFilter: 'Toggle archived sessions',
  fork: (title) => `Fork ${title}`,
  archive: (title) => `Toggle archive ${title}`,
  rename: (title) => `Rename ${title}`,
  name: 'Session name',
  save: 'Save',
  cancel: 'Cancel',
}
export const SESSION_NAVIGATOR_ROWS: readonly HbarAppUiSessionRow[] = [
  { id: 'review', title: 'Review the release', detail: 'Today' },
  { id: 'files', title: 'Explore workspace files', detail: 'Yesterday' },
  { id: 'plan', title: 'Plan the next iteration', detail: 'Yesterday' },
]

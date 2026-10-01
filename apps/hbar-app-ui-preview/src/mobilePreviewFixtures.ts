import type { LumenMobileContent } from '@lumen/app-ui'
import type { MobilePreviewSeed } from './mobilePreviewModel'

export { createMobilePreviewContent } from './mobilePreviewReference'

export function createMobilePreviewSeed(
  content: LumenMobileContent,
  variant: number,
  ownerId: string,
  fixtureId: string,
): MobilePreviewSeed {
  let slots: MobilePreviewSeed['slots'] = []
  let drafts: MobilePreviewSeed['drafts'] = []
  let tasks: MobilePreviewSeed['tasks'] = []
  let requestActions: MobilePreviewSeed['requestActions'] = []
  switch (variant) {
    case 1:
      if (content.activity) {
        slots = [{ id: 'tab', items: content.activity.tabs, initialSelectedId: content.activity.initialTabId }]
        requestActions = [
          { actionId: 'filter' },
          ...[...content.activity.items, ...(content.activity.pages?.flatMap((page) => page.items) ?? [])].map(
            ({ id }) => ({ actionId: 'open', targetId: id }),
          ),
        ]
      }
      break
    case 2:
      if (content.tasks) {
        tasks = content.tasks.tasks
        drafts = [{ id: 'query', value: '' }]
        requestActions = [
          { actionId: 'search' },
          ...(content.tasks.quickActions?.items.map(({ id }) => ({ actionId: 'quick-action', targetId: id })) ?? []),
        ]
      }
      break
    case 3:
      if (content.home) {
        slots = [{ id: 'tab', items: content.home.tabs, initialSelectedId: content.home.initialTabId }]
        drafts = [{ id: 'query', value: '' }]
        requestActions = content.home.cards.map(({ id }) => ({ actionId: 'open', targetId: id }))
      }
      break
    case 4:
      if (content.orders) {
        slots = [{ id: 'tab', items: content.orders.tabs, initialSelectedId: content.orders.initialTabId }]
        requestActions = [
          ...content.orders.orders.map(({ id }) => ({ actionId: 'open', targetId: id })),
          ...[...(content.orders.more?.items ?? []), ...(content.orders.more?.links ?? [])].map(({ id }) => ({
            actionId: 'destination',
            targetId: id,
          })),
        ]
      }
      break
    case 5:
      if (content.runs) {
        slots = [{ id: 'state', items: content.runs.states, initialSelectedId: content.runs.initialStateId }]
        const navigation = content.runs.navigation
        requestActions = [
          { actionId: 'new-run' },
          ...content.runs.runs.map(({ id }) => ({ actionId: 'open', targetId: id })),
          ...[
            ...(navigation?.groups.flatMap((group) => (group.items?.length ? group.items : [group])) ?? []),
            ...(navigation ? [navigation.profile] : []),
          ].map(({ id }) => ({ actionId: 'navigate', targetId: id })),
        ]
      }
      break
    default:
      break
  }
  return { ownerId, variant, fixtureId, slots, drafts, tasks, requestActions }
}

export function mobileRequestNotice(localized: boolean): string {
  return localized
    ? 'Vorschauanfrage erfasst; keine externe Aktion ausgeführt.'
    : 'Preview request recorded; no external action was performed.'
}

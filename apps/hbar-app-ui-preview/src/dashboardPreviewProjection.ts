import type { LumenDashboardContent, LumenDashboardReferenceContent } from '@lumen/app-ui/catalog'
import type {
  DashboardPreviewSeed,
  DashboardPreviewStoreApi,
  DashboardPreviewSelectionSlotSeed,
  DashboardPreviewFlagSeed,
  DashboardPreviewRequestAction,
} from './dashboardPreviewModel'
import { dashboardPreviewNotice } from './dashboardPreviewReferenceFixtures'

type Action = Parameters<LumenDashboardReferenceContent['onRequest']>[0]
type Table = Extract<LumenDashboardReferenceContent, { kind: 'modules' }>['table']
export function createDashboardPreviewSeed(
  content: LumenDashboardReferenceContent,
  variant: number,
  ownerId: string,
  fixtureId: string,
): DashboardPreviewSeed {
  const slots: DashboardPreviewSelectionSlotSeed[] = []
  const flags: DashboardPreviewFlagSeed[] = []
  const requestActions: DashboardPreviewRequestAction[] = []
  function slot(
    id: string,
    items: readonly { readonly id: string; readonly disabled?: boolean | undefined }[],
    initialId: string,
  ) {
    slots.push({ id, items, initialId })
  }
  function request(actions: readonly Action[]) {
    actions.forEach(({ id, value }) => requestActions.push({ actionId: id, ...(value === undefined ? {} : { value }) }))
  }
  switch (content.kind) {
    case 'revenue':
    case 'signups':
      slot('range', content.choices, content.selectedId)
      break
    case 'web-analytics': {
      const items = ['closed', 'sessions', 'pages', 'devices', 'funnel'].map((id) => ({ id }))
      slot('menu', items, 'closed')
      items.filter(({ id }) => id !== 'closed').forEach(({ id }) => flags.push({ id: `hide-${id}`, value: false }))
      flags.push({ id: 'refreshed', value: false })
      items
        .filter(({ id }) => id !== 'closed')
        .forEach(({ id: value }) => request(content.menuActions.map((action) => ({ ...action, value }))))
      break
    }
    case 'status':
      flags.push({ id: 'refreshed', value: false })
      request([content.refresh])
      break
    case 'usage':
      request([content.plan.action])
      break
    case 'channels':
      slot('metric', content.choices, content.selectedId)
      flags.push({ id: 'compare', value: content.compare })
      break
    case 'recurring':
      slot('state', content.choices, content.selectedId)
      break
    case 'modules': {
      slot(
        'sort',
        content.table.columns.filter(({ id }) => id !== 'actions'),
        content.sortColumnId,
      )
      slot('filter', content.filters, content.selectedFilterId)
      slot('module-menu', [{ id: 'closed' }, ...content.table.rows], 'closed')
      flags.push({ id: 'descending', value: content.descending }, { id: 'filter-open', value: content.filterOpen })
      content.table.rows.forEach((row) => {
        flags.push({ id: `star-${row.id}`, value: content.starredIds.includes(row.id) })
        request([
          { id: 'open-spec', label: '', value: row.id },
          ...content.menuActions.map((action) => ({ ...action, value: row.id })),
        ])
      })
      request(content.actions)
      break
    }
    case 'delivery':
      slot('tab', content.choices, content.selectedId)
      slot('week', content.weeks, content.selectedWeekId)
      flags.push({ id: 'bookmark', value: content.bookmarked })
      break
    case 'explorer':
      slot('measure', content.measures, content.selectedId)
      request([
        content.report,
        content.manage,
        ...content.integrations.flatMap(({ action }) => (action ? [action] : [])),
      ])
      break
    case 'coverage':
      request([content.export, ...content.queue.flatMap(({ action }) => (action ? [action] : []))])
      break
    case 'payout':
      request([content.export, ...content.actions, content.release.action])
      break
    case 'goals':
      slot('objective', content.objectives, content.selectedId)
      break
    case 'service':
      slot('service', content.services, content.selectedId)
      request([
        content.refresh,
        ...content.services.flatMap(({ id: value }) => content.actions.map((action) => ({ ...action, value }))),
      ])
      break
  }
  return {
    ownerId,
    variant,
    fixtureId,
    slots,
    flags,
    requestActions,
    query: content.kind === 'modules' || content.kind === 'service' ? content.query : '',
  }
}
function contains(table: Table, query: string): Table {
  const normalized = query.trim().toLocaleLowerCase()
  return {
    ...table,
    rows: table.rows.filter(
      ({ disabled, cells }) =>
        !disabled &&
        cells.some(({ text, detail }) => `${text} ${detail ?? ''}`.toLocaleLowerCase().includes(normalized)),
    ),
  }
}
export function projectDashboardPreview(
  content: LumenDashboardReferenceContent,
  store: DashboardPreviewStoreApi,
  report?: ((action: DashboardPreviewRequestAction) => void) | undefined,
): LumenDashboardContent {
  const state = store.getState()
  let projected: LumenDashboardReferenceContent = content
  switch (content.kind) {
    case 'revenue':
      projected = {
        ...content,
        selectedId: state.selectedBySlot.range ?? '',
        chart: state.selectedBySlot.range === content.selectedId ? content.chart : undefined,
      }
      break
    case 'signups':
      projected = {
        ...content,
        selectedId: state.selectedBySlot.range ?? '',
        chart: state.selectedBySlot.range === content.selectedId ? content.chart : undefined,
        breakdown: state.selectedBySlot.range === content.selectedId ? content.breakdown : undefined,
      }
      break
    case 'web-analytics':
      projected = {
        ...content,
        menuId: state.selectedBySlot.menu === 'closed' ? undefined : state.selectedBySlot.menu,
        hiddenWidgetIds: ['sessions', 'pages', 'devices', 'funnel'].filter((id) => state.flagsById[`hide-${id}`]),
        period: state.flagsById.refreshed ? 'Updated just now' : content.period,
      }
      break
    case 'status':
      projected = { ...content, period: state.flagsById.refreshed ? 'Updated just now' : content.period }
      break
    case 'usage':
    case 'coverage':
    case 'payout':
      break
    case 'channels': {
      const compare = state.flagsById.compare ?? false
      const source = state.selectedBySlot.metric === content.selectedId ? content.table : undefined
      projected = {
        ...content,
        selectedId: state.selectedBySlot.metric ?? '',
        compare,
        table: source
          ? {
              ...source,
              columns: source.columns.map((column) =>
                column.id === 'change' ? { ...column, narrow: compare } : column,
              ),
              rows: source.rows.map((row) => ({
                ...row,
                cells: row.cells.map((cell, index) => (index === 2 && !compare ? { ...cell, text: '' } : cell)),
              })),
            }
          : undefined,
      }
      break
    }
    case 'recurring': {
      const selected = state.selectedBySlot.state
      const mode = selected === 'loading' || selected === 'empty' ? selected : 'ready'
      projected = { ...content, selectedId: selected ?? '', mode }
      break
    }
    case 'modules': {
      const filtered = contains(content.table, state.query)
      const selected = state.selectedBySlot.filter ?? 'all'
      const sort = state.selectedBySlot.sort ?? 'module'
      const column = content.table.columns.findIndex(({ id }) => id === sort)
      const descending = state.flagsById.descending ?? false
      const rows = filtered.rows.filter(({ cells }) => selected === 'all' || cells[3]?.text === selected)
      rows.sort((a, b) => {
        const left = a.cells[column]
        const right = b.cells[column]
        const order =
          sort === 'progress'
            ? (left?.progress ?? 0) - (right?.progress ?? 0)
            : (left?.text ?? '').localeCompare(right?.text ?? '')
        return descending ? -order : order
      })
      projected = {
        ...content,
        query: state.query,
        descending,
        sortColumnId: sort,
        selectedFilterId: selected,
        filterOpen: state.flagsById['filter-open'] ?? false,
        menuRowId: state.selectedBySlot['module-menu'] === 'closed' ? undefined : state.selectedBySlot['module-menu'],
        starredIds: content.table.rows.filter(({ id }) => state.flagsById[`star-${id}`]).map(({ id }) => id),
        table: { ...content.table, rows },
      }
      break
    }
    case 'delivery': {
      const knownWeek = state.selectedBySlot.week === content.selectedWeekId ? content.worklog : content.previousWorklog
      projected = {
        ...content,
        selectedId: state.selectedBySlot.tab ?? '',
        selectedWeekId: state.selectedBySlot.week ?? '',
        bookmarked: state.flagsById.bookmark ?? false,
        worklog:
          (state.selectedBySlot.tab === 'overview' || state.selectedBySlot.tab === 'worklog') &&
          state.selectedBySlot.week !== 'next'
            ? knownWeek
            : undefined,
      }
      break
    }
    case 'explorer':
      projected = { ...content, selectedId: state.selectedBySlot.measure ?? '' }
      break
    case 'goals':
      projected = { ...content, selectedId: state.selectedBySlot.objective ?? '' }
      break
    case 'service': {
      const query = state.query.trim().toLocaleLowerCase()
      projected = {
        ...content,
        selectedId: state.selectedBySlot.service ?? '',
        query: state.query,
        services: content.services.filter(({ title, detail }) =>
          `${title} ${detail ?? ''}`.toLocaleLowerCase().includes(query),
        ),
      }
      break
    }
  }
  const visible = projected
  function eligible(action: Action): boolean {
    if (action.disabled) return false
    const current = store.getState()
    if (
      content.kind === 'modules' &&
      (action.id === 'open-spec' || content.menuActions.some(({ id }) => id === action.id))
    )
      return contains(content.table, current.query).rows.some(
        ({ id, disabled, cells }) =>
          id === action.value &&
          !disabled &&
          (current.selectedBySlot.filter === 'all' || cells[3]?.text === current.selectedBySlot.filter),
      )
    if (content.kind === 'service' && (action.id === 'logs' || action.id === 'rollback'))
      return (
        action.value === current.selectedBySlot.service &&
        content.services.some(
          ({ id, title, detail }) =>
            id === action.value &&
            `${title} ${detail ?? ''}`.toLocaleLowerCase().includes(current.query.trim().toLocaleLowerCase()),
        )
      )
    return true
  }
  function onRequest(action: Action) {
    if (!eligible(action)) return
    if (visible.kind === 'status' && action.id === 'refresh') {
      store.getState().setFlag(state.ownerId, 'refreshed', true)
      return
    }
    if (visible.kind === 'web-analytics' && action.id === 'hide-widget' && action.value) {
      store.getState().setFlag(state.ownerId, `hide-${action.value}`, true)
      store.getState().select(state.ownerId, 'menu', 'closed')
      return
    }
    if (visible.kind === 'web-analytics' && action.id === 'refresh-widget') {
      store.getState().setFlag(state.ownerId, 'refreshed', true)
      store.getState().select(state.ownerId, 'menu', 'closed')
      return
    }
    const result = store
      .getState()
      .request(state.ownerId, { actionId: action.id, ...(action.value === undefined ? {} : { value: action.value }) })
    if (result) report?.({ actionId: result.actionId, ...(result.value === undefined ? {} : { value: result.value }) })
  }
  const request = state.lastRequest
  return {
    reference: {
      ...projected,
      onSelect: (slot, id) => {
        store.getState().select(state.ownerId, slot, id)
      },
      onFlag: (id, value) => {
        store.getState().setFlag(state.ownerId, id, value)
      },
      onQuery: (value) => {
        store.getState().setQuery(state.ownerId, value)
      },
      onRequest,
    },
    presentation: {
      ownerId: state.ownerId,
      notice: request ? dashboardPreviewNotice(request.actionId, request.value) : undefined,
    },
  }
}

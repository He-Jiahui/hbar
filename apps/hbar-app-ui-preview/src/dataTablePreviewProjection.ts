import type { LumenDataTableContent, LumenDataTableReferenceContent } from '@lumen/app-ui/catalog'
import type { TablePreviewSeed, TablePreviewStoreApi } from './dataTablePreviewModel'
import { dataTablePreviewMoney, dataTablePreviewNotice } from './dataTablePreviewReferenceFixtures'

type Standard = Exclude<LumenDataTableReferenceContent, { readonly kind: 'shipments' | 'sources' }>
function values(row: Standard['rows'][number]): Readonly<Record<string, string | number>> {
  const result: Record<string, string | number> = { name: row.name }
  for (const cell of row.cells) {
    result[cell.id] = cell.value ?? (cell.id === 'peak' ? Number.parseFloat(cell.text) : cell.text)
  }
  return result
}
export function createTablePreviewSeed(
  content: LumenDataTableContent,
  variant: number,
  ownerId: string,
  fixtureId: string,
): TablePreviewSeed {
  const reference = content.reference
  let slots: TablePreviewSeed['slots'] = []
  let rows: TablePreviewSeed['rows'] = []
  let flags: TablePreviewSeed['flags'] = []
  let requestActions: TablePreviewSeed['requestActions'] = []
  let totalRows = 0
  let pageSize = 80
  let allowedPageSizes = [80]
  let sort: TablePreviewSeed['sort']
  if (reference?.kind === 'shipments') {
    rows = reference.items.map((item) => ({
      id: item.id,
      disabled: item.disabled,
      searchText: `${item.name} ${item.route} ${item.status}`,
      values: { name: item.name },
    }))
    slots = [{ id: 'shipment', items: reference.items, initialSelectedId: reference.selectedId }]
    requestActions = reference.items.flatMap((item) => [
      { actionId: 'message', targetId: item.id },
      { actionId: 'deliver', targetId: item.id },
    ])
    totalRows = reference.items.length
  } else if (reference?.kind === 'sources') {
    slots = [{ id: 'state', items: reference.states, initialSelectedId: reference.selectedStateId }]
    requestActions = [{ actionId: 'retry' }, { actionId: 'connect' }]
  } else if (reference) {
    rows = reference.rows.map((row) => ({
      id: row.id,
      disabled: row.disabled,
      searchText: row.searchText,
      categoryId: row.categoryId,
      values: values(row),
      editable: row.cells
        .filter((cell) => cell.editable && cell.value !== undefined)
        .map((cell) => ({ id: cell.id, value: cell.value ?? 0, min: 0, max: 1000000, locked: row.disabled })),
    }))
    sort = reference.sort
    totalRows = reference.total
    pageSize = Math.max(1, reference.rows.length)
    allowedPageSizes = [pageSize]
    switch (reference.kind) {
      case 'accounts':
        slots = [{ id: 'plan', items: reference.filters, initialSelectedId: reference.filterId }]
        flags = reference.columns
          .filter((column) => column.toggleable)
          .map((column) => ({ id: `column:${column.id}`, value: column.visible }))
        requestActions = [{ actionId: 'export' }]
        break
      case 'payments':
        flags = reference.rows
          .filter((row) => !row.disabled)
          .map((row) => ({ id: `select:${row.id}`, value: Boolean(row.selected) }))
        pageSize = reference.pageSize
        allowedPageSizes = [...reference.pageSizes]
        requestActions = [{ actionId: 'hold' }, { actionId: 'export' }]
        break
      case 'checks':
        flags = reference.rows
          .filter((row) => !row.disabled)
          .map((row) => ({ id: `expand:${row.id}`, value: Boolean(row.expanded) }))
        break
      case 'dispatch':
        slots = [{ id: 'density', items: reference.densities, initialSelectedId: reference.densityId }]
        break
      case 'budget':
      case 'capacity':
        break
    }
  }
  return {
    ownerId,
    variant,
    fixtureId,
    slots,
    rows,
    flags,
    requestActions,
    query: '',
    sort,
    page: 1,
    pageSize,
    allowedPageSizes,
    totalRows,
  }
}
export function projectTablePreview(
  content: LumenDataTableContent,
  store: TablePreviewStoreApi,
  report: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenDataTableContent {
  const state = store.getState()
  const ownerId = state.ownerId
  const request: NonNullable<LumenDataTableContent['onAction']> = ({ actionId, value }) => {
    const current = store.getState()
    if (
      content.reference?.kind === 'shipments' &&
      (value !== current.selectedBySlot.shipment || !current.visibleRowIds.includes(value ?? ''))
    )
      return
    if (
      content.reference?.kind === 'sources' &&
      (actionId === 'retry' ? current.selectedBySlot.state !== 'error' : current.selectedBySlot.state !== 'empty')
    )
      return
    if (
      content.reference?.kind === 'payments' &&
      !current.flags.some((flag) => flag.id.startsWith('select:') && current.flagsById[flag.id])
    )
      return
    if (current.request(ownerId, { actionId, ...(value === undefined ? {} : { targetId: value }) })) {
      const selected =
        content.reference?.kind === 'payments'
          ? current.flags
              .filter((flag) => flag.id.startsWith('select:') && current.flagsById[flag.id])
              .map((flag) => flag.id.slice(7))
          : undefined
      report({ actionId, ...(selected ? { value: JSON.stringify(selected) } : value === undefined ? {} : { value }) })
    }
  }
  let reference = content.reference
  if (reference?.kind === 'shipments') {
    const items = reference.items.filter((item) => state.visibleRowIds.includes(item.id))
    reference = {
      ...reference,
      query: state.query,
      items,
      selectedId: state.selectedBySlot.shipment,
      onQuery: (query) => store.getState().setQuery(ownerId, query),
      onSelect: (id: string) => {
        if (store.getState().visibleRowIds.includes(id)) store.getState().select(ownerId, 'shipment', id)
      },
    }
  } else if (reference?.kind === 'sources') {
    reference = {
      ...reference,
      selectedStateId: state.selectedBySlot.state,
      onState: (id) => store.getState().select(ownerId, 'state', id),
    }
  } else if (reference) {
    const knownRows = new Map(reference.rows.map((row) => [row.id, row]))
    const allRows = reference.rows.map((row) => {
      const nextValues = state.rowsById[row.id]?.values ?? values(row)
      return {
        ...row,
        selected: state.flagsById[`select:${row.id}`] ?? row.selected,
        expanded: state.flagsById[`expand:${row.id}`] ?? row.expanded,
        cells: row.cells.map((cell) => {
          const value = nextValues[cell.id]
          const numeric = typeof value === 'number' ? value : undefined
          const editing = state.editDraft?.rowId === row.id && state.editDraft.fieldId === cell.id
          return {
            ...cell,
            ...(numeric === undefined
              ? {}
              : {
                  value: numeric,
                  text: ['mrr', 'amount', 'rate', 'total'].includes(cell.id)
                    ? dataTablePreviewMoney(numeric)
                    : cell.id === 'peak'
                      ? `${numeric}%`
                      : String(numeric),
                }),
            ...(editing
              ? {
                  editor: {
                    draft: state.editDraft?.value ?? '',
                    error: state.editError ? 'Enter a valid non-negative number.' : undefined,
                  },
                }
              : {}),
          }
        }),
      }
    })
    const projectedRows = new Map(allRows.map((row) => [row.id, row]))
    reference = {
      ...reference,
      rows: state.visibleRowIds.flatMap((id) => {
        const row = projectedRows.get(id)
        return row ? [row] : []
      }),
      query: state.query,
      sort: state.sort,
      onQuery: (query) => store.getState().setQuery(ownerId, query),
      onSort: (field) => {
        const current = store.getState()
        store.getState().setSort(ownerId, {
          field,
          direction: current.sort?.field === field && current.sort.direction === 'desc' ? 'asc' : 'desc',
        })
      },
    }
    switch (reference.kind) {
      case 'accounts':
        reference = {
          ...reference,
          filterId: state.selectedBySlot.plan,
          columns: reference.columns.map((column) => ({
            ...column,
            visible: state.flagsById[`column:${column.id}`] ?? column.visible,
          })),
          onFilter: (id) => store.getState().select(ownerId, 'plan', id),
          onColumn: (id, visible) => store.getState().setFlag(ownerId, `column:${id}`, visible),
          onClearFilters: () => {
            store.getState().setQuery(ownerId, '')
            store.getState().select(ownerId, 'plan', 'all')
          },
        }
        break
      case 'payments': {
        const selected = allRows.filter((row) => row.selected && !row.disabled)
        reference = {
          ...reference,
          page: state.page,
          pageSize: state.pageSize,
          selectedCount: selected.length,
          selectedAmount: dataTablePreviewMoney(
            selected.reduce((sum, row) => sum + (row.cells.find((cell) => cell.id === 'amount')?.value ?? 0), 0),
          ),
          onSelect: (id, selected) => {
            if (store.getState().visibleRowIds.includes(id)) store.getState().setFlag(ownerId, `select:${id}`, selected)
          },
          onSelectPage: (selected) => {
            for (const id of store.getState().visibleRowIds) store.getState().setFlag(ownerId, `select:${id}`, selected)
          },
          onClear: () => {
            for (const flag of store.getState().flags)
              if (flag.id.startsWith('select:')) store.getState().setFlag(ownerId, flag.id, false)
          },
          onPage: (page) => store.getState().setPage(ownerId, page),
          onPageSize: (size) => store.getState().setPageSize(ownerId, size),
        }
        break
      }
      case 'budget': {
        const rows = reference.rows.map((row) => {
          const current = state.rowsById[row.id]?.values
          const total =
            typeof current?.hours === 'number' && typeof current.rate === 'number'
              ? current.hours * current.rate
              : undefined
          return {
            ...row,
            cells: row.cells.map((cell) =>
              cell.id === 'total' && total !== undefined
                ? { ...cell, value: total, text: dataTablePreviewMoney(total) }
                : cell,
            ),
          }
        })
        reference = {
          ...reference,
          rows,
          totalBudget: dataTablePreviewMoney(
            rows.reduce(
              (sum, row) =>
                sum +
                (row.cells.find((cell) => cell.id === 'total')?.value ??
                  Number.parseFloat(
                    knownRows
                      .get(row.id)
                      ?.cells.find((cell) => cell.id === 'total')
                      ?.text.replace(/[^\d.]/g, '') ?? '0',
                  )),
              0,
            ),
          ),
          onBeginEdit: (id, field) => store.getState().beginEdit(ownerId, id, field),
          onDraft: (draft) => store.getState().setEditDraft(ownerId, draft),
          onCommit: () => store.getState().commitEdit(ownerId),
          onCancel: () => store.getState().cancelEdit(ownerId),
        }
        break
      }
      case 'checks':
        reference = {
          ...reference,
          onExpand: (id, expanded) => {
            if (store.getState().visibleRowIds.includes(id)) store.getState().setFlag(ownerId, `expand:${id}`, expanded)
          },
        }
        break
      case 'dispatch':
        reference = {
          ...reference,
          densityId: state.selectedBySlot.density,
          onDensity: (id) => store.getState().select(ownerId, 'density', id),
        }
        break
      case 'capacity':
        break
    }
  }
  return {
    ...content,
    reference,
    onAction: request,
    presentation: { ownerId, notice: state.lastRequest ? dataTablePreviewNotice : undefined },
  }
}

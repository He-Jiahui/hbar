import type { LumenListContent, LumenListReferenceContent as Content, LumenListReferenceAction } from '@lumen/app-ui'
import type {
  ListPreviewSeed,
  ListPreviewStoreApi,
  ListPreviewSelectionSlotSeed,
  ListPreviewFlagSeed,
  ListPreviewRequestAction,
} from './listPreviewModel'
import { listPreviewNotice, listPreviewCapturedSelection } from './listPreviewReferenceFixtures'

function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
function normalizeContent(content: Content): Content {
  switch (content.kind) {
    case 'metrics':
      return { ...content, rows: unique(content.rows) }
    case 'spend':
      return { ...content, rows: unique(content.rows) }
    case 'security':
      return { ...content, rows: unique(content.rows) }
    case 'queue':
      return { ...content, rows: unique(content.rows) }
    case 'assets':
      return { ...content, rows: unique(content.rows) }
    case 'deliveries':
      return { ...content, rows: unique(content.rows) }
    case 'suppliers':
      return { ...content, rows: unique(content.rows) }
    case 'inbox':
      return { ...content, rows: unique(content.rows) }
    case 'contacts':
      return { ...content, rows: unique(content.rows) }
    case 'runbook':
      return { ...content, rows: unique(content.rows) }
    case 'leaderboard':
      return { ...content, rows: unique(content.rows) }
    case 'tree':
      return { ...content, nodes: unique(content.nodes) }
    default:
      return content
  }
}

export function createListPreviewSeed(
  content: Content,
  variant: number,
  ownerId: string,
  fixtureId: string,
): ListPreviewSeed {
  const slots: ListPreviewSelectionSlotSeed[] = [{ id: 'range', items: content.choices, initialId: content.selectedId }]
  const flags: ListPreviewFlagSeed[] = []
  const requestActions: ListPreviewRequestAction[] = []
  const slot = (
    id: string,
    items: readonly { readonly id: string; readonly disabled?: boolean | undefined }[],
    initialId = 'none',
  ) => slots.push({ id, items, initialId })
  const flag = (id: string, value: boolean) => flags.push({ id, value })
  const request = (action: LumenListReferenceAction) =>
    requestActions.push({ actionId: action.id, ...(action.value === undefined ? {} : { value: action.value }) })
  content.actions.filter(({ disabled }) => !disabled).forEach(request)
  switch (content.kind) {
    case 'metrics':
      content.rows.forEach(({ id }) => flag(`expanded-${id}`, content.expandedIds.includes(id)))
      break
    case 'spend':
      slot('entry', [{ id: 'none' }, ...content.rows], content.activeId || 'none')
      break
    case 'security':
      flag('flagged', content.flaggedOnly)
      break
    case 'queue':
      slot('queue', content.rows)
      break
    case 'assets':
      content.rows.forEach(({ id }) => flag(`selected-${id}`, content.selectedIds.includes(id)))
      content.bulkActions.forEach(request)
      break
    case 'deliveries':
      slot('endpoint', content.endpointChoices, content.endpointId)
      content.rows.forEach(({ id }) => {
        flag(`expanded-${id}`, content.expandedIds.includes(id))
        request({ id: 'replay', value: id, label: content.replayLabel })
      })
      break
    case 'suppliers':
      break
    case 'inbox':
      slot('archive', [{ id: 'none' }, ...content.rows])
      content.rows.forEach(({ id, unread }) => {
        flag(`read-${id}`, !unread)
        flag(`archived-${id}`, false)
        request({ id: 'snooze', value: id, label: content.snoozeLabel })
      })
      break
    case 'contacts':
      slot('letter', [
        { id: 'none' },
        ...content.letters.filter((letter) => content.rows.some((row) => row.letter === letter)).map((id) => ({ id })),
      ])
      content.rows.forEach(({ id }) => request({ id: 'email', value: id, label: content.emailLabel(id) }))
      break
    case 'runbook':
      content.rows.forEach(({ id }) => {
        flag(`completed-${id}`, content.completedIds.includes(id))
        request({ id: 'runbook', value: id, label: content.runbookLabel })
      })
      break
    case 'leaderboard':
      slot('period', content.periodChoices, content.periodId)
      break
    case 'tree':
      slot('entry', [{ id: 'none' }, ...content.nodes], content.activeId || 'none')
      content.nodes
        .filter(({ kind }) => kind === 'folder')
        .forEach(({ id }) => flag(`expanded-${id}`, content.expandedIds.includes(id)))
      break
    default:
      break
  }
  return {
    ownerId,
    variant,
    fixtureId,
    slots,
    flags,
    requestActions,
    orderIds: content.kind === 'queue' ? content.rows.map(({ id }) => id) : [],
    query: content.kind === 'suppliers' ? content.query : '',
  }
}
export function projectListPreview(
  input: Content,
  store: ListPreviewStoreApi,
  report?: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenListContent {
  const content = normalizeContent(input)
  const state = store.getState()
  const selectedId = state.selectedBySlot.range ?? content.selectedId
  const captured = listPreviewCapturedSelection(content, selectedId)
  const enabled = (id: string) => state.flagsById[id] ?? false
  let projected: Content = content
  switch (content.kind) {
    case 'metrics':
      projected = {
        ...content,
        ...(captured?.kind === 'metrics' ? captured : {}),
        available: selectedId === content.selectedId || captured !== undefined,
        expandedIds: content.rows.filter(({ id }) => enabled(`expanded-${id}`)).map(({ id }) => id),
      }
      break
    case 'spend':
      projected = {
        ...content,
        available: selectedId === content.selectedId,
        activeId: state.selectedBySlot.entry ?? '',
      }
      break
    case 'security': {
      const flaggedOnly = enabled('flagged')
      const rows = content.rows.filter(
        (row) => (selectedId === 'all' || row.categoryId === selectedId) && (!flaggedOnly || row.flagged),
      )
      projected = { ...content, rows, flaggedOnly, footer: `${rows.length} events shown` }
      break
    }
    case 'queue':
      projected = { ...content, rows: state.orderIds.flatMap((id) => content.rows.filter((row) => row.id === id)) }
      break
    case 'assets': {
      const rows = content.rows.filter((row) => selectedId === 'all' || row.categoryId === selectedId)
      const selectedIds = content.rows.filter(({ id }) => enabled(`selected-${id}`)).map(({ id }) => id)
      projected = {
        ...content,
        rows,
        selectedIds,
        bulkActions: content.bulkActions.map((action) => ({ ...action, disabled: selectedIds.length === 0 })),
        footer: `${rows.length} assets`,
      }
      break
    }
    case 'deliveries': {
      const endpointId = state.selectedBySlot.endpoint ?? content.endpointId
      const rows = content.rows.filter(
        (row) =>
          (endpointId === 'all' || row.endpointId === endpointId) &&
          (selectedId === 'all' || (selectedId === 'failed' ? row.failed : !row.failed)),
      )
      projected = {
        ...content,
        rows,
        endpointId,
        expandedIds: rows.filter(({ id }) => enabled(`expanded-${id}`)).map(({ id }) => id),
      }
      break
    }
    case 'suppliers': {
      const query = state.query.trim().toLocaleLowerCase()
      const rows = content.rows.filter(
        (row) =>
          (selectedId === 'all' || row.categoryId === selectedId) &&
          `${row.title} ${row.category} ${row.detail}`.toLocaleLowerCase().includes(query),
      )
      projected = {
        ...content,
        rows,
        query: state.query,
        subtitle: `${rows.length} of ${content.rows.length} suppliers`,
      }
      break
    }
    case 'inbox': {
      const remaining = content.rows
        .filter(({ id }) => !enabled(`archived-${id}`))
        .map((row) => ({ ...row, unread: !enabled(`read-${row.id}`) }))
      const rows = remaining.filter((row) => selectedId === 'all' || row.unread)
      projected = {
        ...content,
        rows,
        subtitle: remaining.some(({ unread }) => unread)
          ? `${remaining.filter(({ unread }) => unread).length} unread`
          : "You're all caught up",
        actions: content.actions.map((action) => ({ ...action, disabled: !remaining.some(({ unread }) => unread) })),
        archiveNotice: state.selectedBySlot.archive !== 'none' ? 'Message archived in local preview.' : undefined,
      }
      break
    }
    case 'contacts':
      projected = {
        ...content,
        rows: selectedId === 'all' ? content.rows : [],
        available: selectedId === 'all',
        selectedLetter: state.selectedBySlot.letter === 'none' ? '' : (state.selectedBySlot.letter ?? ''),
      }
      break
    case 'runbook': {
      let previousDone = true
      const rows = content.rows.map((row) => {
        const done = enabled(`completed-${row.id}`)
        const disabled = !previousDone && !done
        previousDone = previousDone && done
        return { ...row, disabled }
      })
      projected = {
        ...content,
        rows,
        completedIds: rows.filter(({ id }) => enabled(`completed-${id}`)).map(({ id }) => id),
      }
      break
    }
    case 'leaderboard': {
      const periodId = state.selectedBySlot.period ?? content.periodId
      const rows = [...content.rows].sort((a, b) =>
        selectedId === 'response'
          ? a.responseSeconds - b.responseSeconds
          : selectedId === 'satisfaction'
            ? b.satisfaction - a.satisfaction
            : b.resolved - a.resolved,
      )
      projected = {
        ...content,
        rows,
        periodId,
        available: periodId === 'week',
        subtitle:
          new Map([
            ['resolved', 'Ranked by conversations resolved'],
            ['response', 'Ranked by median first-response time'],
            ['satisfaction', 'Ranked by customer satisfaction'],
          ]).get(selectedId) ?? content.subtitle,
      }
      break
    }
    case 'tree':
      projected = {
        ...content,
        activeId: state.selectedBySlot.entry ?? '',
        expandedIds: content.nodes
          .filter(({ id, kind }) => kind === 'folder' && enabled(`expanded-${id}`))
          .map(({ id }) => id),
      }
      break
    default:
      break
  }
  function currentReference(): Content | undefined {
    return projectListPreview(content, store).reference
  }
  function visible(id: string): boolean {
    const current = currentReference()
    if (!current || current.available === false) return false
    if ('rows' in current) return current.rows.some((row) => row.id === id && !row.disabled)
    return current.nodes.some((node) => node.id === id)
  }
  function onRequest(action: LumenListReferenceAction) {
    if (action.disabled) return
    const current = store.getState()
    if (content.kind === 'queue' && action.id === 'reset-order') {
      current.resetOrder(state.ownerId)
      return
    }
    if (content.kind === 'assets' && action.id === 'clear-selection') {
      content.rows.forEach(({ id }) => current.setFlag(state.ownerId, `selected-${id}`, false))
      return
    }
    if (content.kind === 'inbox' && action.id === 'mark-all-read') {
      content.rows
        .filter(({ id }) => !current.flagsById[`archived-${id}`])
        .forEach(({ id }) => current.setFlag(state.ownerId, `read-${id}`, true))
      return
    }
    if (content.kind === 'tree' && (action.id === 'expand-all' || action.id === 'collapse-all')) {
      content.nodes
        .filter(({ kind }) => kind === 'folder')
        .forEach(({ id }) => current.setFlag(state.ownerId, `expanded-${id}`, action.id === 'expand-all'))
      return
    }
    if (action.value && !visible(action.value)) return
    if (content.kind === 'deliveries' && action.value && !current.flagsById[`expanded-${action.value}`]) return
    if (content.kind === 'assets' && !content.rows.some(({ id }) => current.flagsById[`selected-${id}`])) return
    const request = current.request(state.ownerId, {
      actionId: action.id,
      ...(action.value === undefined ? {} : { value: action.value }),
    })
    const requestValue =
      content.kind === 'assets'
        ? content.rows
            .filter(({ id }) => current.flagsById[`selected-${id}`])
            .map(({ id }) => id)
            .join(',')
        : request?.value
    if (request)
      report?.({ actionId: request.actionId, ...(requestValue === undefined ? {} : { value: requestValue }) })
  }
  return {
    reference: {
      ...projected,
      selectedId,
      onSelect: (slotId, itemId) => {
        const current = store.getState()
        if (slotId === 'archive' && content.kind === 'inbox') {
          if (itemId === 'none') {
            const archived = current.selectedBySlot.archive
            if (archived && archived !== 'none') current.setFlag(state.ownerId, `archived-${archived}`, false)
          } else {
            if (!visible(itemId)) return
            current.setFlag(state.ownerId, `archived-${itemId}`, true)
          }
        }
        if (slotId === 'entry' && content.kind === 'spend' && !visible(itemId)) return
        if (slotId === 'letter' && content.kind === 'contacts' && current.selectedBySlot.range !== 'all') return
        current.select(state.ownerId, slotId, itemId)
      },
      onFlag: (flagId, value) => {
        const current = store.getState()
        if (content.kind === 'assets' && flagId === 'select-all') {
          const visibleContent = currentReference()
          if (visibleContent?.kind === 'assets')
            visibleContent.rows
              .filter(({ disabled }) => !disabled)
              .forEach(({ id }) => current.setFlag(state.ownerId, `selected-${id}`, value))
          return
        }
        const prefix = ['expanded-', 'selected-', 'read-', 'completed-'].find((candidate) =>
          flagId.startsWith(candidate),
        )
        const itemId = prefix ? flagId.slice(prefix.length) : undefined
        if (itemId && !visible(itemId)) return
        if (content.kind === 'runbook' && prefix === 'completed-' && !value && itemId) {
          const start = content.rows.findIndex(({ id }) => id === itemId)
          content.rows.slice(start).forEach(({ id }) => current.setFlag(state.ownerId, `completed-${id}`, false))
        } else current.setFlag(state.ownerId, flagId, value)
      },
      onQuery: (value) => {
        store.getState().setQuery(state.ownerId, value)
      },
      onMove: (itemId, beforeId) => {
        if (content.kind === 'queue') store.getState().move(state.ownerId, itemId, beforeId)
      },
      onRequest,
    },
    presentation: {
      ownerId: state.ownerId,
      notice: state.lastRequest
        ? listPreviewNotice(
            state.lastRequest.actionId,
            content.kind === 'assets'
              ? content.rows
                  .filter(({ id }) => state.flagsById[`selected-${id}`])
                  .map(({ id }) => id)
                  .join(',')
              : state.lastRequest.value,
          )
        : undefined,
    },
  }
}

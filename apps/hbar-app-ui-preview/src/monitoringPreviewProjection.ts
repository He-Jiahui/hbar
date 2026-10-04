import type {
  LumenMonitoringContent,
  LumenMonitoringReferenceContent,
  LumenMonitoringReferenceTone,
} from '@lumen/app-ui'
import {
  type MonitoringChoiceField,
  type MonitoringPreviewSeed,
  type MonitoringPreviewStoreApi,
  type MonitoringSortId,
} from './monitoringPreviewModel'
import { monitoringPreviewNotice } from './monitoringPreviewReferenceFixtures'

function first<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return rows.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
function normalize(content: LumenMonitoringReferenceContent): LumenMonitoringReferenceContent {
  switch (content.kind) {
    case 'health':
      return { ...content, events: first(content.events), metrics: first(content.metrics) }
    case 'live':
      return { ...content, metrics: first(content.metrics) }
    case 'incident':
      return {
        ...content,
        updates: first(content.updates),
        affected: first(content.affected),
        responders: first(content.responders),
      }
    case 'alerts':
      return { ...content, rows: first(content.rows) }
    case 'logs':
      return { ...content, lines: first(content.lines).slice(-140) }
    case 'uptime':
      return { ...content, services: first(content.services) }
    case 'fleet':
      return { ...content, nodes: first(content.nodes) }
    case 'response':
      return { ...content, routes: first(content.routes) }
    case 'queue':
      return { ...content, runs: first(content.runs), groups: first(content.groups) }
    case 'slo':
      return { ...content, objectives: first(content.objectives) }
  }
}
export function createMonitoringPreviewSeed(
  input: LumenMonitoringReferenceContent,
  variant: number,
  ownerId: string,
  fixtureId = 'default',
): MonitoringPreviewSeed {
  const content = normalize(input)
  const choices: MonitoringPreviewSeed['choices'][number][] = []
  const items: MonitoringPreviewSeed['items'][number][] = []
  const groups: MonitoringPreviewSeed['groups'][number][] = []
  const requests: MonitoringPreviewSeed['requestActions'][number][] = []
  let initialSelectedId = ''
  let initialSortId: MonitoringSortId = 'node'
  let initialDescending = false
  let initialPaused = false
  let initialFollow = false
  const choice = (field: MonitoringChoiceField, values: readonly { readonly id: string }[], initialId: string) =>
    choices.push({ field, ids: values.map(({ id }) => id), initialId })
  switch (content.kind) {
    case 'health':
      choice('range', content.ranges, content.rangeId)
      items.push(...content.metrics)
      requests.push({ actionId: 'refresh' }, ...content.metrics.map(({ id }) => ({ actionId: 'options', value: id })))
      break
    case 'live':
      choice('metric', content.choices, content.metricId)
      initialPaused = content.paused
      break
    case 'incident':
      choice('status', content.statuses, content.statusId)
      items.push(...content.updates)
      break
    case 'alerts':
      choice('state', content.states, content.stateId)
      items.push(...content.rows.map((row) => ({ ...row, expandedByDefault: content.expandedIds.includes(row.id) })))
      break
    case 'logs':
      choice('level', content.levels, content.levelId)
      items.push(...content.lines)
      initialPaused = content.paused
      initialFollow = content.follow
      break
    case 'uptime':
      choice('window', content.windows, content.windowId)
      items.push(...content.services)
      break
    case 'fleet':
      choice('region', content.regions, content.regionId)
      items.push(
        ...content.nodes.map((node) => ({ ...node, expandedByDefault: content.expandedIds.includes(node.id) })),
      )
      initialSortId = 'cpu'
      initialDescending = true
      break
    case 'response':
      items.push(...content.routes)
      initialSelectedId = content.selectedId
      initialSortId = 'p99'
      initialDescending = true
      requests.push(...content.buckets.map(({ id }) => ({ actionId: 'bucket', value: id })))
      break
    case 'queue':
      items.push(...content.runs)
      groups.push(
        ...content.groups.map((group) => ({
          ...group,
          expandedByDefault: content.expandedGroupIds.includes(group.id),
        })),
      )
      requests.push({ actionId: 'new-run' }, ...content.runs.map(({ id }) => ({ actionId: 'run-actions', value: id })))
      break
    case 'slo':
      choice('window', content.windows, content.windowId)
      items.push(...content.objectives)
      initialSelectedId = content.selectedId
      break
  }
  return {
    ownerId,
    variant,
    fixtureId,
    choices,
    items,
    groups,
    initialSelectedId,
    initialSortId,
    initialDescending,
    initialPaused,
    initialFollow,
    requestActions: requests,
  }
}
export function projectMonitoringPreview(
  input: LumenMonitoringReferenceContent,
  store: MonitoringPreviewStoreApi,
  report?: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenMonitoringContent {
  const content = normalize(input)
  const state = store.getState()
  const owner = state.ownerId
  const query = state.query.trim().toLocaleLowerCase()
  const matches = (value: string) => value.toLocaleLowerCase().includes(query)
  let projected: LumenMonitoringReferenceContent = content
  switch (content.kind) {
    case 'health':
      projected = {
        ...content,
        rangeId: state.choiceIds.range ?? content.rangeId,
        available: (state.choiceIds.range ?? content.rangeId) === content.rangeId,
      }
      break
    case 'live':
      projected = {
        ...content,
        metricId: state.choiceIds.metric ?? content.metricId,
        paused: state.paused,
        header: { ...content.header, status: state.paused ? 'Paused' : content.header.status },
        available: (state.choiceIds.metric ?? content.metricId) === content.metricId,
      }
      break
    case 'incident': {
      const statusId = state.choiceIds.status ?? content.statusId
      const status = content.statuses.find(({ id }) => id === statusId)?.label ?? content.statusLabel
      projected = {
        ...content,
        statusId,
        draft: state.draft,
        updates: [
          ...state.localUpdates.map((update) => ({
            id: update.id,
            initials: 'LP',
            author: 'Local preview',
            time: 'Local draft',
            status: content.statuses.find(({ id }) => id === update.statusId)?.label ?? status,
            body: update.body,
            tone: 'neutral' as LumenMonitoringReferenceTone,
          })),
          ...content.updates,
        ],
        notice: state.localUpdates.length
          ? 'Update posted locally; no subscribers were contacted.'
          : statusId !== content.statusId
            ? 'Incident status changed in local preview only.'
            : undefined,
      }
      break
    }
    case 'alerts': {
      const rows = content.rows.map((row) => ({
        ...row,
        stateId: state.resolvedIds.includes(row.id) ? 'resolved' : row.stateId,
        muted: state.mutedIds.includes(row.id),
      }))
      const stateId = state.choiceIds.state ?? content.stateId
      projected = {
        ...content,
        stateId,
        query: state.query,
        rows: rows.filter(
          (row) => (stateId === 'all' || row.stateId === stateId) && matches(`${row.title} ${row.meta}`),
        ),
        total: Math.max(content.total, rows.length),
        expandedIds: state.expandedIds,
        states: content.states.map((choice) => ({
          ...choice,
          count:
            choice.id === 'all'
              ? Math.max(content.total, rows.length)
              : Math.max(
                  0,
                  (choice.count ?? rows.filter(({ stateId: value }) => value === choice.id).length) +
                    (choice.id === 'resolved'
                      ? state.resolvedIds.length
                      : choice.id === 'firing'
                        ? -state.resolvedIds.length
                        : 0),
                ),
        })),
        notice:
          stateId !== 'firing'
            ? 'Only the three captured firing rules and their local changes are available; four other source rules were not captured.'
            : state.resolvedIds.length || state.mutedIds.length
              ? 'Alert states changed in local preview only.'
              : undefined,
      }
      break
    }
    case 'logs': {
      const lines = state.cleared ? [] : content.lines
      const levelId = state.choiceIds.level ?? content.levelId
      const visible = lines.filter(
        (line) => (levelId === 'all' || line.level === levelId) && matches(`${line.message} ${line.service}`),
      )
      projected = {
        ...content,
        levelId,
        query: state.query,
        paused: state.paused,
        follow: state.follow,
        lines: visible,
        expandedIds: state.expandedIds,
        total: lines.length,
        footer: `${visible.length} of ${lines.length} lines · buffer capped at 140`,
        header: {
          ...content.header,
          status: state.paused ? 'Paused' : content.header.status,
          detail: `production · all services · ${visible.filter(({ level }) => level === 'error').length} errors in view`,
        },
        notice: state.cleared ? 'Buffer cleared locally. No production logs were deleted.' : undefined,
      }
      break
    }
    case 'uptime': {
      const windowId = state.choiceIds.window ?? content.windowId
      const length = Number(windowId)
      projected = {
        ...content,
        windowId,
        expandedIds: state.expandedIds,
        startLabel: `${length} days ago`,
        header: {
          ...content.header,
          detail:
            windowId === '30'
              ? '99.935% average uptime over 30 days'
              : windowId === content.windowId
                ? content.header.detail
                : `Historical strip limited to the last ${length} captured days; aggregate uptime is the original snapshot.`,
        },
        services: content.services.map((service) => ({
          ...service,
          days: service.days.slice(-length),
          uptime: windowId === '30' ? (service.name === 'Search' ? '99.91% uptime' : '99.94% uptime') : service.uptime,
          chartLabel: `${service.name} daily status for the last ${length} captured days`,
        })),
      }
      break
    }
    case 'fleet': {
      const regionId = state.choiceIds.region ?? content.regionId
      const nodes = content.nodes.filter(
        (node) => (regionId === 'all' || node.region === regionId) && matches(`${node.name} ${node.role}`),
      )
      nodes.sort((a, b) => {
        const value =
          state.sortId === 'cpu'
            ? a.cpu - b.cpu
            : state.sortId === 'memory'
              ? a.memory - b.memory
              : state.sortId === 'disk'
                ? a.disk - b.disk
                : a.name.localeCompare(b.name)
        return value * (state.descending ? -1 : 1)
      })
      projected = {
        ...content,
        regionId,
        query: state.query,
        nodes,
        sortId: state.sortId,
        descending: state.descending,
        expandedIds: state.expandedIds,
        total: content.nodes.length,
      }
      break
    }
    case 'response': {
      const routes = [...content.routes].sort((a, b) => {
        const id = state.sortId
        const value =
          id === 'requests'
            ? a.requests - b.requests
            : id === 'p50'
              ? a.p50 - b.p50
              : id === 'p90'
                ? a.p90 - b.p90
                : id === 'errors'
                  ? a.errors - b.errors
                  : a.p99 - b.p99
        return value * (state.descending ? -1 : 1)
      })
      const selected = routes.find(({ id }) => id === state.selectedId)
      projected = {
        ...content,
        routes,
        selectedId: state.selectedId,
        sortId: state.sortId,
        descending: state.descending,
        metrics: selected
          ? ['p50', 'p90', 'p99'].map((id) => {
              const known =
                selected.id === content.selectedId ? content.metrics.find((item) => item.id === id) : undefined
              const value = id === 'p50' ? selected.p50Label : id === 'p90' ? selected.p90Label : selected.p99Label
              return { ...known, id, label: `${id} · ${selected.path}`, value }
            })
          : [],
        histogramLabel: selected ? `Latency histogram for ${selected.path}` : content.histogramLabel,
        histogramTitle:
          state.lastRequest?.actionId === 'bucket' && selected?.id === content.selectedId
            ? (content.buckets.find(({ id }) => id === state.lastRequest?.value)?.detailLabel ?? content.histogramTitle)
            : content.histogramTitle,
        buckets: selected?.id === content.selectedId ? content.buckets : [],
        histogramDetail: selected?.id === content.selectedId ? content.histogramDetail : content.labels.unavailable,
        budgetLabel: selected
          ? selected.p99 > 2000
            ? 'p99 over the 2.00s budget'
            : 'p99 within the 2.00s budget'
          : content.labels.empty,
      }
      break
    }
    case 'queue': {
      const runs = content.runs.filter(
        (run) => (!state.attention || run.attention) && matches(`${run.title} ${run.detail} ${run.environment}`),
      )
      projected = {
        ...content,
        runs,
        query: state.query,
        attention: state.attention,
        expandedGroupIds: state.expandedGroupIds,
      }
      break
    }
    case 'slo':
      projected = {
        ...content,
        windowId: state.choiceIds.window ?? content.windowId,
        selectedId: state.selectedId,
        objectives: content.objectives.map((objective) => ({
          ...objective,
          chart:
            (state.choiceIds.window ?? content.windowId) === content.windowId || state.choiceIds.window === '7d'
              ? objective.chart
              : { ...objective.chart, points: [] },
        })),
      }
      break
  }
  const currentContent = () => projectMonitoringPreview(content, store).reference
  const visible = (id: string) => {
    const current = currentContent()
    if (!current) return false
    switch (current.kind) {
      case 'health':
        return current.available && current.metrics.some((item) => item.id === id)
      case 'live':
        return false
      case 'incident':
        return current.updates.some((item) => item.id === id)
      case 'alerts':
        return current.rows.some((item) => item.id === id)
      case 'logs':
        return current.lines.some((item) => item.id === id)
      case 'uptime':
        return current.services.some((item) => item.id === id)
      case 'fleet':
        return current.nodes.some((item) => item.id === id)
      case 'response':
        return current.routes.some((item) => item.id === id)
      case 'queue':
        return current.runs.some((item) => item.id === id && store.getState().expandedGroupIds.includes(item.groupId))
      case 'slo':
        return current.objectives.some((item) => item.id === id)
    }
  }
  return {
    reference: {
      ...projected,
      notice: state.lastRequest
        ? state.lastRequest.actionId === 'bucket'
          ? undefined
          : monitoringPreviewNotice(state.lastRequest.actionId, state.lastRequest.value)
        : projected.notice,
      onAction: (actionId, value) => {
        const current = store.getState()
        switch (actionId) {
          case 'range':
          case 'metric':
          case 'status':
          case 'state':
          case 'level':
          case 'window':
          case 'region':
            if (value !== undefined) current.choose(owner, actionId, value)
            return
          case 'query':
            if (value !== undefined) current.setQuery(owner, value)
            return
          case 'select':
            if (value && visible(value)) current.select(owner, value)
            return
          case 'expand':
            if (value && visible(value)) current.expand(owner, value)
            return
          case 'group':
            if (value) current.group(owner, value)
            return
          case 'all-groups':
            if (value === 'true' || value === 'false') current.allGroups(owner, value === 'true')
            return
          case 'pause':
            current.pause(owner)
            return
          case 'follow':
            current.toggleFollow(owner)
            return
          case 'attention':
            current.toggleAttention(owner)
            return
          case 'silence':
            if (value && visible(value) && current.expandedIds.includes(value)) current.silence(owner, value)
            return
          case 'silence-firing':
            current.silenceFiring(owner)
            return
          case 'resolve':
            if (value && visible(value) && current.expandedIds.includes(value)) current.resolve(owner, value)
            return
          case 'incident-resolve':
            // The captured source Resolve action has no visible state change.
            return
          case 'reset-alerts':
            current.resetAlerts(owner)
            return
          case 'draft':
            if (value !== undefined) current.setDraft(owner, value)
            return
          case 'post':
            current.post(owner)
            return
          case 'clear':
            current.clear(owner)
            return
          case 'sort': {
            const [id, descending] = (value ?? '').split(':')
            if (content.kind !== 'fleet' && content.kind !== 'response') return
            const column = content.columns.find((entry) => entry.id === id)
            if (column && (descending === 'true' || descending === 'false'))
              current.sort(owner, column.id, descending === 'true')
            return
          }
          case 'options':
          case 'run-actions':
            if (!value || !visible(value)) return
            break
          case 'bucket':
            if (
              currentContent()?.kind !== 'response' ||
              current.selectedId !== (content.kind === 'response' ? content.selectedId : '')
            )
              return
            break
          case 'refresh':
          case 'new-run':
            break
        }
        if (current.request(owner, actionId, value)) report?.({ actionId, ...(value === undefined ? {} : { value }) })
      },
    },
  }
}

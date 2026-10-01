import type { LumenNavbarContent } from '@lumen/app-ui'
import { createNavbarPreviewSeed, matchNavbarSearchItems, type NavbarPreviewCopy } from './navbarPreviewFixtures'
import type { NavbarPreviewModelState, NavbarPreviewStoreApi } from './navbarPreviewModel'

/** The reusable components only render the Host's current data and target-bound callbacks. */
export function projectNavbarPreview(
  fixture: LumenNavbarContent,
  state: NavbarPreviewModelState,
  store: NavbarPreviewStoreApi,
  copy: NavbarPreviewCopy,
  report: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenNavbarContent {
  const { ownerId } = state
  const onAction: NonNullable<LumenNavbarContent['onAction']> = ({ actionId, value }) => {
    if (
      state.variant === 3 &&
      ['workspace', 'project', 'environment'].includes(actionId) &&
      value &&
      value !== 'create'
    ) {
      const current = store.getState()
      if (
        actionId === 'project' &&
        !fixture.deployment?.projectMenu?.items.some(
          (item) =>
            item.id === value &&
            item.label
              .toLocaleLowerCase()
              .includes((current.draftsById['project-search'] ?? '').trim().toLocaleLowerCase()),
        )
      )
        return
      if (current.select(ownerId, actionId, value)) report({ actionId, value })
      return
    }
    const request = store.getState().request(ownerId, { actionId, ...(value === undefined ? {} : { targetId: value }) })
    if (request) report({ actionId, ...(value === undefined ? {} : { value }) })
  }
  function select(slotId: string, actionId: string, targetId: string) {
    const current = store.getState()
    if (!current.select(ownerId, slotId, targetId)) return
    if (slotId === 'primary') {
      current.refresh(ownerId, createNavbarPreviewSeed(fixture, state.variant, ownerId, state.fixtureId, targetId))
    }
    report({ actionId, value: targetId })
  }
  const analyticsSection = fixture.analytics?.sections?.find(
    ({ primaryId }) => primaryId === state.selectedBySlot.primary,
  )
  return {
    ...fixture,
    onAction,
    presentation: { ownerId, notice: state.lastRequest ? copy.requestNotice : undefined },
    ...(fixture.projectBoard
      ? {
          projectBoard: {
            ...fixture.projectBoard,
            starred: {
              value: state.flagsById.starred ?? false,
              label: state.flagsById.starred ? copy.removeStar : copy.addStar,
              onChange: (value) => {
                if (store.getState().setFlag(ownerId, 'starred', value))
                  report({ actionId: 'star', value: String(value) })
              },
            },
            selection: {
              tabId: projectTab(state.selectedBySlot['project-tab']),
              onTabChange: (id) => select('project-tab', 'tabs', id),
            },
          },
        }
      : {}),
    ...(fixture.activity
      ? {
          activity: {
            ...fixture.activity,
            search: {
              query: state.draftsById.search ?? '',
              onQueryChange: (query) => {
                store.getState().setDraft(ownerId, 'search', query)
              },
              resultsLabel: copy.searchResults,
              empty: copy.searchEmpty,
              closeLabel: copy.searchClose,
              results: matchNavbarSearchItems(state.draftsById.search ?? ''),
              onResult: (id) => {
                const query = store.getState().draftsById.search
                if (!query?.trim() || query !== state.draftsById.search) return
                if (!matchNavbarSearchItems(query).some((item) => item.id === id)) return
                onAction({ actionId: 'search-result', value: id })
              },
            },
          },
        }
      : {}),
    ...(fixture.analytics
      ? {
          analytics: {
            ...fixture.analytics,
            secondaryOptions: analyticsSection?.secondaryOptions ?? fixture.analytics.secondaryOptions,
            metrics: analyticsSection?.metrics ?? fixture.analytics.metrics,
            selection: {
              primaryId: state.selectedBySlot.primary,
              secondaryId: state.selectedBySlot.secondary,
              onPrimaryChange: (id) => select('primary', 'primary-tab', id),
              onSecondaryChange: (id) => select('secondary', 'secondary-tab', id),
            },
          },
        }
      : {}),
    ...(fixture.filterList
      ? {
          filterList: {
            ...fixture.filterList,
            itemCount: fixture.filterList.filters.find(({ id }) => id === state.selectedBySlot.filter)?.count ?? 0,
            selection: {
              filterId: state.selectedBySlot.filter,
              onFilterChange: (id) => select('filter', 'filter-tab', id),
            },
          },
        }
      : {}),
    ...(fixture.deployment
      ? {
          deployment: {
            ...fixture.deployment,
            workspace:
              fixture.deployment.workspaceMenu?.items.find(({ id }) => id === state.selectedBySlot.workspace)?.label ??
              fixture.deployment.workspace,
            workspaceInitial:
              state.selectedBySlot.workspace === 'cedar'
                ? 'C'
                : state.selectedBySlot.workspace === 'harbor'
                  ? 'H'
                  : fixture.deployment.workspaceInitial,
            project:
              fixture.deployment.projectMenu?.items.find(({ id }) => id === state.selectedBySlot.project)?.label ??
              fixture.deployment.project,
            environment:
              fixture.deployment.environmentMenu?.items.find(({ id }) => id === state.selectedBySlot.environment)
                ?.label ?? fixture.deployment.environment,
            deploymentLabel:
              fixture.deployment.projectMenu?.items.find(({ id }) => id === state.selectedBySlot.project)?.label ??
              fixture.deployment.deploymentLabel,
            deploymentSummary:
              fixture.deployment.summaryLabel?.(
                fixture.deployment.workspaceMenu?.items.find(({ id }) => id === state.selectedBySlot.workspace)
                  ?.label ?? fixture.deployment.workspace,
                fixture.deployment.environmentMenu?.items.find(({ id }) => id === state.selectedBySlot.environment)
                  ?.label ?? fixture.deployment.environment,
              ) ?? fixture.deployment.deploymentSummary,
            workspaceMenu: fixture.deployment.workspaceMenu
              ? { ...fixture.deployment.workspaceMenu, selectionId: state.selectedBySlot.workspace }
              : undefined,
            environmentMenu: fixture.deployment.environmentMenu
              ? { ...fixture.deployment.environmentMenu, selectionId: state.selectedBySlot.environment }
              : undefined,
            projectMenu: fixture.deployment.projectMenu
              ? {
                  ...fixture.deployment.projectMenu,
                  selectionId: state.selectedBySlot.project,
                  items: fixture.deployment.projectMenu.items.filter(({ label }) =>
                    label
                      .toLocaleLowerCase()
                      .includes((state.draftsById['project-search'] ?? '').trim().toLocaleLowerCase()),
                  ),
                  search: {
                    label: copy.projectSearch,
                    empty: copy.projectEmpty,
                    query: state.draftsById['project-search'] ?? '',
                    onChange: (value) => {
                      store.getState().setDraft(ownerId, 'project-search', value)
                    },
                  },
                }
              : undefined,
          },
        }
      : {}),
    ...(fixture.article
      ? {
          article: {
            ...fixture.article,
            bookmarked: {
              value: state.flagsById.bookmarked ?? false,
              label: state.flagsById.bookmarked ? copy.removeBookmark : copy.addBookmark,
              onChange: (value) => {
                if (store.getState().setFlag(ownerId, 'bookmarked', value))
                  report({ actionId: 'bookmark', value: String(value) })
              },
            },
          },
        }
      : {}),
  }
}

function projectTab(id: string | undefined): NonNullable<LumenNavbarContent['projectBoard']>['initialTab'] {
  switch (id) {
    case 'discussion':
    case 'timeline':
    case 'files':
    case 'overview':
      return id
    case undefined:
    case 'tasks':
      return 'tasks'
    default:
      return 'tasks'
  }
}

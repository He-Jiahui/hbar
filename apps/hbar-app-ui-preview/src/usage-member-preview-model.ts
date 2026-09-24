import { createStore } from 'zustand/vanilla'
import type { HbarAppUiSeatUsageContent } from 'hbar-app-ui/catalog'

export interface UsageMemberRecord {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly teamId: string
  readonly teamLabel: string
  readonly tokens: string
  readonly spend: number
  readonly cap: number
}
export interface UsageMemberTeam {
  readonly id: string
  readonly label: string
  /** Omission means all members. */
  readonly filterId?: string | undefined
}
export interface UsageMemberCopy {
  readonly title: string
  readonly search: string
  readonly team: string
  readonly empty: string
  readonly emptyDescription: string
  readonly previous: string
  readonly next: string
  readonly summary: (total: number, count: number) => string
  readonly detail: (team: string, tokens: string) => string
  readonly capacity: (percent: number, cap: number) => string
  readonly money: (value: number) => string
  readonly page: (current: number, total: number) => string
}
export interface UsageMemberPreviewState {
  readonly records: readonly UsageMemberRecord[]
  readonly teams: readonly UsageMemberTeam[]
  readonly teamId: string | undefined
  readonly query: string
  readonly page: number
  readonly select: (id: string) => void
  readonly search: (query: string) => void
  readonly previous: () => void
  readonly next: () => void
  readonly replace: (teams: readonly UsageMemberTeam[], records: readonly UsageMemberRecord[]) => void
}
export const USAGE_MEMBER_PAGE_SIZE = 50
function unique<T extends { readonly id: string }>(records: readonly T[]): readonly T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()]
}
function matching(state: Pick<UsageMemberPreviewState, 'records' | 'teams' | 'teamId' | 'query'>) {
  const filter = state.teams.find((team) => team.id === state.teamId)?.filterId
  return state.records.filter(
    (row) => (!filter || row.teamId === filter) && row.name.toLowerCase().includes(state.query.toLowerCase()),
  )
}
function lastPage(count: number) {
  return Math.max(0, Math.ceil(count / USAGE_MEMBER_PAGE_SIZE) - 1)
}
export function createUsageMemberPreviewStore(
  teams: readonly UsageMemberTeam[],
  records: readonly UsageMemberRecord[],
) {
  return createStore<UsageMemberPreviewState>((set, get) => ({
    records: unique(records),
    teams: unique(teams),
    teamId: teams[0]?.id,
    query: '',
    page: 0,
    select(id) {
      if (get().teams.some((team) => team.id === id)) set({ teamId: id, page: 0 })
    },
    search(query) {
      set({ query, page: 0 })
    },
    previous() {
      set({ page: Math.max(0, get().page - 1) })
    },
    next() {
      set({ page: Math.min(lastPage(matching(get()).length), get().page + 1) })
    },
    replace(nextTeams, nextRecords) {
      const teams = unique(nextTeams),
        records = unique(nextRecords)
      const teamId = teams.some((team) => team.id === get().teamId) ? get().teamId : teams[0]?.id
      set({
        teams,
        records,
        teamId,
        page: Math.min(get().page, lastPage(matching({ ...get(), teams, records, teamId }).length)),
      })
    },
  }))
}
function positive(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
export function projectUsageMemberPreview(
  state: UsageMemberPreviewState,
  copy: UsageMemberCopy,
): HbarAppUiSeatUsageContent {
  const records = matching(state)
  const rows = records
    .slice(state.page * USAGE_MEMBER_PAGE_SIZE, (state.page + 1) * USAGE_MEMBER_PAGE_SIZE)
    .map((row) => {
      const spend = positive(row.spend),
        cap = positive(row.cap)
      const progress = cap > 0 ? (spend / cap) * 100 : spend > 0 ? 100 : 0
      return {
        id: row.id,
        initials: row.initials,
        name: row.name,
        detail: copy.detail(row.teamLabel, row.tokens),
        progress,
        progressLabel: copy.capacity(Math.round(progress), cap),
        capacity: copy.capacity(Math.round(progress), cap),
        spend: copy.money(spend),
        nearCapacity: progress >= 75,
      }
    })
  return {
    title: copy.title,
    description: copy.summary(
      records.reduce((sum, row) => sum + positive(row.spend), 0),
      records.length,
    ),
    strategy: 'content-grown',
    emptyLabel: copy.empty,
    searchLabel: copy.search,
    query: state.query,
    onQueryChange: state.search,
    rows: [],
    members: {
      rows,
      emptyDescription: copy.emptyDescription,
      team: state.teams.length
        ? { label: copy.team, value: state.teamId ?? '', options: state.teams, onChange: state.select }
        : undefined,
      pagination:
        records.length > USAGE_MEMBER_PAGE_SIZE
          ? {
              label: copy.page(state.page + 1, lastPage(records.length) + 1),
              previousLabel: copy.previous,
              nextLabel: copy.next,
              canPrevious: state.page > 0,
              canNext: state.page < lastPage(records.length),
              onPrevious: state.previous,
              onNext: state.next,
            }
          : undefined,
    },
  }
}

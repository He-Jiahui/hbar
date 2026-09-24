import {
  createUsageMemberPreviewStore,
  projectUsageMemberPreview,
  type UsageMemberCopy,
  type UsageMemberRecord,
  type UsageMemberTeam,
} from '../../apps/hbar-app-ui-preview/src/usage-member-preview-model'

export const USAGE_MEMBER_TEAMS: readonly UsageMemberTeam[] = [
  { id: 'all', label: 'All teams' },
  { id: 'platform', label: 'Platform', filterId: 'platform' },
  { id: 'support', label: 'Support', filterId: 'support' },
  { id: 'research', label: 'Research', filterId: 'research' },
]
export const USAGE_MEMBER_RECORDS: readonly UsageMemberRecord[] = [
  {
    id: 'priya',
    initials: 'PN',
    name: 'Priya Nandakumar',
    teamId: 'platform',
    teamLabel: 'Platform',
    tokens: '42M',
    spend: 384,
    cap: 500,
  },
  {
    id: 'marcus',
    initials: 'MB',
    name: 'Marcus Bell',
    teamId: 'support',
    teamLabel: 'Support',
    tokens: '28M',
    spend: 261,
    cap: 300,
  },
  {
    id: 'sofia',
    initials: 'SA',
    name: 'Sofia Alvarez',
    teamId: 'platform',
    teamLabel: 'Platform',
    tokens: '22M',
    spend: 203,
    cap: 500,
  },
  {
    id: 'tomas',
    initials: 'TG',
    name: 'Tomás Guerrero',
    teamId: 'research',
    teamLabel: 'Research',
    tokens: '20M',
    spend: 180,
    cap: 200,
  },
  {
    id: 'wei',
    initials: 'WC',
    name: 'Wei Chen',
    teamId: 'support',
    teamLabel: 'Support',
    tokens: '11M',
    spend: 103,
    cap: 300,
  },
  {
    id: 'amelia',
    initials: 'AW',
    name: 'Amelia Whitfield',
    teamId: 'research',
    teamLabel: 'Research',
    tokens: '6.4M',
    spend: 59,
    cap: 200,
  },
  {
    id: 'jonas',
    initials: 'JV',
    name: 'Jonas Vikander',
    teamId: 'platform',
    teamLabel: 'Platform',
    tokens: '2.9M',
    spend: 27,
    cap: 500,
  },
]
const money = (value: number) => `$${value.toLocaleString('en-US')}`
export const USAGE_MEMBER_COPY: UsageMemberCopy = {
  title: 'Usage by member',
  search: 'Search members',
  team: 'Team',
  empty: 'No members match',
  emptyDescription: 'Try a different name or clear the team filter.',
  previous: 'Previous members',
  next: 'Next members',
  summary: (total, count) => `${money(total)} across ${count} seat${count === 1 ? '' : 's'} this month.`,
  detail: (team, tokens) => `${team} · ${tokens} tokens`,
  capacity: (percent, cap) => `${percent}% of ${money(cap)} cap`,
  money,
  page: (current, total) => `Page ${current} of ${total}`,
}
export function usageMemberFixture(mode: string | null) {
  const records =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 200 }, (_, i) => ({
            ...USAGE_MEMBER_RECORDS[i % USAGE_MEMBER_RECORDS.length]!,
            id: `member-${i}`,
          }))
        : USAGE_MEMBER_RECORDS
  if (mode !== 'localized') return { records, teams: USAGE_MEMBER_TEAMS, copy: USAGE_MEMBER_COPY }
  const money = (value: number) => `${value.toLocaleString('de-DE')} $`
  const copy: UsageMemberCopy = {
    title: 'Nutzung nach Mitglied',
    search: 'Mitglieder suchen',
    team: 'Arbeitsgruppe',
    empty: 'Keine passenden Mitglieder',
    emptyDescription: 'Versuchen Sie einen anderen Namen oder löschen Sie den Teamfilter.',
    previous: 'Vorherige Mitglieder',
    next: 'Weitere Mitglieder',
    summary: (total, count) => `${money(total)} für ${count} Mitglieder in diesem Monat.`,
    detail: (team, tokens) => `${team} · ${tokens} Token`,
    capacity: (percent, cap) => `${percent}% von ${money(cap)} Limit`,
    money,
    page: (current, total) => `Seite ${current} von ${total}`,
  }
  return {
    records: records.map((row) => ({ ...row, name: `Ausführlicher Mitgliedername ${row.name}` })),
    teams: USAGE_MEMBER_TEAMS.map((team) => ({ ...team, label: `Arbeitsgruppe ${team.label}` })),
    copy,
  }
}
export const USAGE_MEMBER_FIXTURE = projectUsageMemberPreview(
  createUsageMemberPreviewStore(USAGE_MEMBER_TEAMS, USAGE_MEMBER_RECORDS).getState(),
  USAGE_MEMBER_COPY,
)

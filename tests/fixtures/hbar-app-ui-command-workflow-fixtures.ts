import { FileText, GitBranch, UserRound } from 'lucide-react'
import type {
  HbarAppUiCommandItem,
  HbarAppUiInviteCommandProps,
  HbarAppUiAssistantCommandsProps,
} from '../../packages/hbar-app-ui/src/command-menu'
export const SEARCH_COMMANDS: readonly (HbarAppUiCommandItem & { readonly kind: 'doc' | 'person' | 'workflow' })[] = [
  {
    id: 'launch',
    kind: 'doc',
    label: 'Launch readiness review',
    description: 'Runbook · Aurora mobile 2.4',
    icon: FileText,
  },
  { id: 'incident', kind: 'doc', label: 'Checkout latency postmortem', description: 'Incident 4821', icon: FileText },
  {
    id: 'rollback',
    kind: 'doc',
    label: 'Rollback procedure for staged deploys',
    description: 'Runbook · Platform',
    icon: FileText,
  },
  { id: 'priya', kind: 'person', label: 'Priya Anand', description: 'Staff engineer · Release', icon: UserRound },
  { id: 'marcus', kind: 'person', label: 'Marcus Reed', description: 'Senior engineer · Reliability', icon: UserRound },
  {
    id: 'deploy',
    kind: 'workflow',
    label: 'Staged deploy to production',
    description: 'Runs on merge to main',
    icon: GitBranch,
  },
  {
    id: 'rotate',
    kind: 'workflow',
    label: 'Rotate signing keys',
    description: 'Runs weekly, Mondays',
    icon: GitBranch,
  },
  {
    id: 'backup',
    kind: 'workflow',
    label: 'Nightly database backup',
    description: 'Runs daily, 02:00 UTC',
    icon: GitBranch,
  },
]
export const SEARCH_SCOPES = [
  { id: 'all', label: 'All' },
  { id: 'doc', label: 'Docs' },
  { id: 'person', label: 'People' },
  { id: 'workflow', label: 'Workflows' },
]
export const SEARCH_COPY = {
  trigger: 'Search docs, people, workflows',
  title: 'Search everything',
  scope: 'Search scope',
  missing: 'Select a result to see its details.',
  open: 'Open result',
  kinds: { doc: 'DOC', person: 'PERSON', workflow: 'WORKFLOW' },
  fields: [
    { id: 'owner', label: 'Owner', value: 'Priya Anand' },
    { id: 'section', label: 'Section', value: 'Release' },
    { id: 'updated', label: 'Updated', value: '6m ago' },
  ],
  body: 'Gate checklist covering rollout stages, alerting thresholds, and the rollback owner for the 2.4 launch.',
}
export const INVITE_FIXTURE = {
  trigger: 'Run an action',
  email: 'erin.walsh@northwind.io',
  roleId: 'editor',
  roles: [
    { id: 'viewer', label: 'Viewer' },
    { id: 'editor', label: 'Editor' },
    { id: 'admin', label: 'Admin' },
  ],
  labels: {
    title: 'Invite a teammate',
    step: 'Step 1 of 2',
    back: 'Back to actions',
    email: 'Email address',
    role: 'Role',
    unavailableRole: 'Choose an available role',
    review: 'Review',
  } satisfies HbarAppUiInviteCommandProps['labels'],
  step: (step: number) => `Step ${step} of 2`,
}
export const ASSISTANT_FIXTURE = {
  query: 'quarterly burn rate by team',
  labels: {
    search: 'Search or ask',
    title: 'No commands match',
    description: 'Nothing in this workspace matches that. Ask the assistant to answer it from your data instead.',
    ask: (query: string) => `Ask about “${query}”`,
    suggestions: 'TRY INSTEAD',
    resultSummary: '0 matching commands',
  } satisfies HbarAppUiAssistantCommandsProps['labels'],
  suggestions: [
    { id: 'billing', label: 'Billing settings' },
    { id: 'invite', label: 'Invite a teammate' },
    { id: 'usage', label: 'Usage report' },
  ],
}

import type { HbarAppUiOnboardingContent } from '../../packages/hbar-app-ui/src/index'

const grown = { kind: 'content-grown', expectedMaximum: 12 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 40 } as const

export const HBAR_APP_UI_ONBOARDING_FIXTURES: HbarAppUiOnboardingContent = {
  profile: {
    labels: {
      title: 'Set up your profile',
      detail: 'Your teammates will see this information',
      name: 'Name',
      role: 'Role',
      continue: 'Continue',
      preview: 'Directory preview',
    },
    initialName: 'Avery Chen',
    initialRole: 'Workspace operator',
    metrics: [
      { id: 'runs', label: 'Active runs', value: '24' },
      { id: 'projects', label: 'Projects', value: '8' },
    ],
  },
  steps: {
    labels: {
      title: 'Getting started',
      detail: (current, total) => `${current} of ${total}`,
      complete: 'Complete',
      current: 'Current step',
      pending: 'Not started',
      body: 'Complete this step to unlock the next part of your workspace.',
      continue: 'Continue',
      empty: 'No setup steps',
    },
    steps: [
      { id: 'profile', label: 'Profile', detail: 'Add your workspace identity.' },
      { id: 'host', label: 'Connect host', detail: 'Pair a machine with this workspace.' },
      { id: 'workspace', label: 'Choose workspace', detail: 'Select the project to open.' },
      { id: 'preferences', label: 'Preferences', detail: 'Set defaults for new tasks.' },
      { id: 'invite', label: 'Invite team', detail: 'Bring collaborators into the workspace.' },
      { id: 'finish', label: 'Finish', detail: 'Review the setup summary.' },
    ],
    initialStepId: 'workspace',
    initialCompletedCount: 2,
    listStrategy: scroll,
  },
  checklist: {
    labels: {
      title: 'Getting started checklist',
      detail: (completed, total) => `${completed} of ${total} complete`,
      progress: 'Onboarding completion',
      complete: 'Complete',
      required: 'Action required',
      view: 'View',
      start: 'Start',
      empty: 'No checklist tasks',
    },
    tasks: [
      { id: 'host', label: 'Connect a host' },
      { id: 'project', label: 'Create a project' },
      { id: 'task', label: 'Run a first task' },
      { id: 'invite', label: 'Invite a teammate' },
    ],
    initialCompletedCount: 1,
    listStrategy: grown,
  },
  useCase: {
    labels: {
      title: 'Choose your use case',
      detail: 'Tailor the workspace to your team',
      useCases: 'Use cases',
      teamSize: 'Team size',
      continue: 'Continue',
      empty: 'No use cases available',
    },
    useCases: [
      { id: 'product', label: 'Product', detail: 'Recommended product workflows' },
      { id: 'engineering', label: 'Engineering', detail: 'Recommended engineering workflows' },
      { id: 'support', label: 'Support', detail: 'Recommended support workflows' },
      { id: 'research', label: 'Research', detail: 'Recommended research workflows' },
    ],
    sizes: [
      { id: '1', label: '1' },
      { id: '2-10', label: '2–10' },
      { id: '11-50', label: '11–50' },
      { id: '51+', label: '51+' },
    ],
    initialUseCaseId: 'product',
    initialSizeId: '2-10',
  },
  invite: {
    labels: {
      title: 'Invite teammates',
      detail: 'Roles and shareable link',
      email: 'Email address',
      emailPlaceholder: 'teammate@workspace.test',
      role: 'Invite role',
      send: 'Send invite',
      copy: 'Copy link',
      copied: 'Copied',
      invitees: 'Team invitations',
      empty: 'No invitations',
    },
    roles: [
      { id: 'member', label: 'Member' },
      { id: 'admin', label: 'Admin' },
    ],
    initialRoleId: 'member',
    invitees: [
      { id: 'avery', initials: 'A', name: 'Avery Chen', status: 'Joined', statusTone: 'success' },
      { id: 'pending', initials: '?', name: 'pending@workspace.test', status: 'Pending', statusTone: 'warning' },
    ],
    shareLink: 'hbar.local/invite/atlas-91a2',
    listStrategy: scroll,
  },
  complete: {
    labels: {
      title: 'Workspace ready',
      detail: 'Everything is configured',
      status: 'Complete',
      heading: "You're ready to go",
      body: 'Host connected, workspace created and preferences saved.',
      primary: 'Run first task',
      secondary: 'Review settings',
    },
    metrics: [
      { id: 'host', label: 'Host', value: 'Connected', tone: 'success' },
      { id: 'workspace', label: 'Workspace', value: 'Atlas' },
      { id: 'members', label: 'Members', value: '1' },
    ],
    primaryValue: 'task',
    secondaryValue: 'settings',
  },
  slug: {
    labels: {
      steps: 'Setup steps',
      detail: 'Live URL slug preview',
      workspaceName: 'Workspace name',
      slug: 'URL slug',
      preview: 'Workspace URL preview',
      next: 'Next',
      finish: 'Finish setup',
    },
    steps: [
      { id: 'workspace', label: 'Workspace', detail: 'Choose a workspace name and URL.' },
      { id: 'team', label: 'Team', detail: 'Confirm your initial collaborators.' },
      { id: 'finish', label: 'Finish', detail: 'Review and complete setup.' },
    ],
    initialStepId: 'workspace',
    finishStepId: 'finish',
    initialWorkspaceName: 'Project Atlas',
    initialSlug: 'project-atlas',
    baseUrl: 'hbar.local/',
  },
}

export function createHbarAppUiOnboardingLocalizedFixtures(): HbarAppUiOnboardingContent {
  return {
    ...HBAR_APP_UI_ONBOARDING_FIXTURES,
    profile: {
      ...HBAR_APP_UI_ONBOARDING_FIXTURES.profile!,
      labels: {
        title: '设置个人资料',
        detail: '你的队友将看到这些信息',
        name: '姓名',
        role: '角色',
        continue: '继续',
        preview: '目录预览',
      },
    },
  }
}

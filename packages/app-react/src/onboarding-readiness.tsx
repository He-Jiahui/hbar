import {
  LumenContentText,
  LumenFrame,
  LumenInput,
  LumenOnboarding3Reference,
  LumenOnboarding6Reference,
  LumenWizard07,
  type LumenOnboarding3ReferenceContent,
  type LumenOnboarding6ReferenceContent,
} from '@lumen/app-ui'
import { createMessageScope } from './messages'

export interface OnboardingReadiness {
  readonly connected: boolean
  readonly workspaceCount: number
  readonly modelCount: number
  readonly projectReady: boolean
}
export interface OnboardingReadinessLabels {
  readonly disconnected: string
  readonly connected: string
  readonly workspace: string
  readonly workspaceDetail: string
  readonly model: string
  readonly modelDetail: string
  readonly project: string
  readonly projectDetail: string
  readonly configure: string
  readonly create: string
  readonly open: string
  readonly progress: string
  readonly progressText: (completed: number, total: number) => string
  readonly footer: string
  readonly empty: string
  readonly readyTitle: string
  readonly readyDescription: string
  readonly readyWorkspace: string
  readonly readyModel: string
  readonly readyProject: string
  readonly openWorkspace: string
  readonly takeTour: string
  readonly inboxNote: string
  readonly setupTitle: string
  readonly setupDescription: string
  readonly workspaceName: string
  readonly workspaceNamePlaceholder: string
  readonly workspaceUrl: string
  readonly workspaceUrlPlaceholder: string
  readonly memberHint: string
  readonly region: string
  readonly regionHint: string
  readonly privateWorkspace: string
  readonly privateWorkspaceDescription: string
  readonly back: string
  readonly continue: string
  readonly setupPath: string
  readonly setupPathPlaceholder: string
  readonly setupPathHint: string
  readonly cancel: string
  readonly retry: string
  readonly error: (code: string) => string
  readonly loading: string
  readonly unavailable: string
}
type OnboardingReadinessMessageLabels = Pick<
  OnboardingReadinessLabels,
  | 'connected'
  | 'disconnected'
  | 'workspace'
  | 'workspaceDetail'
  | 'model'
  | 'modelDetail'
  | 'project'
  | 'projectDetail'
  | 'configure'
  | 'create'
  | 'open'
  | 'progress'
  | 'progressText'
  | 'footer'
  | 'empty'
  | 'readyTitle'
  | 'readyDescription'
  | 'readyProject'
  | 'openWorkspace'
  | 'takeTour'
  | 'inboxNote'
  | 'setupTitle'
  | 'setupDescription'
  | 'back'
  | 'continue'
  | 'setupPath'
  | 'setupPathPlaceholder'
  | 'setupPathHint'
>
const OnboardingReadinessMessages = createMessageScope<OnboardingReadinessMessageLabels>()
export interface OnboardingReadinessActions {
  readonly onConfigure: (kind: 'workspace' | 'model' | 'project') => void
  readonly onCreate: (path: string) => void
  readonly onPathChange?: (path: string) => void
  readonly onRetry?: () => void
  readonly setupPath?: string
  readonly onOpen: () => void
  readonly onBack?: () => void
  readonly onCancel?: () => void
  readonly busy?: boolean
  readonly error?: string | null
}
export function resolveOnboardingVariant(readiness: OnboardingReadiness): 3 | 6 | 7 {
  if (!readiness.connected || readiness.modelCount === 0) return 3
  if (readiness.workspaceCount === 0 || !readiness.projectReady) return 7
  return 6
}
function checklistContent(
  readiness: OnboardingReadiness,
  t: ReturnType<typeof OnboardingReadinessMessages.useMessages>['t'],
): LumenOnboarding3ReferenceContent {
  const tasks = [
    {
      id: 'connection',
      label: t('connected'),
      detail: t('disconnected'),
      checked: readiness.connected,
      checkboxLabel: t('connected'),
      actionLabel: t('configure'),
    },
    {
      id: 'workspace',
      label: t('workspace'),
      detail: t('workspaceDetail'),
      checked: readiness.workspaceCount > 0,
      checkboxLabel: t('workspace'),
      actionLabel: readiness.workspaceCount > 0 ? t('open') : t('create'),
    },
    {
      id: 'model',
      label: t('model'),
      detail: t('modelDetail'),
      checked: readiness.modelCount > 0,
      checkboxLabel: t('model'),
      actionLabel: t('configure'),
    },
    {
      id: 'project',
      label: t('project'),
      detail: t('projectDetail'),
      checked: readiness.projectReady,
      checkboxLabel: t('project'),
      actionLabel: t('configure'),
    },
  ] as const
  const completedCount = tasks.filter((task) => task.checked).length
  return {
    title: t('setupTitle'),
    description: t('setupDescription'),
    progressLabel: t('progress'),
    progressText: t('progressText')(completedCount, tasks.length),
    completedCount,
    totalCount: tasks.length,
    visualFillPercent: (completedCount / tasks.length) * 100,
    tasks,
    footerText: t('footer'),
    emptyTasksText: t('empty'),
  }
}
interface OnboardingReadinessViewProps {
  readonly readiness: OnboardingReadiness
  readonly labels: OnboardingReadinessLabels
  readonly actions: OnboardingReadinessActions
}

export function OnboardingReadinessView(props: OnboardingReadinessViewProps) {
  const { labels, ...viewProps } = props
  return (
    <OnboardingReadinessMessages.Provider messages={labels}>
      <OnboardingReadinessContent {...viewProps} />
    </OnboardingReadinessMessages.Provider>
  )
}

function OnboardingReadinessContent({
  readiness,
  actions,
}: Omit<OnboardingReadinessViewProps, 'labels'>) {
  const { t } = OnboardingReadinessMessages.useMessages()
  const variant = resolveOnboardingVariant(readiness)
  if (variant === 3)
    return (
      <LumenOnboarding3Reference
        variantId="hbar-onboarding-readiness"
        viewModel={{
          content: checklistContent(readiness, t),
          onCompletionChangeRequest: (id) =>
            actions.onConfigure(id === 'workspace' ? 'workspace' : id === 'model' ? 'model' : 'project'),
          onTaskActionRequest: (id) =>
            actions.onConfigure(id === 'workspace' ? 'workspace' : id === 'model' ? 'model' : 'project'),
        }}
      />
    )
  if (variant === 7) {
    const selectedOptionId =
      readiness.workspaceCount === 0 ? 'workspace' : readiness.modelCount === 0 ? 'model' : 'project'
    const workspaceSelected = selectedOptionId === 'workspace'
    return (
      <LumenFrame className="hbar-onboarding-wizard-flow">
        <LumenWizard07
          content={{
            shipping: {
              labels: {
                title: t('setupTitle'),
                detail: t('setupDescription'),
                options: t('project'),
                back: t('back'),
                continue: t('continue'),
                empty: t('empty'),
              },
              options: [
                { id: 'workspace', label: t('workspace') },
                { id: 'model', label: t('model') },
                { id: 'project', label: t('project') },
              ],
              initialOptionId: selectedOptionId,
              selectedOptionId,
              onOptionChange: (id) =>
                actions.onConfigure(id === 'workspace' ? 'workspace' : id === 'model' ? 'model' : 'project'),
              listStrategy: { kind: 'content-grown', expectedMaximum: 3 },
            },
          }}
          onAction={(event) => {
            if (event.actionId === 'continue' || event.actionId === 'save-shipping') {
              if (event.value === 'workspace') actions.onCreate(actions.setupPath?.trim() ?? '')
              else actions.onConfigure(event.value === 'model' ? 'model' : 'project')
            }
            if (event.actionId === 'back') actions.onBack?.()
          }}
        />
        {workspaceSelected ? (
          <LumenFrame className="hbar-onboarding-workspace-form">
            <LumenFrame as="label" htmlFor="hbar-onboarding-workspace-path">
              {t('setupPath')}
            </LumenFrame>
            <LumenInput
              id="hbar-onboarding-workspace-path"
              value={actions.setupPath ?? ''}
              onChange={(event) => actions.onPathChange?.(event.target.value)}
              placeholder={t('setupPathPlaceholder')}
              disabled={actions.busy === true}
            />
            <LumenContentText context="record.description">{t('setupPathHint')}</LumenContentText>
          </LumenFrame>
        ) : null}
      </LumenFrame>
    )
  }
  const content: LumenOnboarding6ReferenceContent = {
    title: t('readyTitle'),
    description: t('readyDescription'),
    summaryRows: [
      { id: 'workspace', label: t('workspace'), value: String(readiness.workspaceCount) },
      { id: 'model', label: t('model'), value: String(readiness.modelCount) },
      { id: 'project', label: t('project'), value: t('readyProject') },
    ],
    openWorkspaceLabel: t('openWorkspace'),
    takeTourLabel: t('takeTour'),
    inboxNote: t('inboxNote'),
  }
  return (
    <LumenOnboarding6Reference
      variantId="hbar-onboarding-readiness"
      viewModel={{ content, onOpenWorkspaceRequest: actions.onOpen, onTakeTourRequest: actions.onOpen }}
    />
  )
}

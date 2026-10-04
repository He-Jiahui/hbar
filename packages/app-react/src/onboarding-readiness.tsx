import {
  LumenFrame, LumenInput, LumenText,
  LumenOnboarding3Reference,
  LumenOnboarding6Reference,
  LumenWizard07,
  type LumenOnboarding3ReferenceContent,
  type LumenOnboarding6ReferenceContent,
} from '@lumen/app-ui'

export interface OnboardingReadiness { readonly connected: boolean; readonly workspaceCount: number; readonly modelCount: number; readonly projectReady: boolean }
export interface OnboardingReadinessLabels {
  readonly disconnected: string; readonly connected: string; readonly workspace: string; readonly workspaceDetail: string; readonly model: string; readonly modelDetail: string; readonly project: string; readonly projectDetail: string; readonly configure: string; readonly create: string; readonly open: string; readonly progress: string; readonly progressText: (completed: number, total: number) => string; readonly footer: string; readonly empty: string; readonly readyTitle: string; readonly readyDescription: string; readonly readyWorkspace: string; readonly readyModel: string; readonly readyProject: string; readonly openWorkspace: string; readonly takeTour: string; readonly inboxNote: string; readonly setupTitle: string; readonly setupDescription: string; readonly workspaceName: string; readonly workspaceNamePlaceholder: string; readonly workspaceUrl: string; readonly workspaceUrlPlaceholder: string; readonly memberHint: string; readonly region: string; readonly regionHint: string; readonly privateWorkspace: string; readonly privateWorkspaceDescription: string; readonly back: string; readonly continue: string; readonly setupPath: string; readonly setupPathPlaceholder: string; readonly setupPathHint: string; readonly cancel: string; readonly retry: string; readonly error: (code: string) => string; readonly loading: string; readonly unavailable: string
}
export interface OnboardingReadinessActions { readonly onConfigure: (kind: 'workspace' | 'model' | 'project') => void; readonly onCreate: (path: string) => void; readonly onPathChange?: (path: string) => void; readonly onRetry?: () => void; readonly setupPath?: string; readonly onOpen: () => void; readonly onBack?: () => void; readonly onCancel?: () => void; readonly busy?: boolean; readonly error?: string | null }
export function resolveOnboardingVariant(readiness: OnboardingReadiness): 3 | 6 | 7 { if (!readiness.connected || readiness.modelCount === 0) return 3; if (readiness.workspaceCount === 0 || !readiness.projectReady) return 7; return 6 }
function checklistContent(readiness: OnboardingReadiness, labels: OnboardingReadinessLabels): LumenOnboarding3ReferenceContent {
  const tasks = [
    { id: 'connection', label: labels.connected, detail: labels.disconnected, checked: readiness.connected, checkboxLabel: labels.connected, actionLabel: labels.configure },
    { id: 'workspace', label: labels.workspace, detail: labels.workspaceDetail, checked: readiness.workspaceCount > 0, checkboxLabel: labels.workspace, actionLabel: readiness.workspaceCount > 0 ? labels.open : labels.create },
    { id: 'model', label: labels.model, detail: labels.modelDetail, checked: readiness.modelCount > 0, checkboxLabel: labels.model, actionLabel: labels.configure },
    { id: 'project', label: labels.project, detail: labels.projectDetail, checked: readiness.projectReady, checkboxLabel: labels.project, actionLabel: labels.configure },
  ] as const
  const completedCount = tasks.filter((task) => task.checked).length
  return { title: labels.setupTitle, description: labels.setupDescription, progressLabel: labels.progress, progressText: labels.progressText(completedCount, tasks.length), completedCount, totalCount: tasks.length, visualFillPercent: (completedCount / tasks.length) * 100, tasks, footerText: labels.footer, emptyTasksText: labels.empty }
}
export function OnboardingReadinessView({ readiness, labels, actions }: { readonly readiness: OnboardingReadiness; readonly labels: OnboardingReadinessLabels; readonly actions: OnboardingReadinessActions }) {
  const variant = resolveOnboardingVariant(readiness)
  if (variant === 3) return <LumenOnboarding3Reference variantId="hbar-onboarding-readiness" viewModel={{ content: checklistContent(readiness, labels), onCompletionChangeRequest: (id) => actions.onConfigure(id === 'workspace' ? 'workspace' : id === 'model' ? 'model' : 'project'), onTaskActionRequest: (id) => actions.onConfigure(id === 'workspace' ? 'workspace' : id === 'model' ? 'model' : 'project') }} />
  if (variant === 7) {
    const selectedOptionId = readiness.workspaceCount === 0 ? 'workspace' : readiness.modelCount === 0 ? 'model' : 'project'
    const workspaceSelected = selectedOptionId === 'workspace'
    return <LumenFrame className="hbar-onboarding-wizard-flow">
      <LumenWizard07 content={{ shipping: { labels: { title: labels.setupTitle, detail: labels.setupDescription, options: labels.project, back: labels.back, continue: labels.continue, empty: labels.empty }, options: [{ id: 'workspace', label: labels.workspace }, { id: 'model', label: labels.model }, { id: 'project', label: labels.project }], initialOptionId: selectedOptionId, selectedOptionId, onOptionChange: (id) => actions.onConfigure(id === 'workspace' ? 'workspace' : id === 'model' ? 'model' : 'project'), listStrategy: { kind: 'content-grown', expectedMaximum: 3 } } }} onAction={(event) => { if (event.actionId === 'continue' || event.actionId === 'save-shipping') { if (event.value === 'workspace') actions.onCreate(actions.setupPath?.trim() ?? ''); else actions.onConfigure(event.value === 'model' ? 'model' : 'project') } if (event.actionId === 'back') actions.onBack?.() }} />
      {workspaceSelected ? <LumenFrame className="hbar-onboarding-workspace-form">
        <LumenFrame as="label" htmlFor="hbar-onboarding-workspace-path">{labels.setupPath}</LumenFrame>
        <LumenInput id="hbar-onboarding-workspace-path" value={actions.setupPath ?? ''} onChange={(event) => actions.onPathChange?.(event.target.value)} placeholder={labels.setupPathPlaceholder} disabled={actions.busy === true} />
        <LumenText as="small">{labels.setupPathHint}</LumenText>
      </LumenFrame> : null}
    </LumenFrame>
  }
  const content: LumenOnboarding6ReferenceContent = { title: labels.readyTitle, description: labels.readyDescription, summaryRows: [{ id: 'workspace', label: labels.workspace, value: String(readiness.workspaceCount) }, { id: 'model', label: labels.model, value: String(readiness.modelCount) }, { id: 'project', label: labels.project, value: labels.readyProject }], openWorkspaceLabel: labels.openWorkspace, takeTourLabel: labels.takeTour, inboxNote: labels.inboxNote }
  return <LumenOnboarding6Reference variantId="hbar-onboarding-readiness" viewModel={{ content, onOpenWorkspaceRequest: actions.onOpen, onTakeTourRequest: actions.onOpen }} />
}

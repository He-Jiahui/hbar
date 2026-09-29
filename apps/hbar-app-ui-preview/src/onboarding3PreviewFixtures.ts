import {
  ONBOARDING3_TASK_IDS,
  type Onboarding3PreviewStoreSeed,
  type Onboarding3PreviewStoreState,
  type Onboarding3TaskActionId,
  type Onboarding3TaskId,
} from './onboarding3PreviewStore'

export type Onboarding3PreviewLocale = 'en' | 'de'

export const ONBOARDING3_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-3',
  docsDescription: 'Getting-started checklist with a live progress bar and a per-task action.',
  liveSource: {
    status: 'documentation-text-only-no-preview-replay',
    note: 'Interactive behavior in this contract is limited to the authorized cached evidence below.',
  },
  staticCache: {
    cacheId: 'full-static-v10',
    generatedAt: '2026/9/23 4:28:30',
    sourceHash: '396e5c679645f9d54792a317e5899cb5b94205d54f9836d25f9f4313b2b3f0ba',
    sourceStatus: 200,
    schemaVersion: 1,
    themes: ['light', 'dark'],
    viewports: ['desktop', 'tablet', 'mobile', 'stress'],
    rootSizes: {
      desktop: { width: 672, height: 553 },
      tablet: { width: 606, height: 553 },
      mobile: { width: 308, height: 588 },
      stress: { width: 238, height: 608 },
    },
    horizontalOverflow: false,
    truncatedTextCount: { desktop: 6, tablet: 6, mobile: 17, stress: 18 },
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    generatedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: '396e5c679645f9d54792a317e5899cb5b94205d54f9836d25f9f4313b2b3f0ba',
    schemaVersion: 1,
    explicitProtocol: 'not-recorded',
    coverage: 'semantic-shape-representatives',
    themes: ['dark'],
    viewports: ['desktop', 'mobile'],
    verified: {
      profileCheckboxClick: {
        capturedView: 'dark-mobile',
        before: { checked: true, progressText: '2 of 6 done' },
        after: { checked: false, progressText: '1 of 6 done' },
        progressFillWidth: { before: 75.95, after: 39.13 },
        result: 'source-checked-state-and-progress-changed',
      },
    },
    legacyComparatorDiscrepancy: {
      reportedStatus: 'source-no-op',
      reportedSourceChanged: false,
      omittedFromDeltaSignature: ['checkbox-checked', 'ax-progress-text'],
      resolution: 'trust-captured-before-after-ax-and-pixels-for-this-specific-transition',
    },
    unverified: {
      uncheckedCheckboxChange: 'not-captured',
      otherCompletedCheckboxChange: 'not-captured',
      taskActionDestinations: 'not-captured',
      completionPersistence: 'not-captured',
      scrollOwner: 'not-captured',
    },
  },
  olderStaticCache: {
    cacheId: 'full-static-v9',
    sourceHash: '4d8530faf9fb2eabc9650b9bf33915e9e3c9c7664569b9312d5dbc2c855ed83a',
    matchesInteractionCache: false,
  },
} as const

export interface Onboarding3PreviewLabels {
  readonly title: string
  readonly description: string
  readonly progressLabel: string
  readonly progressText: (completed: number, total: number) => string
  readonly checkboxLabel: (taskLabel: string) => string
  readonly footerText: string
  readonly emptyTasksText: string
}

export interface Onboarding3PreviewTaskCopy {
  readonly label: string
  readonly detail: string
  readonly actionLabel: string
}

export type Onboarding3PreviewTaskCopyById = Readonly<Record<Onboarding3TaskId, Onboarding3PreviewTaskCopy>>

export interface Onboarding3PreviewCopy {
  readonly labels: Onboarding3PreviewLabels
  readonly tasks: Onboarding3PreviewTaskCopyById
}

export interface Onboarding3PreviewTask {
  readonly id: Onboarding3TaskId
  readonly label: string
  readonly detail: string
  readonly checked: boolean
  readonly checkboxLabel: string
  readonly action: {
    readonly id: Onboarding3TaskActionId
    readonly label: string
  }
}

export interface Onboarding3PreviewContent {
  readonly locale: Onboarding3PreviewLocale
  readonly labels: Onboarding3PreviewLabels
  readonly progress: {
    readonly completedCount: number
    readonly totalCount: number
    readonly text: string
    readonly visualFillPercent: number
  }
  readonly tasks: readonly Onboarding3PreviewTask[]
  readonly collectionContract: {
    readonly sourceTaskCount: 6
    readonly maxTaskCount: 6
    readonly strategy: 'bounded-content-grown'
    readonly sourceScrollOwner: 'not-captured'
    readonly sourceNarrowCopyBehavior: 'truncation-observed-at-mobile-and-stress'
    readonly localNarrowCopyBehavior: 'normal-flow-preserves-readable-content'
    readonly horizontalOverflowEvidence: 'none-at-four-static-widths'
  }
  readonly evidence: typeof ONBOARDING3_SOURCE_EVIDENCE
}

export interface Onboarding3PreviewFixtureOverrides {
  readonly labels?: Partial<Onboarding3PreviewLabels>
  readonly taskCopy?: Partial<Record<Onboarding3TaskId, Partial<Onboarding3PreviewTaskCopy>>>
  readonly taskOrder?: readonly Onboarding3TaskId[]
}

export interface Onboarding3PreviewFixture {
  readonly locale: Onboarding3PreviewLocale
  readonly copy: Onboarding3PreviewCopy
  readonly seed: Onboarding3PreviewStoreSeed
  readonly contentFor: (state: Onboarding3PreviewStoreState) => Onboarding3PreviewContent
}

const TASK_ACTION_IDS: Readonly<Record<Onboarding3TaskId, Onboarding3TaskActionId>> = {
  profile: 'edit-profile',
  workspace: 'rename-workspace',
  'first-project': 'start-import',
  teammates: 'send-invites',
  repository: 'connect-repository',
  notifications: 'open-notification-settings',
}

function copyFor(locale: Onboarding3PreviewLocale): Onboarding3PreviewCopy {
  if (locale === 'de') {
    return {
      labels: {
        title: 'Erste Schritte',
        description: 'Sechs Aufgaben, die etwa zehn Minuten dauern und alles Weitere erleichtern.',
        progressLabel: 'Einrichtungsfortschritt',
        progressText: (completed, total) => `${completed} von ${total} erledigt`,
        checkboxLabel: (taskLabel) => `Als erledigt markieren: ${taskLabel}`,
        footerText: 'Sie können die Liste verlassen und später über das Workspace-Menü zurückkehren.',
        emptyTasksText: 'Keine Setup-Aufgaben verfügbar.',
      },
      tasks: {
        profile: {
          label: 'Profil vervollständigen',
          detail: 'Name und Foto erleichtern es, Review-Unterhaltungen zuzuordnen.',
          actionLabel: 'Profil bearbeiten',
        },
        workspace: {
          label: 'Arbeitsbereich benennen',
          detail: 'Der Name erscheint in Einladungen und in der Seitenleiste aller Mitglieder.',
          actionLabel: 'Umbenennen',
        },
        'first-project': {
          label: 'Erstes Projekt importieren',
          detail: 'Importieren Sie eine CSV-Datei oder verbinden Sie ein bestehendes Ticketsystem.',
          actionLabel: 'Import starten',
        },
        teammates: {
          label: 'Zwei Teammitglieder einladen',
          detail: 'Arbeitsbereiche mit mindestens drei Personen können gemeinsame Ansichten nutzen.',
          actionLabel: 'Einladungen senden',
        },
        repository: {
          label: 'Repository verbinden',
          detail: 'Verknüpfen Sie Branches und Pull Requests mit den Aufgaben, die sie geöffnet haben.',
          actionLabel: 'Verbinden',
        },
        notifications: {
          label: 'Benachrichtigungen festlegen',
          detail: 'Wählen Sie aus, bei welchen Ereignissen Sie benachrichtigt werden möchten.',
          actionLabel: 'Einstellungen öffnen',
        },
      },
    }
  }

  return {
    labels: {
      title: 'Get set up',
      description: 'Six things that take about ten minutes and make everything after them easier.',
      progressLabel: 'Setup progress',
      progressText: (completed, total) => `${completed} of ${total} done`,
      checkboxLabel: (taskLabel) => `Mark ${taskLabel} complete`,
      footerText: 'You can leave this and come back to it from the workspace menu.',
      emptyTasksText: 'No setup tasks are available.',
    },
    tasks: {
      profile: {
        label: 'Complete your profile',
        detail: 'A name and photo make review threads easier to follow.',
        actionLabel: 'Edit profile',
      },
      workspace: {
        label: 'Name your workspace',
        detail: "Appears in invitations and in everyone's sidebar.",
        actionLabel: 'Rename',
      },
      'first-project': {
        label: 'Import your first project',
        detail: 'Bring in a CSV or connect an existing tracker.',
        actionLabel: 'Start import',
      },
      teammates: {
        label: 'Invite two teammates',
        detail: 'Workspaces with three or more people get shared views.',
        actionLabel: 'Send invites',
      },
      repository: {
        label: 'Connect your repository',
        detail: 'Link branches and pull requests to the work that opened them.',
        actionLabel: 'Connect',
      },
      notifications: {
        label: "Choose how you're notified",
        detail: 'Pick the events worth interrupting you for.',
        actionLabel: 'Open settings',
      },
    },
  }
}

function mergeCopy(
  base: Onboarding3PreviewCopy,
  overrides: Onboarding3PreviewFixtureOverrides,
): Onboarding3PreviewCopy {
  const tasks: Record<Onboarding3TaskId, Onboarding3PreviewTaskCopy> = { ...base.tasks }

  for (const taskId of ONBOARDING3_TASK_IDS) {
    const taskOverrides = overrides.taskCopy?.[taskId]
    if (taskOverrides) tasks[taskId] = { ...tasks[taskId], ...taskOverrides }
  }

  return {
    labels: { ...base.labels, ...overrides.labels },
    tasks,
  }
}

function uniqueTaskOrder(taskOrder: readonly Onboarding3TaskId[] | undefined): readonly Onboarding3TaskId[] {
  const requested = taskOrder ?? ONBOARDING3_TASK_IDS
  const unique: Onboarding3TaskId[] = []

  for (const taskId of requested) {
    if (ONBOARDING3_TASK_IDS.includes(taskId) && !unique.includes(taskId)) unique.push(taskId)
  }

  return unique
}

export function createOnboarding3PreviewFixture(
  locale: Onboarding3PreviewLocale = 'en',
  overrides: Onboarding3PreviewFixtureOverrides = {},
): Onboarding3PreviewFixture {
  const copy = mergeCopy(copyFor(locale), overrides)
  const taskOrder = uniqueTaskOrder(overrides.taskOrder)
  const seed: Onboarding3PreviewStoreSeed = {
    tasks: taskOrder.map((id) => ({ id, actionId: TASK_ACTION_IDS[id] })),
    initiallyCompletedTaskIds: ['profile', 'workspace'],
  }

  return {
    locale,
    copy,
    seed,
    contentFor: (state) => {
      const tasks = state.tasks.map((task) => {
        const taskCopy = copy.tasks[task.id]
        const checked = state.completedTaskIds.includes(task.id)
        return {
          id: task.id,
          label: taskCopy.label,
          detail: taskCopy.detail,
          checked,
          checkboxLabel: copy.labels.checkboxLabel(taskCopy.label),
          action: {
            id: task.actionId,
            label: taskCopy.actionLabel,
          },
        }
      })
      const completedCount = tasks.filter((task) => task.checked).length
      const totalCount = tasks.length

      return {
        locale,
        labels: copy.labels,
        progress: {
          completedCount,
          totalCount,
          text: copy.labels.progressText(completedCount, totalCount),
          visualFillPercent: totalCount === 0 ? 0 : (completedCount / totalCount) * 100,
        },
        tasks,
        collectionContract: {
          sourceTaskCount: 6,
          maxTaskCount: 6,
          strategy: 'bounded-content-grown',
          sourceScrollOwner: 'not-captured',
          sourceNarrowCopyBehavior: 'truncation-observed-at-mobile-and-stress',
          localNarrowCopyBehavior: 'normal-flow-preserves-readable-content',
          horizontalOverflowEvidence: 'none-at-four-static-widths',
        },
        evidence: ONBOARDING3_SOURCE_EVIDENCE,
      }
    },
  }
}

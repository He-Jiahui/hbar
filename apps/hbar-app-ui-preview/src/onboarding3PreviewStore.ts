import { createStore } from 'zustand/vanilla'

export const ONBOARDING3_TASK_IDS = [
  'profile',
  'workspace',
  'first-project',
  'teammates',
  'repository',
  'notifications',
] as const

export const ONBOARDING3_TASK_ACTION_IDS = [
  'edit-profile',
  'rename-workspace',
  'start-import',
  'send-invites',
  'connect-repository',
  'open-notification-settings',
] as const

export const ONBOARDING3_MAX_TASKS = ONBOARDING3_TASK_IDS.length
export const ONBOARDING3_OBSERVED_COMPLETED_NOOP_TASK_ID = 'profile' satisfies Onboarding3TaskId

export type Onboarding3TaskId = (typeof ONBOARDING3_TASK_IDS)[number]
export type Onboarding3TaskActionId = (typeof ONBOARDING3_TASK_ACTION_IDS)[number]

export interface Onboarding3PreviewTaskReference {
  readonly id: Onboarding3TaskId
  readonly actionId: Onboarding3TaskActionId
}

export interface Onboarding3PreviewStoreSeed {
  readonly tasks: readonly {
    readonly id: string
    readonly actionId: string
  }[]
  readonly initiallyCompletedTaskIds: readonly string[]
}

export type Onboarding3HostRequest =
  | {
      readonly kind: 'task-completion-change-request'
      readonly taskId: Onboarding3TaskId
      readonly checked: boolean
      readonly resultBehavior: 'typed-request-only-source-result-unobserved'
    }
  | {
      readonly kind: 'task-action-request'
      readonly taskId: Onboarding3TaskId
      readonly actionId: Onboarding3TaskActionId
      readonly resultBehavior: 'typed-request-only-navigation-result-unobserved'
    }

export interface Onboarding3PreviewStoreState {
  readonly tasks: readonly Onboarding3PreviewTaskReference[]
  readonly completedTaskIds: readonly Onboarding3TaskId[]
  readonly requestCompletionChange: (taskId: string, checked: boolean) => Onboarding3HostRequest | null
  readonly requestTaskAction: (taskId: string) => Onboarding3HostRequest | null
}

function isTaskId(value: string): value is Onboarding3TaskId {
  return ONBOARDING3_TASK_IDS.some((id) => id === value)
}

function isTaskActionId(value: string): value is Onboarding3TaskActionId {
  return ONBOARDING3_TASK_ACTION_IDS.some((id) => id === value)
}

function normalizeTasks(tasks: Onboarding3PreviewStoreSeed['tasks']): readonly Onboarding3PreviewTaskReference[] {
  const normalized: Onboarding3PreviewTaskReference[] = []

  for (const task of tasks) {
    if (!isTaskId(task.id) || !isTaskActionId(task.actionId)) continue
    if (normalized.some((existing) => existing.id === task.id)) continue
    if (normalized.length === ONBOARDING3_MAX_TASKS) break
    normalized.push({ id: task.id, actionId: task.actionId })
  }

  return normalized
}

function normalizeCompletedTaskIds(
  taskIds: readonly Onboarding3TaskId[],
  completedTaskIds: readonly string[],
): readonly Onboarding3TaskId[] {
  const requested = new Set(completedTaskIds.filter(isTaskId))
  return taskIds.filter((taskId) => requested.has(taskId))
}

export function createOnboarding3PreviewStore(seed: Onboarding3PreviewStoreSeed) {
  const tasks = normalizeTasks(seed.tasks)
  const taskIds = tasks.map((task) => task.id)
  const completedTaskIds = normalizeCompletedTaskIds(taskIds, seed.initiallyCompletedTaskIds)

  return createStore<Onboarding3PreviewStoreState>(() => ({
    tasks,
    completedTaskIds,
    requestCompletionChange: (taskId, checked) => {
      if (!isTaskId(taskId) || !taskIds.includes(taskId)) return null

      const isCurrentlyCompleted = completedTaskIds.includes(taskId)
      if (isCurrentlyCompleted === checked) return null

      // The archived source sample clicked this already-completed checkbox and recorded no visible change.
      if (taskId === ONBOARDING3_OBSERVED_COMPLETED_NOOP_TASK_ID && isCurrentlyCompleted && !checked) return null

      return {
        kind: 'task-completion-change-request',
        taskId,
        checked,
        resultBehavior: 'typed-request-only-source-result-unobserved',
      }
    },
    requestTaskAction: (taskId) => {
      if (!isTaskId(taskId)) return null
      const task = tasks.find((candidate) => candidate.id === taskId)
      if (!task) return null

      return {
        kind: 'task-action-request',
        taskId,
        actionId: task.actionId,
        resultBehavior: 'typed-request-only-navigation-result-unobserved',
      }
    },
  }))
}

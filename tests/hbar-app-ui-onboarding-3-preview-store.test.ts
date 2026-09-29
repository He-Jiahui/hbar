import { describe, expect, test } from 'bun:test'
import { createOnboarding3PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding3PreviewFixtures'
import {
  ONBOARDING3_MAX_TASKS,
  ONBOARDING3_TASK_IDS,
  createOnboarding3PreviewStore,
} from '../apps/hbar-app-ui-preview/src/onboarding3PreviewStore'

describe('Onboarding 3 preview store', () => {
  test('projects the cached six-task initial state with two completed items', () => {
    const fixture = createOnboarding3PreviewFixture()
    const store = createOnboarding3PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.tasks.map((task) => task.id)).toEqual([
      'profile',
      'workspace',
      'first-project',
      'teammates',
      'repository',
      'notifications',
    ])
    expect(content.tasks.map((task) => task.checked)).toEqual([true, true, false, false, false, false])
    expect(content.progress.completedCount).toBe(2)
    expect(content.progress.totalCount).toBe(6)
    expect(content.progress.text).toBe('2 of 6 done')
    expect(content.progress.visualFillPercent).toBeCloseTo(100 / 3)
    expect(content.tasks.map((task) => task.action.label)).toEqual([
      'Edit profile',
      'Rename',
      'Start import',
      'Send invites',
      'Connect',
      'Open settings',
    ])
    expect(content.collectionContract).toEqual({
      sourceTaskCount: 6,
      maxTaskCount: 6,
      strategy: 'bounded-content-grown',
      sourceScrollOwner: 'not-captured',
      sourceNarrowCopyBehavior: 'truncation-observed-at-mobile-and-stress',
      localNarrowCopyBehavior: 'normal-flow-preserves-readable-content',
      horizontalOverflowEvidence: 'none-at-four-static-widths',
    })
  })

  test('keeps the only observed completed-checkbox click as a no-op and requests unverified changes', () => {
    const fixture = createOnboarding3PreviewFixture()
    const store = createOnboarding3PreviewStore(fixture.seed)

    expect(store.getState().requestCompletionChange('profile', false)).toBeNull()
    expect(store.getState().requestCompletionChange('first-project', true)).toEqual({
      kind: 'task-completion-change-request',
      taskId: 'first-project',
      checked: true,
      resultBehavior: 'typed-request-only-source-result-unobserved',
    })
    expect(fixture.contentFor(store.getState()).progress.text).toBe('2 of 6 done')
    expect(store.getState().completedTaskIds).toEqual(['profile', 'workspace'])
  })

  test('directs task links by stable ID after reordering and never claims navigation', () => {
    const fixture = createOnboarding3PreviewFixture('en', {
      taskOrder: ['notifications', 'first-project'],
    })
    const store = createOnboarding3PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.tasks.map((task) => task.id)).toEqual(['notifications', 'first-project'])
    expect(store.getState().requestTaskAction('first-project')).toEqual({
      kind: 'task-action-request',
      taskId: 'first-project',
      actionId: 'start-import',
      resultBehavior: 'typed-request-only-navigation-result-unobserved',
    })
    expect(store.getState().requestTaskAction('removed-task')).toBeNull()
    expect(content.progress.text).toBe('0 of 2 done')
  })

  test('handles empty, one-item, boundary, duplicate, and stale task IDs safely', () => {
    const emptyFixture = createOnboarding3PreviewFixture('en', { taskOrder: [] })
    const emptyStore = createOnboarding3PreviewStore(emptyFixture.seed)
    const emptyContent = emptyFixture.contentFor(emptyStore.getState())

    expect(emptyContent.tasks).toEqual([])
    expect(emptyContent.progress).toEqual({
      completedCount: 0,
      totalCount: 0,
      text: '0 of 0 done',
      visualFillPercent: 0,
    })
    expect(emptyStore.getState().requestTaskAction('profile')).toBeNull()

    const oneFixture = createOnboarding3PreviewFixture('en', { taskOrder: ['teammates'] })
    const oneStore = createOnboarding3PreviewStore(oneFixture.seed)
    expect(oneFixture.contentFor(oneStore.getState()).progress.text).toBe('0 of 1 done')

    const boundaryStore = createOnboarding3PreviewStore({
      tasks: [
        { id: 'removed-task', actionId: 'invalid-action' },
        { id: 'profile', actionId: 'edit-profile' },
        { id: 'profile', actionId: 'rename-workspace' },
        { id: 'workspace', actionId: 'rename-workspace' },
        { id: 'first-project', actionId: 'start-import' },
        { id: 'teammates', actionId: 'send-invites' },
        { id: 'repository', actionId: 'invalid-action' },
        { id: 'repository', actionId: 'connect-repository' },
        { id: 'notifications', actionId: 'open-notification-settings' },
        { id: 'unknown-task', actionId: 'edit-profile' },
        { id: 'removed-task', actionId: 'invalid-action' },
      ],
      initiallyCompletedTaskIds: ['profile', 'profile', 'workspace', 'removed-task'],
    })

    expect(boundaryStore.getState().tasks).toHaveLength(ONBOARDING3_MAX_TASKS)
    expect(boundaryStore.getState().tasks.map((task) => task.id)).toEqual([...ONBOARDING3_TASK_IDS])
    expect(boundaryStore.getState().completedTaskIds).toEqual(['profile', 'workspace'])
    expect(boundaryStore.getState().requestCompletionChange('removed-task', true)).toBeNull()
    expect(boundaryStore.getState().requestTaskAction('unknown-task')).toBeNull()
  })

  test('keeps long German host copy intact and localizes accessible names and progress', () => {
    const longDetail =
      'Importieren Sie eine sorgfältig vorbereitete CSV-Datei oder verbinden Sie ein bestehendes Ticketsystem, damit alle Teammitglieder die ursprünglichen Projektdaten nachvollziehen können.'
    const fixture = createOnboarding3PreviewFixture('de', {
      taskCopy: {
        'first-project': {
          detail: longDetail,
        },
      },
    })
    const store = createOnboarding3PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())
    const importTask = content.tasks.find((task) => task.id === 'first-project')

    expect(content.labels.progressText(2, 6)).toBe('2 von 6 erledigt')
    expect(content.tasks).toHaveLength(6)
    expect(importTask?.detail).toBe(longDetail)
    expect(importTask?.checkboxLabel).toBe('Als erledigt markieren: Erstes Projekt importieren')
    expect(importTask?.action.label).toBe('Import starten')
    expect(content.collectionContract.sourceNarrowCopyBehavior).toBe('truncation-observed-at-mobile-and-stress')
    expect(content.collectionContract.localNarrowCopyBehavior).toBe('normal-flow-preserves-readable-content')
  })
})
